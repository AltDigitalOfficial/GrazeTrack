import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuid } from "uuid";

import { db } from "../db";
import { herds, userRanches } from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";

/**
 * Resolve the active ranch for the authenticated user.
 */
async function getActiveRanchId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ ranchId: userRanches.ranchId })
    .from(userRanches)
    .where(eq(userRanches.userId, userId))
    .limit(1);

  return rows[0]?.ranchId ?? null;
}

/**
 * Payload schemas
 * NOTE: API uses snake_case keys for neutered descriptors.
 */
const herdCreateSchema = z.object({
  name: z.string().min(1),
  shortDescription: z.string().optional(),
  species: z.string().optional(),
  breed: z.string().optional(),

  maleDesc: z.string().optional(),
  femaleDesc: z.string().optional(),
  babyDesc: z.string().optional(),

  male_neut_desc: z.string().optional(),
  female_neut_desc: z.string().optional(),

  longDescription: z.string().optional(),
});

const herdUpdateSchema = herdCreateSchema.partial();

export async function herdRoutes(app: FastifyInstance) {
  /**
   * LIST herds
   */
  app.get("/herds", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) {
        return reply.status(400).send({ error: "No ranch selected" });
      }

      const rows = await db
        .select({
          id: herds.id,
          ranchId: herds.ranchId,
          name: herds.name,
          shortDescription: herds.shortDescription,
          species: herds.species,
          breed: herds.breed,

          maleDesc: herds.maleDesc,
          femaleDesc: herds.femaleDesc,
          babyDesc: herds.babyDesc,

          male_neut_desc: herds.maleNeutDesc,
          female_neut_desc: herds.femaleNeutDesc,

          longDescription: herds.longDescription,
          createdAt: herds.createdAt,
        })
        .from(herds)
        .where(eq(herds.ranchId, ranchId))
        .orderBy(herds.createdAt);

      return reply.send(rows);
    } catch (err) {
      req.log.error({ err }, "Failed to list herds");
      return reply.status(500).send({ error: "Failed to list herds" });
    }
  });

  /**
   * GET herd by id
   */
  app.get("/herds/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) {
        return reply.status(400).send({ error: "No ranch selected" });
      }

      const herdId = (req.params as any).id as string;

      const rows = await db
        .select({
          id: herds.id,
          ranchId: herds.ranchId,
          name: herds.name,
          shortDescription: herds.shortDescription,
          species: herds.species,
          breed: herds.breed,

          maleDesc: herds.maleDesc,
          femaleDesc: herds.femaleDesc,
          babyDesc: herds.babyDesc,

          male_neut_desc: herds.maleNeutDesc,
          female_neut_desc: herds.femaleNeutDesc,

          longDescription: herds.longDescription,
          createdAt: herds.createdAt,
        })
        .from(herds)
        .where(and(eq(herds.id, herdId), eq(herds.ranchId, ranchId)))
        .limit(1);

      const herd = rows[0];
      if (!herd) {
        return reply.status(404).send({ error: "Herd not found" });
      }

      return reply.send(herd);
    } catch (err) {
      req.log.error({ err }, "Failed to get herd");
      return reply.status(500).send({ error: "Failed to get herd" });
    }
  });

  /**
   * CREATE herd
   */
  app.post("/herds", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) {
        return reply.status(400).send({ error: "No ranch selected" });
      }

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

        maleNeutDesc: data.male_neut_desc?.trim() || null,
        femaleNeutDesc: data.female_neut_desc?.trim() || null,

        longDescription: data.longDescription?.trim() || null,
      });

      return reply.status(201).send({ id: herdId });
    } catch (err) {
      req.log.error({ err }, "Failed to create herd");
      return reply.status(500).send({ error: "Failed to create herd" });
    }
  });

  /**
   * UPDATE herd
   */
  app.put("/herds/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) {
        return reply.status(400).send({ error: "No ranch selected" });
      }

      const herdId = (req.params as any).id as string;

      const parsed = herdUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid herd payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;

      await db
        .update(herds)
        .set({
          name: data.name != null ? data.name.trim() : undefined,
          shortDescription:
            data.shortDescription != null ? data.shortDescription.trim() || null : undefined,
          species: data.species != null ? data.species.trim() || null : undefined,
          breed: data.breed != null ? data.breed.trim() || null : undefined,

          maleDesc: data.maleDesc != null ? data.maleDesc.trim() || null : undefined,
          femaleDesc: data.femaleDesc != null ? data.femaleDesc.trim() || null : undefined,
          babyDesc: data.babyDesc != null ? data.babyDesc.trim() || null : undefined,

          maleNeutDesc:
            data.male_neut_desc != null ? data.male_neut_desc.trim() || null : undefined,
          femaleNeutDesc:
            data.female_neut_desc != null ? data.female_neut_desc.trim() || null : undefined,

          longDescription:
            data.longDescription != null ? data.longDescription.trim() || null : undefined,
        })
        .where(and(eq(herds.id, herdId), eq(herds.ranchId, ranchId)));

      return reply.send({ success: true });
    } catch (err) {
      req.log.error({ err }, "Failed to update herd");
      return reply.status(500).send({ error: "Failed to update herd" });
    }
  });

  /**
   * DELETE herd
   */
  app.delete("/herds/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) {
        return reply.status(400).send({ error: "No ranch selected" });
      }

      const herdId = (req.params as any).id as string;

      await db
        .delete(herds)
        .where(and(eq(herds.id, herdId), eq(herds.ranchId, ranchId)));

      return reply.send({ success: true });
    } catch (err) {
      req.log.error({ err }, "Failed to delete herd");
      return reply.status(500).send({ error: "Failed to delete herd" });
    }
  });
}
