import type { FastifyInstance } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuid } from "uuid";

import { db } from "../db";
import { animalHerdMembership, animals, herds, userRanches } from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";

const MIXED_VALUE = "Mixed";
const OTHER_VALUE = "Other";

type HerdCounts = {
  male: number;
  male_neut: number;
  female: number;
  female_neut: number;
  baby: number;
};

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

function getBabyCutoffDate(): Date {
  // "Baby" definition for now: < 12 months old
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d;
}

function emptyCounts(): HerdCounts {
  return { male: 0, male_neut: 0, female: 0, female_neut: 0, baby: 0 };
}

async function getCountsByHerdId(ranchId: string): Promise<Record<string, HerdCounts>> {
  // Pull current memberships for herds in this ranch, joined to animals.
  // Then aggregate in JS for clarity.
  const rows = await db
    .select({
      herdId: animalHerdMembership.herdId,
      sex: animals.sex,
      neutered: animals.neutered,
      birthDate: animals.birthDate,
      status: animals.status,
    })
    .from(animalHerdMembership)
    .innerJoin(herds, eq(herds.id, animalHerdMembership.herdId))
    .innerJoin(animals, eq(animals.id, animalHerdMembership.animalId))
    .where(and(eq(herds.ranchId, ranchId), isNull(animalHerdMembership.endAt)));

  const cutoff = getBabyCutoffDate();
  const byHerd: Record<string, HerdCounts> = {};

  for (const r of rows) {
    const hid = r.herdId;
    if (!byHerd[hid]) byHerd[hid] = emptyCounts();

    // If you only want "active" animals counted, enforce it here:
    // (leave this in — it’s predictable and avoids counting sold/deceased animals)
    if (r.status && r.status !== "active") continue;

    const sex = (r.sex ?? "").toLowerCase();
    const neutered = Boolean(r.neutered);

    // Baby rule: birthDate within last year
    // Drizzle `date()` comes back as string in many setups; handle both.
    let birth: Date | null = null;

    if (typeof r.birthDate === "string" && r.birthDate.length >= 10) {
      birth = new Date(r.birthDate);
    }

    if (birth && birth > cutoff) {
      byHerd[hid].baby += 1;
      continue;
    }

    if (sex === "male") {
      if (neutered) byHerd[hid].male_neut += 1;
      else byHerd[hid].male += 1;
      continue;
    }

    if (sex === "female") {
      if (neutered) byHerd[hid].female_neut += 1;
      else byHerd[hid].female += 1;
      continue;
    }

    // Unknown/blank sex: don’t force into buckets
  }

  return byHerd;
}

/**
 * Payload schemas
 *
 * Herd UI no longer supports herd-level vocabulary fields.
 *
 * Species rules:
 * - allow undefined/null
 * - allow "Mixed"
 * - allow any other non-empty string (trimmed)
 *
 * TODO: validate against ranch-defined species for this ranchId once imported.
 */
const speciesSchema = z.string().trim().min(1).or(z.literal(MIXED_VALUE));

/**
 * Breed rules:
 * - allow undefined
 * - allow any non-empty string
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

  species: speciesSchema.optional(),
  breed: breedSchema.optional(),

  longDescription: z.string().optional(),
});

const herdUpdateSchema = herdCreateSchema.partial();

export async function herdRoutes(app: FastifyInstance) {
  /**
   * LIST herds (includes counts)
   */
  app.get("/herds", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) {
        return reply.status(400).send({ error: "No ranch selected" });
      }

      const countsByHerdId = await getCountsByHerdId(ranchId);

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

      const withCounts = rows.map((h) => ({
        ...h,
        counts: countsByHerdId[h.id] ?? emptyCounts(),
      }));

      return reply.send(withCounts);
    } catch (err) {
      req.log.error({ err }, "Failed to list herds");
      return reply.status(500).send({ error: "Failed to list herds" });
    }
  });

  /**
   * GET herd by id (includes counts)
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

      // Build counts map and pluck this herd
      const countsByHerdId = await getCountsByHerdId(ranchId);
      const counts = countsByHerdId[herdId] ?? emptyCounts();

      return reply.send({ ...herd, counts });
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
