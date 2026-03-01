import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import path from "path";
import fs from "fs";

import { ensureRanchStructure, saveUploadedFile } from "../../lib/storage.js";
import { db } from "../db";
import {
  fuelInventoryBalances,
  fuelPhotos,
  fuelProducts,
  fuelPurchaseItems,
  fuelPurchases,
} from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";
import { getActiveRanchIdForUser } from "../lib/activeRanch";
import { config } from "../config";

type FuelProductCategory =
  | "GASOLINE"
  | "DIESEL"
  | "OIL_2_CYCLE"
  | "MOTOR_OIL"
  | "HYDRAULIC_FLUID"
  | "GREASE_LUBRICANT"
  | "DEF"
  | "COOLANT"
  | "OTHER";
type FuelUnitType = "WEIGHT" | "VOLUME" | "COUNT";
type FuelPhotoEntityType = "PRODUCT" | "PURCHASE";
type ParsedMultipart = {
  body: Record<string, any>;
  files: any[];
};
type AppError = Error & { statusCode?: number };

const FUEL_CATEGORIES = new Set<FuelProductCategory>([
  "GASOLINE",
  "DIESEL",
  "OIL_2_CYCLE",
  "MOTOR_OIL",
  "HYDRAULIC_FLUID",
  "GREASE_LUBRICANT",
  "DEF",
  "COOLANT",
  "OTHER",
]);

const WEIGHT_UNITS = new Set(["lb", "lbs", "pound", "pounds", "kg", "kgs", "kilogram", "kilograms", "ton", "tons"]);
const VOLUME_UNITS = new Set([
  "gal",
  "gallon",
  "gallons",
  "l",
  "liter",
  "liters",
  "qt",
  "quart",
  "quarts",
  "pt",
  "pint",
  "pints",
  "oz",
  "floz",
  "fl oz",
  "fl_oz",
  "fluid ounce",
  "fluid ounces",
  "ml",
  "milliliter",
  "milliliters",
]);
const COUNT_UNITS = new Set([
  "tube",
  "tubes",
  "drum",
  "drums",
  "tote",
  "totes",
  "bottle",
  "bottles",
  "can",
  "cans",
  "pail",
  "pails",
  "bucket",
  "buckets",
]);

function appError(statusCode: number, message: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeFuelCategory(value: unknown): FuelProductCategory | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (FUEL_CATEGORIES.has(normalized as FuelProductCategory)) return normalized as FuelProductCategory;
  return null;
}

function normalizeFuelUnitType(value: unknown): FuelUnitType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "WEIGHT" || normalized === "VOLUME" || normalized === "COUNT") return normalized;
  return null;
}

function inferFuelUnitTypeFromUnit(unit: string | null | undefined): FuelUnitType | null {
  const normalized = String(unit ?? "").trim().toLowerCase();
  if (!normalized.length) return null;
  if (WEIGHT_UNITS.has(normalized)) return "WEIGHT";
  if (VOLUME_UNITS.has(normalized)) return "VOLUME";
  if (COUNT_UNITS.has(normalized)) return "COUNT";
  return null;
}

function parseFuelCategoryFilter(value: unknown): FuelProductCategory[] {
  if (typeof value !== "string" || !value.trim().length) return [];
  const parts = value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  const parsed = Array.from(
    new Set(parts.map((v) => normalizeFuelCategory(v)).filter((v): v is FuelProductCategory => v !== null))
  );
  if (parsed.length !== parts.length) throw appError(400, "Invalid fuel category filter value.");
  return parsed;
}

function normalizeVolumeUnit(unit: string | null | undefined): "gal" | "l" | "qt" | "pt" | "oz" | "ml" | null {
  const normalized = String(unit ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized.length) return null;
  if (normalized === "gal" || normalized === "gallon" || normalized === "gallons") return "gal";
  if (normalized === "l" || normalized === "liter" || normalized === "liters") return "l";
  if (normalized === "qt" || normalized === "quart" || normalized === "quarts") return "qt";
  if (normalized === "pt" || normalized === "pint" || normalized === "pints") return "pt";
  if (
    normalized === "oz" ||
    normalized === "floz" ||
    normalized === "fl_oz" ||
    normalized === "fluidounce" ||
    normalized === "fluidounces"
  ) {
    return "oz";
  }
  if (normalized === "ml" || normalized === "milliliter" || normalized === "milliliters") return "ml";
  return null;
}

function convertVolumeToGal(value: number, unit: string | null | undefined): number | null {
  const normalized = normalizeVolumeUnit(unit);
  if (!normalized) return null;
  if (normalized === "gal") return value;
  if (normalized === "l") return value * 0.2641720524;
  if (normalized === "qt") return value * 0.25;
  if (normalized === "pt") return value * 0.125;
  if (normalized === "oz") return value / 128;
  return value * 0.0002641720524;
}

function convertVolumeBetween(value: number, fromUnit: string | null | undefined, toUnit: string | null | undefined): number | null {
  const fromGal = convertVolumeToGal(value, fromUnit);
  const to = normalizeVolumeUnit(toUnit);
  if (fromGal === null || !to) return null;
  if (to === "gal") return fromGal;
  if (to === "l") return fromGal / 0.2641720524;
  if (to === "qt") return fromGal / 0.25;
  if (to === "pt") return fromGal / 0.125;
  if (to === "oz") return fromGal * 128;
  return fromGal / 0.0002641720524;
}

function toNullableDecimalString(
  value: unknown,
  opts?: { allowZero?: boolean; allowNegative?: boolean; fieldLabel?: string }
): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s.length) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw appError(400, `${opts?.fieldLabel ?? "Value"} must be numeric`);
  if (opts?.allowNegative !== true && n < 0) throw appError(400, `${opts?.fieldLabel ?? "Value"} cannot be negative`);
  if (opts?.allowZero !== true && n === 0) throw appError(400, `${opts?.fieldLabel ?? "Value"} must be greater than 0`);
  return s;
}

function toBooleanLike(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function normalizeBody(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (value && typeof value === "object" && "value" in value) {
      out[key] = (value as any).value;
      continue;
    }
    out[key] = value;
  }
  for (const key of ["items", "removePhotoIds"]) {
    if (typeof out[key] === "string") {
      try {
        out[key] = JSON.parse(out[key]);
      } catch {
        // leave as-is for schema validation errors
      }
    }
  }
  return out;
}

async function parseMultipartRequest(req: any): Promise<ParsedMultipart> {
  const contentType = String(req.headers?.["content-type"] ?? "");
  const isMultipart = contentType.includes("multipart/form-data");

  if (isMultipart && typeof req.parts === "function") {
    const body: Record<string, any> = {};
    const files: any[] = [];
    for await (const part of req.parts()) {
      if (part.type === "file") files.push(part);
      else body[part.fieldname] = part.value;
    }
    return { body, files };
  }
  if (isMultipart && typeof req.saveRequestFiles === "function") {
    const files = await req.saveRequestFiles();
    return { body: (req.body ?? {}) as Record<string, any>, files };
  }
  return { body: (req.body ?? {}) as Record<string, any>, files: [] };
}

async function getActiveRanchId(userId: string): Promise<string | null> {
  return getActiveRanchIdForUser(userId);
}

function getFuelPhotoPurpose(entityType: FuelPhotoEntityType, fieldName: string): string {
  const normalized = fieldName.trim().toLowerCase();
  if (entityType === "PURCHASE") {
    if (normalized === "receipt") return "receipt";
    if (normalized === "label") return "label";
    if (normalized === "misc") return "misc";
    return "receipt";
  }
  if (normalized === "label" || normalized === "packaging") return "label";
  if (normalized === "misc") return "misc";
  return "label";
}

function buildRelativeFuelPhotoPath(
  ranchId: string,
  entityType: FuelPhotoEntityType,
  entityId: string,
  purpose: string,
  storedFilename: string
): string {
  const segment = entityType === "PRODUCT" ? "products" : "purchases";
  return `ranches/${ranchId}/fuel/${segment}/${entityId}/${purpose}/${storedFilename}`;
}

async function saveFuelPhotos(params: { ranchId: string; entityType: FuelPhotoEntityType; entityId: string; files: any[] }) {
  const { ranchId, entityType, entityId, files } = params;
  if (!files.length) return;
  const ranchRoot = await ensureRanchStructure(ranchId);
  const entityFolder = entityType === "PRODUCT" ? "products" : "purchases";

  for (const file of files) {
    const purpose = getFuelPhotoPurpose(entityType, String(file.fieldname ?? ""));
    const destDir = path.join(ranchRoot, "fuel", entityFolder, entityId, purpose);
    ensureDir(destDir);
    const saved = await saveUploadedFile(file, destDir);
    const relativePath = buildRelativeFuelPhotoPath(ranchId, entityType, entityId, purpose, saved.filename);
    const storageUrl = `/images/${relativePath}`;
    await db.insert(fuelPhotos).values({
      id: crypto.randomUUID(),
      ranchId,
      entityType,
      entityId,
      filePath: relativePath,
      storageUrl,
      originalFilename: file.filename ?? null,
      mimeType: file.mimetype ?? null,
      fileSize: typeof file.size === "number" ? file.size : null,
      metadataJson: { purpose },
    });
  }
}

async function removePhotoFiles(rows: Array<{ filePath: string | null }>) {
  for (const row of rows) {
    const rel = row.filePath?.trim();
    if (!rel) continue;
    const fullPath = path.join(config.IMAGES_ROOT, rel.replace(/\//g, path.sep));
    try {
      await fs.promises.unlink(fullPath);
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
    }
  }
}

async function removeFuelPhotosByIds(params: { ranchId: string; entityType: FuelPhotoEntityType; entityId: string; photoIds: string[] }) {
  const { ranchId, entityType, entityId, photoIds } = params;
  if (!photoIds.length) return;
  const rows = await db
    .select({ id: fuelPhotos.id, filePath: fuelPhotos.filePath })
    .from(fuelPhotos)
    .where(
      and(
        eq(fuelPhotos.ranchId, ranchId),
        eq(fuelPhotos.entityType, entityType),
        eq(fuelPhotos.entityId, entityId),
        inArray(fuelPhotos.id, photoIds)
      )
    );
  if (!rows.length) return;
  await db
    .delete(fuelPhotos)
    .where(
      and(
        eq(fuelPhotos.ranchId, ranchId),
        eq(fuelPhotos.entityType, entityType),
        eq(fuelPhotos.entityId, entityId),
        inArray(fuelPhotos.id, rows.map((r) => r.id))
      )
    );
  await removePhotoFiles(rows);
}

function parsePhotoPurpose(metadataJson: unknown): string {
  if (!metadataJson || typeof metadataJson !== "object") return "misc";
  const purpose = (metadataJson as { purpose?: unknown }).purpose;
  if (typeof purpose !== "string" || !purpose.trim().length) return "misc";
  return purpose.trim();
}

function withErrorHandling(
  req: FastifyRequest,
  reply: FastifyReply,
  err: unknown,
  logMessage: string,
  defaultErrorMessage: string
) {
  const maybeAppErr = err as AppError;
  if (typeof maybeAppErr?.statusCode === "number") {
    return reply.status(maybeAppErr.statusCode).send({ error: maybeAppErr.message });
  }
  req.log.error({ err }, logMessage);
  return reply.status(500).send({ error: defaultErrorMessage, message: (err as any)?.message });
}

const FuelProductListQuerySchema = z.object({
  category: z.string().optional().nullable(),
  includeInactive: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") return value;
      if (typeof value !== "string") return false;
      const normalized = value.trim().toLowerCase();
      return normalized === "true" || normalized === "1";
    }),
});

const FuelProductCreateBodySchema = z.object({
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  defaultUnit: z.string().optional().nullable(),
  unitType: z.string().optional().nullable(),
  defaultPackageSize: z.union([z.string(), z.number()]).optional().nullable(),
  defaultPackageUnit: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.union([z.boolean(), z.string()]).optional().nullable(),
});

const FuelProductUpdateBodySchema = z.object({
  name: z.string().optional(),
  category: z.string().optional().nullable(),
  defaultUnit: z.string().optional().nullable(),
  unitType: z.string().optional().nullable(),
  defaultPackageSize: z.union([z.string(), z.number()]).optional().nullable(),
  defaultPackageUnit: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.union([z.boolean(), z.string()]).optional().nullable(),
  removePhotoIds: z.array(z.string().uuid()).optional(),
});

const FuelPurchaseListQuerySchema = z.object({
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  limit: z
    .string()
    .optional()
    .transform((value) => {
      if (!value || !value.trim().length) return 50;
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return 50;
      return Math.min(Math.round(n), 200);
    }),
});

const FuelPurchaseItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  unit: z.string().optional().nullable(),
  unitCost: z.union([z.string(), z.number()]).optional().nullable(),
  totalCost: z.union([z.string(), z.number()]).optional().nullable(),
  unitType: z.string().optional().nullable(),
  normalizedQuantity: z.union([z.string(), z.number()]).optional().nullable(),
  normalizedUnit: z.string().optional().nullable(),
  packageSize: z.union([z.string(), z.number()]).optional().nullable(),
  packageUnit: z.string().optional().nullable(),
});

const FuelPurchaseCreateBodySchema = z.object({
  purchaseDate: z.string().min(10).optional(),
  vendor: z.string().optional().nullable(),
  invoiceRef: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(FuelPurchaseItemSchema).min(1),
});

const FuelProductParamSchema = z.object({ productId: z.string().uuid() });
const FuelPurchaseParamSchema = z.object({ purchaseId: z.string().uuid() });
const UuidParamSchema = z.object({ id: z.string().uuid() });

export async function fuelRoutes(app: FastifyInstance) {
  app.get("/fuel/products", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const query = FuelProductListQuerySchema.parse(req.query ?? {});
      const ranchId = await getActiveRanchId((req as any).auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const categoryFilter = parseFuelCategoryFilter(query.category);
      const whereParts = [eq(fuelProducts.ranchId, ranchId)] as any[];
      if (categoryFilter.length > 0) whereParts.push(inArray(fuelProducts.category, categoryFilter));
      if (!query.includeInactive) whereParts.push(eq(fuelProducts.isActive, true));

      const rows = await db
        .select({
          id: fuelProducts.id,
          name: fuelProducts.name,
          category: fuelProducts.category,
          defaultUnit: fuelProducts.defaultUnit,
          unitType: fuelProducts.unitType,
          defaultPackageSize: fuelProducts.defaultPackageSize,
          defaultPackageUnit: fuelProducts.defaultPackageUnit,
          notes: fuelProducts.notes,
          isActive: fuelProducts.isActive,
          createdAt: fuelProducts.createdAt,
          updatedAt: fuelProducts.updatedAt,
        })
        .from(fuelProducts)
        .where(whereParts.length > 1 ? and(...whereParts) : whereParts[0])
        .orderBy(asc(fuelProducts.name));

      return reply.send({
        products: rows.map((row) => ({
          ...row,
          unitType: normalizeFuelUnitType(row.unitType) ?? inferFuelUnitTypeFromUnit(row.defaultUnit) ?? "COUNT",
        })),
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to list fuel products", "Failed to list fuel products");
    }
  });

  app.get("/fuel/products/:productId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { productId } = FuelProductParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId((req as any).auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const rows = await db
        .select({
          id: fuelProducts.id,
          name: fuelProducts.name,
          category: fuelProducts.category,
          defaultUnit: fuelProducts.defaultUnit,
          unitType: fuelProducts.unitType,
          defaultPackageSize: fuelProducts.defaultPackageSize,
          defaultPackageUnit: fuelProducts.defaultPackageUnit,
          notes: fuelProducts.notes,
          isActive: fuelProducts.isActive,
          createdAt: fuelProducts.createdAt,
          updatedAt: fuelProducts.updatedAt,
        })
        .from(fuelProducts)
        .where(and(eq(fuelProducts.id, productId), eq(fuelProducts.ranchId, ranchId)))
        .limit(1);
      if (!rows.length) return reply.status(404).send({ error: "Fuel product not found" });

      const photos = await db
        .select({
          id: fuelPhotos.id,
          filePath: fuelPhotos.filePath,
          storageUrl: fuelPhotos.storageUrl,
          originalFilename: fuelPhotos.originalFilename,
          mimeType: fuelPhotos.mimeType,
          fileSize: fuelPhotos.fileSize,
          uploadedAt: fuelPhotos.uploadedAt,
          metadataJson: fuelPhotos.metadataJson,
        })
        .from(fuelPhotos)
        .where(and(eq(fuelPhotos.ranchId, ranchId), eq(fuelPhotos.entityType, "PRODUCT"), eq(fuelPhotos.entityId, productId)))
        .orderBy(desc(fuelPhotos.uploadedAt));

      return reply.send({
        product: {
          ...rows[0],
          unitType: normalizeFuelUnitType(rows[0].unitType) ?? inferFuelUnitTypeFromUnit(rows[0].defaultUnit) ?? "COUNT",
        },
        photos: photos.map((row) => ({
          id: row.id,
          purpose: parsePhotoPurpose(row.metadataJson),
          filePath: row.filePath,
          storageUrl: row.storageUrl,
          url: row.storageUrl ?? (row.filePath && row.filePath.trim().length > 0 ? `/images/${row.filePath}` : null),
          originalFilename: row.originalFilename,
          mimeType: row.mimeType,
          fileSize: row.fileSize,
          uploadedAt: row.uploadedAt,
          metadataJson: row.metadataJson,
        })),
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to load fuel product", "Failed to load fuel product");
    }
  });

  app.get("/fuel/products/:productId/photos", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { productId } = FuelProductParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId((req as any).auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const exists = await db
        .select({ id: fuelProducts.id })
        .from(fuelProducts)
        .where(and(eq(fuelProducts.id, productId), eq(fuelProducts.ranchId, ranchId)))
        .limit(1);
      if (!exists.length) return reply.status(404).send({ error: "Fuel product not found" });

      const photos = await db
        .select({
          id: fuelPhotos.id,
          filePath: fuelPhotos.filePath,
          storageUrl: fuelPhotos.storageUrl,
          originalFilename: fuelPhotos.originalFilename,
          mimeType: fuelPhotos.mimeType,
          fileSize: fuelPhotos.fileSize,
          uploadedAt: fuelPhotos.uploadedAt,
          metadataJson: fuelPhotos.metadataJson,
        })
        .from(fuelPhotos)
        .where(and(eq(fuelPhotos.ranchId, ranchId), eq(fuelPhotos.entityType, "PRODUCT"), eq(fuelPhotos.entityId, productId)))
        .orderBy(desc(fuelPhotos.uploadedAt));

      return reply.send({
        photos: photos.map((row) => ({
          id: row.id,
          purpose: parsePhotoPurpose(row.metadataJson),
          filePath: row.filePath,
          storageUrl: row.storageUrl,
          url: row.storageUrl ?? (row.filePath && row.filePath.trim().length > 0 ? `/images/${row.filePath}` : null),
          originalFilename: row.originalFilename,
          mimeType: row.mimeType,
          fileSize: row.fileSize,
          uploadedAt: row.uploadedAt,
          metadataJson: row.metadataJson,
        })),
      });
    } catch (err) {
      return withErrorHandling(
        req,
        reply,
        err,
        "Failed to list fuel product photos",
        "Failed to list fuel product photos"
      );
    }
  });

  app.post("/fuel/products", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId((req as any).auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const body = normalizeBody(rawBody);
      const parsed = FuelProductCreateBodySchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid fuel product payload", details: parsed.error.flatten() });
      }

      const data = parsed.data;
      const normalizedCategory = data.category ? normalizeFuelCategory(data.category) : "OTHER";
      if (!normalizedCategory) throw appError(400, "Invalid fuel product category.");
      const normalizedDefaultUnit = data.defaultUnit?.trim() ? data.defaultUnit.trim() : "gal";
      const normalizedUnitType =
        normalizeFuelUnitType(data.unitType) ?? inferFuelUnitTypeFromUnit(normalizedDefaultUnit) ?? "VOLUME";
      const normalizedPackageSize = toNullableDecimalString(data.defaultPackageSize, { fieldLabel: "defaultPackageSize" });
      const normalizedPackageUnit =
        normalizedPackageSize && data.defaultPackageUnit && data.defaultPackageUnit.trim().length > 0
          ? data.defaultPackageUnit.trim()
          : null;
      const isActive = data.isActive !== undefined ? toBooleanLike(data.isActive, true) : true;

      const now = new Date();
      const productId = crypto.randomUUID();
      await db.insert(fuelProducts).values({
        id: productId,
        ranchId,
        name: data.name.trim(),
        category: normalizedCategory,
        defaultUnit: normalizedDefaultUnit,
        unitType: normalizedUnitType,
        defaultPackageSize: normalizedPackageSize,
        defaultPackageUnit: normalizedPackageUnit,
        notes: data.notes?.trim() ? data.notes.trim() : null,
        isActive,
        createdAt: now,
        updatedAt: now,
      });

      await saveFuelPhotos({ ranchId, entityType: "PRODUCT", entityId: productId, files });

      return reply.status(201).send({
        product: {
          id: productId,
          ranchId,
          name: data.name.trim(),
          category: normalizedCategory,
          defaultUnit: normalizedDefaultUnit,
          unitType: normalizedUnitType,
          defaultPackageSize: normalizedPackageSize,
          defaultPackageUnit: normalizedPackageUnit,
          notes: data.notes?.trim() ? data.notes.trim() : null,
          isActive,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to create fuel product", "Failed to create fuel product");
    }
  });

  app.put("/fuel/products/:productId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { productId } = FuelProductParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId((req as any).auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const exists = await db
        .select({ id: fuelProducts.id })
        .from(fuelProducts)
        .where(and(eq(fuelProducts.id, productId), eq(fuelProducts.ranchId, ranchId)))
        .limit(1);
      if (!exists.length) return reply.status(404).send({ error: "Fuel product not found" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const body = normalizeBody(rawBody);
      const parsed = FuelProductUpdateBodySchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid fuel product payload", details: parsed.error.flatten() });
      }

      const data = parsed.data;
      const now = new Date();
      const patch: Record<string, any> = {};
      if (typeof data.name === "string") patch.name = data.name.trim();
      if (data.category !== undefined) {
        const normalized = data.category ? normalizeFuelCategory(data.category) : "OTHER";
        if (!normalized) throw appError(400, "Invalid fuel product category.");
        patch.category = normalized;
      }
      if (data.defaultUnit !== undefined) {
        patch.defaultUnit = data.defaultUnit?.trim() ? data.defaultUnit.trim() : "gal";
        if (data.unitType === undefined) patch.unitType = inferFuelUnitTypeFromUnit(patch.defaultUnit) ?? "VOLUME";
      }
      if (data.unitType !== undefined) {
        const normalized = normalizeFuelUnitType(data.unitType);
        if (!normalized) throw appError(400, "Invalid fuel product unit type.");
        patch.unitType = normalized;
      }
      if (data.defaultPackageSize !== undefined) {
        patch.defaultPackageSize = toNullableDecimalString(data.defaultPackageSize, { fieldLabel: "defaultPackageSize" });
      }
      if (data.defaultPackageUnit !== undefined) {
        patch.defaultPackageUnit = data.defaultPackageUnit?.trim() ? data.defaultPackageUnit.trim() : null;
      }
      if (patch.defaultPackageSize === null) patch.defaultPackageUnit = null;
      if (data.notes !== undefined) patch.notes = data.notes?.trim() ? data.notes.trim() : null;
      if (data.isActive !== undefined) patch.isActive = toBooleanLike(data.isActive, true);
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = now;
        await db.update(fuelProducts).set(patch).where(and(eq(fuelProducts.id, productId), eq(fuelProducts.ranchId, ranchId)));
      }

      if (data.removePhotoIds && data.removePhotoIds.length > 0) {
        await removeFuelPhotosByIds({
          ranchId,
          entityType: "PRODUCT",
          entityId: productId,
          photoIds: data.removePhotoIds,
        });
      }
      await saveFuelPhotos({ ranchId, entityType: "PRODUCT", entityId: productId, files });
      return reply.send({ updated: { id: productId } });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to update fuel product", "Failed to update fuel product");
    }
  });

  app.get("/fuel/purchases", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const query = FuelPurchaseListQuerySchema.parse(req.query ?? {});
      const ranchId = await getActiveRanchId((req as any).auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const whereParts = [eq(fuelPurchases.ranchId, ranchId)] as any[];
      if (query.from?.trim()) whereParts.push(gte(fuelPurchases.purchaseDate, query.from.trim()));
      if (query.to?.trim()) whereParts.push(lte(fuelPurchases.purchaseDate, query.to.trim()));

      const purchases = await db
        .select({
          id: fuelPurchases.id,
          ranchId: fuelPurchases.ranchId,
          purchaseDate: fuelPurchases.purchaseDate,
          vendor: fuelPurchases.vendor,
          invoiceRef: fuelPurchases.invoiceRef,
          notes: fuelPurchases.notes,
          createdAt: fuelPurchases.createdAt,
          updatedAt: fuelPurchases.updatedAt,
        })
        .from(fuelPurchases)
        .where(whereParts.length > 1 ? and(...whereParts) : whereParts[0])
        .orderBy(desc(fuelPurchases.purchaseDate), desc(fuelPurchases.createdAt))
        .limit(query.limit);

      const purchaseIds = purchases.map((row) => row.id);
      const itemStats =
        purchaseIds.length > 0
          ? await db
              .select({
                fuelPurchaseId: fuelPurchaseItems.fuelPurchaseId,
                itemCount: sql<number>`COUNT(*)`,
                totalCost: sql<string>`COALESCE(SUM(${fuelPurchaseItems.totalCost}), 0)`,
              })
              .from(fuelPurchaseItems)
              .where(and(eq(fuelPurchaseItems.ranchId, ranchId), inArray(fuelPurchaseItems.fuelPurchaseId, purchaseIds)))
              .groupBy(fuelPurchaseItems.fuelPurchaseId)
          : [];

      const statsByPurchase = new Map(itemStats.map((row) => [row.fuelPurchaseId, row]));
      return reply.send({
        purchases: purchases.map((row) => ({
          ...row,
          itemCount: Number(statsByPurchase.get(row.id)?.itemCount ?? 0),
          totalCost: statsByPurchase.get(row.id)?.totalCost ?? "0",
        })),
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to list fuel purchases", "Failed to list fuel purchases");
    }
  });

  app.get("/fuel/purchases/:purchaseId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { purchaseId } = FuelPurchaseParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId((req as any).auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const purchaseRows = await db
        .select({
          id: fuelPurchases.id,
          ranchId: fuelPurchases.ranchId,
          purchaseDate: fuelPurchases.purchaseDate,
          vendor: fuelPurchases.vendor,
          invoiceRef: fuelPurchases.invoiceRef,
          notes: fuelPurchases.notes,
          createdAt: fuelPurchases.createdAt,
          updatedAt: fuelPurchases.updatedAt,
        })
        .from(fuelPurchases)
        .where(and(eq(fuelPurchases.id, purchaseId), eq(fuelPurchases.ranchId, ranchId)))
        .limit(1);
      if (!purchaseRows.length) return reply.status(404).send({ error: "Fuel purchase not found" });

      const itemRows = await db
        .select({
          id: fuelPurchaseItems.id,
          productId: fuelPurchaseItems.fuelProductId,
          quantity: fuelPurchaseItems.quantity,
          unit: fuelPurchaseItems.unit,
          unitCost: fuelPurchaseItems.unitCost,
          totalCost: fuelPurchaseItems.totalCost,
          unitType: fuelPurchaseItems.unitType,
          normalizedQuantity: fuelPurchaseItems.normalizedQuantity,
          normalizedUnit: fuelPurchaseItems.normalizedUnit,
          packageSize: fuelPurchaseItems.packageSize,
          packageUnit: fuelPurchaseItems.packageUnit,
          createdAt: fuelPurchaseItems.createdAt,
          productName: fuelProducts.name,
          productCategory: fuelProducts.category,
        })
        .from(fuelPurchaseItems)
        .innerJoin(
          fuelProducts,
          and(eq(fuelProducts.id, fuelPurchaseItems.fuelProductId), eq(fuelProducts.ranchId, ranchId))
        )
        .where(and(eq(fuelPurchaseItems.ranchId, ranchId), eq(fuelPurchaseItems.fuelPurchaseId, purchaseId)))
        .orderBy(fuelPurchaseItems.createdAt);

      return reply.send({
        purchase: purchaseRows[0],
        items: itemRows.map((row) => ({
          ...row,
          unitType: normalizeFuelUnitType(row.unitType) ?? inferFuelUnitTypeFromUnit(row.unit),
        })),
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to load fuel purchase", "Failed to load fuel purchase");
    }
  });

  app.get("/fuel/purchases/:purchaseId/photos", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { purchaseId } = FuelPurchaseParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId((req as any).auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const exists = await db
        .select({ id: fuelPurchases.id })
        .from(fuelPurchases)
        .where(and(eq(fuelPurchases.id, purchaseId), eq(fuelPurchases.ranchId, ranchId)))
        .limit(1);
      if (!exists.length) return reply.status(404).send({ error: "Fuel purchase not found" });

      const photos = await db
        .select({
          id: fuelPhotos.id,
          filePath: fuelPhotos.filePath,
          storageUrl: fuelPhotos.storageUrl,
          originalFilename: fuelPhotos.originalFilename,
          mimeType: fuelPhotos.mimeType,
          fileSize: fuelPhotos.fileSize,
          uploadedAt: fuelPhotos.uploadedAt,
          metadataJson: fuelPhotos.metadataJson,
        })
        .from(fuelPhotos)
        .where(and(eq(fuelPhotos.ranchId, ranchId), eq(fuelPhotos.entityType, "PURCHASE"), eq(fuelPhotos.entityId, purchaseId)))
        .orderBy(desc(fuelPhotos.uploadedAt));

      return reply.send({
        photos: photos.map((row) => ({
          id: row.id,
          purpose: parsePhotoPurpose(row.metadataJson),
          filePath: row.filePath,
          storageUrl: row.storageUrl,
          url: row.storageUrl ?? (row.filePath && row.filePath.trim().length > 0 ? `/images/${row.filePath}` : null),
          originalFilename: row.originalFilename,
          mimeType: row.mimeType,
          fileSize: row.fileSize,
          uploadedAt: row.uploadedAt,
          metadataJson: row.metadataJson,
        })),
      });
    } catch (err) {
      return withErrorHandling(
        req,
        reply,
        err,
        "Failed to list fuel purchase photos",
        "Failed to list fuel purchase photos"
      );
    }
  });

  app.post("/fuel/purchases", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId((req as any).auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const body = normalizeBody(rawBody);
      const parsed = FuelPurchaseCreateBodySchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid fuel purchase payload", details: parsed.error.flatten() });
      }

      const data = parsed.data;
      const now = new Date();
      const purchaseDate = data.purchaseDate ?? todayIsoDate();
      const purchaseId = crypto.randomUUID();

      type ResolvedItem = {
        productId: string;
        quantity: string;
        unit: string;
        unitCost: string | null;
        totalCost: string | null;
        unitType: FuelUnitType | null;
        normalizedQuantity: string | null;
        normalizedUnit: string | null;
        packageSize: string | null;
        packageUnit: string | null;
      };
      const resolvedItems: ResolvedItem[] = [];

      await db.transaction(async (tx) => {
        for (const item of data.items) {
          const quantity = toNullableDecimalString(item.quantity, { fieldLabel: "quantity" });
          if (!quantity) throw appError(400, "Quantity is required.");

          const productRows = await tx
            .select({
              id: fuelProducts.id,
              defaultUnit: fuelProducts.defaultUnit,
              unitType: fuelProducts.unitType,
              defaultPackageSize: fuelProducts.defaultPackageSize,
              defaultPackageUnit: fuelProducts.defaultPackageUnit,
            })
            .from(fuelProducts)
            .where(and(eq(fuelProducts.ranchId, ranchId), eq(fuelProducts.id, item.productId)))
            .limit(1);
          if (!productRows.length) throw appError(404, "Selected fuel product was not found for this ranch.");
          const product = productRows[0];

          const resolvedUnit = item.unit?.trim() ? item.unit.trim() : product.defaultUnit ?? "gal";
          const resolvedUnitType =
            normalizeFuelUnitType(item.unitType) ??
            normalizeFuelUnitType(product.unitType) ??
            inferFuelUnitTypeFromUnit(resolvedUnit);
          const resolvedPackageSize =
            toNullableDecimalString(item.packageSize, { fieldLabel: "packageSize" }) ??
            product.defaultPackageSize ??
            null;
          const resolvedPackageUnit =
            resolvedPackageSize && item.packageUnit && item.packageUnit.trim().length > 0
              ? item.packageUnit.trim()
              : resolvedPackageSize
                ? product.defaultPackageUnit ?? null
                : null;
          let resolvedNormalizedQuantity = toNullableDecimalString(item.normalizedQuantity, {
            fieldLabel: "normalizedQuantity",
          });
          let resolvedNormalizedUnit =
            resolvedNormalizedQuantity && item.normalizedUnit && item.normalizedUnit.trim().length > 0
              ? item.normalizedUnit.trim()
              : resolvedNormalizedQuantity
                ? "gal"
                : null;
          if (!resolvedNormalizedQuantity) {
            const quantityNumber = Number(quantity);
            if (resolvedUnitType === "VOLUME") {
              const normalizedGal = convertVolumeToGal(quantityNumber, resolvedUnit);
              if (normalizedGal !== null) {
                resolvedNormalizedQuantity = String(normalizedGal);
                resolvedNormalizedUnit = "gal";
              }
            } else if (resolvedUnitType === "COUNT" && resolvedPackageSize && resolvedPackageUnit) {
              const packageSizeNumber = Number(resolvedPackageSize);
              const totalVolume = quantityNumber * packageSizeNumber;
              const normalizedGal = convertVolumeToGal(totalVolume, resolvedPackageUnit);
              if (normalizedGal !== null) {
                resolvedNormalizedQuantity = String(normalizedGal);
                resolvedNormalizedUnit = "gal";
              }
            }
          }

          const unitCost = toNullableDecimalString(item.unitCost, {
            allowZero: true,
            fieldLabel: "unitCost",
          });
          let totalCost = toNullableDecimalString(item.totalCost, {
            allowZero: true,
            fieldLabel: "totalCost",
          });
          if (!totalCost && unitCost) totalCost = String(Number(unitCost) * Number(quantity));

          resolvedItems.push({
            productId: item.productId,
            quantity,
            unit: resolvedUnit,
            unitCost,
            totalCost,
            unitType: resolvedUnitType,
            normalizedQuantity: resolvedNormalizedQuantity,
            normalizedUnit: resolvedNormalizedUnit,
            packageSize: resolvedPackageSize,
            packageUnit: resolvedPackageUnit,
          });
        }

        await tx.insert(fuelPurchases).values({
          id: purchaseId,
          ranchId,
          purchaseDate,
          vendor: data.vendor?.trim() ? data.vendor.trim() : null,
          invoiceRef: data.invoiceRef?.trim() ? data.invoiceRef.trim() : null,
          notes: data.notes?.trim() ? data.notes.trim() : null,
          createdAt: now,
          updatedAt: now,
        });

        for (const item of resolvedItems) {
          await tx.insert(fuelPurchaseItems).values({
            id: crypto.randomUUID(),
            ranchId,
            fuelPurchaseId: purchaseId,
            fuelProductId: item.productId,
            quantity: item.quantity,
            unit: item.unit,
            unitCost: item.unitCost,
            totalCost: item.totalCost,
            unitType: item.unitType,
            normalizedQuantity: item.normalizedQuantity,
            normalizedUnit: item.normalizedUnit,
            packageSize: item.packageSize,
            packageUnit: item.packageUnit,
            createdAt: now,
          });

          const existing = await tx
            .select({
              id: fuelInventoryBalances.id,
              normalizedOnHandQuantity: fuelInventoryBalances.normalizedOnHandQuantity,
              normalizedUnit: fuelInventoryBalances.normalizedUnit,
            })
            .from(fuelInventoryBalances)
            .where(
              and(
                eq(fuelInventoryBalances.ranchId, ranchId),
                eq(fuelInventoryBalances.fuelProductId, item.productId),
                eq(fuelInventoryBalances.unit, item.unit)
              )
            )
            .limit(1);

          if (existing.length > 0) {
            const updateSet: Record<string, any> = {
              onHandQuantity: sql`${fuelInventoryBalances.onHandQuantity} + ${item.quantity}`,
              updatedAt: now,
            };
            if (item.normalizedQuantity && item.normalizedUnit) {
              const existingNormalizedUnit = existing[0].normalizedUnit;
              if (existingNormalizedUnit && existingNormalizedUnit !== item.normalizedUnit) {
                const converted = convertVolumeBetween(
                  Number(item.normalizedQuantity),
                  item.normalizedUnit,
                  existingNormalizedUnit
                );
                if (converted === null) {
                  throw appError(
                    400,
                    `Cannot mix normalized units (${existingNormalizedUnit} and ${item.normalizedUnit}) for fuel inventory.`
                  );
                }
                updateSet.normalizedOnHandQuantity =
                  sql`COALESCE(${fuelInventoryBalances.normalizedOnHandQuantity}, 0) + ${String(converted)}`;
              } else {
                updateSet.normalizedUnit = existingNormalizedUnit ?? item.normalizedUnit;
                updateSet.normalizedOnHandQuantity =
                  sql`COALESCE(${fuelInventoryBalances.normalizedOnHandQuantity}, 0) + ${item.normalizedQuantity}`;
              }
            }
            await tx.update(fuelInventoryBalances).set(updateSet).where(eq(fuelInventoryBalances.id, existing[0].id));
          } else {
            await tx.insert(fuelInventoryBalances).values({
              id: crypto.randomUUID(),
              ranchId,
              fuelProductId: item.productId,
              unit: item.unit,
              onHandQuantity: item.quantity,
              normalizedOnHandQuantity: item.normalizedQuantity,
              normalizedUnit: item.normalizedUnit,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      });

      await saveFuelPhotos({ ranchId, entityType: "PURCHASE", entityId: purchaseId, files });

      return reply.status(201).send({
        purchase: {
          id: purchaseId,
          purchaseDate,
          vendor: data.vendor?.trim() ? data.vendor.trim() : null,
          invoiceRef: data.invoiceRef?.trim() ? data.invoiceRef.trim() : null,
        },
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to create fuel purchase", "Failed to create fuel purchase");
    }
  });

  app.put("/fuel/purchases/:purchaseId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      FuelPurchaseParamSchema.parse(req.params ?? {});
      return reply.status(409).send({
        error: "Fuel purchases are append-only for now. Editing is not supported yet.",
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to process fuel purchase update", "Failed to process fuel purchase update");
    }
  });

  app.delete("/fuel/purchases/:purchaseId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      FuelPurchaseParamSchema.parse(req.params ?? {});
      return reply.status(409).send({
        error: "Fuel purchases are append-only for now. Deletion is not supported yet.",
      });
    } catch (err) {
      return withErrorHandling(
        req,
        reply,
        err,
        "Failed to process fuel purchase deletion",
        "Failed to process fuel purchase deletion"
      );
    }
  });

  app.get("/fuel/inventory", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId((req as any).auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const rows = await db
        .select({
          id: fuelInventoryBalances.id,
          productId: fuelInventoryBalances.fuelProductId,
          unit: fuelInventoryBalances.unit,
          onHandQuantity: fuelInventoryBalances.onHandQuantity,
          normalizedOnHandQuantity: fuelInventoryBalances.normalizedOnHandQuantity,
          normalizedUnit: fuelInventoryBalances.normalizedUnit,
          updatedAt: fuelInventoryBalances.updatedAt,
          productName: fuelProducts.name,
          productCategory: fuelProducts.category,
          unitType: fuelProducts.unitType,
          isActive: fuelProducts.isActive,
        })
        .from(fuelInventoryBalances)
        .innerJoin(
          fuelProducts,
          and(eq(fuelProducts.id, fuelInventoryBalances.fuelProductId), eq(fuelProducts.ranchId, ranchId))
        )
        .where(eq(fuelInventoryBalances.ranchId, ranchId))
        .orderBy(fuelProducts.category, fuelProducts.name, fuelInventoryBalances.unit);

      return reply.send({
        inventory: rows.map((row) => ({
          ...row,
          unitType: normalizeFuelUnitType(row.unitType) ?? inferFuelUnitTypeFromUnit(row.unit),
        })),
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to load fuel inventory", "Failed to load fuel inventory");
    }
  });

  app.delete("/fuel/photos/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId((req as any).auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const rows = await db
        .select({
          id: fuelPhotos.id,
          filePath: fuelPhotos.filePath,
          entityType: fuelPhotos.entityType,
          entityId: fuelPhotos.entityId,
        })
        .from(fuelPhotos)
        .where(and(eq(fuelPhotos.id, id), eq(fuelPhotos.ranchId, ranchId)))
        .limit(1);
      if (!rows.length) return reply.status(404).send({ error: "Photo not found" });

      const row = rows[0];
      await db.delete(fuelPhotos).where(and(eq(fuelPhotos.id, id), eq(fuelPhotos.ranchId, ranchId)));
      await removePhotoFiles([{ filePath: row.filePath }]);

      return reply.send({
        deleted: {
          id,
          entityType: row.entityType,
          entityId: row.entityId,
        },
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to delete fuel photo", "Failed to delete fuel photo");
    }
  });
}
