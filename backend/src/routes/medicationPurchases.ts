// src/routes/medicationPurchases.ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import path from "path";
import fs from "fs";

import { ensureRanchStructure, saveUploadedFile } from "../../lib/storage.js";
import { db } from "../db";
import {
  userRanches,
  suppliers,
  standardMedications,
  ranchMedicationStandards,
  medicationPurchases,
  medicationPurchaseImages,
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

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function parseMultipartRequest(req: any): Promise<{
  body: Record<string, any>;
  files: any[];
}> {
  const contentType = String(req.headers?.["content-type"] ?? "");
  const isMultipart = contentType.includes("multipart/form-data");

  // For multipart, read parts from the stream. req.body is often empty unless attachFieldsToBody is enabled.
  if (isMultipart && typeof req.parts === "function") {
    const body: Record<string, any> = {};
    const files: any[] = [];

    for await (const part of req.parts()) {
      if (part.type === "file") files.push(part);
      else body[part.fieldname] = part.value;
    }

    return { body, files };
  }

  // Fallback for setups that write temp files and populate req.body
  if (isMultipart && typeof req.saveRequestFiles === "function") {
    const files = await req.saveRequestFiles();
    return { body: (req.body ?? {}) as Record<string, any>, files };
  }

  return { body: (req.body ?? {}) as Record<string, any>, files: [] };
}

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

/**
 * Accept either:
 * - standardMedicationId
 * OR
 * - createNewMedication (and also create an active ranch standard)
 *
 * For multipart, createNewMedication can be passed as JSON string in a field.
 */
const CreatePurchaseBody = z.object({
  standardMedicationId: z.string().optional(),

  createNewMedication: z
    .union([
      z.object({
        chemicalName: z.string().min(1),
        format: z.string().min(1),
        concentrationValue: z.union([z.string(), z.number()]).optional().nullable(),
        concentrationUnit: z.string().optional().nullable(),
        manufacturerName: z.string().min(1),
        brandName: z.string().min(1),
        onLabelDoseText: z.string().optional().nullable(),
        standard: z.object({
          usesOffLabel: z.union([z.boolean(), z.string()]).transform((v) => v === true || v === "true"),
          standardDoseText: z.string().min(1),
          startDate: z.string().min(10).optional(),
        }),
      }),
      z.string(), // JSON string
    ])
    .optional(),

  quantity: z.union([z.string(), z.number()]).transform((v) => {
    const s = String(v).trim();
    if (!s) throw new Error("Quantity is required");
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) throw new Error("Quantity must be a positive number");
    return String(n);
  }),

  totalPrice: z.union([z.string(), z.number()]).optional().nullable(),
  supplierName: z.string().optional().nullable(),
  purchaseDate: z.string().min(10).optional(),
  notes: z.string().optional().nullable(),
});

const ListPurchasesQuery = z.object({
  standardMedicationId: z.string().min(1),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(Number(v), 200) : 50)),
});

const PurchaseParams = z.object({
  purchaseId: z.string().min(1),
});

export async function medicationPurchasesRoutes(app: FastifyInstance) {
  /**
   * Purchase images for a purchase
   */
  app.get("/medication-purchases/:purchaseId/images", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const { purchaseId } = PurchaseParams.parse(req.params ?? {});

      // Verify purchase exists + belongs to ranch
      const exists = await db
        .select({ id: medicationPurchases.id })
        .from(medicationPurchases)
        .where(and(eq(medicationPurchases.ranchId, ranchId), eq(medicationPurchases.id, purchaseId)))
        .limit(1);

      if (!exists.length) return reply.status(404).send({ error: "Purchase not found" });

      const rows = await db
        .select({
          id: medicationPurchaseImages.id,
          purpose: medicationPurchaseImages.purpose,
          storedFilename: medicationPurchaseImages.storedFilename,
          originalFilename: medicationPurchaseImages.originalFilename,
          mimeType: medicationPurchaseImages.mimeType,
          sizeBytes: medicationPurchaseImages.sizeBytes,
          createdAt: medicationPurchaseImages.createdAt,
        })
        .from(medicationPurchaseImages)
        .where(
          and(
            eq(medicationPurchaseImages.ranchId, ranchId),
            eq(medicationPurchaseImages.medicationPurchaseId, purchaseId)
          )
        )
        .orderBy(desc(medicationPurchaseImages.createdAt));

      const images = rows.map((r) => ({
        id: r.id,
        purpose: r.purpose,
        storedFilename: r.storedFilename,
        originalFilename: r.originalFilename ?? null,
        mimeType: r.mimeType ?? null,
        sizeBytes: r.sizeBytes ?? null,
        createdAt: r.createdAt,
        url: `/images/ranches/${ranchId}/medications/purchases/${purchaseId}/${r.purpose}/${r.storedFilename}`,
      }));

      return reply.send({ images });
    } catch (err: any) {
      req.log.error({ err }, "Failed to load purchase images");
      return reply.status(500).send({ error: "Failed to load purchase images", message: err?.message });
    }
  });

  /**
   * Purchase detail (read-only)
   */
  app.get("/medication-purchases/:purchaseId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const { purchaseId } = PurchaseParams.parse(req.params ?? {});

      const rows = await db
        .select({
          id: medicationPurchases.id,
          ranchId: medicationPurchases.ranchId,
          standardMedicationId: medicationPurchases.standardMedicationId,
          supplierId: medicationPurchases.supplierId,
          purchaseDate: medicationPurchases.purchaseDate,
          quantity: medicationPurchases.quantity,
          totalPrice: medicationPurchases.totalPrice,
          notes: medicationPurchases.notes,
          createdAt: medicationPurchases.createdAt,

          supplierName: suppliers.name,

          // Medication fields (for header/identity)
          chemicalName: standardMedications.chemicalName,
          format: standardMedications.format,
          concentrationValue: standardMedications.concentrationValue,
          concentrationUnit: standardMedications.concentrationUnit,
          manufacturerName: standardMedications.manufacturerName,
          brandName: standardMedications.brandName,
        })
        .from(medicationPurchases)
        .leftJoin(suppliers, and(eq(suppliers.id, medicationPurchases.supplierId), eq(suppliers.ranchId, ranchId)))
        .leftJoin(
          standardMedications,
          and(eq(standardMedications.id, medicationPurchases.standardMedicationId), eq(standardMedications.ranchId, ranchId))
        )
        .where(and(eq(medicationPurchases.ranchId, ranchId), eq(medicationPurchases.id, purchaseId)))
        .limit(1);

      if (!rows.length) return reply.status(404).send({ error: "Purchase not found" });

      return reply.send({ purchase: rows[0] });
    } catch (err: any) {
      req.log.error({ err }, "Failed to load purchase detail");
      return reply.status(500).send({ error: "Failed to load purchase detail", message: err?.message });
    }
  });

  /**
   * CREATE purchase (append-only)
   * + optional images saved to:
   *   images/ranches/<ranchId>/medications/purchases/<purchaseId>/<purpose>/
   *
   * Expected multipart file fieldnames (can repeat each):
   * - receipt
   * - label
   * - packaging
   * - misc
   */
  app.post("/medication-purchases", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const { body, files } = await parseMultipartRequest(req);

      // Parse createNewMedication JSON string if provided that way
      if (typeof body.createNewMedication === "string") {
        try {
          body.createNewMedication = JSON.parse(body.createNewMedication);
        } catch {
          return reply.status(400).send({ error: "createNewMedication must be valid JSON" });
        }
      }

      const parsed = CreatePurchaseBody.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid purchase payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const now = new Date();
      const purchaseDate = data.purchaseDate ?? todayIsoDate();

      // Must provide exactly one of standardMedicationId or createNewMedication
      const hasExisting = !!(data.standardMedicationId && data.standardMedicationId.trim().length > 0);
      const hasCreateNew = !!data.createNewMedication;

      if (hasExisting === hasCreateNew) {
        return reply.status(400).send({
          error: "Provide exactly one of standardMedicationId OR createNewMedication",
        });
      }

      let standardMedicationId = data.standardMedicationId;

      // Create new standard_medications + active standard if requested
      if (!standardMedicationId && data.createNewMedication && typeof data.createNewMedication !== "string") {
        const newMed = data.createNewMedication;
        const medId = crypto.randomUUID();
        const standardId = crypto.randomUUID();
        const startDate = newMed.standard.startDate ?? todayIsoDate();

        await db.transaction(async (tx) => {
          await tx.insert(standardMedications).values({
            id: medId,
            ranchId,
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
            ranchId,
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

      // Verify chosen medication exists in this ranch
      const medRow = await db
        .select({ id: standardMedications.id })
        .from(standardMedications)
        .where(and(eq(standardMedications.id, standardMedicationId!), eq(standardMedications.ranchId, ranchId)))
        .limit(1);

      if (!medRow.length) {
        return reply.status(404).send({ error: "Medication not found" });
      }

      // Only meds with active standard are purchasable
      const activeStd = await db
        .select({ id: ranchMedicationStandards.id })
        .from(ranchMedicationStandards)
        .where(
          and(
            eq(ranchMedicationStandards.ranchId, ranchId),
            eq(ranchMedicationStandards.standardMedicationId, standardMedicationId!),
            isNull(ranchMedicationStandards.endDate)
          )
        )
        .limit(1);

      if (!activeStd.length) {
        return reply.status(400).send({
          error: "Selected medication does not have an active ranch standard (it may be retired).",
        });
      }

      // Supplier upsert (optional)
      let supplierId: string | null = null;
      if (data.supplierName && data.supplierName.trim().length > 0) {
        supplierId = await upsertSupplier(ranchId, data.supplierName);
      }

      // Insert purchase
      const purchaseId = crypto.randomUUID();
      await db.insert(medicationPurchases).values({
        id: purchaseId,
        ranchId,
        standardMedicationId: standardMedicationId!,
        supplierId,
        purchaseDate,
        quantity: data.quantity,
        totalPrice:
          data.totalPrice === null || data.totalPrice === undefined ? null : String(data.totalPrice),
        notes: data.notes ?? null,
        createdAt: now,
      });

      // Save images + insert records
      if (files.length > 0) {
        const ranchRoot = await ensureRanchStructure(ranchId);

        for (const file of files) {
          const field = String(file.fieldname || "").toLowerCase();

          const purpose =
            field === "receipt" || field === "label" || field === "packaging" || field === "misc"
              ? field
              : "misc";

          const destDir = path.join(ranchRoot, "medications", "purchases", purchaseId, purpose);

          ensureDir(destDir);

          const saved = await saveUploadedFile(file, destDir);

          await db.insert(medicationPurchaseImages).values({
            id: crypto.randomUUID(),
            ranchId,
            medicationPurchaseId: purchaseId,
            purpose,
            storedFilename: saved.filename,
            originalFilename: file.filename ?? null,
            mimeType: file.mimetype ?? null,
            sizeBytes: typeof file.size === "number" ? file.size : null,
          });
        }
      }

      return reply.send({
        purchase: {
          id: purchaseId,
          standardMedicationId,
          supplierId,
          purchaseDate,
        },
      });
    } catch (err: any) {
      req.log.error({ err }, "Failed to create medication purchase");
      return reply.status(500).send({
        error: "Failed to create medication purchase",
        message: err?.message,
      });
    }
  });

  /**
   * LIST purchase history for a medication
   */
  app.get("/medication-purchases", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const q = ListPurchasesQuery.parse(req.query ?? {});

      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const rows = await db
        .select({
          id: medicationPurchases.id,
          ranchId: medicationPurchases.ranchId,
          standardMedicationId: medicationPurchases.standardMedicationId,
          supplierId: medicationPurchases.supplierId,
          purchaseDate: medicationPurchases.purchaseDate,
          quantity: medicationPurchases.quantity,
          totalPrice: medicationPurchases.totalPrice,
          notes: medicationPurchases.notes,
          createdAt: medicationPurchases.createdAt,

          supplierName: suppliers.name,
        })
        .from(medicationPurchases)
        .leftJoin(
          suppliers,
          and(eq(suppliers.id, medicationPurchases.supplierId), eq(suppliers.ranchId, ranchId))
        )
        .where(
          and(
            eq(medicationPurchases.ranchId, ranchId),
            eq(medicationPurchases.standardMedicationId, q.standardMedicationId)
          )
        )
        .orderBy(desc(medicationPurchases.purchaseDate), desc(medicationPurchases.createdAt))
        .limit(q.limit);

      return reply.send({ purchases: rows });
    } catch (err: any) {
      req.log.error({ err }, "Failed to list medication purchases");
      return reply.status(500).send({ error: "Failed to list medication purchases", message: err?.message });
    }
  });
}
