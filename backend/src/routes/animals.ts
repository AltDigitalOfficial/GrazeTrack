// backend/src/routes/animals.ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { v4 as uuid } from "uuid";

import { db } from "../db";
import {
  animals,
  animalDocuments,
  animalHerdMembership,
  animalIntakeEvents,
  animalMeasurements,
  animalNotes,
  animalPhotos,
  animalPhotoTags,
  animalTagHistory,
  herds,
  userRanches,
} from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";

/* ------------------------------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------------------------------ */

async function getActiveRanchId(userId: string): Promise<string | null> {
  // Pick the first ranch membership row.
  const rows = await db
    .select({ ranchId: userRanches.ranchId })
    .from(userRanches)
    .where(eq(userRanches.userId, userId))
    .limit(1);

  return rows[0]?.ranchId ?? null;
}

async function requireHerdWithRanchAccess(
  userId: string,
  herdId: string
): Promise<{ herdId: string; ranchId: string }> {
  const herdRows = await db
    .select({ herdId: herds.id, ranchId: herds.ranchId })
    .from(herds)
    .where(eq(herds.id, herdId))
    .limit(1);

  const herdRow = herdRows[0];
  if (!herdRow) {
    throw Object.assign(new Error("Herd not found"), { statusCode: 404 });
  }

  const accessRows = await db
    .select({ userId: userRanches.userId })
    .from(userRanches)
    .where(and(eq(userRanches.userId, userId), eq(userRanches.ranchId, herdRow.ranchId)))
    .limit(1);

  if (!accessRows[0]) {
    throw Object.assign(new Error("Forbidden: no access to this ranch"), { statusCode: 403 });
  }

  return { herdId: herdRow.herdId, ranchId: herdRow.ranchId };
}

/**
 * For animal-specific operations, derive ranch scope from CURRENT herd membership.
 * This prevents cross-ranch access regardless of any "active ranch" concept.
 */
async function requireCurrentMembershipScope(
  userId: string,
  animalId: string
): Promise<{ ranchId: string; herdId: string; membershipId: string }> {
  const membershipRows = await db
    .select({
      membershipId: animalHerdMembership.id,
      herdId: animalHerdMembership.herdId,
    })
    .from(animalHerdMembership)
    .where(and(eq(animalHerdMembership.animalId, animalId), isNull(animalHerdMembership.endAt)))
    .orderBy(desc(animalHerdMembership.startAt))
    .limit(1);

  const membership = membershipRows[0];
  if (!membership) {
    throw Object.assign(new Error("Animal has no current herd membership"), { statusCode: 404 });
  }

  const herdRows = await db
    .select({ ranchId: herds.ranchId })
    .from(herds)
    .where(eq(herds.id, membership.herdId))
    .limit(1);

  const herdRow = herdRows[0];
  if (!herdRow) {
    throw Object.assign(new Error("Herd not found for current membership"), { statusCode: 404 });
  }

  const accessRows = await db
    .select({ userId: userRanches.userId })
    .from(userRanches)
    .where(and(eq(userRanches.userId, userId), eq(userRanches.ranchId, herdRow.ranchId)))
    .limit(1);

  if (!accessRows[0]) {
    throw Object.assign(new Error("Forbidden: no access to this ranch"), { statusCode: 403 });
  }

  return {
    ranchId: herdRow.ranchId,
    herdId: membership.herdId,
    membershipId: membership.membershipId,
  };
}

function sendError(reply: any, err: any) {
  const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;

  const pgMessage =
    err?.cause?.message || err?.cause?.toString?.() || err?.originalError?.message || null;

  if (statusCode === 500) {
    reply.log.error({ err, pgMessage }, "animalsRoutes error");
  }

  return reply.status(statusCode).send({
    error: err?.message ?? "Unexpected server error",
    pg: pgMessage,
  });
}

async function insertCurrentTag(args: {
  tx: any;
  animalId: string;
  tagNumber: string | null;
  tagColor: string | null;
  tagEar: "left" | "right" | null;
  at: Date;
  changeReason: string;
  // UUID user id (future). For now we store null (Option B).
  changedByUserId: string | null;
}) {
  const { tx, animalId, tagNumber, tagColor, tagEar, at, changeReason, changedByUserId } = args;

  // If no tag fields provided, do nothing.
  const hasAny = !!(tagNumber || tagColor || tagEar);
  if (!hasAny) return;

  // End any current tag (defensive; should not exist on create)
  await tx
    .update(animalTagHistory)
    .set({ endAt: at })
    .where(and(eq(animalTagHistory.animalId, animalId), isNull(animalTagHistory.endAt)));

  // Insert new current tag
  await tx.insert(animalTagHistory).values({
    id: uuid(),
    animalId,
    tagNumber,
    tagColor,
    tagEar,
    startAt: at,
    endAt: null,
    changeReason,
    changedByUserId, // must be uuid or null; for now we pass null
    createdAt: at,
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

  // Tag info is now stored in animal_tag_history
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

const ListAnimalsQuerySchema = z.object({
  herdId: z.string().optional(),
});

const CreateMeasurementSchema = z.object({
  measurementType: z.string().min(1),
  valueNumber: z.number().optional().nullable(),
  valueText: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  measuredAt: z.string().optional().nullable(),
});

const CreateNoteSchema = z.object({
  noteType: z.string().optional().nullable(),
  content: z.string().min(1),
  noteAt: z.string().optional().nullable(),
});

/* ------------------------------------------------------------------------------------------------
 * Routes
 * ------------------------------------------------------------------------------------------------ */

export async function animalsRoutes(app: FastifyInstance) {
  /**
   * GET /api/animals
   *
   * Lists animals for the user's "active ranch" (first user_ranches row),
   * based on CURRENT herd membership (end_at is null).
   *
   * Tag columns are derived from animal_tag_history where end_at is null.
   */
  app.get("/animals", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const parsed = ListAnimalsQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid query", details: parsed.error.flatten() });
      }

      const { herdId } = parsed.data;

      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      if (herdId) {
        const herdAccess = await requireHerdWithRanchAccess(req.auth!.userId, herdId);
        if (herdAccess.ranchId !== ranchId) {
          return reply.status(400).send({
            error: "Herd is not in the active ranch",
            message:
              "This backend currently uses your first ranch membership as the active ranch. Switch ranch support can be added later.",
          });
        }
      }

      const conditions = [
        eq(herds.ranchId, ranchId),
        isNull(animalHerdMembership.endAt),
        ...(herdId ? [eq(herds.id, herdId)] : []),
      ];

      const rows = await db
        .select({
          animalId: animals.id,
          species: animals.species,
          breed: animals.breed,
          sex: animals.sex,
          birthDate: animals.birthDate,
          birthDateIsEstimated: animals.birthDateIsEstimated,
          status: animals.status,
          neutered: animals.neutered,
          neuteredDate: animals.neuteredDate,
          notes: animals.notes,
          createdAt: animals.createdAt,
          updatedAt: animals.updatedAt,

          herdId: herds.id,
          herdName: herds.name,

          // current tag (nullable)
          tagNumber: animalTagHistory.tagNumber,
          tagColor: animalTagHistory.tagColor,
          tagEar: animalTagHistory.tagEar,
        })
        .from(animalHerdMembership)
        .innerJoin(herds, eq(animalHerdMembership.herdId, herds.id))
        .innerJoin(animals, eq(animalHerdMembership.animalId, animals.id))
        .leftJoin(
          animalTagHistory,
          and(eq(animalTagHistory.animalId, animals.id), isNull(animalTagHistory.endAt))
        )
        .where(and(...conditions))
        .orderBy(desc(animals.createdAt));

      return reply.send({
        ranchId,
        herdId: herdId ?? null,
        animals: rows,
      });
    } catch (err: any) {
      return sendError(reply, err);
    }
  });

  /**
   * GET /api/animals/:animalId
   *
   * Includes tag history (and current tag derived from end_at is null).
   */
  app.get("/animals/:animalId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const animalId = (req.params as any)?.animalId as string;
      if (!animalId) return reply.status(400).send({ error: "Missing animalId" });

      const scope = await requireCurrentMembershipScope(req.auth!.userId, animalId);

      const animalRows = await db.select().from(animals).where(eq(animals.id, animalId)).limit(1);
      const animal = animalRows[0];
      if (!animal) return reply.status(404).send({ error: "Animal not found" });

      const herdRows = await db
        .select({ id: herds.id, name: herds.name, ranchId: herds.ranchId })
        .from(herds)
        .where(eq(herds.id, scope.herdId))
        .limit(1);

      const herd = herdRows[0] ?? null;

      const tagHistory = await db
        .select()
        .from(animalTagHistory)
        .where(eq(animalTagHistory.animalId, animalId))
        .orderBy(desc(animalTagHistory.startAt), desc(animalTagHistory.createdAt))
        .limit(200);

      const currentTag = tagHistory.find((t: any) => t.endAt == null) ?? null;

      const intakeEvents = await db
        .select()
        .from(animalIntakeEvents)
        .where(eq(animalIntakeEvents.animalId, animalId))
        .orderBy(desc(animalIntakeEvents.createdAt))
        .limit(50);

      const measurements = await db
        .select()
        .from(animalMeasurements)
        .where(eq(animalMeasurements.animalId, animalId))
        .orderBy(desc(animalMeasurements.measuredAt), desc(animalMeasurements.createdAt))
        .limit(100);

      const notes = await db
        .select()
        .from(animalNotes)
        .where(eq(animalNotes.animalId, animalId))
        .orderBy(desc(animalNotes.noteAt), desc(animalNotes.createdAt))
        .limit(100);

      const taggedPhotos = await db
        .select({
          photoId: animalPhotos.id,
          ranchId: animalPhotos.ranchId,
          herdId: animalPhotos.herdId,
          animalId: animalPhotos.animalId,
          purpose: animalPhotos.purpose,
          storedFilename: animalPhotos.storedFilename,
          originalFilename: animalPhotos.originalFilename,
          mimeType: animalPhotos.mimeType,
          sizeBytes: animalPhotos.sizeBytes,
          width: animalPhotos.width,
          height: animalPhotos.height,
          capturedAt: animalPhotos.capturedAt,
          caption: animalPhotos.caption,
          createdAt: animalPhotos.createdAt,

          tagId: animalPhotoTags.id,
          tagType: animalPhotoTags.tagType,
          confidence: animalPhotoTags.confidence,
          tagNotes: animalPhotoTags.notes,
          tagCreatedAt: animalPhotoTags.createdAt,
        })
        .from(animalPhotoTags)
        .innerJoin(animalPhotos, eq(animalPhotoTags.photoId, animalPhotos.id))
        .where(and(eq(animalPhotoTags.animalId, animalId), eq(animalPhotoTags.ranchId, scope.ranchId)))
        .orderBy(desc(animalPhotos.createdAt))
        .limit(200);

      const documents = await db
        .select()
        .from(animalDocuments)
        .where(eq(animalDocuments.animalId, animalId))
        .orderBy(desc(animalDocuments.createdAt))
        .limit(200);

      return reply.send({
        animal,
        current: {
          ranchId: scope.ranchId,
          herdId: scope.herdId,
          membershipId: scope.membershipId,
          herd,
        },
        currentTag,
        tagHistory,
        intakeEvents,
        measurements,
        notes,
        photos: taggedPhotos,
        documents,
      });
    } catch (err: any) {
      return sendError(reply, err);
    }
  });

  /**
   * POST /api/animals/intake/birth
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

        await insertCurrentTag({
          tx,
          animalId,
          tagNumber: data.tagNumber ?? null,
          tagColor: data.tagColor ?? null,
          tagEar: (data.tagEar ?? null) as "left" | "right" | null,
          at: now,
          changeReason: "birth_intake",
          changedByUserId: null, // Option B for now; column is uuid
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

          status: data.status ?? "active",
          statusChangedAt: data.statusChangedAt ? new Date(data.statusChangedAt) : null,

          // lineage unknown on purchase (for now)
          damAnimalId: null,
          sireAnimalId: null,

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

        await insertCurrentTag({
          tx,
          animalId,
          tagNumber: data.tagNumber ?? null,
          tagColor: data.tagColor ?? null,
          tagEar: (data.tagEar ?? null) as "left" | "right" | null,
          at: now,
          changeReason: "purchase_intake",
          changedByUserId: null, // Option B for now; column is uuid
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
   * POST /api/animals/:animalId/measurements
   *
   * Appends a measurement row, with ranch_id + herd_id snapshots derived from current membership.
   */
  app.post("/animals/:animalId/measurements", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const animalId = (req.params as any)?.animalId as string;
      if (!animalId) return reply.status(400).send({ error: "Missing animalId" });

      const parsed = CreateMeasurementSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const scope = await requireCurrentMembershipScope(req.auth!.userId, animalId);
      const m = parsed.data;

      if ((m.valueNumber == null || Number.isNaN(m.valueNumber)) && !m.valueText) {
        return reply.status(400).send({ error: "Provide valueNumber or valueText" });
      }

      const id = uuid();
      const now = new Date();

      await db.insert(animalMeasurements).values({
        id,
        ranchId: scope.ranchId,
        herdId: scope.herdId,
        animalId,

        measurementType: m.measurementType,
        valueNumber: m.valueNumber == null ? null : String(m.valueNumber),
        valueText: m.valueText ?? null,
        unit: m.unit ?? null,
        notes: m.notes ?? null,

        measuredAt: m.measuredAt ? new Date(m.measuredAt) : now,
        createdAt: now,
      });

      return reply.status(201).send({ id });
    } catch (err: any) {
      return sendError(reply, err);
    }
  });

  /**
   * POST /api/animals/:animalId/notes
   *
   * Appends a note row, with ranch_id + herd_id snapshots derived from current membership.
   */
  app.post("/animals/:animalId/notes", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const animalId = (req.params as any)?.animalId as string;
      if (!animalId) return reply.status(400).send({ error: "Missing animalId" });

      const parsed = CreateNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const scope = await requireCurrentMembershipScope(req.auth!.userId, animalId);

      const n = parsed.data;
      const id = uuid();
      const now = new Date();

      await db.insert(animalNotes).values({
        id,
        ranchId: scope.ranchId,
        herdId: scope.herdId,
        animalId,

        noteType: n.noteType ?? null,
        content: n.content,

        noteAt: n.noteAt ? new Date(n.noteAt) : now,
        createdAt: now,
      });

      return reply.status(201).send({ id });
    } catch (err: any) {
      return sendError(reply, err);
    }
  });
}
