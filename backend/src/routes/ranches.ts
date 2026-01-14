import type { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import path from "path";

import { ensureRanchStructure, saveUploadedFile } from "../../lib/storage.js";
import { db } from "../db";
import { ranches, userRanches, herds } from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";

function toNullIfEmpty(s?: string): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}

const ranchPayloadSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  dba: z.string().optional(),
  phone: z.string().optional(),

  phys_street: z.string().optional(),
  phys_city: z.string().optional(),
  phys_state: z.string().optional(),
  phys_zip: z.string().optional(),

  mail_street: z.string().optional(),
  mail_city: z.string().optional(),
  mail_state: z.string().optional(),
  mail_zip: z.string().optional(),
});

async function parseRanchRequest(req: any) {
  // multipart vs json: support both
  const isMultipart = typeof req.isMultipart === "function" && req.isMultipart();

  if (isMultipart) {
    // Ensure decorator exists
    const files = typeof req.saveRequestFiles === "function" ? await req.saveRequestFiles() : [];
    const body = (req.body ?? {}) as Record<string, any>;
    return { mode: "multipart" as const, body, files };
  }

  return { mode: "json" as const, body: (req.body ?? {}) as Record<string, any>, files: [] as any[] };
}

export async function ranchRoutes(app: FastifyInstance) {
  // CREATE ranch (and default Transfer herd)
  app.post("/ranches", { preHandler: requireAuth }, async (req, reply) => {
    req.log.info({ msg: "RANCH ROUTE VERSION = 2026-01-01-A" });

    try {
      const { body, files } = await parseRanchRequest(req);

      const parsed = ranchPayloadSchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid ranch payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;

      const ranchId = uuid();

      // Ensure folder structure exists
      const ranchRoot = await ensureRanchStructure(ranchId);

      // Optional file handling
      let logoUrl: string | null = null;
      let brandUrl: string | null = null;

      for (const file of files) {
        const field = file.fieldname;

        if (field === "logo") {
          const saved = await saveUploadedFile(file, path.join(ranchRoot, "logo"));
          logoUrl = saved.filename;
        }

        if (field === "brand") {
          const saved = await saveUploadedFile(file, path.join(ranchRoot, "brand"));
          brandUrl = saved.filename;
        }
      }

      // Insert ranch
      await db.insert(ranches).values({
        id: ranchId,
        name: data.name,
        description: toNullIfEmpty(data.description),
        dba: toNullIfEmpty(data.dba),
        phone: toNullIfEmpty(data.phone),

        phys_street: toNullIfEmpty(data.phys_street),
        phys_city: toNullIfEmpty(data.phys_city),
        phys_state: toNullIfEmpty(data.phys_state),
        phys_zip: toNullIfEmpty(data.phys_zip),

        mail_street: toNullIfEmpty(data.mail_street),
        mail_city: toNullIfEmpty(data.mail_city),
        mail_state: toNullIfEmpty(data.mail_state),
        mail_zip: toNullIfEmpty(data.mail_zip),

        logo_image_url: logoUrl,
        brand_image_url: brandUrl,
      });

      // Ensure membership exists (owner)
      await db.insert(userRanches).values({
        userId: req.auth!.userId,
        ranchId,
        role: "owner",
      });

      // ✅ Create default Transfer herd (only on ranch creation)
      // Avoid duplicates just in case the route is re-run.
      const existingTransfer = await db
        .select({ id: herds.id })
        .from(herds)
        .where(and(eq(herds.ranchId, ranchId), eq(herds.name, "Transfer")))
        .limit(1);

      if (!existingTransfer.length) {
        await db.insert(herds).values({
          id: uuid(),
          ranchId,
          name: "Transfer",
          shortDescription: "System herd for incoming/outgoing animals",
          species: null,
          breed: null,
          maleDesc: null,
          femaleDesc: null,
          babyDesc: null,
          longDescription:
            "System-managed holding herd. Animals may be placed here temporarily for transfers.",
        });
      }

      return reply.send({ id: ranchId });
    } catch (err: any) {
      req.log.error({ err }, "Failed to create ranch");
      return reply.status(500).send({
        error: "Failed to create ranch",
        message: err?.message,
      });
    }
  });

  // (Your PUT /ranches/:id etc can stay as-is; not changing it here.)
}
