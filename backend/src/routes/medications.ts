// src/routes/medications.ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import path from "path";
import fs from "fs";

import { ensureRanchStructure, saveUploadedFile } from "../../lib/storage.js";
import { db } from "../db";
import {
  userRanches,
  standardMedications,
  ranchMedicationStandards,
  medicationPurchases,
  standardMedicationImages,
} from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function getActiveRanchId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ ranchId: userRanches.ranchId })
    .from(userRanches)
    .where(eq(userRanches.userId, userId))
    .limit(1);

  return rows[0]?.ranchId ?? null;
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

/**
 * We support multipart:
 * - fields in req.body
 * - files in req.saveRequestFiles()
 */
async function parseMultipartRequest(req: any): Promise<{
  body: Record<string, any>;
  files: any[];
}> {
  const contentType = String(req.headers?.["content-type"] ?? "");
  const isMultipart = contentType.includes("multipart/form-data");

  if (isMultipart && typeof req.saveRequestFiles === "function") {
    const files = await req.saveRequestFiles();
    return { body: (req.body ?? {}) as Record<string, any>, files };
  }

  return { body: (req.body ?? {}) as Record<string, any>, files: [] };
}

const CreateStandardMedicationBody = z.object({
  chemicalName: z.string().min(1),
  format: z.string().min(1),

  concentrationValue: z.union([z.string(), z.number()]).optional().nullable(),
  concentrationUnit: z.string().optional().nullable(),

  manufacturerName: z.string().min(1), // allow "Generic"
  brandName: z.string().min(1), // allow "Generic"

  onLabelDoseText: z.string().optional().nullable(),

  standard: z.object({
    usesOffLabel: z.union([z.boolean(), z.string()]).transform((v) => v === true || v === "true"),
    standardDoseText: z.string().min(1),
    startDate: z.string().min(10).optional(), // YYYY-MM-DD
  }),
});

const ListActiveDropdownQuery = z.object({
  // no ranchId here; derived from session
});

const ListInventoryQuery = z.object({
  // no ranchId here; derived from session
});

const ListStandardsQuery = z.object({
  includeRetired: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

const RetireStandardParams = z.object({
  id: z.string().min(1),
});
const RetireStandardBody = z.object({
  endDate: z.string().min(10).optional(), // YYYY-MM-DD
});

export async function medicationsRoutes(app: FastifyInstance) {
  /**
   * CREATE Standard Medication + initial active Ranch Standard
   * + optional images saved to:
   *   images/ranches/<ranchId>/medications/standards/<standardMedicationId>/<purpose>/
   *
   * Expected multipart file fieldnames (can repeat each):
   * - label
   * - insert
   * - misc
   */
  app.post("/standard-medications", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const { body, files } = await parseMultipartRequest(req);

      // Body can come as flat JSON (application/json) OR as multipart fields.
      // Support both:
      const parsed = CreateStandardMedicationBody.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid standard medication payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const medicationId = crypto.randomUUID();
      const standardId = crypto.randomUUID();

      const now = new Date();
      const startDate = data.standard.startDate ?? todayIsoDate();

      // Create the DB records first, then save images (or in a transaction with best-effort file saving)
      await db.transaction(async (tx) => {
        await tx.insert(standardMedications).values({
          id: medicationId,
          ranchId,
          chemicalName: data.chemicalName,
          format: data.format,
          concentrationValue:
            data.concentrationValue === null || data.concentrationValue === undefined
              ? null
              : String(data.concentrationValue),
          concentrationUnit: data.concentrationUnit ?? null,
          manufacturerName: data.manufacturerName,
          brandName: data.brandName,
          onLabelDoseText: data.onLabelDoseText ?? null,
          createdAt: now,
        });

        await tx.insert(ranchMedicationStandards).values({
          id: standardId,
          ranchId,
          standardMedicationId: medicationId,
          usesOffLabel: data.standard.usesOffLabel,
          standardDoseText: data.standard.standardDoseText,
          startDate,
          endDate: null,
          createdAt: now,
        });
      });

      // Save files to disk + insert image records
      if (files.length > 0) {
        const ranchRoot = await ensureRanchStructure(ranchId);

        for (const file of files) {
          const field = String(file.fieldname || "").toLowerCase();

          // standard purposes
          const purpose = field === "label" || field === "insert" || field === "misc" ? field : "misc";

          const destDir = path.join(
            ranchRoot,
            "medications",
            "standards",
            medicationId,
            purpose
          );

          ensureDir(destDir);

          const saved = await saveUploadedFile(file, destDir);

          await db.insert(standardMedicationImages).values({
            id: crypto.randomUUID(),
            ranchId,
            standardMedicationId: medicationId,
            purpose,
            storedFilename: saved.filename,
            originalFilename: file.filename ?? null,
            mimeType: file.mimetype ?? null,
            sizeBytes: typeof file.size === "number" ? file.size : null,
            // created_at default in DB
          });
        }
      }

      return reply.send({
        medication: {
          id: medicationId,
          displayName: buildDisplayName({
            chemicalName: data.chemicalName,
            brandName: data.brandName,
            manufacturerName: data.manufacturerName,
            format: data.format,
            concentrationValue:
              data.concentrationValue === null || data.concentrationValue === undefined
                ? null
                : String(data.concentrationValue),
            concentrationUnit: data.concentrationUnit ?? null,
          }),
          currentStandard: {
            id: standardId,
            usesOffLabel: data.standard.usesOffLabel,
            standardDoseText: data.standard.standardDoseText,
            startDate,
            endDate: null,
          },
        },
      });
    } catch (err: any) {
      req.log.error({ err }, "Failed to create standard medication");
      return reply.status(500).send({
        error: "Failed to create standard medication",
        message: err?.message,
      });
    }
  });

  /**
   * ACTIVE medications for dropdown (only those with active standard)
   */
  app.get("/standard-medications/active", { preHandler: requireAuth }, async (req, reply) => {
    try {
      // validate query shape (even though empty, keeps pattern consistent)
      ListActiveDropdownQuery.parse(req.query ?? {});

      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

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
            eq(ranchMedicationStandards.ranchId, ranchId),
            isNull(ranchMedicationStandards.endDate)
          )
        )
        .where(eq(standardMedications.ranchId, ranchId))
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
    } catch (err: any) {
      req.log.error({ err }, "Failed to list active medications");
      return reply.status(500).send({ error: "Failed to list active medications", message: err?.message });
    }
  });

  /**
   * INVENTORY derived from purchases (no purchase_unit; unit derived from medication format)
   */
  app.get("/medications/inventory", { preHandler: requireAuth }, async (req, reply) => {
    try {
      ListInventoryQuery.parse(req.query ?? {});

      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

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
            eq(medicationPurchases.ranchId, ranchId)
          )
        )
        .where(eq(standardMedications.ranchId, ranchId))
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
    } catch (err: any) {
      req.log.error({ err }, "Failed to load inventory");
      return reply.status(500).send({ error: "Failed to load inventory", message: err?.message });
    }
  });

  /**
   * Ranch Standards list (include retired toggle)
   */
  app.get("/ranch-medication-standards", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const q = ListStandardsQuery.parse(req.query ?? {});
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const whereClause = q.includeRetired
        ? eq(ranchMedicationStandards.ranchId, ranchId)
        : and(eq(ranchMedicationStandards.ranchId, ranchId), isNull(ranchMedicationStandards.endDate));

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
            eq(standardMedications.ranchId, ranchId)
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
    } catch (err: any) {
      req.log.error({ err }, "Failed to list medication standards");
      return reply.status(500).send({ error: "Failed to list medication standards", message: err?.message });
    }
  });

  /**
   * Retire a standard (set endDate)
   */
  app.post("/ranch-medication-standards/:id/retire", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const params = RetireStandardParams.parse(req.params ?? {});
      const body = RetireStandardBody.parse(req.body ?? {});

      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const endDate = body.endDate ?? todayIsoDate();

      const updated = await db
        .update(ranchMedicationStandards)
        .set({ endDate })
        .where(and(eq(ranchMedicationStandards.id, params.id), eq(ranchMedicationStandards.ranchId, ranchId)))
        .returning({
          id: ranchMedicationStandards.id,
          standardMedicationId: ranchMedicationStandards.standardMedicationId,
          endDate: ranchMedicationStandards.endDate,
        });

      if (updated.length === 0) {
        return reply.status(404).send({ error: "Standard not found" });
      }

      return reply.send({ retired: updated[0] });
    } catch (err: any) {
      req.log.error({ err }, "Failed to retire medication standard");
      return reply.status(500).send({ error: "Failed to retire medication standard", message: err?.message });
    }
  });
}
