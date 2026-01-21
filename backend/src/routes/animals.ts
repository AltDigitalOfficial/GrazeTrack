// backend/src/routes/animals.ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

import { db } from "../db";
import {
  animals,
  animalHerdMembership,
  animalIntakeEvents,
  herds,
  userRanches,
} from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";

/* ------------------------------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------------------------------ */

async function requireHerdWithRanchAccess(userId: string, herdId: string): Promise<{ herdId: string; ranchId: string }> {
  const herdRows = await db
    .select({ herdId: herds.id, ranchId: herds.ranchId })
    .from(herds)
    .where(eq(herds.id, herdId))
    .limit(1);

  const herdRow = herdRows[0];
  if (!herdRow) {
    // Herd doesn't exist
    throw Object.assign(new Error("Herd not found"), { statusCode: 404 });
  }

  const accessRows = await db
    .select({ userId: userRanches.userId })
    .from(userRanches)
    .where(and(eq(userRanches.userId, userId), eq(userRanches.ranchId, herdRow.ranchId)))
    .limit(1);

  if (!accessRows[0]) {
    // User has no membership in this herd's ranch => cross-ranch denial
    throw Object.assign(new Error("Forbidden: no access to this ranch"), { statusCode: 403 });
  }

  return { herdId: herdRow.herdId, ranchId: herdRow.ranchId };
}

function sendError(reply: any, err: any) {
  const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;

  if (statusCode === 500) {
    reply.log.error({ err }, "animalsRoutes error");
  }

  return reply.status(statusCode).send({
    error: err?.message ?? "Unexpected server error",
  });
}

/* ------------------------------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------------------------------ */

const SexSchema = z.enum(["male", "female", "unknown"]);
const TagEarSchema = z.enum(["left", "right"]);
const StatusSchema = z.enum(["active", "sold", "deceased", "transferred"]);

const BaseAnimalSchema = z.object({
  herdId: z.string().min(1),

  species: z.string().min(1),
  breed: z.string().optional().nullable(),
  sex: SexSchema,

  birthDate: z.string().optional().nullable(), // YYYY-MM-DD
  birthDateIsEstimated: z.boolean().optional(),

  tagNumber: z.string().optional().nullable(),
  tagColor: z.string().optional().nullable(),
  tagEar: TagEarSchema.optional().nullable(),

  status: StatusSchema.optional(),
  statusChangedAt: z.string().optional().nullable(), // ISO datetime string

  damAnimalId: z.string().optional().nullable(),
  sireAnimalId: z.string().optional().nullable(),

  neutered: z.boolean().optional(),
  neuteredDate: z.string().optional().nullable(), // YYYY-MM-DD

  notes: z.string().optional().nullable(),
});

const BirthIntakeSchema = BaseAnimalSchema.extend({
  intake: z.object({
    eventDate: z.string().min(10), // YYYY-MM-DD
    bornOnRanch: z.boolean().optional(),
  }),
});

const PurchaseIntakeSchema = BaseAnimalSchema.extend({
  intake: z.object({
    eventDate: z.string().min(10), // YYYY-MM-DD
    supplierName: z.string().optional().nullable(),
    purchasePriceCents: z.number().int().nonnegative().optional().nullable(),
    purchaseCurrency: z.string().optional().nullable(), // e.g. USD
  }),
});

/* ------------------------------------------------------------------------------------------------
 * Routes
 * ------------------------------------------------------------------------------------------------ */

export async function animalsRoutes(app: FastifyInstance) {
  /**
   * POST /api/animals/intake/birth
   *
   * Creates:
   * - animals row
   * - animal_herd_membership row (current)
   * - animal_intake_events row (snapshot ranch_id + herd_id)
   */
  app.post("/animals/intake/birth", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const parsed = BirthIntakeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const data = parsed.data;

      const { herdId, ranchId } = await requireHerdWithRanchAccess(req.auth!.userId, data.herdId);

      const animalId = uuid();
      const membershipId = uuid();
      const intakeId = uuid();
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx.insert(animals).values({
          id: animalId,

          notes: data.notes ?? null,

          species: data.species,
          breed: data.breed ?? null,
          sex: data.sex,

          birthDate: data.birthDate ?? null,
          birthDateIsEstimated: data.birthDateIsEstimated ?? false,

          tagNumber: data.tagNumber ?? null,
          tagColor: data.tagColor ?? null,
          tagEar: data.tagEar ?? null,

          status: data.status ?? "active",
          statusChangedAt: data.statusChangedAt ? new Date(data.statusChangedAt) : null,

          damAnimalId: data.damAnimalId ?? null,
          sireAnimalId: data.sireAnimalId ?? null,

          neutered: data.neutered ?? false,
          neuteredDate: data.neuteredDate ?? null,

          createdAt: now,
          updatedAt: now,
        });

        await tx.insert(animalHerdMembership).values({
          id: membershipId,
          animalId,
          herdId,
          startAt: now,
          endAt: null,
          createdAt: now,
        });

        await tx.insert(animalIntakeEvents).values({
          id: intakeId,

          ranchId,
          herdId,
          animalId,

          intakeType: "birth",
          eventDate: data.intake.eventDate,

          bornOnRanch: data.intake.bornOnRanch ?? true,
          damAnimalId: data.damAnimalId ?? null,
          sireAnimalId: data.sireAnimalId ?? null,

          supplierName: null,
          purchasePriceCents: null,
          purchaseCurrency: null,

          createdAt: now,
        });
      });

      return reply.status(201).send({
        animalId,
        herdId,
        ranchId,
        membershipId,
        intakeEventId: intakeId,
      });
    } catch (err: any) {
      return sendError(reply, err);
    }
  });

  /**
   * POST /api/animals/intake/purchase
   *
   * Creates:
   * - animals row
   * - animal_herd_membership row (current)
   * - animal_intake_events row (snapshot ranch_id + herd_id)
   */
  app.post("/animals/intake/purchase", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const parsed = PurchaseIntakeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const data = parsed.data;

      const { herdId, ranchId } = await requireHerdWithRanchAccess(req.auth!.userId, data.herdId);

      const animalId = uuid();
      const membershipId = uuid();
      const intakeId = uuid();
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx.insert(animals).values({
          id: animalId,

          notes: data.notes ?? null,

          species: data.species,
          breed: data.breed ?? null,
          sex: data.sex,

          birthDate: data.birthDate ?? null,
          birthDateIsEstimated: data.birthDateIsEstimated ?? false,

          tagNumber: data.tagNumber ?? null,
          tagColor: data.tagColor ?? null,
          tagEar: data.tagEar ?? null,

          status: data.status ?? "active",
          statusChangedAt: data.statusChangedAt ? new Date(data.statusChangedAt) : null,

          damAnimalId: data.damAnimalId ?? null,
          sireAnimalId: data.sireAnimalId ?? null,

          neutered: data.neutered ?? false,
          neuteredDate: data.neuteredDate ?? null,

          createdAt: now,
          updatedAt: now,
        });

        await tx.insert(animalHerdMembership).values({
          id: membershipId,
          animalId,
          herdId,
          startAt: now,
          endAt: null,
          createdAt: now,
        });

        await tx.insert(animalIntakeEvents).values({
          id: intakeId,

          ranchId,
          herdId,
          animalId,

          intakeType: "purchase",
          eventDate: data.intake.eventDate,

          bornOnRanch: null,
          damAnimalId: null,
          sireAnimalId: null,

          supplierName: data.intake.supplierName ?? null,
          purchasePriceCents: data.intake.purchasePriceCents ?? null,
          purchaseCurrency: data.intake.purchaseCurrency ?? null,

          createdAt: now,
        });
      });

      return reply.status(201).send({
        animalId,
        herdId,
        ranchId,
        membershipId,
        intakeEventId: intakeId,
      });
    } catch (err: any) {
      return sendError(reply, err);
    }
  });
}
