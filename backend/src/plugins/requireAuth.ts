import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

import { getFirebaseAdmin } from "../../lib/firebaseAdmin";
import { db } from "../db";
import { users } from "../db/schema";

// Extend FastifyRequest with auth context
declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      uid: string;
      email?: string;
      userId: string; // DB users.id
    };
  }
}

function isDatabaseUnavailableError(err: any): boolean {
  // Node network-ish errors (common when Docker container is stopped)
  const code = err?.code;
  if (code && ["ECONNREFUSED", "ECONNRESET", "EPIPE", "ENOTFOUND", "EAI_AGAIN"].includes(code)) {
    return true;
  }

  // postgres/postgres-js style
  // - when server is not reachable or connection fails, some libs throw messages like:
  //   "connect ECONNREFUSED ..." or "connection ended unexpectedly"
  const msg = String(err?.message || "").toLowerCase();
  if (
    msg.includes("econnrefused") ||
    msg.includes("connection terminated") ||
    msg.includes("connection ended unexpectedly") ||
    msg.includes("terminating connection") ||
    msg.includes("the database system is starting up") ||
    msg.includes("password authentication failed") // optional: treat separately if you want
  ) {
    return true;
  }

  return false;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  // Helpful single-line hit marker
  // (keeps your logs easy to scan)
  console.log(`🔥 requireAuth hit ${req.method} ${req.url}`);

  // 1) Parse Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Missing Authorization bearer token" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return reply.status(401).send({ error: "Missing Authorization bearer token" });
  }

  // 2) Verify Firebase token (ONLY token-related failures become 401)
  let decoded: { uid: string; email?: string } | null = null;
  try {
    const admin = getFirebaseAdmin();
    const d = await admin.auth().verifyIdToken(token);
    decoded = { uid: d.uid, email: d.email };
    req.log.info(
      { uid: d.uid, email: d.email, aud: d.aud, iss: d.iss, exp: d.exp },
      "AUTH DEBUG: verifyIdToken OK"
    );
  } catch (err) {
    req.log.error({ err }, "AUTH DEBUG: verifyIdToken FAILED");
    return reply.status(401).send({ error: "Invalid or expired token" });
  }

  // 3) Resolve / create DB user (DB failures become 503)
  try {
    const uid = decoded.uid;
    const email = decoded.email;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.firebaseUid, uid))
      .limit(1);

    let userId: string;

    if (existing.length === 0) {
      const inserted = await db
        .insert(users)
        .values({
          id: uuid(),
          firebaseUid: uid,
          email: email ?? null,
        })
        .returning({ id: users.id });

      userId = inserted[0].id;
    } else {
      userId = existing[0].id;
    }

    req.auth = { uid, email, userId };
  } catch (err: any) {
    req.log.error({ err }, "AUTH DEBUG: DB lookup/create user FAILED");

    if (isDatabaseUnavailableError(err)) {
      return reply.status(503).send({
        error: "Database unavailable",
        message: "PostgreSQL is not reachable. Is your Docker container running?",
      });
    }

    return reply.status(500).send({
      error: "Failed to load profile",
      message: "Database error while resolving user record.",
    });
  }
}
