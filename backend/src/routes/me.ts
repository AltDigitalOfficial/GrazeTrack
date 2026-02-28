import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { z } from "zod";

import { db } from "../db";
import { users, userRanches, ranches } from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";
import { getActiveRanchIdForUser, setActiveRanchIdForUser } from "../lib/activeRanch";

export async function meRoutes(app: FastifyInstance) {
  const SetActiveRanchBody = z.object({
    ranchId: z.string().uuid().nullable(),
  });

  app.get("/me", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const uid = req.auth!.uid;
      const email = req.auth!.email ?? null;

      // 1) Ensure local DB user exists
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.firebaseUid, uid))
        .limit(1);

      let dbUser = existing[0];

      if (!dbUser) {
        const newId = uuid();

        await db.insert(users).values({
          id: newId,
          firebaseUid: uid,
          email,
          activeRanchId: null,
        });

        const created = await db.select().from(users).where(eq(users.id, newId)).limit(1);
        dbUser = created[0];
      } else if (!dbUser.email && email) {
        // Optional: backfill email if it was missing
        await db
          .update(users)
          .set({ email })
          .where(and(eq(users.id, dbUser.id), eq(users.firebaseUid, uid)));
      }

      // 2) Memberships (LEFT JOIN so missing ranch rows won't crash response formatting)
      const memberships = await db
        .select({
          ranchId: userRanches.ranchId,
          role: userRanches.role,
          ranchName: ranches.name,
        })
        .from(userRanches)
        .leftJoin(ranches, eq(userRanches.ranchId, ranches.id))
        .where(eq(userRanches.userId, dbUser.id))
        .orderBy(desc(userRanches.createdAt));

      // 3) Active ranch pointer on users.active_ranch_id (with safe fallback)
      const activeRanchId = await getActiveRanchIdForUser(dbUser.id);

      return reply.send({
        user: {
          id: dbUser.id,
          firebaseUid: dbUser.firebaseUid,
          email: dbUser.email ?? email,
        },
        ranches: memberships, // [{ ranchId, role, ranchName }]
        activeRanchId,
      });
    } catch (err: any) {
      // This makes it WAY easier to diagnose missing tables/columns.
      req.log.error({ err }, "Failed /api/me");

      return reply.status(500).send({
        error: "Failed to load profile",
        message: err?.message,
        cause: err?.cause?.message,
      });
    }
  });

  app.put("/me/active-ranch", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const parsed = SetActiveRanchBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid active ranch payload",
          details: parsed.error.flatten(),
        });
      }

      const ranchId = await setActiveRanchIdForUser(req.auth!.userId, parsed.data.ranchId);
      return reply.send({ activeRanchId: ranchId });
    } catch (err: any) {
      if (String(err?.message || "").includes("not in user memberships")) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      req.log.error({ err }, "Failed to set active ranch");
      return reply.status(500).send({
        error: "Failed to set active ranch",
        message: err?.message,
      });
    }
  });
}
