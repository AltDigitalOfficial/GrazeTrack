// src/routes/medications.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db";

// Keep your project’s export style consistent.
// Your current file imports from ../db/schema, so we keep that.
import { medicationPurchases, ranchMedicationStandards, standardMedications } from "../db/schema";

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

function buildDisplayName(m: {
  chemicalName: string;
  brandName: string;
  manufacturerName: string;
  format: string;
  concentrationValue: string | null;
  concentrationUnit: string | null;
}): string {
  const conc =
    m.concentrationValue && m.concentrationUnit
      ? ` ${m.concentrationValue}${m.concentrationUnit}`
      : "";
  return `${m.brandName} — ${m.chemicalName}${conc} (${m.format})`;
}

const CreateStandardMedicationBody = z.object({
  ranchId: z.string().min(1),

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
});

const ListActiveDropdownQuery = z.object({
  ranchId: z.string().min(1),
});

const ListInventoryQuery = z.object({
  ranchId: z.string().min(1),
});

const ListStandardsQuery = z.object({
  ranchId: z.string().min(1),
  includeRetired: z.string().optional().transform((v) => v === "true"),
});

const RetireStandardParams = z.object({ id: z.string().min(1) });
const RetireStandardBody = z.object({
  ranchId: z.string().min(1),
  endDate: z.string().min(10).optional(),
});

export async function medicationsRoutes(app: FastifyInstance) {
  /**
   * Create Standard Medication + initial active Ranch Standard
   */
  app.post("/standard-medications", async (req, reply) => {
    const body = CreateStandardMedicationBody.parse(req.body);

    const medicationId = crypto.randomUUID();
    const standardId = crypto.randomUUID();

    const now = new Date();
    const startDate = body.standard.startDate ?? todayIsoDate();

    await db.transaction(async (tx) => {
      await tx.insert(standardMedications).values({
        id: medicationId,
        ranchId: body.ranchId,
        chemicalName: body.chemicalName,
        format: body.format,
        concentrationValue:
          body.concentrationValue === null || body.concentrationValue === undefined
            ? null
            : String(body.concentrationValue),
        concentrationUnit: body.concentrationUnit ?? null,
        manufacturerName: body.manufacturerName,
        brandName: body.brandName,
        onLabelDoseText: body.onLabelDoseText ?? null,
        createdAt: now,
      });

      await tx.insert(ranchMedicationStandards).values({
        id: standardId,
        ranchId: body.ranchId,
        standardMedicationId: medicationId,
        usesOffLabel: body.standard.usesOffLabel,
        standardDoseText: body.standard.standardDoseText,
        startDate,
        endDate: null,
        createdAt: now,
      });
    });

    return reply.send({
      medication: {
        id: medicationId,
        displayName: buildDisplayName({
          chemicalName: body.chemicalName,
          brandName: body.brandName,
          manufacturerName: body.manufacturerName,
          format: body.format,
          concentrationValue:
            body.concentrationValue === null || body.concentrationValue === undefined
              ? null
              : String(body.concentrationValue),
          concentrationUnit: body.concentrationUnit ?? null,
        }),
        currentStandard: {
          id: standardId,
          usesOffLabel: body.standard.usesOffLabel,
          standardDoseText: body.standard.standardDoseText,
          startDate,
          endDate: null,
        },
      },
    });
  });

  /**
   * Dropdown for Record Purchase:
   * only medications with an ACTIVE standard (endDate is null)
   */
  app.get("/standard-medications/active", async (req, reply) => {
    const q = ListActiveDropdownQuery.parse(req.query);

    const rows = await db
      .select({
        medicationId: standardMedications.id,
        chemicalName: standardMedications.chemicalName,
        format: standardMedications.format,
        concentrationValue: standardMedications.concentrationValue,
        concentrationUnit: standardMedications.concentrationUnit,
        manufacturerName: standardMedications.manufacturerName,
        brandName: standardMedications.brandName,
        onLabelDoseText: standardMedications.onLabelDoseText,

        standardId: ranchMedicationStandards.id,
        usesOffLabel: ranchMedicationStandards.usesOffLabel,
        standardDoseText: ranchMedicationStandards.standardDoseText,
        startDate: ranchMedicationStandards.startDate,
        endDate: ranchMedicationStandards.endDate,
      })
      .from(standardMedications)
      .innerJoin(
        ranchMedicationStandards,
        and(
          eq(ranchMedicationStandards.standardMedicationId, standardMedications.id),
          eq(ranchMedicationStandards.ranchId, q.ranchId),
          isNull(ranchMedicationStandards.endDate)
        )
      )
      .where(eq(standardMedications.ranchId, q.ranchId))
      .orderBy(standardMedications.chemicalName, standardMedications.brandName);

    return reply.send({
      medications: rows.map((r) => ({
        id: r.medicationId,
        chemicalName: r.chemicalName,
        format: r.format,
        concentrationValue: r.concentrationValue,
        concentrationUnit: r.concentrationUnit,
        manufacturerName: r.manufacturerName,
        brandName: r.brandName,
        onLabelDoseText: r.onLabelDoseText,
        displayName: buildDisplayName({
          chemicalName: r.chemicalName,
          brandName: r.brandName,
          manufacturerName: r.manufacturerName,
          format: r.format,
          concentrationValue: r.concentrationValue,
          concentrationUnit: r.concentrationUnit,
        }),
        currentStandard: {
          id: r.standardId,
          usesOffLabel: r.usesOffLabel,
          standardDoseText: r.standardDoseText,
          startDate: r.startDate,
          endDate: r.endDate,
        },
      })),
    });
  });

  /**
   * Inventory derived from purchases
   * - purchase_unit removed entirely
   * - quantity is always treated as canonical units derived from medication format
   */
  app.get("/medications/inventory", async (req, reply) => {
    const q = ListInventoryQuery.parse(req.query);

    const rows = await db
      .select({
        medicationId: standardMedications.id,
        chemicalName: standardMedications.chemicalName,
        format: standardMedications.format,
        concentrationValue: standardMedications.concentrationValue,
        concentrationUnit: standardMedications.concentrationUnit,
        manufacturerName: standardMedications.manufacturerName,
        brandName: standardMedications.brandName,

        onHandQuantity: sql<string>`COALESCE(SUM(${medicationPurchases.quantity}), 0)`,
        lastPurchaseDate: sql<string | null>`MAX(${medicationPurchases.purchaseDate})`,
      })
      .from(standardMedications)
      .leftJoin(
        medicationPurchases,
        and(
          eq(medicationPurchases.standardMedicationId, standardMedications.id),
          eq(medicationPurchases.ranchId, q.ranchId)
        )
      )
      .where(eq(standardMedications.ranchId, q.ranchId))
      .groupBy(
        standardMedications.id,
        standardMedications.chemicalName,
        standardMedications.format,
        standardMedications.concentrationValue,
        standardMedications.concentrationUnit,
        standardMedications.manufacturerName,
        standardMedications.brandName
      )
      .orderBy(standardMedications.chemicalName, standardMedications.brandName);

    return reply.send({
      inventory: rows.map((r) => ({
        id: r.medicationId,
        displayName: buildDisplayName({
          chemicalName: r.chemicalName,
          brandName: r.brandName,
          manufacturerName: r.manufacturerName,
          format: r.format,
          concentrationValue: r.concentrationValue,
          concentrationUnit: r.concentrationUnit,
        }),
        quantity: r.onHandQuantity,
        unit: canonicalUnitFromFormat(r.format),
        lastPurchaseDate: r.lastPurchaseDate ?? null,
      })),
    });
  });

  /**
   * Ranch standards list (includeRetired toggle)
   */
  app.get("/ranch-medication-standards", async (req, reply) => {
    const q = ListStandardsQuery.parse(req.query);

    const whereClause = q.includeRetired
      ? eq(ranchMedicationStandards.ranchId, q.ranchId)
      : and(eq(ranchMedicationStandards.ranchId, q.ranchId), isNull(ranchMedicationStandards.endDate));

    const rows = await db
      .select({
        standardId: ranchMedicationStandards.id,
        standardMedicationId: ranchMedicationStandards.standardMedicationId,
        usesOffLabel: ranchMedicationStandards.usesOffLabel,
        standardDoseText: ranchMedicationStandards.standardDoseText,
        startDate: ranchMedicationStandards.startDate,
        endDate: ranchMedicationStandards.endDate,
        createdAt: ranchMedicationStandards.createdAt,

        chemicalName: standardMedications.chemicalName,
        format: standardMedications.format,
        concentrationValue: standardMedications.concentrationValue,
        concentrationUnit: standardMedications.concentrationUnit,
        manufacturerName: standardMedications.manufacturerName,
        brandName: standardMedications.brandName,
      })
      .from(ranchMedicationStandards)
      .innerJoin(
        standardMedications,
        and(
          eq(standardMedications.id, ranchMedicationStandards.standardMedicationId),
          eq(standardMedications.ranchId, q.ranchId)
        )
      )
      .where(whereClause)
      .orderBy(desc(ranchMedicationStandards.startDate), standardMedications.chemicalName);

    return reply.send({
      standards: rows.map((r) => ({
        id: r.standardId,
        standardMedicationId: r.standardMedicationId,
        medicationDisplayName: buildDisplayName({
          chemicalName: r.chemicalName,
          brandName: r.brandName,
          manufacturerName: r.manufacturerName,
          format: r.format,
          concentrationValue: r.concentrationValue,
          concentrationUnit: r.concentrationUnit,
        }),
        usesOffLabel: r.usesOffLabel,
        standardDoseText: r.standardDoseText,
        startDate: r.startDate,
        endDate: r.endDate,
        createdAt: r.createdAt,
      })),
    });
  });

  /**
   * Retire a standard (sets endDate)
   */
  app.post("/ranch-medication-standards/:id/retire", async (req, reply) => {
    const params = RetireStandardParams.parse(req.params);
    const body = RetireStandardBody.parse(req.body);

    const endDate = body.endDate ?? todayIsoDate();

    const updated = await db
      .update(ranchMedicationStandards)
      .set({ endDate })
      .where(
        and(
          eq(ranchMedicationStandards.id, params.id),
          eq(ranchMedicationStandards.ranchId, body.ranchId)
        )
      )
      .returning({
        id: ranchMedicationStandards.id,
        standardMedicationId: ranchMedicationStandards.standardMedicationId,
        endDate: ranchMedicationStandards.endDate,
      });

    if (updated.length === 0) {
      return reply.code(404).send({ error: "Standard not found" });
    }

    return reply.send({ retired: updated[0] });
  });
}
