// src/routes/medications.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, isNull, sql, desc } from "drizzle-orm";
import {
  standardMedications,
  ranchMedicationStandards,
  medicationPurchases,
} from "../db/schema";

// Adjust this import to your actual DB export location:
import { db } from "../db";

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  includeRetired: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

const RetireStandardParams = z.object({
  id: z.string().min(1),
});
const RetireStandardBody = z.object({
  ranchId: z.string().min(1),
  endDate: z.string().min(10).optional(), // YYYY-MM-DD
});

export async function medicationsRoutes(app: FastifyInstance) {
  /**
   * Create a Standard Medication + initial active Ranch Standard
   *
   * IMPORTANT:
   * server.ts registers this routes file with prefix "/api"
   * so this path becomes POST /api/standard-medications
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
   * Dropdown source for "Record Purchase":
   * only Standard Medications that have an ACTIVE standard (endDate is null)
   *
   * GET /api/standard-medications/active?ranchId=...
   */
  app.get("/standard-medications/active", async (req, reply) => {
    const q = ListActiveDropdownQuery.parse(req.query);

    const rows = await db
      .select({
        medicationId: standardMedications.id,
        ranchId: standardMedications.ranchId,
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
   * GET /api/medications/inventory?ranchId=...
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

        purchaseUnit: medicationPurchases.purchaseUnit,
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
        standardMedications.brandName,
        medicationPurchases.purchaseUnit
      )
      .orderBy(standardMedications.chemicalName, standardMedications.brandName);

    const map = new Map<
      string,
      {
        id: string;
        displayName: string;
        units: Array<{ unit: string; quantity: string }>;
        lastPurchaseDate: string | null;
      }
    >();

    for (const r of rows) {
      const existing = map.get(r.medicationId);
      const displayName = buildDisplayName({
        chemicalName: r.chemicalName,
        brandName: r.brandName,
        manufacturerName: r.manufacturerName,
        format: r.format,
        concentrationValue: r.concentrationValue,
        concentrationUnit: r.concentrationUnit,
      });

      if (!existing) {
        map.set(r.medicationId, {
          id: r.medicationId,
          displayName,
          units: [],
          lastPurchaseDate: r.lastPurchaseDate ?? null,
        });
      }

      const entry = map.get(r.medicationId)!;

      if (r.purchaseUnit) {
        entry.units.push({ unit: r.purchaseUnit, quantity: r.onHandQuantity });
      }

      if (r.lastPurchaseDate) {
        if (!entry.lastPurchaseDate || r.lastPurchaseDate > entry.lastPurchaseDate) {
          entry.lastPurchaseDate = r.lastPurchaseDate;
        }
      }
    }

    return reply.send({ inventory: Array.from(map.values()) });
  });

  /**
   * Standards list
   * GET /api/ranch-medication-standards?ranchId=...&includeRetired=true|false
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
   * Retire a standard
   * POST /api/ranch-medication-standards/:id/retire
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
