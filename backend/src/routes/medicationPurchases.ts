// src/routes/medicationPurchases.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, isNull, desc } from "drizzle-orm";

import { db } from "../db";

// NOTE: use whichever schema file actually exports these in your project.
// Your current file used ../db/schema. Keep that convention here.
import {
  medicationPurchases,
  suppliers,
  standardMedications,
  ranchMedicationStandards,
} from "../db/schema";

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function canonicalUnitFromFormat(format: string): string {
  switch ((format || "").toLowerCase()) {
    case "pill":
      return "pills";
    case "powder":
      return "g";
    case "liquid":
    case "injectable":
    case "paste":
    case "topical":
      return "mL";
    default:
      return "units";
  }
}

const CreatePurchaseBody = z.object({
  ranchId: z.string().min(1),

  // Either choose existing OR create inline
  standardMedicationId: z.string().min(1).optional(),
  createNewMedication: z
    .object({
      chemicalName: z.string().min(1),
      format: z.string().min(1),
      concentrationValue: z.union([z.string(), z.number()]).optional().nullable(),
      concentrationUnit: z.string().optional().nullable(),
      manufacturerName: z.string().min(1),
      brandName: z.string().min(1),
      onLabelDoseText: z.string().optional().nullable(),
      standard: z.object({
        usesOffLabel: z.boolean(),
        standardDoseText: z.string().min(1),
        startDate: z.string().min(10).optional(), // YYYY-MM-DD
      }),
    })
    .optional(),

  quantity: z.union([z.string(), z.number()]).transform((v) => {
    const s = String(v).trim();
    if (!s) throw new Error("Quantity is required");
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) throw new Error("Quantity must be a positive number");
    return n;
  }),

  totalPrice: z.union([z.string(), z.number()]).optional().nullable(),
  supplierName: z.string().min(1),
  purchaseDate: z.string().min(10).optional(), // default today
  notes: z.string().optional().nullable(),
});

const ListPurchasesQuery = z.object({
  ranchId: z.string().min(1),
  standardMedicationId: z.string().min(1),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(Number(v), 200) : 50)),
});

async function upsertSupplier(ranchId: string, name: string): Promise<string> {
  const normalized = normalizeName(name);

  const existing = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.ranchId, ranchId), eq(suppliers.nameNormalized, normalized)))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const supplierId = crypto.randomUUID();
  await db.insert(suppliers).values({
    id: supplierId,
    ranchId,
    name: name.trim(),
    nameNormalized: normalized,
    createdAt: new Date(),
  });

  return supplierId;
}

export async function medicationPurchasesRoutes(app: FastifyInstance) {
  /**
   * Create Purchase
   * - Append-only
   * - If createNewMedication provided: create standard_medications + active ranch standard in same transaction
   * - purchaseUnit is REMOVED. Unit is derived from standardMedications.format.
   */
  app.post("/medication-purchases", async (req, reply) => {
    const body = CreatePurchaseBody.parse(req.body);

    const now = new Date();
    const purchaseDate = body.purchaseDate ?? todayIsoDate();

    if (!!body.standardMedicationId === !!body.createNewMedication) {
      return reply.code(400).send({
        error: "Provide exactly one of standardMedicationId OR createNewMedication",
      });
    }

    let standardMedicationId: string;
    let medFormat: string;

    if (body.standardMedicationId) {
      // Verify med belongs to ranch + fetch format
      const rows = await db
        .select({
          id: standardMedications.id,
          format: standardMedications.format,
        })
        .from(standardMedications)
        .where(
          and(
            eq(standardMedications.ranchId, body.ranchId),
            eq(standardMedications.id, body.standardMedicationId),
          ),
        )
        .limit(1);

      if (rows.length === 0) {
        return reply.code(404).send({ error: "Standard medication not found" });
      }

      standardMedicationId = rows[0].id;
      medFormat = rows[0].format;
    } else {
      // Create new medication + new active standard
      const newMed = body.createNewMedication!;
      const medId = crypto.randomUUID();
      const standardId = crypto.randomUUID();
      const startDate = newMed.standard.startDate ?? todayIsoDate();

      await db.transaction(async (tx) => {
        await tx.insert(standardMedications).values({
          id: medId,
          ranchId: body.ranchId,
          chemicalName: newMed.chemicalName,
          format: newMed.format,
          concentrationValue:
            newMed.concentrationValue === null || newMed.concentrationValue === undefined
              ? null
              : String(newMed.concentrationValue),
          concentrationUnit: newMed.concentrationUnit ?? null,
          manufacturerName: newMed.manufacturerName,
          brandName: newMed.brandName,
          onLabelDoseText: newMed.onLabelDoseText ?? null,
          createdAt: now,
        });

        await tx.insert(ranchMedicationStandards).values({
          id: standardId,
          ranchId: body.ranchId,
          standardMedicationId: medId,
          usesOffLabel: newMed.standard.usesOffLabel,
          standardDoseText: newMed.standard.standardDoseText,
          startDate,
          endDate: null,
          createdAt: now,
        });
      });

      standardMedicationId = medId;
      medFormat = newMed.format;
    }

    // Ensure active ranch standard exists (only active standards are purchasable)
    const activeStandard = await db
      .select({ id: ranchMedicationStandards.id })
      .from(ranchMedicationStandards)
      .where(
        and(
          eq(ranchMedicationStandards.ranchId, body.ranchId),
          eq(ranchMedicationStandards.standardMedicationId, standardMedicationId),
          isNull(ranchMedicationStandards.endDate),
        ),
      )
      .limit(1);

    if (activeStandard.length === 0) {
      return reply.code(400).send({
        error: "Selected medication does not have an active ranch standard (it may be retired).",
      });
    }

    const supplierId = await upsertSupplier(body.ranchId, body.supplierName);

    const purchaseId = crypto.randomUUID();
    await db.insert(medicationPurchases).values({
      id: purchaseId,
      ranchId: body.ranchId,
      standardMedicationId,
      supplierId,
      purchaseDate,
      quantity: String(body.quantity),
      totalPrice:
        body.totalPrice === null || body.totalPrice === undefined ? null : String(body.totalPrice),
      notes: body.notes ?? null,
      createdAt: now,
    });

    return reply.send({
      purchase: {
        id: purchaseId,
        ranchId: body.ranchId,
        standardMedicationId,
        purchaseDate,
        quantity: String(body.quantity),
        unit: canonicalUnitFromFormat(medFormat),
        supplierId,
      },
    });
  });

  /**
   * Purchase history for a medication (derived unit)
   */
  app.get("/medication-purchases", async (req, reply) => {
    const q = ListPurchasesQuery.parse(req.query);

    const rows = await db
      .select({
        id: medicationPurchases.id,
        purchaseDate: medicationPurchases.purchaseDate,
        quantity: medicationPurchases.quantity,
        totalPrice: medicationPurchases.totalPrice,
        notes: medicationPurchases.notes,
        supplierId: medicationPurchases.supplierId,
        medFormat: standardMedications.format,
      })
      .from(medicationPurchases)
      .innerJoin(
        standardMedications,
        and(
          eq(standardMedications.id, medicationPurchases.standardMedicationId),
          eq(standardMedications.ranchId, q.ranchId),
        ),
      )
      .where(
        and(
          eq(medicationPurchases.ranchId, q.ranchId),
          eq(medicationPurchases.standardMedicationId, q.standardMedicationId),
        ),
      )
      .orderBy(desc(medicationPurchases.purchaseDate), desc(medicationPurchases.createdAt))
      .limit(q.limit);

    return reply.send({
      purchases: rows.map((r) => ({
        id: r.id,
        purchaseDate: r.purchaseDate,
        quantity: r.quantity,
        unit: canonicalUnitFromFormat(r.medFormat),
        totalPrice: r.totalPrice,
        notes: r.notes,
        supplierId: r.supplierId,
      })),
    });
  });
}
