import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuid } from "uuid";

import { db } from "../db";
import { herds, userRanches } from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";

const MIXED_VALUE = "Mixed";
const OTHER_VALUE = "Other";

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
 *
 * Herd UI no longer supports herd-level vocabulary fields.
 *
 * Species rules (for now):
 * - allow undefined/null
 * - allow "Mixed"
 * - allow any other non-empty string (trimmed)
 *
 * TODO (next increment): validate against ranch-defined species for this ranchId
 * once ranch species tables are imported here (e.g., ranch_species join).
 */
const speciesSchema = z.string().trim().min(1).or(z.literal(MIXED_VALUE));

/**
 * Breed rules:
 * - allow undefined
 * - allow empty string -> treat as undefined in handlers
 * - allow "Mixed"
 * - allow any other non-empty string
 * - explicitly reject "Other" (UI should persist the free-entry value instead)
 */
const breedSchema = z
  .string()
  .trim()
  .refine((v) => v.length > 0, { message: "Breed cannot be empty" })
  .refine((v) => v !== OTHER_VALUE, {
    message: 'Breed "Other" is not allowed; send the free-entry breed text instead.',
  });

const herdCreateSchema = z.object({
  name: z.string().min(1),
  shortDescription: z.string().optional(),

  // optional fields
  species: speciesSchema.optional(),
  breed: breedSchema.optional(),

  longDescription: z.string().optional(),
});

const herdUpdateSchema = herdCreateSchema.partial();

const herdBreedsQuerySchema = z.object({
  species: z.string().trim().min(1),
});

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
   * LIST distinct breeds for a ranch + species (most recent first)
   *
   * IMPORTANT: this route MUST be declared before /herds/:id
   * or "breeds" will be treated as an id param.
   */
  app.get("/herds/breeds", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) {
        return reply.status(400).send({ error: "No ranch selected" });
      }

      const parsed = herdBreedsQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid query",
          details: parsed.error.flatten(),
        });
      }

      const species = parsed.data.species.trim();

      const rows = await db
        .select({
          breed: herds.breed,
          createdAt: herds.createdAt,
        })
        .from(herds)
        .where(and(eq(herds.ranchId, ranchId), eq(herds.species, species)))
        .orderBy(herds.createdAt)
        .limit(500);

      // rows oldest -> newest, walk backwards for "most recent first"
      const seen = new Set<string>();
      const breeds: string[] = [];

      for (let i = rows.length - 1; i >= 0; i--) {
        const b = (rows[i]?.breed ?? "").trim();
        if (!b) continue;

        if (b === MIXED_VALUE) continue;

        const key = b.toLowerCase();
        if (seen.has(key)) continue;

        seen.add(key);
        breeds.push(b);

        if (breeds.length >= 50) break;
      }

      return reply.send({ breeds });
    } catch (err) {
      req.log.error({ err }, "Failed to list herd breeds");
      return reply.status(500).send({ error: "Failed to list herd breeds" });
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

      const species = data.species?.trim();
      const breed = data.breed?.trim();

      await db.insert(herds).values({
        id: herdId,
        ranchId,
        name: data.name.trim(),
        shortDescription: data.shortDescription?.trim() || null,
        species: species ? species : null,
        breed: breed ? breed : null,
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

      await db.delete(herds).where(and(eq(herds.id, herdId), eq(herds.ranchId, ranchId)));

      return reply.send({ success: true });
    } catch (err) {
      req.log.error({ err }, "Failed to delete herd");
      return reply.status(500).send({ error: "Failed to delete herd" });
    }
  });
}
