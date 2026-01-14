import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { z } from "zod";

import { db } from "../db";
import { herds, userRanches, animalHerdMembership } from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";

async function getActiveRanchId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ ranchId: userRanches.ranchId })
    .from(userRanches)
    .where(eq(userRanches.userId, userId))
    .limit(1);

  return rows[0]?.ranchId ?? null;
}

const herdCreateSchema = z.object({
  name: z.string().min(1),
  shortDescription: z.string().optional(),
  species: z.string().optional(),
  breed: z.string().optional(),

  maleDesc: z.string().optional(),
  femaleDesc: z.string().optional(),
  babyDesc: z.string().optional(),

  longDescription: z.string().optional(),
});

export async function herdRoutes(app: FastifyInstance) {
  // LIST herds (for active ranch)
  app.get("/herds", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const rows = await db
        .select({
          id: herds.id,
          name: herds.name,
          shortDescription: herds.shortDescription,
          species: herds.species,
          breed: herds.breed,
          maleDesc: herds.maleDesc,
          femaleDesc: herds.femaleDesc,
          babyDesc: herds.babyDesc,
          longDescription: herds.longDescription,
          createdAt: herds.createdAt,
        })
        .from(herds)
        .where(eq(herds.ranchId, ranchId));

      return reply.send(rows);
    } catch (err: any) {
      req.log.error({ err }, "Failed to list herds");
      return reply.status(500).send({ error: "Failed to list herds" });
    }
  });

  // GET single herd (edit)
  app.get("/herds/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const herdId = (req.params as any).id as string;

      const rows = await db
        .select()
        .from(herds)
        .where(and(eq(herds.id, herdId), eq(herds.ranchId, ranchId)))
        .limit(1);

      if (!rows.length) return reply.status(404).send({ error: "Herd not found" });
      return reply.send(rows[0]);
    } catch (err: any) {
      req.log.error({ err }, "Failed to load herd");
      return reply.status(500).send({ error: "Failed to load herd" });
    }
  });

  // CREATE herd
  app.post("/herds", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const parsed = herdCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid herd payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;

      const herdId = uuid();

      await db.insert(herds).values({
        id: herdId,
        ranchId,
        name: data.name.trim(),

        shortDescription: data.shortDescription?.trim() || null,
        species: data.species?.trim() || null,
        breed: data.breed?.trim() || null,

        maleDesc: data.maleDesc?.trim() || null,
        femaleDesc: data.femaleDesc?.trim() || null,
        babyDesc: data.babyDesc?.trim() || null,

        longDescription: data.longDescription?.trim() || null,
      });

      return reply.send({ id: herdId });
    } catch (err: any) {
      req.log.error({ err }, "Failed to create herd");
      return reply.status(500).send({ error: "Failed to create herd" });
    }
  });

  // UPDATE herd
  app.put("/herds/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const herdId = (req.params as any).id as string;

      const parsed = herdCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid herd payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;

      // Prevent renaming Transfer (optional, but safer)
      const existing = await db
        .select({ name: herds.name })
        .from(herds)
        .where(and(eq(herds.id, herdId), eq(herds.ranchId, ranchId)))
        .limit(1);

      if (!existing.length) return reply.status(404).send({ error: "Herd not found" });

      const isTransfer = existing[0].name === "Transfer";
      if (isTransfer && data.name.trim() !== "Transfer") {
        return reply.status(400).send({ error: "Transfer herd cannot be renamed" });
      }

      await db
        .update(herds)
        .set({
          name: isTransfer ? "Transfer" : data.name.trim(),
          shortDescription: data.shortDescription?.trim() || null,
          species: data.species?.trim() || null,
          breed: data.breed?.trim() || null,
          maleDesc: data.maleDesc?.trim() || null,
          femaleDesc: data.femaleDesc?.trim() || null,
          babyDesc: data.babyDesc?.trim() || null,
          longDescription: data.longDescription?.trim() || null,
        })
        .where(and(eq(herds.id, herdId), eq(herds.ranchId, ranchId)));

      return reply.send({ ok: true });
    } catch (err: any) {
      req.log.error({ err }, "Failed to update herd");
      return reply.status(500).send({ error: "Failed to update herd" });
    }
  });

  // DELETE herd (only if not Transfer AND no animals)
  app.delete("/herds/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const herdId = (req.params as any).id as string;

      const rows = await db
        .select({ name: herds.name })
        .from(herds)
        .where(and(eq(herds.id, herdId), eq(herds.ranchId, ranchId)))
        .limit(1);

      if (!rows.length) return reply.status(404).send({ error: "Herd not found" });

      if (rows[0].name === "Transfer") {
        return reply.status(400).send({ error: "Transfer herd cannot be deleted" });
      }

      const membership = await db
        .select({ herdId: animalHerdMembership.herdId })
        .from(animalHerdMembership)
        .where(eq(animalHerdMembership.herdId, herdId))
        .limit(1);

      if (membership.length) {
        return reply.status(400).send({
          error: "Herd contains animals",
          message: "You can’t delete a herd that has animal history. Move animals out first.",
        });
      }

      await db.delete(herds).where(and(eq(herds.id, herdId), eq(herds.ranchId, ranchId)));
      return reply.send({ ok: true });
    } catch (err: any) {
      req.log.error({ err }, "Failed to delete herd");
      return reply.status(500).send({ error: "Failed to delete herd" });
    }
  });
}
