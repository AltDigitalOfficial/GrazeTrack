// src/routes/medicationPurchases.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, isNull, desc } from "drizzle-orm";
import {
  medicationPurchases,
  suppliers,
  standardMedications,
  ranchMedicationStandards,
} from "../db/schema";

// Adjust this import to your actual DB export location:
import { db } from "../db";

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

const CreatePurchaseBody = z.object({
  ranchId: z.string().min(1),

  // user either selects an existing standardMedicationId OR creates a new one inline
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

  quantity: z.union([z.string(), z.number()]),
  purchaseUnit: z.string().min(1),
  totalPrice: z.union([z.string(), z.number()]).optional().nullable(),

  supplierName: z.string().optional().nullable(), // "Walmart"
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
    .where(and(eq(suppliers.ranchId, ranchId), eq(suppliers.nameNormalized, normalized)));

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
   * - supports inline "Add New Medication" creation (standard_medications + active ranch standard)
   * - supplier upsert
   * - append-only purchase record
   */
  app.post("/medication-purchases", async (req, reply) => {
    const body = CreatePurchaseBody.parse(req.body);

    const now = new Date();
    const purchaseDate = body.purchaseDate ?? todayIsoDate();

    // Determine standardMedicationId:
    // - if user selected an existing med, use it
    // - otherwise, they must provide createNewMedication, and we create it inline
    let standardMedicationId: string;

    if (body.standardMedicationId) {
      standardMedicationId = body.standardMedicationId;
    } else {
      const newMed = body.createNewMedication;
      if (!newMed) {
        return reply.code(400).send({
          error: "Must provide standardMedicationId or createNewMedication",
        });
      }

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
    }

    // Ensure the medication is eligible for dropdown logic:
    // only meds with an active standard should be purchasable (per your workflow).
    const activeStandard = await db
      .select({ id: ranchMedicationStandards.id })
      .from(ranchMedicationStandards)
      .where(
        and(
          eq(ranchMedicationStandards.ranchId, body.ranchId),
          eq(ranchMedicationStandards.standardMedicationId, standardMedicationId),
          isNull(ranchMedicationStandards.endDate),
        ),
      );

    if (activeStandard.length === 0) {
      return reply.code(400).send({
        error: "Selected medication does not have an active ranch standard (it may be retired).",
      });
    }

    let supplierId: string | null = null;
    if (body.supplierName && body.supplierName.trim().length > 0) {
      supplierId = await upsertSupplier(body.ranchId, body.supplierName);
    }

    const purchaseId = crypto.randomUUID();
    await db.insert(medicationPurchases).values({
      id: purchaseId,
      ranchId: body.ranchId,
      standardMedicationId,
      supplierId,
      purchaseDate,
      quantity: String(body.quantity),
      purchaseUnit: body.purchaseUnit,
      totalPrice:
        body.totalPrice === null || body.totalPrice === undefined ? null : String(body.totalPrice),
      notes: body.notes ?? null,
      createdAt: now,
    });

    return reply.send({
      purchase: {
        id: purchaseId,
        standardMedicationId,
        supplierId,
        purchaseDate,
      },
    });
  });

  /**
   * Purchase history for a medication
   */
  app.get("/medication-purchases", async (req, reply) => {
    const q = ListPurchasesQuery.parse(req.query);

    const rows = await db
      .select({
        id: medicationPurchases.id,
        purchaseDate: medicationPurchases.purchaseDate,
        quantity: medicationPurchases.quantity,
        purchaseUnit: medicationPurchases.purchaseUnit,
        totalPrice: medicationPurchases.totalPrice,
        notes: medicationPurchases.notes,
        supplierId: medicationPurchases.supplierId,

        supplierName: suppliers.name,
      })
      .from(medicationPurchases)
      .leftJoin(
        suppliers,
        and(eq(suppliers.id, medicationPurchases.supplierId), eq(suppliers.ranchId, q.ranchId)),
      )
      .where(
        and(
          eq(medicationPurchases.ranchId, q.ranchId),
          eq(medicationPurchases.standardMedicationId, q.standardMedicationId),
        ),
      )
      .orderBy(desc(medicationPurchases.purchaseDate), desc(medicationPurchases.createdAt))
      .limit(q.limit);

    return reply.send({ purchases: rows });
  });
}
