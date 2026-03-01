import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import path from "path";
import fs from "fs";

import { ensureRanchStructure, saveUploadedFile } from "../../lib/storage.js";
import { db } from "../db";
import {
  feedBlendEligibleSpecies,
  feedBlendVersionItems,
  feedBlendVersions,
  feedBlends,
  feedComponentEligibleSpecies,
  feedComponents,
  feedInventoryBalances,
  feedPhotos,
  feedPurchaseItems,
  feedPurchases,
  herds,
  ranchSpecies,
} from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";
import { getActiveRanchIdForUser } from "../lib/activeRanch";
import { config } from "../config";

type ParsedMultipart = {
  body: Record<string, any>;
  files: any[];
};

type FeedPhotoEntityType = "COMPONENT" | "BLEND" | "PURCHASE";
type FeedUnitType = "WEIGHT" | "COUNT" | "VOLUME";
type FeedComponentCategory = "FORAGE" | "GRAIN" | "MINERAL" | "SUPPLEMENT" | "ADDITIVE" | "OTHER";
type FeedDeliveryMethod = "FREE_CHOICE" | "MIXED_IN_FEED" | "WATER" | "TOP_DRESS" | "OTHER";

type AppError = Error & { statusCode?: number };

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

const WEIGHT_UNITS = new Set([
  "lb",
  "lbs",
  "pound",
  "pounds",
  "kg",
  "kgs",
  "kilogram",
  "kilograms",
  "ton",
  "tons",
]);

const COUNT_UNITS = new Set([
  "bag",
  "bags",
  "tub",
  "tubs",
  "bale",
  "bales",
  "pallet",
  "pallets",
  "sack",
  "sacks",
]);

const VOLUME_UNITS = new Set([
  "gal",
  "gallon",
  "gallons",
  "l",
  "liter",
  "liters",
]);

const FEED_COMPONENT_CATEGORIES = new Set<FeedComponentCategory>([
  "FORAGE",
  "GRAIN",
  "MINERAL",
  "SUPPLEMENT",
  "ADDITIVE",
  "OTHER",
]);

const FEED_DELIVERY_METHODS = new Set<FeedDeliveryMethod>([
  "FREE_CHOICE",
  "MIXED_IN_FEED",
  "WATER",
  "TOP_DRESS",
  "OTHER",
]);

function normalizeFeedUnitType(value: unknown): FeedUnitType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "WEIGHT" || normalized === "COUNT" || normalized === "VOLUME") {
    return normalized;
  }
  return null;
}

function normalizeFeedComponentCategory(value: unknown): FeedComponentCategory | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (FEED_COMPONENT_CATEGORIES.has(normalized as FeedComponentCategory)) {
    return normalized as FeedComponentCategory;
  }
  return null;
}

function normalizeFeedDeliveryMethod(value: unknown): FeedDeliveryMethod | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (FEED_DELIVERY_METHODS.has(normalized as FeedDeliveryMethod)) {
    return normalized as FeedDeliveryMethod;
  }
  return null;
}

function parseFeedComponentCategoryFilter(value: unknown): FeedComponentCategory[] {
  if (typeof value !== "string" || !value.trim().length) return [];
  const parsed = Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => normalizeFeedComponentCategory(entry))
        .filter((entry): entry is FeedComponentCategory => entry !== null)
    )
  );
  const expectedCount = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0).length;
  if (parsed.length !== expectedCount) {
    throw appError(400, "Invalid feed component category filter value.");
  }
  return parsed;
}

function inferUnitTypeFromUnit(unit: string | null | undefined): FeedUnitType | null {
  const normalized = String(unit ?? "").trim().toLowerCase();
  if (!normalized.length) return null;
  if (WEIGHT_UNITS.has(normalized)) return "WEIGHT";
  if (COUNT_UNITS.has(normalized)) return "COUNT";
  if (VOLUME_UNITS.has(normalized)) return "VOLUME";
  return null;
}

function normalizeWeightUnit(unit: string | null | undefined): "lb" | "kg" | "ton" | null {
  const normalized = String(unit ?? "").trim().toLowerCase();
  if (!normalized.length) return null;
  if (normalized === "lb" || normalized === "lbs" || normalized === "pound" || normalized === "pounds") {
    return "lb";
  }
  if (normalized === "kg" || normalized === "kgs" || normalized === "kilogram" || normalized === "kilograms") {
    return "kg";
  }
  if (normalized === "ton" || normalized === "tons") {
    return "ton";
  }
  return null;
}

function convertWeightToLb(value: number, unit: string | null | undefined): number | null {
  const normalizedUnit = normalizeWeightUnit(unit);
  if (!normalizedUnit) return null;
  if (normalizedUnit === "lb") return value;
  if (normalizedUnit === "kg") return value * 2.2046226218;
  return value * 2000;
}

function convertWeightBetween(value: number, fromUnit: string | null | undefined, toUnit: string | null | undefined): number | null {
  const fromLb = convertWeightToLb(value, fromUnit);
  const to = normalizeWeightUnit(toUnit);
  if (fromLb === null || !to) return null;
  if (to === "lb") return fromLb;
  if (to === "kg") return fromLb / 2.2046226218;
  return fromLb / 2000;
}

function decimalInputSchema() {
  return z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length > 0, "Value is required")
    .refine((v) => Number.isFinite(Number(v)), "Must be a number")
    .refine((v) => Number(v) > 0, "Must be greater than 0");
}

function toNullableDecimalString(
  value: unknown,
  opts?: { allowZero?: boolean; allowNegative?: boolean; fieldLabel?: string }
): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s.length) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw appError(400, `${opts?.fieldLabel ?? "Value"} must be numeric`);
  }
  if (opts?.allowNegative !== true && n < 0) {
    throw appError(400, `${opts?.fieldLabel ?? "Value"} cannot be negative`);
  }
  if (opts?.allowZero !== true && n === 0) {
    throw appError(400, `${opts?.fieldLabel ?? "Value"} must be greater than 0`);
  }
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

function toNormalizedSpeciesList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((v) => String(v ?? "").trim())
        .filter((s) => s.length > 0 && s.toLowerCase() !== "mixed")
    )
  );
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

  const jsonKeys = ["eligibleSpecies", "items", "removePhotoIds"];
  for (const key of jsonKeys) {
    if (typeof out[key] === "string") {
      try {
        out[key] = JSON.parse(out[key]);
      } catch {
        // leave value as-is so validation can fail clearly.
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
      if (part.type === "file") {
        files.push(part);
      } else {
        body[part.fieldname] = part.value;
      }
    }

    return { body, files };
  }

  if (isMultipart && typeof req.saveRequestFiles === "function") {
    const files = await req.saveRequestFiles();
    return {
      body: (req.body ?? {}) as Record<string, any>,
      files,
    };
  }

  return {
    body: (req.body ?? {}) as Record<string, any>,
    files: [],
  };
}

async function getActiveRanchId(userId: string): Promise<string | null> {
  return getActiveRanchIdForUser(userId);
}

async function loadRanchSpeciesOptions(ranchId: string): Promise<string[]> {
  const [ranchSpeciesRows, herdRows] = await Promise.all([
    db
      .select({ species: ranchSpecies.species })
      .from(ranchSpecies)
      .where(eq(ranchSpecies.ranchId, ranchId)),
    db
      .select({ species: herds.species })
      .from(herds)
      .where(and(eq(herds.ranchId, ranchId), sql`${herds.species} IS NOT NULL`)),
  ]);

  return Array.from(
    new Set(
      [...ranchSpeciesRows, ...herdRows]
        .map((row) => String(row.species ?? "").trim())
        .filter((s) => s.length > 0 && s.toLowerCase() !== "mixed")
    )
  ).sort((a, b) => a.localeCompare(b));
}

function validateSpeciesAgainstRanch(species: string[], allowedSpecies: string[]) {
  const allowed = new Set(allowedSpecies.map((s) => s.trim().toLowerCase()));
  for (const sp of species) {
    if (!allowed.has(sp.trim().toLowerCase())) {
      throw appError(400, `Species "${sp}" is not configured for this ranch`);
    }
  }
}

function ensureBlendPercentTotal(items: Array<{ percent: string }>) {
  const total = items.reduce((sum, row) => sum + Number(row.percent), 0);
  if (Math.abs(total - 100) > 0.01) {
    throw appError(400, "Blend composition percentages must total 100 (plus/minus 0.01).");
  }
}

function getPhotoPurpose(entityType: FeedPhotoEntityType, fieldName: string): string {
  const normalized = fieldName.trim().toLowerCase();
  if (entityType === "PURCHASE") {
    if (normalized === "receipt") return "receipt";
    if (normalized === "packaging") return "packaging";
    if (normalized === "label") return "label";
    if (normalized === "misc") return "misc";
    return "misc";
  }

  if (normalized === "packaging") return "packaging";
  if (normalized === "label") return "packaging";
  if (normalized === "misc") return "misc";
  return "packaging";
}

function buildRelativeFeedPhotoPath(
  ranchId: string,
  entityType: FeedPhotoEntityType,
  entityId: string,
  purpose: string,
  storedFilename: string
): string {
  let segment = "purchases";
  if (entityType === "COMPONENT") segment = "components";
  if (entityType === "BLEND") segment = "blends";
  return `ranches/${ranchId}/feed/${segment}/${entityId}/${purpose}/${storedFilename}`;
}

async function saveFeedPhotos(params: {
  ranchId: string;
  entityType: FeedPhotoEntityType;
  entityId: string;
  files: any[];
}) {
  const { ranchId, entityType, entityId, files } = params;
  if (!files.length) return;

  const ranchRoot = await ensureRanchStructure(ranchId);
  const entityFolder = entityType === "COMPONENT" ? "components" : entityType === "BLEND" ? "blends" : "purchases";

  for (const file of files) {
    const purpose = getPhotoPurpose(entityType, String(file.fieldname ?? ""));
    const destDir = path.join(ranchRoot, "feed", entityFolder, entityId, purpose);
    ensureDir(destDir);

    const saved = await saveUploadedFile(file, destDir);
    const relativePath = buildRelativeFeedPhotoPath(ranchId, entityType, entityId, purpose, saved.filename);
    const storageUrl = `/images/${relativePath}`;

    await db.insert(feedPhotos).values({
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

async function removeFeedPhotosByIds(params: {
  ranchId: string;
  entityType: FeedPhotoEntityType;
  entityId: string;
  photoIds: string[];
}) {
  const { ranchId, entityType, entityId, photoIds } = params;
  if (!photoIds.length) return;

  const rows = await db
    .select({ id: feedPhotos.id, filePath: feedPhotos.filePath })
    .from(feedPhotos)
    .where(
      and(
        eq(feedPhotos.ranchId, ranchId),
        eq(feedPhotos.entityType, entityType),
        eq(feedPhotos.entityId, entityId),
        inArray(feedPhotos.id, photoIds)
      )
    );

  if (!rows.length) return;

  await db
    .delete(feedPhotos)
    .where(
      and(
        eq(feedPhotos.ranchId, ranchId),
        eq(feedPhotos.entityType, entityType),
        eq(feedPhotos.entityId, entityId),
        inArray(feedPhotos.id, rows.map((r) => r.id))
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

const FeedComponentCreateBodySchema = z.object({
  name: z.string().min(1),
  manufacturerName: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  deliveryMethod: z.string().optional().nullable(),
  unitType: z.union([z.enum(["WEIGHT", "COUNT", "VOLUME"]), z.string()]).optional().nullable(),
  defaultUnit: z.string().optional().nullable(),
  defaultPackageWeight: z.union([z.string(), z.number()]).optional().nullable(),
  defaultPackageUnit: z.string().optional().nullable(),
  isBulkCommodity: z.union([z.boolean(), z.string()]).optional().nullable(),
  notes: z.string().optional().nullable(),
  eligibleSpecies: z.array(z.string().min(1)).optional(),
});

const FeedComponentUpdateBodySchema = z.object({
  name: z.string().optional(),
  manufacturerName: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  deliveryMethod: z.string().optional().nullable(),
  unitType: z.union([z.enum(["WEIGHT", "COUNT", "VOLUME"]), z.string()]).optional().nullable(),
  defaultUnit: z.string().optional().nullable(),
  defaultPackageWeight: z.union([z.string(), z.number()]).optional().nullable(),
  defaultPackageUnit: z.string().optional().nullable(),
  isBulkCommodity: z.union([z.boolean(), z.string()]).optional().nullable(),
  notes: z.string().optional().nullable(),
  eligibleSpecies: z.array(z.string().min(1)).optional(),
  removePhotoIds: z.array(z.string().uuid()).optional(),
});

const FeedBlendItemSchema = z.object({
  feedComponentId: z.string().uuid(),
  percent: decimalInputSchema(),
});

const FeedBlendCreateBodySchema = z
  .object({
    name: z.string().min(1),
    manufacturerName: z.string().optional().nullable(),
    unitType: z.union([z.enum(["WEIGHT", "COUNT", "VOLUME"]), z.string()]).optional().nullable(),
    defaultUnit: z.string().optional().nullable(),
    defaultPackageWeight: z.union([z.string(), z.number()]).optional().nullable(),
    defaultPackageUnit: z.string().optional().nullable(),
    isBulkCommodity: z.union([z.boolean(), z.string()]).optional().nullable(),
    notes: z.string().optional().nullable(),
    versionNotes: z.string().optional().nullable(),
    eligibleSpecies: z.array(z.string().min(1)).optional(),
    items: z.array(FeedBlendItemSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const item of data.items) {
      if (seen.has(item.feedComponentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A blend cannot contain the same component more than once.",
          path: ["items"],
        });
      }
      seen.add(item.feedComponentId);
    }
  });

const FeedBlendUpdateBodySchema = z
  .object({
    name: z.string().optional(),
    manufacturerName: z.string().optional().nullable(),
    unitType: z.union([z.enum(["WEIGHT", "COUNT", "VOLUME"]), z.string()]).optional().nullable(),
    defaultUnit: z.string().optional().nullable(),
    defaultPackageWeight: z.union([z.string(), z.number()]).optional().nullable(),
    defaultPackageUnit: z.string().optional().nullable(),
    isBulkCommodity: z.union([z.boolean(), z.string()]).optional().nullable(),
    notes: z.string().optional().nullable(),
    versionNotes: z.string().optional().nullable(),
    eligibleSpecies: z.array(z.string().min(1)).optional(),
    items: z.array(FeedBlendItemSchema).optional(),
    removePhotoIds: z.array(z.string().uuid()).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.items || data.items.length === 0) return;
    const seen = new Set<string>();
    for (const item of data.items) {
      if (seen.has(item.feedComponentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A blend cannot contain the same component more than once.",
          path: ["items"],
        });
      }
      seen.add(item.feedComponentId);
    }
  });

const FeedPurchaseItemSchema = z
  .object({
    entityType: z.enum(["COMPONENT", "BLEND"]),
    feedComponentId: z.string().uuid().optional(),
    feedBlendId: z.string().uuid().optional(),
    blendVersionId: z.string().uuid().optional(),
    unitType: z.union([z.enum(["WEIGHT", "COUNT", "VOLUME"]), z.string()]).optional().nullable(),
    quantity: decimalInputSchema(),
    unit: z.string().optional().nullable(),
    packageWeight: z.union([z.string(), z.number()]).optional().nullable(),
    packageWeightUnit: z.string().optional().nullable(),
    normalizedQuantity: z.union([z.string(), z.number()]).optional().nullable(),
    normalizedUnit: z.string().optional().nullable(),
    unitPrice: z.union([z.string(), z.number()]).optional().nullable(),
    lineTotal: z.union([z.string(), z.number()]).optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.entityType === "COMPONENT") {
      if (!data.feedComponentId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "feedComponentId is required when entityType is COMPONENT",
          path: ["feedComponentId"],
        });
      }
      if (data.feedBlendId || data.blendVersionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Blend fields are not allowed for COMPONENT purchase items",
          path: ["feedBlendId"],
        });
      }
    } else {
      if (!data.feedBlendId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "feedBlendId is required when entityType is BLEND",
          path: ["feedBlendId"],
        });
      }
      if (data.feedComponentId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "feedComponentId is not allowed for BLEND purchase items",
          path: ["feedComponentId"],
        });
      }
    }
  });

const FeedPurchaseCreateBodySchema = z.object({
  purchaseDate: z.string().min(10).optional(),
  supplierName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(FeedPurchaseItemSchema).min(1),
});

const UuidParamSchema = z.object({ id: z.string().uuid() });
const ComponentParamSchema = z.object({ componentId: z.string().uuid() });
const BlendParamSchema = z.object({ blendId: z.string().uuid() });
const PurchaseParamSchema = z.object({ purchaseId: z.string().uuid() });

const FeedListQuerySchema = z.object({
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

const FeedComponentListQuerySchema = z.object({
  category: z.string().optional().nullable(),
});

export async function feedRoutes(app: FastifyInstance) {
  app.get("/feed/species-options", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      const species = await loadRanchSpeciesOptions(ranchId);
      return reply.send({ species });
    } catch (err: any) {
      req.log.error({ err }, "Failed to load feed species options");
      return reply.status(500).send({
        error: "Failed to load feed species options",
        message: err?.message,
      });
    }
  });

  app.get("/feed/components", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const query = FeedComponentListQuerySchema.parse(req.query ?? {});
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      const categoryFilter = parseFeedComponentCategoryFilter(query.category);
      const componentWhere =
        categoryFilter.length > 0
          ? and(eq(feedComponents.ranchId, ranchId), inArray(feedComponents.category, categoryFilter))
          : eq(feedComponents.ranchId, ranchId);

      const [componentRows, speciesRows, balanceRows] = await Promise.all([
        db
          .select({
            id: feedComponents.id,
            name: feedComponents.name,
            manufacturerName: feedComponents.manufacturerName,
            category: feedComponents.category,
            deliveryMethod: feedComponents.deliveryMethod,
            unitType: feedComponents.unitType,
            defaultUnit: feedComponents.defaultUnit,
            defaultPackageWeight: feedComponents.defaultPackageWeight,
            defaultPackageUnit: feedComponents.defaultPackageUnit,
            isBulkCommodity: feedComponents.isBulkCommodity,
            notes: feedComponents.notes,
            createdAt: feedComponents.createdAt,
            updatedAt: feedComponents.updatedAt,
          })
          .from(feedComponents)
          .where(componentWhere)
          .orderBy(asc(feedComponents.name)),
        db
          .select({
            feedComponentId: feedComponentEligibleSpecies.feedComponentId,
            species: feedComponentEligibleSpecies.species,
          })
          .from(feedComponentEligibleSpecies)
          .where(eq(feedComponentEligibleSpecies.ranchId, ranchId))
          .orderBy(feedComponentEligibleSpecies.species),
        db
          .select({
            feedComponentId: feedInventoryBalances.feedComponentId,
            quantityOnHand: feedInventoryBalances.quantityOnHand,
            updatedAt: feedInventoryBalances.updatedAt,
          })
          .from(feedInventoryBalances)
          .where(
            and(eq(feedInventoryBalances.ranchId, ranchId), eq(feedInventoryBalances.entityType, "COMPONENT"))
          ),
      ]);

      const speciesByComponent = new Map<string, string[]>();
      for (const row of speciesRows) {
        const existing = speciesByComponent.get(row.feedComponentId) ?? [];
        existing.push(row.species);
        speciesByComponent.set(row.feedComponentId, existing);
      }

      const balanceByComponent = new Map<string, { quantityOnHand: string; updatedAt: Date }>();
      for (const row of balanceRows) {
        if (!row.feedComponentId) continue;
        balanceByComponent.set(row.feedComponentId, {
          quantityOnHand: row.quantityOnHand,
          updatedAt: row.updatedAt,
        });
      }

      return reply.send({
        components: componentRows.map((row) => {
          const eligibleSpecies = speciesByComponent.get(row.id) ?? [];
          const balance = balanceByComponent.get(row.id);
          return {
            id: row.id,
            name: row.name,
            manufacturerName: row.manufacturerName,
            category: row.category,
            deliveryMethod: row.deliveryMethod,
            unitType: row.unitType ?? inferUnitTypeFromUnit(row.defaultUnit),
            defaultUnit: row.defaultUnit,
            defaultPackageWeight: row.defaultPackageWeight,
            defaultPackageUnit: row.defaultPackageUnit,
            isBulkCommodity: row.isBulkCommodity,
            notes: row.notes,
            eligibleSpecies,
            eligibleSpeciesIsAll: eligibleSpecies.length === 0,
            quantityOnHand: balance?.quantityOnHand ?? "0",
            balanceUpdatedAt: balance?.updatedAt ?? null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        }),
      });
    } catch (err: any) {
      req.log.error({ err }, "Failed to list feed components");
      return reply.status(500).send({ error: "Failed to list feed components", message: err?.message });
    }
  });

  app.get("/feed/components/:componentId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { componentId } = ComponentParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const componentRows = await db
        .select({
          id: feedComponents.id,
          name: feedComponents.name,
          manufacturerName: feedComponents.manufacturerName,
          category: feedComponents.category,
          deliveryMethod: feedComponents.deliveryMethod,
          unitType: feedComponents.unitType,
          defaultUnit: feedComponents.defaultUnit,
          defaultPackageWeight: feedComponents.defaultPackageWeight,
          defaultPackageUnit: feedComponents.defaultPackageUnit,
          isBulkCommodity: feedComponents.isBulkCommodity,
          notes: feedComponents.notes,
          createdAt: feedComponents.createdAt,
          updatedAt: feedComponents.updatedAt,
        })
        .from(feedComponents)
        .where(and(eq(feedComponents.id, componentId), eq(feedComponents.ranchId, ranchId)))
        .limit(1);

      if (!componentRows.length) return reply.status(404).send({ error: "Feed component not found" });

      const [speciesRows, photoRows] = await Promise.all([
        db
          .select({ species: feedComponentEligibleSpecies.species })
          .from(feedComponentEligibleSpecies)
          .where(
            and(
              eq(feedComponentEligibleSpecies.ranchId, ranchId),
              eq(feedComponentEligibleSpecies.feedComponentId, componentId)
            )
          )
          .orderBy(feedComponentEligibleSpecies.species),
        db
          .select({
            id: feedPhotos.id,
            filePath: feedPhotos.filePath,
            storageUrl: feedPhotos.storageUrl,
            originalFilename: feedPhotos.originalFilename,
            mimeType: feedPhotos.mimeType,
            fileSize: feedPhotos.fileSize,
            uploadedAt: feedPhotos.uploadedAt,
            metadataJson: feedPhotos.metadataJson,
          })
          .from(feedPhotos)
          .where(
            and(
              eq(feedPhotos.ranchId, ranchId),
              eq(feedPhotos.entityType, "COMPONENT"),
              eq(feedPhotos.entityId, componentId)
            )
          )
          .orderBy(desc(feedPhotos.uploadedAt)),
      ]);

      const eligibleSpecies = speciesRows.map((row) => row.species);

      return reply.send({
        component: {
          ...componentRows[0],
          unitType:
            componentRows[0].unitType ?? inferUnitTypeFromUnit(componentRows[0].defaultUnit),
          eligibleSpecies,
          eligibleSpeciesIsAll: eligibleSpecies.length === 0,
        },
        photos: photoRows.map((row) => ({
          id: row.id,
          purpose: parsePhotoPurpose(row.metadataJson),
          filePath: row.filePath,
          storageUrl: row.storageUrl,
          url:
            row.storageUrl ??
            (row.filePath && row.filePath.trim().length > 0 ? `/images/${row.filePath}` : null),
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
        "Failed to load feed component detail",
        "Failed to load feed component detail"
      );
    }
  });

  app.get("/feed/components/:componentId/photos", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { componentId } = ComponentParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const exists = await db
        .select({ id: feedComponents.id })
        .from(feedComponents)
        .where(and(eq(feedComponents.id, componentId), eq(feedComponents.ranchId, ranchId)))
        .limit(1);

      if (!exists.length) return reply.status(404).send({ error: "Feed component not found" });

      const photos = await db
        .select({
          id: feedPhotos.id,
          filePath: feedPhotos.filePath,
          storageUrl: feedPhotos.storageUrl,
          originalFilename: feedPhotos.originalFilename,
          mimeType: feedPhotos.mimeType,
          fileSize: feedPhotos.fileSize,
          uploadedAt: feedPhotos.uploadedAt,
          metadataJson: feedPhotos.metadataJson,
        })
        .from(feedPhotos)
        .where(
          and(
            eq(feedPhotos.ranchId, ranchId),
            eq(feedPhotos.entityType, "COMPONENT"),
            eq(feedPhotos.entityId, componentId)
          )
        )
        .orderBy(desc(feedPhotos.uploadedAt));

      return reply.send({
        photos: photos.map((row) => ({
          id: row.id,
          purpose: parsePhotoPurpose(row.metadataJson),
          filePath: row.filePath,
          storageUrl: row.storageUrl,
          url:
            row.storageUrl ??
            (row.filePath && row.filePath.trim().length > 0 ? `/images/${row.filePath}` : null),
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
        "Failed to list feed component photos",
        "Failed to list feed component photos"
      );
    }
  });

  app.post("/feed/components", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const body = normalizeBody(rawBody);
      const parsed = FeedComponentCreateBodySchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid feed component payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const eligibleSpecies = toNormalizedSpeciesList(data.eligibleSpecies ?? []);
      if (eligibleSpecies.length > 0) {
        const ranchAllowedSpecies = await loadRanchSpeciesOptions(ranchId);
        validateSpeciesAgainstRanch(eligibleSpecies, ranchAllowedSpecies);
      }

      const normalizedDefaultUnit = data.defaultUnit?.trim() ? data.defaultUnit.trim() : "lb";
      const normalizedCategory = data.category
        ? normalizeFeedComponentCategory(data.category)
        : ("OTHER" as FeedComponentCategory);
      if (!normalizedCategory) {
        throw appError(400, "Invalid feed component category.");
      }
      const normalizedDeliveryMethod =
        data.deliveryMethod && data.deliveryMethod.trim().length > 0
          ? normalizeFeedDeliveryMethod(data.deliveryMethod)
          : null;
      if (data.deliveryMethod && data.deliveryMethod.trim().length > 0 && !normalizedDeliveryMethod) {
        throw appError(400, "Invalid feed component delivery method.");
      }
      const normalizedUnitType =
        normalizeFeedUnitType(data.unitType) ?? inferUnitTypeFromUnit(normalizedDefaultUnit);
      const normalizedPackageWeight = toNullableDecimalString(data.defaultPackageWeight, {
        fieldLabel: "defaultPackageWeight",
      });
      const normalizedPackageUnit =
        normalizedPackageWeight && data.defaultPackageUnit && data.defaultPackageUnit.trim().length > 0
          ? data.defaultPackageUnit.trim()
          : normalizedPackageWeight
            ? "lb"
            : null;
      const isBulkCommodity = toBooleanLike(data.isBulkCommodity, false);

      const now = new Date();
      const componentId = crypto.randomUUID();

      await db.transaction(async (tx) => {
        await tx.insert(feedComponents).values({
          id: componentId,
          ranchId,
          name: data.name.trim(),
          manufacturerName: data.manufacturerName?.trim() ? data.manufacturerName.trim() : null,
          category: normalizedCategory,
          deliveryMethod: normalizedDeliveryMethod,
          unitType: normalizedUnitType,
          defaultUnit: normalizedDefaultUnit,
          defaultPackageWeight: normalizedPackageWeight,
          defaultPackageUnit: normalizedPackageUnit,
          isBulkCommodity,
          notes: data.notes?.trim() ? data.notes.trim() : null,
          createdAt: now,
          updatedAt: now,
        });

        if (eligibleSpecies.length > 0) {
          await tx.insert(feedComponentEligibleSpecies).values(
            eligibleSpecies.map((species) => ({
              ranchId,
              feedComponentId: componentId,
              species,
              createdAt: now,
            }))
          );
        }
      });

      await saveFeedPhotos({
        ranchId,
        entityType: "COMPONENT",
        entityId: componentId,
        files,
      });

      return reply.status(201).send({
        component: {
          id: componentId,
          ranchId,
          name: data.name.trim(),
          manufacturerName: data.manufacturerName?.trim() ? data.manufacturerName.trim() : null,
          category: normalizedCategory,
          deliveryMethod: normalizedDeliveryMethod,
          unitType: normalizedUnitType,
          defaultUnit: normalizedDefaultUnit,
          defaultPackageWeight: normalizedPackageWeight,
          defaultPackageUnit: normalizedPackageUnit,
          isBulkCommodity,
          notes: data.notes?.trim() ? data.notes.trim() : null,
          eligibleSpecies,
          eligibleSpeciesIsAll: eligibleSpecies.length === 0,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (err) {
      return withErrorHandling(
        req,
        reply,
        err,
        "Failed to create feed component",
        "Failed to create feed component"
      );
    }
  });

  app.put("/feed/components/:componentId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { componentId } = ComponentParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const exists = await db
        .select({ id: feedComponents.id })
        .from(feedComponents)
        .where(and(eq(feedComponents.id, componentId), eq(feedComponents.ranchId, ranchId)))
        .limit(1);

      if (!exists.length) return reply.status(404).send({ error: "Feed component not found" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const body = normalizeBody(rawBody);
      const parsed = FeedComponentUpdateBodySchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid feed component payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const now = new Date();
      const patch: Record<string, any> = {};

      if (typeof data.name === "string") patch.name = data.name.trim();
      if (data.manufacturerName !== undefined) {
        patch.manufacturerName = data.manufacturerName?.trim() ? data.manufacturerName.trim() : null;
      }
      if (data.category !== undefined) {
        const normalizedCategory = data.category
          ? normalizeFeedComponentCategory(data.category)
          : ("OTHER" as FeedComponentCategory);
        if (!normalizedCategory) {
          throw appError(400, "Invalid feed component category.");
        }
        patch.category = normalizedCategory;
      }
      if (data.deliveryMethod !== undefined) {
        if (!data.deliveryMethod || !data.deliveryMethod.trim().length) {
          patch.deliveryMethod = null;
        } else {
          const normalizedDeliveryMethod = normalizeFeedDeliveryMethod(data.deliveryMethod);
          if (!normalizedDeliveryMethod) {
            throw appError(400, "Invalid feed component delivery method.");
          }
          patch.deliveryMethod = normalizedDeliveryMethod;
        }
      }
      if (data.unitType !== undefined) {
        patch.unitType = normalizeFeedUnitType(data.unitType);
      }
      if (data.defaultUnit !== undefined) {
        patch.defaultUnit = data.defaultUnit?.trim() ? data.defaultUnit.trim() : "lb";
        if (data.unitType === undefined) {
          patch.unitType = inferUnitTypeFromUnit(patch.defaultUnit);
        }
      }
      if (data.defaultPackageWeight !== undefined) {
        patch.defaultPackageWeight = toNullableDecimalString(data.defaultPackageWeight, {
          fieldLabel: "defaultPackageWeight",
        });
      }
      if (data.defaultPackageUnit !== undefined) {
        patch.defaultPackageUnit = data.defaultPackageUnit?.trim() ? data.defaultPackageUnit.trim() : null;
      }
      if (patch.defaultPackageWeight && !patch.defaultPackageUnit) {
        patch.defaultPackageUnit = "lb";
      }
      if (patch.defaultPackageWeight === null) {
        patch.defaultPackageUnit = null;
      }
      if (data.isBulkCommodity !== undefined) {
        patch.isBulkCommodity = toBooleanLike(data.isBulkCommodity, false);
      }
      if (data.notes !== undefined) {
        patch.notes = data.notes?.trim() ? data.notes.trim() : null;
      }
      if (Object.keys(patch).length > 0) patch.updatedAt = now;

      const eligibleSpeciesProvided = data.eligibleSpecies !== undefined;
      const eligibleSpecies = toNormalizedSpeciesList(data.eligibleSpecies ?? []);
      if (eligibleSpeciesProvided && eligibleSpecies.length > 0) {
        const ranchAllowedSpecies = await loadRanchSpeciesOptions(ranchId);
        validateSpeciesAgainstRanch(eligibleSpecies, ranchAllowedSpecies);
      }

      await db.transaction(async (tx) => {
        if (Object.keys(patch).length > 0) {
          await tx
            .update(feedComponents)
            .set(patch)
            .where(and(eq(feedComponents.id, componentId), eq(feedComponents.ranchId, ranchId)));
        }

        if (eligibleSpeciesProvided) {
          await tx
            .delete(feedComponentEligibleSpecies)
            .where(
              and(
                eq(feedComponentEligibleSpecies.ranchId, ranchId),
                eq(feedComponentEligibleSpecies.feedComponentId, componentId)
              )
            );

          if (eligibleSpecies.length > 0) {
            await tx.insert(feedComponentEligibleSpecies).values(
              eligibleSpecies.map((species) => ({
                ranchId,
                feedComponentId: componentId,
                species,
                createdAt: now,
              }))
            );
          }
        }
      });

      if (data.removePhotoIds && data.removePhotoIds.length > 0) {
        await removeFeedPhotosByIds({
          ranchId,
          entityType: "COMPONENT",
          entityId: componentId,
          photoIds: data.removePhotoIds,
        });
      }

      await saveFeedPhotos({
        ranchId,
        entityType: "COMPONENT",
        entityId: componentId,
        files,
      });

      return reply.send({
        updated: { id: componentId },
      });
    } catch (err) {
      return withErrorHandling(
        req,
        reply,
        err,
        "Failed to update feed component",
        "Failed to update feed component"
      );
    }
  });

  app.get("/feed/blends", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const [blendRows, speciesRows, currentVersionRows] = await Promise.all([
        db
          .select({
            id: feedBlends.id,
            name: feedBlends.name,
            manufacturerName: feedBlends.manufacturerName,
            unitType: feedBlends.unitType,
            defaultUnit: feedBlends.defaultUnit,
            defaultPackageWeight: feedBlends.defaultPackageWeight,
            defaultPackageUnit: feedBlends.defaultPackageUnit,
            isBulkCommodity: feedBlends.isBulkCommodity,
            notes: feedBlends.notes,
            currentVersionId: feedBlends.currentVersionId,
            createdAt: feedBlends.createdAt,
            updatedAt: feedBlends.updatedAt,
          })
          .from(feedBlends)
          .where(eq(feedBlends.ranchId, ranchId))
          .orderBy(asc(feedBlends.name)),
        db
          .select({
            feedBlendId: feedBlendEligibleSpecies.feedBlendId,
            species: feedBlendEligibleSpecies.species,
          })
          .from(feedBlendEligibleSpecies)
          .where(eq(feedBlendEligibleSpecies.ranchId, ranchId))
          .orderBy(feedBlendEligibleSpecies.species),
        db
          .select({
            id: feedBlendVersions.id,
            feedBlendId: feedBlendVersions.feedBlendId,
            versionNumber: feedBlendVersions.versionNumber,
            isCurrent: feedBlendVersions.isCurrent,
            notes: feedBlendVersions.notes,
            createdAt: feedBlendVersions.createdAt,
          })
          .from(feedBlendVersions)
          .where(and(eq(feedBlendVersions.ranchId, ranchId), eq(feedBlendVersions.isCurrent, true))),
      ]);

      const versionIds = currentVersionRows.map((row) => row.id);
      const currentVersionItemsRows =
        versionIds.length > 0
          ? await db
              .select({
                feedBlendVersionId: feedBlendVersionItems.feedBlendVersionId,
                feedComponentId: feedBlendVersionItems.feedComponentId,
                componentName: feedComponents.name,
                percent: feedBlendVersionItems.percent,
              })
              .from(feedBlendVersionItems)
              .innerJoin(
                feedComponents,
                and(
                  eq(feedComponents.id, feedBlendVersionItems.feedComponentId),
                  eq(feedComponents.ranchId, ranchId)
                )
              )
              .where(
                and(
                  eq(feedBlendVersionItems.ranchId, ranchId),
                  inArray(feedBlendVersionItems.feedBlendVersionId, versionIds)
                )
              )
              .orderBy(feedComponents.name)
          : [];

      const speciesByBlend = new Map<string, string[]>();
      for (const row of speciesRows) {
        const existing = speciesByBlend.get(row.feedBlendId) ?? [];
        existing.push(row.species);
        speciesByBlend.set(row.feedBlendId, existing);
      }

      const currentVersionByBlend = new Map<string, (typeof currentVersionRows)[number]>();
      for (const row of currentVersionRows) {
        currentVersionByBlend.set(row.feedBlendId, row);
      }

      const itemsByVersion = new Map<
        string,
        Array<{ feedComponentId: string; componentName: string; percent: string }>
      >();
      for (const row of currentVersionItemsRows) {
        const existing = itemsByVersion.get(row.feedBlendVersionId) ?? [];
        existing.push({
          feedComponentId: row.feedComponentId,
          componentName: row.componentName,
          percent: row.percent,
        });
        itemsByVersion.set(row.feedBlendVersionId, existing);
      }

      return reply.send({
        blends: blendRows.map((blend) => {
          const eligibleSpecies = speciesByBlend.get(blend.id) ?? [];
          const currentVersion = currentVersionByBlend.get(blend.id) ?? null;
          const currentItems = currentVersion ? itemsByVersion.get(currentVersion.id) ?? [] : [];
          const percentTotal = currentItems.reduce((sum, item) => sum + Number(item.percent), 0);

          return {
            ...blend,
            unitType: blend.unitType ?? inferUnitTypeFromUnit(blend.defaultUnit),
            eligibleSpecies,
            eligibleSpeciesIsAll: eligibleSpecies.length === 0,
            currentVersion: currentVersion
              ? {
                  id: currentVersion.id,
                  versionNumber: currentVersion.versionNumber,
                  notes: currentVersion.notes,
                  createdAt: currentVersion.createdAt,
                  items: currentItems,
                  percentTotal: String(percentTotal),
                }
              : null,
          };
        }),
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to list feed blends", "Failed to list feed blends");
    }
  });

  app.get("/feed/blends/:blendId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { blendId } = BlendParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const blendRows = await db
        .select({
          id: feedBlends.id,
          name: feedBlends.name,
          manufacturerName: feedBlends.manufacturerName,
          unitType: feedBlends.unitType,
          defaultUnit: feedBlends.defaultUnit,
          defaultPackageWeight: feedBlends.defaultPackageWeight,
          defaultPackageUnit: feedBlends.defaultPackageUnit,
          isBulkCommodity: feedBlends.isBulkCommodity,
          notes: feedBlends.notes,
          currentVersionId: feedBlends.currentVersionId,
          createdAt: feedBlends.createdAt,
          updatedAt: feedBlends.updatedAt,
        })
        .from(feedBlends)
        .where(and(eq(feedBlends.id, blendId), eq(feedBlends.ranchId, ranchId)))
        .limit(1);

      if (!blendRows.length) return reply.status(404).send({ error: "Feed blend not found" });

      const [eligibleSpeciesRows, versionRows, photoRows] = await Promise.all([
        db
          .select({ species: feedBlendEligibleSpecies.species })
          .from(feedBlendEligibleSpecies)
          .where(and(eq(feedBlendEligibleSpecies.ranchId, ranchId), eq(feedBlendEligibleSpecies.feedBlendId, blendId)))
          .orderBy(feedBlendEligibleSpecies.species),
        db
          .select({
            id: feedBlendVersions.id,
            versionNumber: feedBlendVersions.versionNumber,
            isCurrent: feedBlendVersions.isCurrent,
            notes: feedBlendVersions.notes,
            createdAt: feedBlendVersions.createdAt,
          })
          .from(feedBlendVersions)
          .where(and(eq(feedBlendVersions.ranchId, ranchId), eq(feedBlendVersions.feedBlendId, blendId)))
          .orderBy(desc(feedBlendVersions.versionNumber)),
        db
          .select({
            id: feedPhotos.id,
            filePath: feedPhotos.filePath,
            storageUrl: feedPhotos.storageUrl,
            originalFilename: feedPhotos.originalFilename,
            mimeType: feedPhotos.mimeType,
            fileSize: feedPhotos.fileSize,
            uploadedAt: feedPhotos.uploadedAt,
            metadataJson: feedPhotos.metadataJson,
          })
          .from(feedPhotos)
          .where(and(eq(feedPhotos.ranchId, ranchId), eq(feedPhotos.entityType, "BLEND"), eq(feedPhotos.entityId, blendId)))
          .orderBy(desc(feedPhotos.uploadedAt)),
      ]);

      const versionIds = versionRows.map((row) => row.id);
      const itemRows =
        versionIds.length > 0
          ? await db
              .select({
                feedBlendVersionId: feedBlendVersionItems.feedBlendVersionId,
                feedComponentId: feedBlendVersionItems.feedComponentId,
                componentName: feedComponents.name,
                percent: feedBlendVersionItems.percent,
              })
              .from(feedBlendVersionItems)
              .innerJoin(
                feedComponents,
                and(
                  eq(feedComponents.id, feedBlendVersionItems.feedComponentId),
                  eq(feedComponents.ranchId, ranchId)
                )
              )
              .where(
                and(
                  eq(feedBlendVersionItems.ranchId, ranchId),
                  inArray(feedBlendVersionItems.feedBlendVersionId, versionIds)
                )
              )
              .orderBy(feedBlendVersionItems.feedBlendVersionId, feedComponents.name)
          : [];

      const itemsByVersion = new Map<string, Array<{ feedComponentId: string; componentName: string; percent: string }>>();
      for (const row of itemRows) {
        const existing = itemsByVersion.get(row.feedBlendVersionId) ?? [];
        existing.push({
          feedComponentId: row.feedComponentId,
          componentName: row.componentName,
          percent: row.percent,
        });
        itemsByVersion.set(row.feedBlendVersionId, existing);
      }

      const versions = versionRows.map((row) => {
        const items = itemsByVersion.get(row.id) ?? [];
        const percentTotal = items.reduce((sum, item) => sum + Number(item.percent), 0);
        return {
          ...row,
          items,
          percentTotal: String(percentTotal),
        };
      });

      const eligibleSpecies = eligibleSpeciesRows.map((row) => row.species);

      return reply.send({
        blend: {
          ...blendRows[0],
          unitType: blendRows[0].unitType ?? inferUnitTypeFromUnit(blendRows[0].defaultUnit),
          eligibleSpecies,
          eligibleSpeciesIsAll: eligibleSpecies.length === 0,
          versions,
        },
        photos: photoRows.map((row) => ({
          id: row.id,
          purpose: parsePhotoPurpose(row.metadataJson),
          filePath: row.filePath,
          storageUrl: row.storageUrl,
          url:
            row.storageUrl ??
            (row.filePath && row.filePath.trim().length > 0 ? `/images/${row.filePath}` : null),
          originalFilename: row.originalFilename,
          mimeType: row.mimeType,
          fileSize: row.fileSize,
          uploadedAt: row.uploadedAt,
          metadataJson: row.metadataJson,
        })),
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to load feed blend detail", "Failed to load feed blend detail");
    }
  });

  app.get("/feed/blends/:blendId/photos", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { blendId } = BlendParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const exists = await db
        .select({ id: feedBlends.id })
        .from(feedBlends)
        .where(and(eq(feedBlends.id, blendId), eq(feedBlends.ranchId, ranchId)))
        .limit(1);

      if (!exists.length) return reply.status(404).send({ error: "Feed blend not found" });

      const photos = await db
        .select({
          id: feedPhotos.id,
          filePath: feedPhotos.filePath,
          storageUrl: feedPhotos.storageUrl,
          originalFilename: feedPhotos.originalFilename,
          mimeType: feedPhotos.mimeType,
          fileSize: feedPhotos.fileSize,
          uploadedAt: feedPhotos.uploadedAt,
          metadataJson: feedPhotos.metadataJson,
        })
        .from(feedPhotos)
        .where(and(eq(feedPhotos.ranchId, ranchId), eq(feedPhotos.entityType, "BLEND"), eq(feedPhotos.entityId, blendId)))
        .orderBy(desc(feedPhotos.uploadedAt));

      return reply.send({
        photos: photos.map((row) => ({
          id: row.id,
          purpose: parsePhotoPurpose(row.metadataJson),
          filePath: row.filePath,
          storageUrl: row.storageUrl,
          url:
            row.storageUrl ??
            (row.filePath && row.filePath.trim().length > 0 ? `/images/${row.filePath}` : null),
          originalFilename: row.originalFilename,
          mimeType: row.mimeType,
          fileSize: row.fileSize,
          uploadedAt: row.uploadedAt,
          metadataJson: row.metadataJson,
        })),
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to list feed blend photos", "Failed to list feed blend photos");
    }
  });

  app.post("/feed/blends", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const body = normalizeBody(rawBody);
      const parsed = FeedBlendCreateBodySchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid feed blend payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      ensureBlendPercentTotal(data.items);

      const eligibleSpecies = toNormalizedSpeciesList(data.eligibleSpecies ?? []);
      if (eligibleSpecies.length > 0) {
        const ranchAllowedSpecies = await loadRanchSpeciesOptions(ranchId);
        validateSpeciesAgainstRanch(eligibleSpecies, ranchAllowedSpecies);
      }

      const componentIds = Array.from(new Set(data.items.map((item) => item.feedComponentId)));
      const components = await db
        .select({ id: feedComponents.id })
        .from(feedComponents)
        .where(and(eq(feedComponents.ranchId, ranchId), inArray(feedComponents.id, componentIds)));

      const existingComponentIds = new Set(components.map((row) => row.id));
      const missing = componentIds.filter((id) => !existingComponentIds.has(id));
      if (missing.length > 0) {
        throw appError(400, "One or more blend components are missing or outside the active ranch.");
      }

      const normalizedDefaultUnit = data.defaultUnit?.trim() ? data.defaultUnit.trim() : "lb";
      const normalizedUnitType =
        normalizeFeedUnitType(data.unitType) ?? inferUnitTypeFromUnit(normalizedDefaultUnit);
      const normalizedPackageWeight = toNullableDecimalString(data.defaultPackageWeight, {
        fieldLabel: "defaultPackageWeight",
      });
      const normalizedPackageUnit =
        normalizedPackageWeight && data.defaultPackageUnit && data.defaultPackageUnit.trim().length > 0
          ? data.defaultPackageUnit.trim()
          : normalizedPackageWeight
            ? "lb"
            : null;
      const isBulkCommodity = toBooleanLike(data.isBulkCommodity, false);

      const now = new Date();
      const blendId = crypto.randomUUID();
      const versionId = crypto.randomUUID();

      await db.transaction(async (tx) => {
        await tx.insert(feedBlends).values({
          id: blendId,
          ranchId,
          name: data.name.trim(),
          manufacturerName: data.manufacturerName?.trim() ? data.manufacturerName.trim() : null,
          unitType: normalizedUnitType,
          defaultUnit: normalizedDefaultUnit,
          defaultPackageWeight: normalizedPackageWeight,
          defaultPackageUnit: normalizedPackageUnit,
          isBulkCommodity,
          notes: data.notes?.trim() ? data.notes.trim() : null,
          currentVersionId: versionId,
          createdAt: now,
          updatedAt: now,
        });

        if (eligibleSpecies.length > 0) {
          await tx.insert(feedBlendEligibleSpecies).values(
            eligibleSpecies.map((species) => ({
              ranchId,
              feedBlendId: blendId,
              species,
              createdAt: now,
            }))
          );
        }

        await tx.insert(feedBlendVersions).values({
          id: versionId,
          ranchId,
          feedBlendId: blendId,
          versionNumber: 1,
          isCurrent: true,
          notes: data.versionNotes?.trim() ? data.versionNotes.trim() : null,
          createdAt: now,
        });

        await tx.insert(feedBlendVersionItems).values(
          data.items.map((item) => ({
            id: crypto.randomUUID(),
            ranchId,
            feedBlendVersionId: versionId,
            feedComponentId: item.feedComponentId,
            percent: item.percent,
            createdAt: now,
          }))
        );
      });

      await saveFeedPhotos({
        ranchId,
        entityType: "BLEND",
        entityId: blendId,
        files,
      });

      return reply.status(201).send({
        blend: {
          id: blendId,
          ranchId,
          name: data.name.trim(),
          manufacturerName: data.manufacturerName?.trim() ? data.manufacturerName.trim() : null,
          unitType: normalizedUnitType,
          defaultUnit: normalizedDefaultUnit,
          defaultPackageWeight: normalizedPackageWeight,
          defaultPackageUnit: normalizedPackageUnit,
          isBulkCommodity,
          notes: data.notes?.trim() ? data.notes.trim() : null,
          currentVersionId: versionId,
          eligibleSpecies,
          eligibleSpeciesIsAll: eligibleSpecies.length === 0,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to create feed blend", "Failed to create feed blend");
    }
  });

  app.put("/feed/blends/:blendId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { blendId } = BlendParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const blendRows = await db
        .select({ id: feedBlends.id })
        .from(feedBlends)
        .where(and(eq(feedBlends.id, blendId), eq(feedBlends.ranchId, ranchId)))
        .limit(1);

      if (!blendRows.length) return reply.status(404).send({ error: "Feed blend not found" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const body = normalizeBody(rawBody);
      const parsed = FeedBlendUpdateBodySchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid feed blend payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const now = new Date();
      const patch: Record<string, any> = {};
      if (typeof data.name === "string") patch.name = data.name.trim();
      if (data.manufacturerName !== undefined) {
        patch.manufacturerName = data.manufacturerName?.trim() ? data.manufacturerName.trim() : null;
      }
      if (data.unitType !== undefined) {
        patch.unitType = normalizeFeedUnitType(data.unitType);
      }
      if (data.defaultUnit !== undefined) {
        patch.defaultUnit = data.defaultUnit?.trim() ? data.defaultUnit.trim() : "lb";
        if (data.unitType === undefined) {
          patch.unitType = inferUnitTypeFromUnit(patch.defaultUnit);
        }
      }
      if (data.defaultPackageWeight !== undefined) {
        patch.defaultPackageWeight = toNullableDecimalString(data.defaultPackageWeight, {
          fieldLabel: "defaultPackageWeight",
        });
      }
      if (data.defaultPackageUnit !== undefined) {
        patch.defaultPackageUnit = data.defaultPackageUnit?.trim() ? data.defaultPackageUnit.trim() : null;
      }
      if (patch.defaultPackageWeight && !patch.defaultPackageUnit) {
        patch.defaultPackageUnit = "lb";
      }
      if (patch.defaultPackageWeight === null) {
        patch.defaultPackageUnit = null;
      }
      if (data.isBulkCommodity !== undefined) {
        patch.isBulkCommodity = toBooleanLike(data.isBulkCommodity, false);
      }
      if (data.notes !== undefined) patch.notes = data.notes?.trim() ? data.notes.trim() : null;
      if (Object.keys(patch).length > 0) patch.updatedAt = now;

      const eligibleSpeciesProvided = data.eligibleSpecies !== undefined;
      const eligibleSpecies = toNormalizedSpeciesList(data.eligibleSpecies ?? []);
      if (eligibleSpeciesProvided && eligibleSpecies.length > 0) {
        const ranchAllowedSpecies = await loadRanchSpeciesOptions(ranchId);
        validateSpeciesAgainstRanch(eligibleSpecies, ranchAllowedSpecies);
      }

      const itemsProvided = Array.isArray(data.items) && data.items.length > 0;
      if (itemsProvided) {
        ensureBlendPercentTotal(data.items!);
        const componentIds = Array.from(new Set(data.items!.map((item) => item.feedComponentId)));
        const components = await db
          .select({ id: feedComponents.id })
          .from(feedComponents)
          .where(and(eq(feedComponents.ranchId, ranchId), inArray(feedComponents.id, componentIds)));
        const existingComponentIds = new Set(components.map((row) => row.id));
        const missing = componentIds.filter((id) => !existingComponentIds.has(id));
        if (missing.length > 0) {
          throw appError(400, "One or more blend components are missing or outside the active ranch.");
        }
      }

      let createdVersionId: string | null = null;

      await db.transaction(async (tx) => {
        if (Object.keys(patch).length > 0) {
          await tx
            .update(feedBlends)
            .set(patch)
            .where(and(eq(feedBlends.id, blendId), eq(feedBlends.ranchId, ranchId)));
        }

        if (eligibleSpeciesProvided) {
          await tx
            .delete(feedBlendEligibleSpecies)
            .where(and(eq(feedBlendEligibleSpecies.ranchId, ranchId), eq(feedBlendEligibleSpecies.feedBlendId, blendId)));
          if (eligibleSpecies.length > 0) {
            await tx.insert(feedBlendEligibleSpecies).values(
              eligibleSpecies.map((species) => ({
                ranchId,
                feedBlendId: blendId,
                species,
                createdAt: now,
              }))
            );
          }
        }

        if (itemsProvided) {
          const maxVersionRows = await tx
            .select({ maxVersion: sql<number>`COALESCE(MAX(${feedBlendVersions.versionNumber}), 0)` })
            .from(feedBlendVersions)
            .where(and(eq(feedBlendVersions.ranchId, ranchId), eq(feedBlendVersions.feedBlendId, blendId)));

          const nextVersionNumber = Number(maxVersionRows[0]?.maxVersion ?? 0) + 1;
          const versionId = crypto.randomUUID();
          createdVersionId = versionId;

          await tx
            .update(feedBlendVersions)
            .set({ isCurrent: false })
            .where(and(eq(feedBlendVersions.ranchId, ranchId), eq(feedBlendVersions.feedBlendId, blendId)));

          await tx.insert(feedBlendVersions).values({
            id: versionId,
            ranchId,
            feedBlendId: blendId,
            versionNumber: nextVersionNumber,
            isCurrent: true,
            notes: data.versionNotes?.trim() ? data.versionNotes.trim() : null,
            createdAt: now,
          });

          await tx.insert(feedBlendVersionItems).values(
            data.items!.map((item) => ({
              id: crypto.randomUUID(),
              ranchId,
              feedBlendVersionId: versionId,
              feedComponentId: item.feedComponentId,
              percent: item.percent,
              createdAt: now,
            }))
          );

          await tx
            .update(feedBlends)
            .set({
              currentVersionId: versionId,
              updatedAt: now,
            })
            .where(and(eq(feedBlends.id, blendId), eq(feedBlends.ranchId, ranchId)));
        }
      });

      if (data.removePhotoIds && data.removePhotoIds.length > 0) {
        await removeFeedPhotosByIds({
          ranchId,
          entityType: "BLEND",
          entityId: blendId,
          photoIds: data.removePhotoIds,
        });
      }

      await saveFeedPhotos({
        ranchId,
        entityType: "BLEND",
        entityId: blendId,
        files,
      });

      return reply.send({
        updated: {
          id: blendId,
          createdVersionId,
        },
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to update feed blend", "Failed to update feed blend");
    }
  });

  app.get("/feed/purchases", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const query = FeedListQuerySchema.parse(req.query ?? {});
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const purchases = await db
        .select({
          id: feedPurchases.id,
          ranchId: feedPurchases.ranchId,
          purchaseDate: feedPurchases.purchaseDate,
          supplierName: feedPurchases.supplierName,
          notes: feedPurchases.notes,
          createdAt: feedPurchases.createdAt,
        })
        .from(feedPurchases)
        .where(eq(feedPurchases.ranchId, ranchId))
        .orderBy(desc(feedPurchases.purchaseDate), desc(feedPurchases.createdAt))
        .limit(query.limit);

      const purchaseIds = purchases.map((row) => row.id);
      const itemCounts =
        purchaseIds.length > 0
          ? await db
              .select({
                feedPurchaseId: feedPurchaseItems.feedPurchaseId,
                itemCount: sql<number>`COUNT(*)`,
              })
              .from(feedPurchaseItems)
              .where(and(eq(feedPurchaseItems.ranchId, ranchId), inArray(feedPurchaseItems.feedPurchaseId, purchaseIds)))
              .groupBy(feedPurchaseItems.feedPurchaseId)
          : [];

      const itemCountByPurchase = new Map(itemCounts.map((row) => [row.feedPurchaseId, Number(row.itemCount)]));

      return reply.send({
        purchases: purchases.map((row) => ({
          ...row,
          itemCount: itemCountByPurchase.get(row.id) ?? 0,
        })),
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to list feed purchases", "Failed to list feed purchases");
    }
  });

  app.get("/feed/purchases/:purchaseId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { purchaseId } = PurchaseParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const purchaseRows = await db
        .select({
          id: feedPurchases.id,
          ranchId: feedPurchases.ranchId,
          purchaseDate: feedPurchases.purchaseDate,
          supplierName: feedPurchases.supplierName,
          notes: feedPurchases.notes,
          createdAt: feedPurchases.createdAt,
        })
        .from(feedPurchases)
        .where(and(eq(feedPurchases.id, purchaseId), eq(feedPurchases.ranchId, ranchId)))
        .limit(1);

      if (!purchaseRows.length) return reply.status(404).send({ error: "Feed purchase not found" });

      const itemRows = await db
        .select({
          id: feedPurchaseItems.id,
          entityType: feedPurchaseItems.entityType,
          feedComponentId: feedPurchaseItems.feedComponentId,
          feedBlendId: feedPurchaseItems.feedBlendId,
          blendVersionId: feedPurchaseItems.blendVersionId,
          unitType: feedPurchaseItems.unitType,
          quantity: feedPurchaseItems.quantity,
          unit: feedPurchaseItems.unit,
          packageWeight: feedPurchaseItems.packageWeight,
          packageWeightUnit: feedPurchaseItems.packageWeightUnit,
          normalizedQuantity: feedPurchaseItems.normalizedQuantity,
          normalizedUnit: feedPurchaseItems.normalizedUnit,
          unitPrice: feedPurchaseItems.unitPrice,
          lineTotal: feedPurchaseItems.lineTotal,
          notes: feedPurchaseItems.notes,
          componentName: feedComponents.name,
          blendName: feedBlends.name,
        })
        .from(feedPurchaseItems)
        .leftJoin(
          feedComponents,
          and(eq(feedComponents.id, feedPurchaseItems.feedComponentId), eq(feedComponents.ranchId, ranchId))
        )
        .leftJoin(feedBlends, and(eq(feedBlends.id, feedPurchaseItems.feedBlendId), eq(feedBlends.ranchId, ranchId)))
        .where(and(eq(feedPurchaseItems.ranchId, ranchId), eq(feedPurchaseItems.feedPurchaseId, purchaseId)))
        .orderBy(feedPurchaseItems.createdAt);

      const componentIds = Array.from(
        new Set(itemRows.map((row) => row.feedComponentId).filter((v): v is string => typeof v === "string"))
      );
      const blendIds = Array.from(
        new Set(itemRows.map((row) => row.feedBlendId).filter((v): v is string => typeof v === "string"))
      );

      const [componentSpeciesRows, blendSpeciesRows] = await Promise.all([
        componentIds.length > 0
          ? db
              .select({
                feedComponentId: feedComponentEligibleSpecies.feedComponentId,
                species: feedComponentEligibleSpecies.species,
              })
              .from(feedComponentEligibleSpecies)
              .where(
                and(
                  eq(feedComponentEligibleSpecies.ranchId, ranchId),
                  inArray(feedComponentEligibleSpecies.feedComponentId, componentIds)
                )
              )
          : Promise.resolve([]),
        blendIds.length > 0
          ? db
              .select({
                feedBlendId: feedBlendEligibleSpecies.feedBlendId,
                species: feedBlendEligibleSpecies.species,
              })
              .from(feedBlendEligibleSpecies)
              .where(
                and(
                  eq(feedBlendEligibleSpecies.ranchId, ranchId),
                  inArray(feedBlendEligibleSpecies.feedBlendId, blendIds)
                )
              )
          : Promise.resolve([]),
      ]);

      const componentSpeciesMap = new Map<string, string[]>();
      for (const row of componentSpeciesRows) {
        const existing = componentSpeciesMap.get(row.feedComponentId) ?? [];
        existing.push(row.species);
        componentSpeciesMap.set(row.feedComponentId, existing);
      }

      const blendSpeciesMap = new Map<string, string[]>();
      for (const row of blendSpeciesRows) {
        const existing = blendSpeciesMap.get(row.feedBlendId) ?? [];
        existing.push(row.species);
        blendSpeciesMap.set(row.feedBlendId, existing);
      }

      return reply.send({
        purchase: purchaseRows[0],
        items: itemRows.map((row) => {
          const eligibleSpecies =
            row.entityType === "COMPONENT"
              ? row.feedComponentId
                ? componentSpeciesMap.get(row.feedComponentId) ?? []
                : []
              : row.feedBlendId
                ? blendSpeciesMap.get(row.feedBlendId) ?? []
                : [];

          return {
            id: row.id,
            entityType: row.entityType,
            entityId: row.entityType === "COMPONENT" ? row.feedComponentId : row.feedBlendId,
            displayName: row.entityType === "COMPONENT" ? row.componentName : row.blendName,
            feedComponentId: row.feedComponentId,
            feedBlendId: row.feedBlendId,
            blendVersionId: row.blendVersionId,
            unitType: row.unitType ?? inferUnitTypeFromUnit(row.unit),
            quantity: row.quantity,
            unit: row.unit,
            packageWeight: row.packageWeight,
            packageWeightUnit: row.packageWeightUnit,
            normalizedQuantity: row.normalizedQuantity,
            normalizedUnit: row.normalizedUnit,
            unitPrice: row.unitPrice,
            lineTotal: row.lineTotal,
            notes: row.notes,
            eligibleSpecies,
            eligibleSpeciesIsAll: eligibleSpecies.length === 0,
          };
        }),
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to load feed purchase detail", "Failed to load feed purchase detail");
    }
  });

  app.get("/feed/purchases/:purchaseId/photos", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { purchaseId } = PurchaseParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const exists = await db
        .select({ id: feedPurchases.id })
        .from(feedPurchases)
        .where(and(eq(feedPurchases.id, purchaseId), eq(feedPurchases.ranchId, ranchId)))
        .limit(1);

      if (!exists.length) return reply.status(404).send({ error: "Feed purchase not found" });

      const photos = await db
        .select({
          id: feedPhotos.id,
          filePath: feedPhotos.filePath,
          storageUrl: feedPhotos.storageUrl,
          originalFilename: feedPhotos.originalFilename,
          mimeType: feedPhotos.mimeType,
          fileSize: feedPhotos.fileSize,
          uploadedAt: feedPhotos.uploadedAt,
          metadataJson: feedPhotos.metadataJson,
        })
        .from(feedPhotos)
        .where(and(eq(feedPhotos.ranchId, ranchId), eq(feedPhotos.entityType, "PURCHASE"), eq(feedPhotos.entityId, purchaseId)))
        .orderBy(desc(feedPhotos.uploadedAt));

      return reply.send({
        photos: photos.map((row) => ({
          id: row.id,
          purpose: parsePhotoPurpose(row.metadataJson),
          filePath: row.filePath,
          storageUrl: row.storageUrl,
          url:
            row.storageUrl ??
            (row.filePath && row.filePath.trim().length > 0 ? `/images/${row.filePath}` : null),
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
        "Failed to list feed purchase photos",
        "Failed to list feed purchase photos"
      );
    }
  });

  app.post("/feed/purchases", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const body = normalizeBody(rawBody);
      const parsed = FeedPurchaseCreateBodySchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid feed purchase payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const now = new Date();
      const purchaseDate = data.purchaseDate ?? todayIsoDate();
      const purchaseId = crypto.randomUUID();

      type ResolvedItem = {
        entityType: "COMPONENT" | "BLEND";
        feedComponentId: string | null;
        feedBlendId: string | null;
        blendVersionId: string | null;
        unitType: FeedUnitType | null;
        quantity: string;
        unit: string;
        packageWeight: string | null;
        packageWeightUnit: string | null;
        normalizedQuantity: string | null;
        normalizedUnit: string | null;
        unitPrice: string | null;
        lineTotal: string | null;
        notes: string | null;
      };

      const resolvedItems: ResolvedItem[] = [];

      await db.transaction(async (tx) => {
        for (const item of data.items) {
          if (item.entityType === "COMPONENT") {
            const componentRows = await tx
              .select({
                id: feedComponents.id,
                unitType: feedComponents.unitType,
                defaultUnit: feedComponents.defaultUnit,
                defaultPackageWeight: feedComponents.defaultPackageWeight,
                defaultPackageUnit: feedComponents.defaultPackageUnit,
              })
              .from(feedComponents)
              .where(
                and(eq(feedComponents.ranchId, ranchId), eq(feedComponents.id, item.feedComponentId!))
              )
              .limit(1);

            if (!componentRows.length) {
              throw appError(404, "Selected feed component was not found for this ranch.");
            }

            const component = componentRows[0];
            const resolvedUnit = item.unit?.trim() ? item.unit.trim() : component.defaultUnit ?? "lb";
            const resolvedUnitType =
              normalizeFeedUnitType(item.unitType) ??
              normalizeFeedUnitType(component.unitType) ??
              inferUnitTypeFromUnit(resolvedUnit);
            const resolvedPackageWeight =
              toNullableDecimalString(item.packageWeight, {
                fieldLabel: "packageWeight",
              }) ?? component.defaultPackageWeight ?? null;
            const resolvedPackageWeightUnit =
              resolvedPackageWeight && item.packageWeightUnit && item.packageWeightUnit.trim().length > 0
                ? item.packageWeightUnit.trim()
                : resolvedPackageWeight
                  ? component.defaultPackageUnit ?? "lb"
                  : null;

            let resolvedNormalizedQuantity = toNullableDecimalString(item.normalizedQuantity, {
              fieldLabel: "normalizedQuantity",
            });
            let resolvedNormalizedUnit =
              resolvedNormalizedQuantity && item.normalizedUnit && item.normalizedUnit.trim().length > 0
                ? item.normalizedUnit.trim()
                : resolvedNormalizedQuantity
                  ? "lb"
                  : null;

            if (!resolvedNormalizedQuantity) {
              const quantityNumber = Number(item.quantity);
              if (resolvedUnitType === "WEIGHT") {
                const normalizedLb = convertWeightToLb(quantityNumber, resolvedUnit);
                if (normalizedLb !== null) {
                  resolvedNormalizedQuantity = String(normalizedLb);
                  resolvedNormalizedUnit = "lb";
                }
              } else if (resolvedUnitType === "COUNT" && resolvedPackageWeight && resolvedPackageWeightUnit) {
                const packageWeightNumber = Number(resolvedPackageWeight);
                const totalWeight = quantityNumber * packageWeightNumber;
                const normalizedLb = convertWeightToLb(totalWeight, resolvedPackageWeightUnit);
                if (normalizedLb !== null) {
                  resolvedNormalizedQuantity = String(normalizedLb);
                  resolvedNormalizedUnit = "lb";
                }
              }
            }

            resolvedItems.push({
              entityType: "COMPONENT",
              feedComponentId: item.feedComponentId!,
              feedBlendId: null,
              blendVersionId: null,
              unitType: resolvedUnitType,
              quantity: item.quantity,
              unit: resolvedUnit,
              packageWeight: resolvedPackageWeight,
              packageWeightUnit: resolvedPackageWeightUnit,
              normalizedQuantity: resolvedNormalizedQuantity,
              normalizedUnit: resolvedNormalizedUnit,
              unitPrice: toNullableDecimalString(item.unitPrice, {
                allowZero: true,
                fieldLabel: "unitPrice",
              }),
              lineTotal: toNullableDecimalString(item.lineTotal, {
                allowZero: true,
                fieldLabel: "lineTotal",
              }),
              notes: item.notes?.trim() ? item.notes.trim() : null,
            });
            continue;
          }

          const blendRows = await tx
            .select({
              id: feedBlends.id,
              currentVersionId: feedBlends.currentVersionId,
              unitType: feedBlends.unitType,
              defaultUnit: feedBlends.defaultUnit,
              defaultPackageWeight: feedBlends.defaultPackageWeight,
              defaultPackageUnit: feedBlends.defaultPackageUnit,
            })
            .from(feedBlends)
            .where(and(eq(feedBlends.ranchId, ranchId), eq(feedBlends.id, item.feedBlendId!)))
            .limit(1);

          if (!blendRows.length) {
            throw appError(404, "Selected feed blend was not found for this ranch.");
          }

          const blendRow = blendRows[0];
          let resolvedBlendVersionId = item.blendVersionId ?? blendRow.currentVersionId;

          if (!resolvedBlendVersionId) {
            const currentVersionRows = await tx
              .select({ id: feedBlendVersions.id })
              .from(feedBlendVersions)
              .where(
                and(
                  eq(feedBlendVersions.ranchId, ranchId),
                  eq(feedBlendVersions.feedBlendId, blendRow.id),
                  eq(feedBlendVersions.isCurrent, true)
                )
              )
              .orderBy(desc(feedBlendVersions.versionNumber))
              .limit(1);
            resolvedBlendVersionId = currentVersionRows[0]?.id ?? null;
          }

          if (!resolvedBlendVersionId) {
            throw appError(400, "Selected blend does not have a current version.");
          }

          const versionRows = await tx
            .select({ id: feedBlendVersions.id })
            .from(feedBlendVersions)
            .where(
              and(
                eq(feedBlendVersions.ranchId, ranchId),
                eq(feedBlendVersions.id, resolvedBlendVersionId),
                eq(feedBlendVersions.feedBlendId, blendRow.id)
              )
            )
            .limit(1);

          if (!versionRows.length) {
            throw appError(400, "Selected blend version does not belong to the selected blend.");
          }

          const resolvedUnit = item.unit?.trim() ? item.unit.trim() : blendRow.defaultUnit ?? "lb";
          const resolvedUnitType =
            normalizeFeedUnitType(item.unitType) ??
            normalizeFeedUnitType(blendRow.unitType) ??
            inferUnitTypeFromUnit(resolvedUnit);
          const resolvedPackageWeight =
            toNullableDecimalString(item.packageWeight, {
              fieldLabel: "packageWeight",
            }) ?? blendRow.defaultPackageWeight ?? null;
          const resolvedPackageWeightUnit =
            resolvedPackageWeight && item.packageWeightUnit && item.packageWeightUnit.trim().length > 0
              ? item.packageWeightUnit.trim()
              : resolvedPackageWeight
                ? blendRow.defaultPackageUnit ?? "lb"
                : null;

          let resolvedNormalizedQuantity = toNullableDecimalString(item.normalizedQuantity, {
            fieldLabel: "normalizedQuantity",
          });
          let resolvedNormalizedUnit =
            resolvedNormalizedQuantity && item.normalizedUnit && item.normalizedUnit.trim().length > 0
              ? item.normalizedUnit.trim()
              : resolvedNormalizedQuantity
                ? "lb"
                : null;

          if (!resolvedNormalizedQuantity) {
            const quantityNumber = Number(item.quantity);
            if (resolvedUnitType === "WEIGHT") {
              const normalizedLb = convertWeightToLb(quantityNumber, resolvedUnit);
              if (normalizedLb !== null) {
                resolvedNormalizedQuantity = String(normalizedLb);
                resolvedNormalizedUnit = "lb";
              }
            } else if (resolvedUnitType === "COUNT" && resolvedPackageWeight && resolvedPackageWeightUnit) {
              const packageWeightNumber = Number(resolvedPackageWeight);
              const totalWeight = quantityNumber * packageWeightNumber;
              const normalizedLb = convertWeightToLb(totalWeight, resolvedPackageWeightUnit);
              if (normalizedLb !== null) {
                resolvedNormalizedQuantity = String(normalizedLb);
                resolvedNormalizedUnit = "lb";
              }
            }
          }

          resolvedItems.push({
            entityType: "BLEND",
            feedComponentId: null,
            feedBlendId: blendRow.id,
            blendVersionId: resolvedBlendVersionId,
            unitType: resolvedUnitType,
            quantity: item.quantity,
            unit: resolvedUnit,
            packageWeight: resolvedPackageWeight,
            packageWeightUnit: resolvedPackageWeightUnit,
            normalizedQuantity: resolvedNormalizedQuantity,
            normalizedUnit: resolvedNormalizedUnit,
            unitPrice: toNullableDecimalString(item.unitPrice, {
              allowZero: true,
              fieldLabel: "unitPrice",
            }),
            lineTotal: toNullableDecimalString(item.lineTotal, {
              allowZero: true,
              fieldLabel: "lineTotal",
            }),
            notes: item.notes?.trim() ? item.notes.trim() : null,
          });
        }

        await tx.insert(feedPurchases).values({
          id: purchaseId,
          ranchId,
          purchaseDate,
          supplierName: data.supplierName?.trim() ? data.supplierName.trim() : null,
          notes: data.notes?.trim() ? data.notes.trim() : null,
          createdAt: now,
        });

        for (const item of resolvedItems) {
          await tx.insert(feedPurchaseItems).values({
            id: crypto.randomUUID(),
            ranchId,
            feedPurchaseId: purchaseId,
            entityType: item.entityType,
            feedComponentId: item.feedComponentId,
            feedBlendId: item.feedBlendId,
            blendVersionId: item.blendVersionId,
            unitType: item.unitType,
            quantity: item.quantity,
            unit: item.unit,
            packageWeight: item.packageWeight,
            packageWeightUnit: item.packageWeightUnit,
            normalizedQuantity: item.normalizedQuantity,
            normalizedUnit: item.normalizedUnit,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            notes: item.notes,
            createdAt: now,
          });

          if (item.entityType === "COMPONENT") {
            const existing = await tx
              .select({
                id: feedInventoryBalances.id,
                normalizedOnHandQuantity: feedInventoryBalances.normalizedOnHandQuantity,
                normalizedUnit: feedInventoryBalances.normalizedUnit,
              })
              .from(feedInventoryBalances)
              .where(
                and(
                  eq(feedInventoryBalances.ranchId, ranchId),
                  eq(feedInventoryBalances.entityType, "COMPONENT"),
                  eq(feedInventoryBalances.feedComponentId, item.feedComponentId!)
                )
              )
              .limit(1);

            if (existing.length > 0) {
              const updateSet: Record<string, any> = {
                quantityOnHand: sql`${feedInventoryBalances.quantityOnHand} + ${item.quantity}`,
                updatedAt: now,
              };

              if (item.normalizedQuantity && item.normalizedUnit) {
                const existingNormalizedUnit = existing[0].normalizedUnit;
                if (existingNormalizedUnit && existingNormalizedUnit !== item.normalizedUnit) {
                  const converted = convertWeightBetween(
                    Number(item.normalizedQuantity),
                    item.normalizedUnit,
                    existingNormalizedUnit
                  );
                  if (converted === null) {
                    throw appError(
                      400,
                      `Cannot mix normalized units (${existingNormalizedUnit} and ${item.normalizedUnit}) for component inventory.`
                    );
                  }
                  updateSet.normalizedOnHandQuantity =
                    sql`COALESCE(${feedInventoryBalances.normalizedOnHandQuantity}, 0) + ${String(converted)}`;
                } else {
                  updateSet.normalizedUnit = existingNormalizedUnit ?? item.normalizedUnit;
                  updateSet.normalizedOnHandQuantity =
                    sql`COALESCE(${feedInventoryBalances.normalizedOnHandQuantity}, 0) + ${item.normalizedQuantity}`;
                }
              }

              await tx
                .update(feedInventoryBalances)
                .set(updateSet)
                .where(eq(feedInventoryBalances.id, existing[0].id));
            } else {
              await tx.insert(feedInventoryBalances).values({
                id: crypto.randomUUID(),
                ranchId,
                entityType: "COMPONENT",
                feedComponentId: item.feedComponentId!,
                feedBlendId: null,
                quantityOnHand: item.quantity,
                normalizedOnHandQuantity: item.normalizedQuantity,
                normalizedUnit: item.normalizedUnit,
                createdAt: now,
                updatedAt: now,
              });
            }
          } else {
            const existing = await tx
              .select({
                id: feedInventoryBalances.id,
                normalizedOnHandQuantity: feedInventoryBalances.normalizedOnHandQuantity,
                normalizedUnit: feedInventoryBalances.normalizedUnit,
              })
              .from(feedInventoryBalances)
              .where(
                and(
                  eq(feedInventoryBalances.ranchId, ranchId),
                  eq(feedInventoryBalances.entityType, "BLEND"),
                  eq(feedInventoryBalances.feedBlendId, item.feedBlendId!)
                )
              )
              .limit(1);

            if (existing.length > 0) {
              const updateSet: Record<string, any> = {
                quantityOnHand: sql`${feedInventoryBalances.quantityOnHand} + ${item.quantity}`,
                updatedAt: now,
              };

              if (item.normalizedQuantity && item.normalizedUnit) {
                const existingNormalizedUnit = existing[0].normalizedUnit;
                if (existingNormalizedUnit && existingNormalizedUnit !== item.normalizedUnit) {
                  const converted = convertWeightBetween(
                    Number(item.normalizedQuantity),
                    item.normalizedUnit,
                    existingNormalizedUnit
                  );
                  if (converted === null) {
                    throw appError(
                      400,
                      `Cannot mix normalized units (${existingNormalizedUnit} and ${item.normalizedUnit}) for blend inventory.`
                    );
                  }
                  updateSet.normalizedOnHandQuantity =
                    sql`COALESCE(${feedInventoryBalances.normalizedOnHandQuantity}, 0) + ${String(converted)}`;
                } else {
                  updateSet.normalizedUnit = existingNormalizedUnit ?? item.normalizedUnit;
                  updateSet.normalizedOnHandQuantity =
                    sql`COALESCE(${feedInventoryBalances.normalizedOnHandQuantity}, 0) + ${item.normalizedQuantity}`;
                }
              }

              await tx
                .update(feedInventoryBalances)
                .set(updateSet)
                .where(eq(feedInventoryBalances.id, existing[0].id));
            } else {
              await tx.insert(feedInventoryBalances).values({
                id: crypto.randomUUID(),
                ranchId,
                entityType: "BLEND",
                feedComponentId: null,
                feedBlendId: item.feedBlendId!,
                quantityOnHand: item.quantity,
                normalizedOnHandQuantity: item.normalizedQuantity,
                normalizedUnit: item.normalizedUnit,
                createdAt: now,
                updatedAt: now,
              });
            }
          }
        }
      });

      await saveFeedPhotos({
        ranchId,
        entityType: "PURCHASE",
        entityId: purchaseId,
        files,
      });

      return reply.status(201).send({
        purchase: {
          id: purchaseId,
          purchaseDate,
          supplierName: data.supplierName?.trim() ? data.supplierName.trim() : null,
        },
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to create feed purchase", "Failed to create feed purchase");
    }
  });

  app.put("/feed/purchases/:purchaseId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      PurchaseParamSchema.parse(req.params ?? {});
      return reply.status(409).send({
        error: "Feed purchases are append-only for now. Editing is not supported yet.",
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to process purchase update", "Failed to process purchase update");
    }
  });

  app.delete("/feed/purchases/:purchaseId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      PurchaseParamSchema.parse(req.params ?? {});
      return reply.status(409).send({
        error: "Feed purchases are append-only for now. Deletion is not supported yet.",
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to process purchase deletion", "Failed to process purchase deletion");
    }
  });

  app.get("/feed/inventory", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const rows = await db
        .select({
          id: feedInventoryBalances.id,
          entityType: feedInventoryBalances.entityType,
          feedComponentId: feedInventoryBalances.feedComponentId,
          feedBlendId: feedInventoryBalances.feedBlendId,
          quantityOnHand: feedInventoryBalances.quantityOnHand,
          normalizedOnHandQuantity: feedInventoryBalances.normalizedOnHandQuantity,
          normalizedUnit: feedInventoryBalances.normalizedUnit,
          updatedAt: feedInventoryBalances.updatedAt,
          componentName: feedComponents.name,
          componentUnitType: feedComponents.unitType,
          componentUnit: feedComponents.defaultUnit,
          blendName: feedBlends.name,
          blendUnitType: feedBlends.unitType,
          blendUnit: feedBlends.defaultUnit,
        })
        .from(feedInventoryBalances)
        .leftJoin(
          feedComponents,
          and(eq(feedComponents.id, feedInventoryBalances.feedComponentId), eq(feedComponents.ranchId, ranchId))
        )
        .leftJoin(feedBlends, and(eq(feedBlends.id, feedInventoryBalances.feedBlendId), eq(feedBlends.ranchId, ranchId)))
        .where(eq(feedInventoryBalances.ranchId, ranchId))
        .orderBy(feedInventoryBalances.entityType, feedComponents.name, feedBlends.name);

      return reply.send({
        inventory: rows.map((row) => ({
          id: row.id,
          entityType: row.entityType,
          entityId: row.entityType === "COMPONENT" ? row.feedComponentId : row.feedBlendId,
          displayName: row.entityType === "COMPONENT" ? row.componentName : row.blendName,
          unitType:
            row.entityType === "COMPONENT"
              ? row.componentUnitType ?? inferUnitTypeFromUnit(row.componentUnit)
              : row.blendUnitType ?? inferUnitTypeFromUnit(row.blendUnit),
          quantityOnHand: row.quantityOnHand,
          unit: row.entityType === "COMPONENT" ? (row.componentUnit ?? "lb") : (row.blendUnit ?? "lb"),
          normalizedOnHandQuantity: row.normalizedOnHandQuantity,
          normalizedUnit: row.normalizedUnit,
          updatedAt: row.updatedAt,
        })),
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to load feed inventory", "Failed to load feed inventory");
    }
  });

  app.delete("/feed/photos/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const rows = await db
        .select({
          id: feedPhotos.id,
          filePath: feedPhotos.filePath,
          entityType: feedPhotos.entityType,
          entityId: feedPhotos.entityId,
        })
        .from(feedPhotos)
        .where(and(eq(feedPhotos.id, id), eq(feedPhotos.ranchId, ranchId)))
        .limit(1);

      if (!rows.length) return reply.status(404).send({ error: "Photo not found" });

      const row = rows[0];
      await db.delete(feedPhotos).where(and(eq(feedPhotos.id, id), eq(feedPhotos.ranchId, ranchId)));
      await removePhotoFiles([{ filePath: row.filePath }]);

      return reply.send({
        deleted: {
          id,
          entityType: row.entityType,
          entityId: row.entityId,
        },
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to delete feed photo", "Failed to delete feed photo");
    }
  });
}
