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

async function parseRanchRequest(req: any): Promise<{
  body: Record<string, any>;
  files: any[];
}> {
  const contentType = String(req.headers?.["content-type"] ?? "");
  const isMultipart = contentType.includes("multipart/form-data");

  if (isMultipart && typeof req.saveRequestFiles === "function") {
    const files = await req.saveRequestFiles();
    return { body: (req.body ?? {}) as Record<string, any>, files };
  }

  return { body: (req.body ?? {}) as Record<string, any>, files: [] as any[] };
}

export async function ranchRoutes(app: FastifyInstance) {
  app.post("/ranches", { preHandler: requireAuth }, async (req, reply) => {
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

      const ranchRoot = await ensureRanchStructure(ranchId);

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

      await db.insert(userRanches).values({
        userId: req.auth!.userId,
        ranchId,
        role: "owner",
      });

      // Default Transfer herd (full schema-friendly)
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
          shortDescription: "System-managed holding herd.",
          longDescription:
            "System-managed holding herd. Animals may be placed here temporarily for transfers.",
          species: null,
          breed: null,
          maleDesc: null,
          femaleDesc: null,
          babyDesc: null,
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
}
