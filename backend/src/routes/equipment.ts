import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import path from "path";
import fs from "fs";

import { ensureRanchStructure, saveUploadedFile } from "../../lib/storage.js";
import { db } from "../db";
import {
  attachments,
  equipmentAssetIdentifiers,
  equipmentAssets,
  equipmentMaintenanceEvents,
  equipmentPartInventoryEvents,
  equipmentParts,
} from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";
import { getActiveRanchIdForUser } from "../lib/activeRanch";
import { config } from "../config";

type EquipmentAssetType =
  | "VEHICLE"
  | "TRACTOR"
  | "ATV_UTV"
  | "TRAILER"
  | "IMPLEMENT"
  | "LIVESTOCK_HANDLING"
  | "POWER_TOOL"
  | "ELECTRONICS"
  | "GENERATOR"
  | "PUMP"
  | "OTHER";

type EquipmentAssetStatus = "ACTIVE" | "DISABLED" | "SOLD" | "RETIRED" | "LOST" | "RENTED" | "LEASED";
type EquipmentAcquisitionType = "PURCHASED" | "LEASED" | "RENTED" | "INHERITED" | "OTHER";
type EquipmentMeterType = "NONE" | "HOURS" | "MILES" | "OTHER";
type EquipmentMaintenanceEventType = "SERVICE" | "REPAIR" | "INSPECTION" | "MODIFICATION" | "WARRANTY" | "OTHER";
type EquipmentPerformedBy = "OWNER" | "EMPLOYEE" | "CONTRACTOR" | "DEALER" | "UNKNOWN";
type EquipmentPartCategory =
  | "FENCING"
  | "HARDWARE"
  | "PLUMBING"
  | "ELECTRICAL"
  | "LIVESTOCK_HANDLING"
  | "IMPLEMENT_PART"
  | "VEHICLE_PART"
  | "OTHER";
type EquipmentPartUnitType = "COUNT" | "LENGTH" | "WEIGHT";
type EquipmentPartEventType = "PURCHASE" | "ADJUSTMENT" | "USE" | "OTHER";
type AttachmentEntityType = "EQUIPMENT_ASSET" | "EQUIPMENT_MAINTENANCE" | "EQUIPMENT_PART" | "EQUIPMENT_PART_EVENT";

type ParsedMultipart = {
  body: Record<string, any>;
  files: any[];
};

type AppError = Error & { statusCode?: number };

const ASSET_TYPES = new Set<EquipmentAssetType>([
  "VEHICLE",
  "TRACTOR",
  "ATV_UTV",
  "TRAILER",
  "IMPLEMENT",
  "LIVESTOCK_HANDLING",
  "POWER_TOOL",
  "ELECTRONICS",
  "GENERATOR",
  "PUMP",
  "OTHER",
]);
const ASSET_STATUSES = new Set<EquipmentAssetStatus>(["ACTIVE", "DISABLED", "SOLD", "RETIRED", "LOST", "RENTED", "LEASED"]);
const ACQUISITION_TYPES = new Set<EquipmentAcquisitionType>(["PURCHASED", "LEASED", "RENTED", "INHERITED", "OTHER"]);
const METER_TYPES = new Set<EquipmentMeterType>(["NONE", "HOURS", "MILES", "OTHER"]);
const MAINTENANCE_EVENT_TYPES = new Set<EquipmentMaintenanceEventType>([
  "SERVICE",
  "REPAIR",
  "INSPECTION",
  "MODIFICATION",
  "WARRANTY",
  "OTHER",
]);
const PERFORMED_BY_TYPES = new Set<EquipmentPerformedBy>(["OWNER", "EMPLOYEE", "CONTRACTOR", "DEALER", "UNKNOWN"]);
const PART_CATEGORIES = new Set<EquipmentPartCategory>([
  "FENCING",
  "HARDWARE",
  "PLUMBING",
  "ELECTRICAL",
  "LIVESTOCK_HANDLING",
  "IMPLEMENT_PART",
  "VEHICLE_PART",
  "OTHER",
]);
const PART_UNIT_TYPES = new Set<EquipmentPartUnitType>(["COUNT", "LENGTH", "WEIGHT"]);
const PART_EVENT_TYPES = new Set<EquipmentPartEventType>(["PURCHASE", "ADJUSTMENT", "USE", "OTHER"]);
const IDENTIFIER_TYPES = new Set(["VIN", "PIN", "SERIAL", "ENGINE_SERIAL", "LICENSE_PLATE", "TAG", "OTHER"]);
const ATTACHMENT_ENTITY_TYPES = new Set<AttachmentEntityType>([
  "EQUIPMENT_ASSET",
  "EQUIPMENT_MAINTENANCE",
  "EQUIPMENT_PART",
  "EQUIPMENT_PART_EVENT",
]);
const MAINTENANCE_DEFAULT_TYPES = new Set<EquipmentAssetType>([
  "VEHICLE",
  "TRACTOR",
  "ATV_UTV",
  "POWER_TOOL",
  "ELECTRONICS",
  "GENERATOR",
]);

function appError(statusCode: number, message: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
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

function normalizeEnum<T extends string>(value: unknown, allowed: Set<T>): T | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase() as T;
  if (!allowed.has(normalized)) return null;
  return normalized;
}

function parseIsoDateOrNull(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s.length) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw appError(400, `${field} must be YYYY-MM-DD.`);
  }
  return s;
}

function toNullableDecimalString(
  value: unknown,
  opts?: { allowZero?: boolean; allowNegative?: boolean; fieldLabel?: string }
): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s.length) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw appError(400, `${opts?.fieldLabel ?? "Value"} must be numeric.`);
  if (opts?.allowNegative !== true && n < 0) throw appError(400, `${opts?.fieldLabel ?? "Value"} cannot be negative.`);
  if (opts?.allowZero !== true && n === 0) throw appError(400, `${opts?.fieldLabel ?? "Value"} must be greater than 0.`);
  return s;
}

function toNullableInteger(
  value: unknown,
  opts?: { allowZero?: boolean; allowNegative?: boolean; fieldLabel?: string }
): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s.length) return null;
  const n = Number(s);
  if (!Number.isInteger(n)) throw appError(400, `${opts?.fieldLabel ?? "Value"} must be an integer.`);
  if (opts?.allowNegative !== true && n < 0) throw appError(400, `${opts?.fieldLabel ?? "Value"} cannot be negative.`);
  if (opts?.allowZero !== true && n === 0) throw appError(400, `${opts?.fieldLabel ?? "Value"} must be greater than 0.`);
  return n;
}

function toBooleanLike(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return fallback;
}

function toBooleanOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized.length) return null;
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  throw appError(400, "Boolean filter value must be true or false.");
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
  for (const key of ["identifiers", "removeAttachmentIds", "usedForAssetTypes"]) {
    if (typeof out[key] === "string") {
      try {
        out[key] = JSON.parse(out[key]);
      } catch {
        // Leave as-is for schema errors.
      }
    }
  }
  return out;
}

function normalizeUsedForValues(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") throw appError(400, "usedForAssetTypes values must be strings.");
    const next = value.trim();
    if (!next.length) continue;
    if (next.length > 120) throw appError(400, "usedForAssetTypes values must be 120 characters or fewer.");
    normalized.push(next);
  }
  return Array.from(new Set(normalized));
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

async function resolveRanchId(userId: string, requestedRanchId?: string | null): Promise<string | null> {
  const activeRanchId = await getActiveRanchIdForUser(userId);
  if (!activeRanchId) return null;
  if (requestedRanchId && requestedRanchId !== activeRanchId) {
    throw appError(403, "Requested ranchId does not match your active ranch.");
  }
  return activeRanchId;
}

function shouldTrackMaintenanceByDefault(assetType: EquipmentAssetType): boolean {
  return MAINTENANCE_DEFAULT_TYPES.has(assetType);
}

function attachmentEntityFolder(entityType: AttachmentEntityType): string {
  if (entityType === "EQUIPMENT_ASSET") return "assets";
  if (entityType === "EQUIPMENT_MAINTENANCE") return "maintenance";
  if (entityType === "EQUIPMENT_PART") return "parts";
  return "part-events";
}

function attachmentPurposeFromFieldName(fieldName: string): string {
  const normalized = fieldName.trim().toLowerCase();
  if (!normalized.length) return "file";
  if (normalized.includes("manual")) return "manual";
  if (normalized.includes("warranty")) return "warranty";
  if (normalized.includes("receipt")) return "receipt";
  if (normalized.includes("serial")) return "serial-plate";
  if (normalized.includes("photo") || normalized.includes("image")) return "photo";
  return normalized.replace(/[^a-z0-9_-]/g, "") || "file";
}

function buildRelativeAttachmentPath(
  ranchId: string,
  entityType: AttachmentEntityType,
  entityId: string,
  purpose: string,
  storedFilename: string
): string {
  return `ranches/${ranchId}/equipment/attachments/${attachmentEntityFolder(entityType)}/${entityId}/${purpose}/${storedFilename}`;
}

function parseAttachmentPurpose(metadataJson: unknown): string {
  if (!metadataJson || typeof metadataJson !== "object") return "file";
  const purpose = (metadataJson as { purpose?: unknown }).purpose;
  if (typeof purpose !== "string" || !purpose.trim().length) return "file";
  return purpose.trim();
}

function toAttachmentResponse(row: any) {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    purpose: parseAttachmentPurpose(row.metadataJson),
    filePath: row.filePath,
    storageUrl: row.storageUrl,
    url: row.storageUrl ?? (row.filePath && row.filePath.trim().length > 0 ? `/images/${row.filePath}` : null),
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    metadataJson: row.metadataJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listEntityAttachments(ranchId: string, entityType: AttachmentEntityType, entityId: string) {
  const rows = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.ranchId, ranchId), eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)))
    .orderBy(desc(attachments.createdAt));
  return rows.map(toAttachmentResponse);
}

async function listEntityAttachmentsByIds(ranchId: string, entityType: AttachmentEntityType, entityIds: string[]) {
  if (!entityIds.length) return {} as Record<string, ReturnType<typeof toAttachmentResponse>[]>;

  const rows = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.ranchId, ranchId), eq(attachments.entityType, entityType), inArray(attachments.entityId, entityIds)))
    .orderBy(desc(attachments.createdAt));

  const grouped: Record<string, ReturnType<typeof toAttachmentResponse>[]> = {};
  for (const row of rows) {
    const key = row.entityId;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(toAttachmentResponse(row));
  }
  return grouped;
}

async function removeAttachmentFiles(rows: Array<{ filePath: string | null }>) {
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

async function saveEntityAttachments(params: {
  ranchId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  files: any[];
}) {
  const { ranchId, entityType, entityId, files } = params;
  if (!files.length) return [] as string[];

  const ranchRoot = await ensureRanchStructure(ranchId);
  const folder = attachmentEntityFolder(entityType);
  const insertedIds: string[] = [];

  for (const file of files) {
    const purpose = attachmentPurposeFromFieldName(String(file.fieldname ?? ""));
    const destDir = path.join(ranchRoot, "equipment", "attachments", folder, entityId, purpose);
    ensureDir(destDir);

    const saved = await saveUploadedFile(file, destDir);
    const relativePath = buildRelativeAttachmentPath(ranchId, entityType, entityId, purpose, saved.filename);
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(attachments).values({
      id,
      ranchId,
      entityType,
      entityId,
      filePath: relativePath,
      storageUrl: `/images/${relativePath}`,
      originalFilename: file.filename ?? null,
      mimeType: file.mimetype ?? null,
      fileSize: typeof file.size === "number" ? file.size : null,
      metadataJson: { purpose, fieldName: String(file.fieldname ?? "") },
      createdAt: now,
      updatedAt: now,
    });

    insertedIds.push(id);
  }

  return insertedIds;
}

async function removeEntityAttachmentsByIds(params: {
  ranchId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  attachmentIds: string[];
}) {
  const { ranchId, entityType, entityId, attachmentIds } = params;
  if (!attachmentIds.length) return;

  const rows = await db
    .select({ id: attachments.id, filePath: attachments.filePath })
    .from(attachments)
    .where(
      and(
        eq(attachments.ranchId, ranchId),
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId),
        inArray(attachments.id, attachmentIds)
      )
    );

  if (!rows.length) return;

  await db
    .delete(attachments)
    .where(
      and(
        eq(attachments.ranchId, ranchId),
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId),
        inArray(attachments.id, rows.map((r) => r.id))
      )
    );

  await removeAttachmentFiles(rows);
}

async function ensureAttachmentEntityExists(ranchId: string, entityType: AttachmentEntityType, entityId: string) {
  if (entityType === "EQUIPMENT_ASSET") {
    const rows = await db
      .select({ id: equipmentAssets.id })
      .from(equipmentAssets)
      .where(and(eq(equipmentAssets.ranchId, ranchId), eq(equipmentAssets.id, entityId)))
      .limit(1);
    if (!rows.length) throw appError(404, "Equipment asset not found.");
    return;
  }

  if (entityType === "EQUIPMENT_MAINTENANCE") {
    const rows = await db
      .select({ id: equipmentMaintenanceEvents.id })
      .from(equipmentMaintenanceEvents)
      .where(and(eq(equipmentMaintenanceEvents.ranchId, ranchId), eq(equipmentMaintenanceEvents.id, entityId)))
      .limit(1);
    if (!rows.length) throw appError(404, "Maintenance event not found.");
    return;
  }

  if (entityType === "EQUIPMENT_PART") {
    const rows = await db
      .select({ id: equipmentParts.id })
      .from(equipmentParts)
      .where(and(eq(equipmentParts.ranchId, ranchId), eq(equipmentParts.id, entityId)))
      .limit(1);
    if (!rows.length) throw appError(404, "Equipment part not found.");
    return;
  }

  const rows = await db
    .select({ id: equipmentPartInventoryEvents.id })
    .from(equipmentPartInventoryEvents)
    .where(and(eq(equipmentPartInventoryEvents.ranchId, ranchId), eq(equipmentPartInventoryEvents.id, entityId)))
    .limit(1);
  if (!rows.length) throw appError(404, "Equipment part event not found.");
}

async function getAssetDetail(ranchId: string, assetId: string) {
  const assetRows = await db
    .select()
    .from(equipmentAssets)
    .where(and(eq(equipmentAssets.ranchId, ranchId), eq(equipmentAssets.id, assetId)))
    .limit(1);
  if (!assetRows.length) throw appError(404, "Equipment asset not found.");

  const [identifierRows, attachmentRows, countRows, lastRows, nextRows] = await Promise.all([
    db.select().from(equipmentAssetIdentifiers).where(eq(equipmentAssetIdentifiers.assetId, assetId)).orderBy(asc(equipmentAssetIdentifiers.identifierType)),
    listEntityAttachments(ranchId, "EQUIPMENT_ASSET", assetId),
    db
      .select({ count: sql<string>`count(*)` })
      .from(equipmentMaintenanceEvents)
      .where(and(eq(equipmentMaintenanceEvents.ranchId, ranchId), eq(equipmentMaintenanceEvents.assetId, assetId))),
    db
      .select({ eventDate: equipmentMaintenanceEvents.eventDate })
      .from(equipmentMaintenanceEvents)
      .where(and(eq(equipmentMaintenanceEvents.ranchId, ranchId), eq(equipmentMaintenanceEvents.assetId, assetId)))
      .orderBy(desc(equipmentMaintenanceEvents.eventDate), desc(equipmentMaintenanceEvents.createdAt))
      .limit(1),
    db
      .select({ nextDueDate: equipmentMaintenanceEvents.nextDueDate, nextDueMeter: equipmentMaintenanceEvents.nextDueMeter })
      .from(equipmentMaintenanceEvents)
      .where(
        and(
          eq(equipmentMaintenanceEvents.ranchId, ranchId),
          eq(equipmentMaintenanceEvents.assetId, assetId),
          sql`${equipmentMaintenanceEvents.nextDueDate} IS NOT NULL`
        )
      )
      .orderBy(asc(equipmentMaintenanceEvents.nextDueDate), desc(equipmentMaintenanceEvents.createdAt))
      .limit(1),
  ]);

  return {
    asset: assetRows[0],
    identifiers: identifierRows,
    attachments: attachmentRows,
    maintenanceSummary: {
      eventCount: Number(countRows[0]?.count ?? 0),
      lastEventDate: lastRows[0]?.eventDate ?? null,
      nextDueDate: nextRows[0]?.nextDueDate ?? null,
      nextDueMeter: nextRows[0]?.nextDueMeter ?? null,
    },
  };
}

const RanchScopedQuerySchema = z.object({ ranchId: z.string().uuid().optional().nullable() });
const UuidParamSchema = z.object({ id: z.string().uuid() });
const QueryPageSchema = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return 1;
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) throw appError(400, "page must be a positive integer.");
    return n;
  });
const QueryLimitSchema = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return 50;
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) throw appError(400, "limit must be a positive integer.");
    return Math.min(200, n);
  });

const EquipmentAssetListQuerySchema = RanchScopedQuerySchema.extend({
  type: z.string().optional().nullable(),
  assetType: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  acquisitionType: z.string().optional().nullable(),
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
  yearFrom: z.union([z.string(), z.number()]).optional().nullable(),
  yearTo: z.union([z.string(), z.number()]).optional().nullable(),
  trackMaintenance: z.union([z.string(), z.boolean()]).optional().nullable(),
  make: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  search: z.string().optional().nullable(),
  sort: z.string().optional().nullable(),
  page: QueryPageSchema,
  limit: QueryLimitSchema,
});

const IdentifierInputSchema = z.object({
  identifierType: z.string().min(1),
  identifierValue: z.string().min(1),
  notes: z.string().optional().nullable(),
});

const EquipmentAssetCreateBodySchema = z.object({
  name: z.string().min(1),
  assetType: z.string().optional().nullable(),
  make: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  modelYear: z.union([z.string(), z.number()]).optional().nullable(),
  status: z.string().optional().nullable(),
  acquisitionType: z.string().optional().nullable(),
  acquisitionDate: z.string().optional().nullable(),
  purchasePrice: z.union([z.string(), z.number()]).optional().nullable(),
  currentValueEstimate: z.union([z.string(), z.number()]).optional().nullable(),
  trackMaintenance: z.union([z.boolean(), z.string()]).optional().nullable(),
  meterType: z.string().optional().nullable(),
  defaultMeterUnitLabel: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  identifiers: z.array(IdentifierInputSchema).optional(),
});

const EquipmentAssetUpdateBodySchema = EquipmentAssetCreateBodySchema.partial().extend({
  removeAttachmentIds: z.array(z.string().uuid()).optional(),
});

const EquipmentMaintenanceBodySchema = z.object({
  eventDate: z.string().optional().nullable(),
  eventType: z.string().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  provider: z.string().optional().nullable(),
  performedBy: z.string().optional().nullable(),
  hasInvoice: z.union([z.boolean(), z.string()]).optional().nullable(),
  downtimeHours: z.union([z.string(), z.number()]).optional().nullable(),
  laborCost: z.union([z.string(), z.number()]).optional().nullable(),
  partsCost: z.union([z.string(), z.number()]).optional().nullable(),
  totalCost: z.union([z.string(), z.number()]).optional().nullable(),
  meterReading: z.union([z.string(), z.number()]).optional().nullable(),
  meterType: z.string().optional().nullable(),
  nextDueDate: z.string().optional().nullable(),
  nextDueMeter: z.union([z.string(), z.number()]).optional().nullable(),
});

const EquipmentMaintenanceUpdateBodySchema = EquipmentMaintenanceBodySchema.partial().extend({
  removeAttachmentIds: z.array(z.string().uuid()).optional(),
});

const EquipmentMaintenanceListQuerySchema = RanchScopedQuerySchema.extend({
  type: z.string().optional().nullable(),
  assetType: z.string().optional().nullable(),
  eventType: z.string().optional().nullable(),
  provider: z.string().optional().nullable(),
  search: z.string().optional().nullable(),
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
  diyOnly: z.union([z.boolean(), z.string()]).optional().nullable(),
  sort: z.string().optional().nullable(),
  page: QueryPageSchema,
  limit: QueryLimitSchema,
});

const EquipmentPartsListQuerySchema = RanchScopedQuerySchema.extend({
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
  search: z.string().optional().nullable(),
});

const EquipmentPartBodySchema = z.object({
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  partNumber: z.string().optional().nullable(),
  usedForAssetTypes: z.array(z.string()).optional(),
  unitType: z.string().optional().nullable(),
  defaultUnit: z.string().optional().nullable(),
  onHandQuantity: z.union([z.string(), z.number()]).optional().nullable(),
  reorderThreshold: z.union([z.string(), z.number()]).optional().nullable(),
  reorderTarget: z.union([z.string(), z.number()]).optional().nullable(),
  vendor: z.string().optional().nullable(),
  costPerUnit: z.union([z.string(), z.number()]).optional().nullable(),
  storageLocation: z.string().optional().nullable(),
  isActive: z.union([z.boolean(), z.string()]).optional().nullable(),
});

const EquipmentPartUpdateBodySchema = EquipmentPartBodySchema.partial().extend({
  removeAttachmentIds: z.array(z.string().uuid()).optional(),
});

const EquipmentPartEventBodySchema = z.object({
  eventDate: z.string().optional().nullable(),
  eventType: z.string().optional().nullable(),
  quantityDelta: z.union([z.string(), z.number()]),
  unit: z.string().optional().nullable(),
  unitCost: z.union([z.string(), z.number()]).optional().nullable(),
  vendor: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const AttachmentListQuerySchema = RanchScopedQuerySchema.extend({
  entityType: z.string().optional().nullable(),
  entityId: z.string().uuid().optional().nullable(),
});

const AttachmentCreateBodySchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
});

export async function equipmentRoutes(app: FastifyInstance) {
  app.get("/equipment/assets", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const query = EquipmentAssetListQuerySchema.parse(req.query ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId, query.ranchId ?? null);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      const page = query.page ?? 1;
      const limit = query.limit ?? 50;
      const offset = (page - 1) * limit;

      const whereParts = [eq(equipmentAssets.ranchId, ranchId)] as any[];
      const requestedAssetType = query.assetType?.trim() ? query.assetType : query.type;
      if (requestedAssetType?.trim()) {
        const assetType = normalizeEnum(requestedAssetType, ASSET_TYPES);
        if (!assetType) return reply.status(400).send({ error: "Invalid assetType filter" });
        whereParts.push(eq(equipmentAssets.assetType, assetType));
      }
      if (query.status?.trim()) {
        const status = normalizeEnum(query.status, ASSET_STATUSES);
        if (!status) return reply.status(400).send({ error: "Invalid status filter" });
        whereParts.push(eq(equipmentAssets.status, status));
      }
      if (query.acquisitionType?.trim()) {
        const acquisitionType = normalizeEnum(query.acquisitionType, ACQUISITION_TYPES);
        if (!acquisitionType) return reply.status(400).send({ error: "Invalid acquisitionType filter" });
        whereParts.push(eq(equipmentAssets.acquisitionType, acquisitionType));
      }
      if (query.trackMaintenance !== undefined && query.trackMaintenance !== null && String(query.trackMaintenance).trim().length) {
        const trackMaintenanceFilter = toBooleanOrNull(query.trackMaintenance);
        if (trackMaintenanceFilter !== null) {
          whereParts.push(eq(equipmentAssets.trackMaintenance, trackMaintenanceFilter));
        }
      }
      const dateFrom = parseIsoDateOrNull(query.dateFrom, "dateFrom");
      const dateTo = parseIsoDateOrNull(query.dateTo, "dateTo");
      if (dateFrom) whereParts.push(sql`${equipmentAssets.acquisitionDate} >= ${dateFrom}`);
      if (dateTo) whereParts.push(sql`${equipmentAssets.acquisitionDate} <= ${dateTo}`);
      const yearFrom = toNullableInteger(query.yearFrom, { allowZero: false, fieldLabel: "yearFrom" });
      const yearTo = toNullableInteger(query.yearTo, { allowZero: false, fieldLabel: "yearTo" });
      if (yearFrom !== null) whereParts.push(sql`${equipmentAssets.modelYear} >= ${yearFrom}`);
      if (yearTo !== null) whereParts.push(sql`${equipmentAssets.modelYear} <= ${yearTo}`);
      if (query.make?.trim()) {
        const make = `%${query.make.trim()}%`;
        whereParts.push(sql`COALESCE(${equipmentAssets.make}, '') ILIKE ${make}`);
      }
      if (query.model?.trim()) {
        const model = `%${query.model.trim()}%`;
        whereParts.push(sql`COALESCE(${equipmentAssets.model}, '') ILIKE ${model}`);
      }
      if (query.search?.trim()) {
        const search = `%${query.search.trim()}%`;
        whereParts.push(
          sql`(
            ${equipmentAssets.name} ILIKE ${search}
            OR COALESCE(${equipmentAssets.make}, '') ILIKE ${search}
            OR COALESCE(${equipmentAssets.model}, '') ILIKE ${search}
          )`
        );
      }
      const whereClause = whereParts.length > 1 ? and(...whereParts) : whereParts[0];
      const sort = (query.sort ?? "NAME_ASC").trim().toUpperCase();
      let orderByClauses: any[] = [asc(equipmentAssets.name), asc(equipmentAssets.createdAt)];
      if (sort === "NAME_DESC") orderByClauses = [desc(equipmentAssets.name), desc(equipmentAssets.createdAt)];
      else if (sort === "ACQUIRED_DATE_ASC") orderByClauses = [asc(equipmentAssets.acquisitionDate), asc(equipmentAssets.name)];
      else if (sort === "ACQUIRED_DATE_DESC") orderByClauses = [desc(equipmentAssets.acquisitionDate), asc(equipmentAssets.name)];
      else if (sort === "UPDATED_DESC") orderByClauses = [desc(equipmentAssets.updatedAt), asc(equipmentAssets.name)];
      else if (sort === "CREATED_DESC") orderByClauses = [desc(equipmentAssets.createdAt), asc(equipmentAssets.name)];

      const [rows, countRows] = await Promise.all([
        db.select().from(equipmentAssets).where(whereClause).orderBy(...orderByClauses).limit(limit).offset(offset),
        db.select({ count: sql<string>`count(*)` }).from(equipmentAssets).where(whereClause),
      ]);
      const total = Number(countRows[0]?.count ?? 0);
      const assetIds = rows.map((row) => row.id);

      const lastEventByAssetId: Record<string, string | null> = {};
      const nextDueByAssetId: Record<string, { nextDueDate: string | null; nextDueMeter: string | null }> = {};
      const maintenanceCountByAssetId: Record<string, number> = {};
      const attachmentCountByAssetId: Record<string, number> = {};

      if (assetIds.length > 0) {
        const [lastRows, nextDueRows, maintenanceCountRows, attachmentCountRows] = await Promise.all([
          db
            .select({ assetId: equipmentMaintenanceEvents.assetId, lastEventDate: sql<string>`max(${equipmentMaintenanceEvents.eventDate})` })
            .from(equipmentMaintenanceEvents)
            .where(and(eq(equipmentMaintenanceEvents.ranchId, ranchId), inArray(equipmentMaintenanceEvents.assetId, assetIds)))
            .groupBy(equipmentMaintenanceEvents.assetId),
          db
            .select({
              assetId: equipmentMaintenanceEvents.assetId,
              nextDueDate: equipmentMaintenanceEvents.nextDueDate,
              nextDueMeter: equipmentMaintenanceEvents.nextDueMeter,
            })
            .from(equipmentMaintenanceEvents)
            .where(
              and(
                eq(equipmentMaintenanceEvents.ranchId, ranchId),
                inArray(equipmentMaintenanceEvents.assetId, assetIds),
                sql`${equipmentMaintenanceEvents.nextDueDate} IS NOT NULL`
              )
            )
            .orderBy(
              asc(equipmentMaintenanceEvents.assetId),
              asc(equipmentMaintenanceEvents.nextDueDate),
              desc(equipmentMaintenanceEvents.createdAt)
            ),
          db
            .select({ assetId: equipmentMaintenanceEvents.assetId, count: sql<string>`count(*)` })
            .from(equipmentMaintenanceEvents)
            .where(and(eq(equipmentMaintenanceEvents.ranchId, ranchId), inArray(equipmentMaintenanceEvents.assetId, assetIds)))
            .groupBy(equipmentMaintenanceEvents.assetId),
          db
            .select({ entityId: attachments.entityId, count: sql<string>`count(*)` })
            .from(attachments)
            .where(and(eq(attachments.ranchId, ranchId), eq(attachments.entityType, "EQUIPMENT_ASSET"), inArray(attachments.entityId, assetIds)))
            .groupBy(attachments.entityId),
        ]);

        for (const row of lastRows) {
          lastEventByAssetId[row.assetId] = row.lastEventDate ?? null;
        }
        for (const row of nextDueRows) {
          if (!nextDueByAssetId[row.assetId]) {
            nextDueByAssetId[row.assetId] = {
              nextDueDate: row.nextDueDate ?? null,
              nextDueMeter: row.nextDueMeter ?? null,
            };
          }
        }
        for (const row of maintenanceCountRows) {
          maintenanceCountByAssetId[row.assetId] = Number(row.count ?? 0);
        }
        for (const row of attachmentCountRows) {
          attachmentCountByAssetId[row.entityId] = Number(row.count ?? 0);
        }
      }

      const assets = rows.map((row) => ({
        ...row,
        lastEventDate: lastEventByAssetId[row.id] ?? null,
        nextDueDate: nextDueByAssetId[row.id]?.nextDueDate ?? null,
        nextDueMeter: nextDueByAssetId[row.id]?.nextDueMeter ?? null,
        maintenanceEventCount: maintenanceCountByAssetId[row.id] ?? 0,
        attachmentCount: attachmentCountByAssetId[row.id] ?? 0,
      }));

      return reply.send({ assets, pagination: { page, limit, total } });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to list equipment assets", "Failed to list equipment assets");
    }
  });

  app.get("/equipment/maintenance", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const query = EquipmentMaintenanceListQuerySchema.parse(req.query ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId, query.ranchId ?? null);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      const page = query.page ?? 1;
      const limit = query.limit ?? 50;
      const offset = (page - 1) * limit;

      const whereParts = [eq(equipmentMaintenanceEvents.ranchId, ranchId), eq(equipmentAssets.ranchId, ranchId)] as any[];
      const requestedAssetType = query.assetType?.trim() ? query.assetType : query.type;
      if (requestedAssetType?.trim()) {
        const assetType = normalizeEnum(requestedAssetType, ASSET_TYPES);
        if (!assetType) return reply.status(400).send({ error: "Invalid assetType filter" });
        whereParts.push(eq(equipmentAssets.assetType, assetType));
      }
      if (query.eventType?.trim()) {
        const eventType = normalizeEnum(query.eventType, MAINTENANCE_EVENT_TYPES);
        if (!eventType) return reply.status(400).send({ error: "Invalid eventType filter" });
        whereParts.push(eq(equipmentMaintenanceEvents.eventType, eventType));
      }
      const dateFrom = parseIsoDateOrNull(query.dateFrom, "dateFrom");
      const dateTo = parseIsoDateOrNull(query.dateTo, "dateTo");
      if (dateFrom) whereParts.push(sql`${equipmentMaintenanceEvents.eventDate} >= ${dateFrom}`);
      if (dateTo) whereParts.push(sql`${equipmentMaintenanceEvents.eventDate} <= ${dateTo}`);
      if (query.provider?.trim()) {
        const provider = `%${query.provider.trim()}%`;
        whereParts.push(sql`COALESCE(${equipmentMaintenanceEvents.provider}, '') ILIKE ${provider}`);
      }
      if (toBooleanOrNull(query.diyOnly)) {
        whereParts.push(
          sql`(
            COALESCE(${equipmentMaintenanceEvents.provider}, '') = ''
            OR ${equipmentMaintenanceEvents.performedBy} IN ('OWNER', 'EMPLOYEE')
          )`
        );
      }
      if (query.search?.trim()) {
        const search = `%${query.search.trim()}%`;
        whereParts.push(
          sql`(
            ${equipmentMaintenanceEvents.title} ILIKE ${search}
            OR COALESCE(${equipmentMaintenanceEvents.description}, '') ILIKE ${search}
            OR COALESCE(${equipmentMaintenanceEvents.provider}, '') ILIKE ${search}
            OR ${equipmentAssets.name} ILIKE ${search}
            OR COALESCE(${equipmentAssets.make}, '') ILIKE ${search}
            OR COALESCE(${equipmentAssets.model}, '') ILIKE ${search}
          )`
        );
      }

      const whereClause = whereParts.length > 1 ? and(...whereParts) : whereParts[0];
      const sort = (query.sort ?? "DATE_DESC").trim().toUpperCase();
      let orderByClauses: any[] = [desc(equipmentMaintenanceEvents.eventDate), desc(equipmentMaintenanceEvents.createdAt)];
      if (sort === "DATE_ASC") orderByClauses = [asc(equipmentMaintenanceEvents.eventDate), desc(equipmentMaintenanceEvents.createdAt)];
      else if (sort === "ASSET_ASC") orderByClauses = [asc(equipmentAssets.name), desc(equipmentMaintenanceEvents.eventDate)];
      else if (sort === "ASSET_DESC") orderByClauses = [desc(equipmentAssets.name), desc(equipmentMaintenanceEvents.eventDate)];
      else if (sort === "UPDATED_DESC") orderByClauses = [desc(equipmentMaintenanceEvents.updatedAt), desc(equipmentMaintenanceEvents.eventDate)];
      else if (sort === "CREATED_DESC") orderByClauses = [desc(equipmentMaintenanceEvents.createdAt), desc(equipmentMaintenanceEvents.eventDate)];

      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: equipmentMaintenanceEvents.id,
            assetId: equipmentMaintenanceEvents.assetId,
            ranchId: equipmentMaintenanceEvents.ranchId,
            eventDate: equipmentMaintenanceEvents.eventDate,
            eventType: equipmentMaintenanceEvents.eventType,
            title: equipmentMaintenanceEvents.title,
            description: equipmentMaintenanceEvents.description,
            provider: equipmentMaintenanceEvents.provider,
            performedBy: equipmentMaintenanceEvents.performedBy,
            hasInvoice: equipmentMaintenanceEvents.hasInvoice,
            downtimeHours: equipmentMaintenanceEvents.downtimeHours,
            laborCost: equipmentMaintenanceEvents.laborCost,
            partsCost: equipmentMaintenanceEvents.partsCost,
            totalCost: equipmentMaintenanceEvents.totalCost,
            meterReading: equipmentMaintenanceEvents.meterReading,
            meterType: equipmentMaintenanceEvents.meterType,
            nextDueDate: equipmentMaintenanceEvents.nextDueDate,
            nextDueMeter: equipmentMaintenanceEvents.nextDueMeter,
            createdAt: equipmentMaintenanceEvents.createdAt,
            updatedAt: equipmentMaintenanceEvents.updatedAt,
            assetName: equipmentAssets.name,
            assetType: equipmentAssets.assetType,
            assetMake: equipmentAssets.make,
            assetModel: equipmentAssets.model,
            assetModelYear: equipmentAssets.modelYear,
          })
          .from(equipmentMaintenanceEvents)
          .innerJoin(equipmentAssets, eq(equipmentMaintenanceEvents.assetId, equipmentAssets.id))
          .where(whereClause)
          .orderBy(...orderByClauses)
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<string>`count(*)` })
          .from(equipmentMaintenanceEvents)
          .innerJoin(equipmentAssets, eq(equipmentMaintenanceEvents.assetId, equipmentAssets.id))
          .where(whereClause),
      ]);
      const total = Number(countRows[0]?.count ?? 0);
      const eventIds = rows.map((row) => row.id);
      const attachmentCountByEventId: Record<string, number> = {};
      if (eventIds.length > 0) {
        const attachmentCountRows = await db
          .select({ entityId: attachments.entityId, count: sql<string>`count(*)` })
          .from(attachments)
          .where(
            and(eq(attachments.ranchId, ranchId), eq(attachments.entityType, "EQUIPMENT_MAINTENANCE"), inArray(attachments.entityId, eventIds))
          )
          .groupBy(attachments.entityId);
        for (const row of attachmentCountRows) {
          attachmentCountByEventId[row.entityId] = Number(row.count ?? 0);
        }
      }

      const events = rows.map((row) => {
        const providerValue = row.provider?.trim() ?? "";
        const isDiy = !providerValue.length || row.performedBy === "OWNER" || row.performedBy === "EMPLOYEE";
        return {
          ...row,
          isDiy,
          attachmentCount: attachmentCountByEventId[row.id] ?? 0,
        };
      });

      return reply.send({ events, pagination: { page, limit, total } });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to list maintenance events", "Failed to list maintenance events");
    }
  });

  app.post("/equipment/assets", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const parsed = EquipmentAssetCreateBodySchema.safeParse(normalizeBody(rawBody));
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid equipment asset payload", details: parsed.error.flatten() });
      }
      const data = parsed.data;

      const assetType = normalizeEnum(data.assetType, ASSET_TYPES) ?? "OTHER";
      const trackMaintenance =
        data.trackMaintenance === undefined || data.trackMaintenance === null
          ? shouldTrackMaintenanceByDefault(assetType)
          : toBooleanLike(data.trackMaintenance, shouldTrackMaintenanceByDefault(assetType));
      const meterType = trackMaintenance ? normalizeEnum(data.meterType, METER_TYPES) ?? "NONE" : "NONE";
      const status = normalizeEnum(data.status, ASSET_STATUSES) ?? "ACTIVE";
      const acquisitionType = normalizeEnum(data.acquisitionType, ACQUISITION_TYPES) ?? "PURCHASED";
      const now = new Date();
      const assetId = crypto.randomUUID();

      await db.transaction(async (tx) => {
        await tx.insert(equipmentAssets).values({
          id: assetId,
          ranchId,
          name: data.name.trim(),
          assetType,
          make: data.make?.trim() ? data.make.trim() : null,
          model: data.model?.trim() ? data.model.trim() : null,
          modelYear: toNullableInteger(data.modelYear, { allowZero: false, fieldLabel: "modelYear" }),
          status,
          acquisitionType,
          acquisitionDate: parseIsoDateOrNull(data.acquisitionDate, "acquisitionDate"),
          purchasePrice: toNullableDecimalString(data.purchasePrice, { allowZero: true, fieldLabel: "purchasePrice" }),
          currentValueEstimate: toNullableDecimalString(data.currentValueEstimate, {
            allowZero: true,
            fieldLabel: "currentValueEstimate",
          }),
          trackMaintenance,
          meterType,
          defaultMeterUnitLabel: data.defaultMeterUnitLabel?.trim() ? data.defaultMeterUnitLabel.trim() : null,
          notes: data.notes?.trim() ? data.notes.trim() : null,
          createdAt: now,
          updatedAt: now,
        });

        if (data.identifiers?.length) {
          const rows = data.identifiers.map((entry) => {
            const identifierType = normalizeEnum(entry.identifierType, IDENTIFIER_TYPES);
            if (!identifierType) throw appError(400, `Invalid identifier type: ${entry.identifierType}`);
            const identifierValue = entry.identifierValue.trim();
            if (!identifierValue.length) throw appError(400, "Identifier value cannot be blank.");
            return {
              id: crypto.randomUUID(),
              assetId,
              identifierType,
              identifierValue,
              notes: entry.notes?.trim() ? entry.notes.trim() : null,
              createdAt: now,
              updatedAt: now,
            };
          });
          await tx.insert(equipmentAssetIdentifiers).values(rows);
        }
      });

      await saveEntityAttachments({ ranchId, entityType: "EQUIPMENT_ASSET", entityId: assetId, files });
      return reply.status(201).send(await getAssetDetail(ranchId, assetId));
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to create equipment asset", "Failed to create equipment asset");
    }
  });

  app.get("/equipment/assets/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      return reply.send(await getAssetDetail(ranchId, id));
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to load equipment asset", "Failed to load equipment asset");
    }
  });

  app.put("/equipment/assets/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const existingRows = await db
        .select()
        .from(equipmentAssets)
        .where(and(eq(equipmentAssets.ranchId, ranchId), eq(equipmentAssets.id, id)))
        .limit(1);
      if (!existingRows.length) return reply.status(404).send({ error: "Equipment asset not found" });
      const existing = existingRows[0];

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const parsed = EquipmentAssetUpdateBodySchema.safeParse(normalizeBody(rawBody));
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid equipment asset payload", details: parsed.error.flatten() });
      }
      const data = parsed.data;
      const now = new Date();

      const nextTrackMaintenance =
        data.trackMaintenance === undefined || data.trackMaintenance === null
          ? existing.trackMaintenance
          : toBooleanLike(data.trackMaintenance, existing.trackMaintenance);
      const updateSet: Record<string, any> = { updatedAt: now };

      if (data.name !== undefined) updateSet.name = data.name.trim();
      if (data.assetType !== undefined) updateSet.assetType = normalizeEnum(data.assetType, ASSET_TYPES) ?? "OTHER";
      if (data.make !== undefined) updateSet.make = data.make?.trim() ? data.make.trim() : null;
      if (data.model !== undefined) updateSet.model = data.model?.trim() ? data.model.trim() : null;
      if (data.modelYear !== undefined) {
        updateSet.modelYear = toNullableInteger(data.modelYear, { allowZero: false, fieldLabel: "modelYear" });
      }
      if (data.status !== undefined) updateSet.status = normalizeEnum(data.status, ASSET_STATUSES) ?? "ACTIVE";
      if (data.acquisitionType !== undefined) {
        updateSet.acquisitionType = normalizeEnum(data.acquisitionType, ACQUISITION_TYPES) ?? "OTHER";
      }
      if (data.acquisitionDate !== undefined) {
        updateSet.acquisitionDate = parseIsoDateOrNull(data.acquisitionDate, "acquisitionDate");
      }
      if (data.purchasePrice !== undefined) {
        updateSet.purchasePrice = toNullableDecimalString(data.purchasePrice, { allowZero: true, fieldLabel: "purchasePrice" });
      }
      if (data.currentValueEstimate !== undefined) {
        updateSet.currentValueEstimate = toNullableDecimalString(data.currentValueEstimate, {
          allowZero: true,
          fieldLabel: "currentValueEstimate",
        });
      }
      if (data.trackMaintenance !== undefined) updateSet.trackMaintenance = nextTrackMaintenance;
      if (data.meterType !== undefined || data.trackMaintenance !== undefined) {
        updateSet.meterType = nextTrackMaintenance ? normalizeEnum(data.meterType, METER_TYPES) ?? "NONE" : "NONE";
      }
      if (data.defaultMeterUnitLabel !== undefined) {
        updateSet.defaultMeterUnitLabel = data.defaultMeterUnitLabel?.trim() ? data.defaultMeterUnitLabel.trim() : null;
      }
      if (data.notes !== undefined) updateSet.notes = data.notes?.trim() ? data.notes.trim() : null;

      await db.transaction(async (tx) => {
        await tx.update(equipmentAssets).set(updateSet).where(and(eq(equipmentAssets.ranchId, ranchId), eq(equipmentAssets.id, id)));

        if (data.identifiers !== undefined) {
          await tx.delete(equipmentAssetIdentifiers).where(eq(equipmentAssetIdentifiers.assetId, id));
          if (data.identifiers.length) {
            const rows = data.identifiers.map((entry) => {
              const identifierType = normalizeEnum(entry.identifierType, IDENTIFIER_TYPES);
              if (!identifierType) throw appError(400, `Invalid identifier type: ${entry.identifierType}`);
              const identifierValue = entry.identifierValue.trim();
              if (!identifierValue.length) throw appError(400, "Identifier value cannot be blank.");
              return {
                id: crypto.randomUUID(),
                assetId: id,
                identifierType,
                identifierValue,
                notes: entry.notes?.trim() ? entry.notes.trim() : null,
                createdAt: now,
                updatedAt: now,
              };
            });
            await tx.insert(equipmentAssetIdentifiers).values(rows);
          }
        }
      });

      if (data.removeAttachmentIds?.length) {
        await removeEntityAttachmentsByIds({
          ranchId,
          entityType: "EQUIPMENT_ASSET",
          entityId: id,
          attachmentIds: data.removeAttachmentIds,
        });
      }
      if (files.length > 0) {
        await saveEntityAttachments({ ranchId, entityType: "EQUIPMENT_ASSET", entityId: id, files });
      }

      return reply.send(await getAssetDetail(ranchId, id));
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to update equipment asset", "Failed to update equipment asset");
    }
  });

  app.get("/equipment/assets/:id/maintenance", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id: assetId } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const assetRows = await db
        .select({ id: equipmentAssets.id })
        .from(equipmentAssets)
        .where(and(eq(equipmentAssets.ranchId, ranchId), eq(equipmentAssets.id, assetId)))
        .limit(1);
      if (!assetRows.length) return reply.status(404).send({ error: "Equipment asset not found" });

      const events = await db
        .select()
        .from(equipmentMaintenanceEvents)
        .where(and(eq(equipmentMaintenanceEvents.ranchId, ranchId), eq(equipmentMaintenanceEvents.assetId, assetId)))
        .orderBy(desc(equipmentMaintenanceEvents.eventDate), desc(equipmentMaintenanceEvents.createdAt));

      const attachmentsByEvent = await listEntityAttachmentsByIds(
        ranchId,
        "EQUIPMENT_MAINTENANCE",
        events.map((e) => e.id)
      );

      return reply.send({
        events: events.map((e) => ({
          ...e,
          attachments: attachmentsByEvent[e.id] ?? [],
        })),
      });
    } catch (err) {
      return withErrorHandling(
        req,
        reply,
        err,
        "Failed to list equipment maintenance events",
        "Failed to list equipment maintenance events"
      );
    }
  });

  app.post("/equipment/assets/:id/maintenance", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id: assetId } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const assetRows = await db
        .select()
        .from(equipmentAssets)
        .where(and(eq(equipmentAssets.ranchId, ranchId), eq(equipmentAssets.id, assetId)))
        .limit(1);
      if (!assetRows.length) return reply.status(404).send({ error: "Equipment asset not found" });
      if (!assetRows[0].trackMaintenance) {
        return reply.status(409).send({ error: "Maintenance tracking is disabled for this asset." });
      }

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const parsed = EquipmentMaintenanceBodySchema.safeParse(normalizeBody(rawBody));
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid maintenance payload", details: parsed.error.flatten() });
      }
      const data = parsed.data;
      const now = new Date();
      const id = crypto.randomUUID();
      const performedBy = normalizeEnum(data.performedBy, PERFORMED_BY_TYPES);
      const hasInvoice = data.hasInvoice === undefined ? null : toBooleanOrNull(data.hasInvoice);
      const downtimeHours = toNullableDecimalString(data.downtimeHours, { allowZero: true, fieldLabel: "downtimeHours" });
      const laborCost = toNullableDecimalString(data.laborCost, { allowZero: true, fieldLabel: "laborCost" });
      const partsCost = toNullableDecimalString(data.partsCost, { allowZero: true, fieldLabel: "partsCost" });
      let totalCost = toNullableDecimalString(data.totalCost, { allowZero: true, fieldLabel: "totalCost" });
      if (!totalCost && (laborCost || partsCost)) totalCost = String(Number(laborCost ?? "0") + Number(partsCost ?? "0"));

      await db.insert(equipmentMaintenanceEvents).values({
        id,
        assetId,
        ranchId,
        eventDate: parseIsoDateOrNull(data.eventDate, "eventDate") ?? todayIsoDate(),
        eventType: normalizeEnum(data.eventType, MAINTENANCE_EVENT_TYPES) ?? "SERVICE",
        title: data.title.trim(),
        description: data.description?.trim() ? data.description.trim() : null,
        provider: data.provider?.trim() ? data.provider.trim() : null,
        performedBy: performedBy ?? null,
        hasInvoice,
        downtimeHours,
        laborCost,
        partsCost,
        totalCost,
        meterReading: toNullableDecimalString(data.meterReading, { allowZero: true, fieldLabel: "meterReading" }),
        meterType: normalizeEnum(data.meterType, METER_TYPES) ?? normalizeEnum(assetRows[0].meterType, METER_TYPES) ?? "NONE",
        nextDueDate: parseIsoDateOrNull(data.nextDueDate, "nextDueDate"),
        nextDueMeter: toNullableDecimalString(data.nextDueMeter, { allowZero: true, fieldLabel: "nextDueMeter" }),
        createdAt: now,
        updatedAt: now,
      });

      await saveEntityAttachments({ ranchId, entityType: "EQUIPMENT_MAINTENANCE", entityId: id, files });

      const eventRows = await db
        .select()
        .from(equipmentMaintenanceEvents)
        .where(and(eq(equipmentMaintenanceEvents.ranchId, ranchId), eq(equipmentMaintenanceEvents.id, id)))
        .limit(1);

      return reply.status(201).send({
        event: eventRows[0],
        attachments: await listEntityAttachments(ranchId, "EQUIPMENT_MAINTENANCE", id),
      });
    } catch (err) {
      return withErrorHandling(
        req,
        reply,
        err,
        "Failed to create equipment maintenance event",
        "Failed to create equipment maintenance event"
      );
    }
  });

  app.put("/equipment/maintenance/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const existingRows = await db
        .select()
        .from(equipmentMaintenanceEvents)
        .where(and(eq(equipmentMaintenanceEvents.ranchId, ranchId), eq(equipmentMaintenanceEvents.id, id)))
        .limit(1);
      if (!existingRows.length) return reply.status(404).send({ error: "Maintenance event not found" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const parsed = EquipmentMaintenanceUpdateBodySchema.safeParse(normalizeBody(rawBody));
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid maintenance payload", details: parsed.error.flatten() });
      }
      const data = parsed.data;
      const now = new Date();

      const updateSet: Record<string, any> = { updatedAt: now };
      if (data.eventDate !== undefined) updateSet.eventDate = parseIsoDateOrNull(data.eventDate, "eventDate");
      if (data.eventType !== undefined) updateSet.eventType = normalizeEnum(data.eventType, MAINTENANCE_EVENT_TYPES) ?? "OTHER";
      if (data.title !== undefined) updateSet.title = data.title.trim();
      if (data.description !== undefined) updateSet.description = data.description?.trim() ? data.description.trim() : null;
      if (data.provider !== undefined) updateSet.provider = data.provider?.trim() ? data.provider.trim() : null;
      if (data.performedBy !== undefined) updateSet.performedBy = normalizeEnum(data.performedBy, PERFORMED_BY_TYPES) ?? null;
      if (data.hasInvoice !== undefined) updateSet.hasInvoice = toBooleanOrNull(data.hasInvoice);
      if (data.downtimeHours !== undefined) {
        updateSet.downtimeHours = toNullableDecimalString(data.downtimeHours, { allowZero: true, fieldLabel: "downtimeHours" });
      }
      if (data.laborCost !== undefined) updateSet.laborCost = toNullableDecimalString(data.laborCost, { allowZero: true, fieldLabel: "laborCost" });
      if (data.partsCost !== undefined) updateSet.partsCost = toNullableDecimalString(data.partsCost, { allowZero: true, fieldLabel: "partsCost" });
      if (data.totalCost !== undefined) updateSet.totalCost = toNullableDecimalString(data.totalCost, { allowZero: true, fieldLabel: "totalCost" });
      if (data.meterReading !== undefined) {
        updateSet.meterReading = toNullableDecimalString(data.meterReading, { allowZero: true, fieldLabel: "meterReading" });
      }
      if (data.meterType !== undefined) updateSet.meterType = normalizeEnum(data.meterType, METER_TYPES) ?? "NONE";
      if (data.nextDueDate !== undefined) updateSet.nextDueDate = parseIsoDateOrNull(data.nextDueDate, "nextDueDate");
      if (data.nextDueMeter !== undefined) {
        updateSet.nextDueMeter = toNullableDecimalString(data.nextDueMeter, { allowZero: true, fieldLabel: "nextDueMeter" });
      }

      await db
        .update(equipmentMaintenanceEvents)
        .set(updateSet)
        .where(and(eq(equipmentMaintenanceEvents.ranchId, ranchId), eq(equipmentMaintenanceEvents.id, id)));

      if (data.removeAttachmentIds?.length) {
        await removeEntityAttachmentsByIds({
          ranchId,
          entityType: "EQUIPMENT_MAINTENANCE",
          entityId: id,
          attachmentIds: data.removeAttachmentIds,
        });
      }
      if (files.length > 0) {
        await saveEntityAttachments({ ranchId, entityType: "EQUIPMENT_MAINTENANCE", entityId: id, files });
      }

      const rows = await db
        .select()
        .from(equipmentMaintenanceEvents)
        .where(and(eq(equipmentMaintenanceEvents.ranchId, ranchId), eq(equipmentMaintenanceEvents.id, id)))
        .limit(1);

      return reply.send({
        event: rows[0],
        attachments: await listEntityAttachments(ranchId, "EQUIPMENT_MAINTENANCE", id),
      });
    } catch (err) {
      return withErrorHandling(
        req,
        reply,
        err,
        "Failed to update equipment maintenance event",
        "Failed to update equipment maintenance event"
      );
    }
  });

  app.get("/equipment/parts", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const query = EquipmentPartsListQuerySchema.parse(req.query ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId, query.ranchId ?? null);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const whereParts = [eq(equipmentParts.ranchId, ranchId)] as any[];
      if (query.category?.trim()) {
        const category = normalizeEnum(query.category, PART_CATEGORIES);
        if (!category) return reply.status(400).send({ error: "Invalid category filter" });
        whereParts.push(eq(equipmentParts.category, category));
      }
      if (!query.includeInactive) whereParts.push(eq(equipmentParts.isActive, true));
      if (query.search?.trim()) {
        const search = `%${query.search.trim()}%`;
        whereParts.push(
          sql`(
            ${equipmentParts.name} ILIKE ${search}
            OR COALESCE(${equipmentParts.manufacturer}, '') ILIKE ${search}
            OR COALESCE(${equipmentParts.partNumber}, '') ILIKE ${search}
            OR COALESCE(${equipmentParts.storageLocation}, '') ILIKE ${search}
          )`
        );
      }

      const rows = await db
        .select()
        .from(equipmentParts)
        .where(whereParts.length > 1 ? and(...whereParts) : whereParts[0])
        .orderBy(asc(equipmentParts.category), asc(equipmentParts.name), asc(equipmentParts.createdAt));

      return reply.send({ parts: rows });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to list equipment parts", "Failed to list equipment parts");
    }
  });

  app.post("/equipment/parts", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const parsed = EquipmentPartBodySchema.safeParse(normalizeBody(rawBody));
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid equipment part payload", details: parsed.error.flatten() });
      }
      const data = parsed.data;
      const now = new Date();
      const id = crypto.randomUUID();

      await db.insert(equipmentParts).values({
        id,
        ranchId,
        name: data.name.trim(),
        category: normalizeEnum(data.category, PART_CATEGORIES) ?? "OTHER",
        description: data.description?.trim() ? data.description.trim() : null,
        manufacturer: data.manufacturer?.trim() ? data.manufacturer.trim() : null,
        partNumber: data.partNumber?.trim() ? data.partNumber.trim() : null,
        usedForAssetTypes: normalizeUsedForValues(data.usedForAssetTypes),
        unitType: normalizeEnum(data.unitType, PART_UNIT_TYPES) ?? "COUNT",
        defaultUnit: data.defaultUnit?.trim() ? data.defaultUnit.trim() : "each",
        onHandQuantity:
          toNullableDecimalString(data.onHandQuantity, {
            allowZero: true,
            allowNegative: true,
            fieldLabel: "onHandQuantity",
          }) ?? "0",
        reorderThreshold: toNullableDecimalString(data.reorderThreshold, {
          allowZero: true,
          allowNegative: false,
          fieldLabel: "reorderThreshold",
        }),
        reorderTarget: toNullableDecimalString(data.reorderTarget, {
          allowZero: true,
          allowNegative: false,
          fieldLabel: "reorderTarget",
        }),
        vendor: data.vendor?.trim() ? data.vendor.trim() : null,
        costPerUnit: toNullableDecimalString(data.costPerUnit, {
          allowZero: true,
          allowNegative: false,
          fieldLabel: "costPerUnit",
        }),
        storageLocation: data.storageLocation?.trim() ? data.storageLocation.trim() : null,
        isActive: toBooleanLike(data.isActive, true),
        createdAt: now,
        updatedAt: now,
      });

      await saveEntityAttachments({ ranchId, entityType: "EQUIPMENT_PART", entityId: id, files });
      const detailRows = await db
        .select()
        .from(equipmentParts)
        .where(and(eq(equipmentParts.ranchId, ranchId), eq(equipmentParts.id, id)))
        .limit(1);

      return reply.status(201).send({
        part: detailRows[0],
        attachments: await listEntityAttachments(ranchId, "EQUIPMENT_PART", id),
        recentEvents: [],
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to create equipment part", "Failed to create equipment part");
    }
  });

  app.put("/equipment/parts/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const exists = await db
        .select({ id: equipmentParts.id })
        .from(equipmentParts)
        .where(and(eq(equipmentParts.ranchId, ranchId), eq(equipmentParts.id, id)))
        .limit(1);
      if (!exists.length) return reply.status(404).send({ error: "Equipment part not found" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const parsed = EquipmentPartUpdateBodySchema.safeParse(normalizeBody(rawBody));
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid equipment part payload", details: parsed.error.flatten() });
      }
      const data = parsed.data;
      const now = new Date();

      const updateSet: Record<string, any> = { updatedAt: now };
      if (data.name !== undefined) updateSet.name = data.name.trim();
      if (data.category !== undefined) updateSet.category = normalizeEnum(data.category, PART_CATEGORIES) ?? "OTHER";
      if (data.description !== undefined) updateSet.description = data.description?.trim() ? data.description.trim() : null;
      if (data.manufacturer !== undefined) updateSet.manufacturer = data.manufacturer?.trim() ? data.manufacturer.trim() : null;
      if (data.partNumber !== undefined) updateSet.partNumber = data.partNumber?.trim() ? data.partNumber.trim() : null;
      if (data.usedForAssetTypes !== undefined) {
        updateSet.usedForAssetTypes = normalizeUsedForValues(data.usedForAssetTypes);
      }
      if (data.unitType !== undefined) updateSet.unitType = normalizeEnum(data.unitType, PART_UNIT_TYPES) ?? "COUNT";
      if (data.defaultUnit !== undefined) updateSet.defaultUnit = data.defaultUnit?.trim() ? data.defaultUnit.trim() : "each";
      if (data.onHandQuantity !== undefined) {
        updateSet.onHandQuantity = toNullableDecimalString(data.onHandQuantity, {
          allowZero: true,
          allowNegative: true,
          fieldLabel: "onHandQuantity",
        });
      }
      if (data.reorderThreshold !== undefined) {
        updateSet.reorderThreshold = toNullableDecimalString(data.reorderThreshold, {
          allowZero: true,
          allowNegative: false,
          fieldLabel: "reorderThreshold",
        });
      }
      if (data.reorderTarget !== undefined) {
        updateSet.reorderTarget = toNullableDecimalString(data.reorderTarget, {
          allowZero: true,
          allowNegative: false,
          fieldLabel: "reorderTarget",
        });
      }
      if (data.vendor !== undefined) updateSet.vendor = data.vendor?.trim() ? data.vendor.trim() : null;
      if (data.costPerUnit !== undefined) {
        updateSet.costPerUnit = toNullableDecimalString(data.costPerUnit, {
          allowZero: true,
          allowNegative: false,
          fieldLabel: "costPerUnit",
        });
      }
      if (data.storageLocation !== undefined) {
        updateSet.storageLocation = data.storageLocation?.trim() ? data.storageLocation.trim() : null;
      }
      if (data.isActive !== undefined) updateSet.isActive = toBooleanLike(data.isActive, true);

      await db.update(equipmentParts).set(updateSet).where(and(eq(equipmentParts.ranchId, ranchId), eq(equipmentParts.id, id)));

      if (data.removeAttachmentIds?.length) {
        await removeEntityAttachmentsByIds({
          ranchId,
          entityType: "EQUIPMENT_PART",
          entityId: id,
          attachmentIds: data.removeAttachmentIds,
        });
      }
      if (files.length > 0) {
        await saveEntityAttachments({ ranchId, entityType: "EQUIPMENT_PART", entityId: id, files });
      }

      const partRows = await db
        .select()
        .from(equipmentParts)
        .where(and(eq(equipmentParts.ranchId, ranchId), eq(equipmentParts.id, id)))
        .limit(1);
      const eventRows = await db
        .select()
        .from(equipmentPartInventoryEvents)
        .where(and(eq(equipmentPartInventoryEvents.ranchId, ranchId), eq(equipmentPartInventoryEvents.partId, id)))
        .orderBy(desc(equipmentPartInventoryEvents.eventDate), desc(equipmentPartInventoryEvents.createdAt))
        .limit(10);

      return reply.send({
        part: partRows[0],
        attachments: await listEntityAttachments(ranchId, "EQUIPMENT_PART", id),
        recentEvents: eventRows,
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to update equipment part", "Failed to update equipment part");
    }
  });

  app.get("/equipment/parts/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const partRows = await db
        .select()
        .from(equipmentParts)
        .where(and(eq(equipmentParts.ranchId, ranchId), eq(equipmentParts.id, id)))
        .limit(1);
      if (!partRows.length) return reply.status(404).send({ error: "Equipment part not found" });

      const events = await db
        .select()
        .from(equipmentPartInventoryEvents)
        .where(and(eq(equipmentPartInventoryEvents.ranchId, ranchId), eq(equipmentPartInventoryEvents.partId, id)))
        .orderBy(desc(equipmentPartInventoryEvents.eventDate), desc(equipmentPartInventoryEvents.createdAt))
        .limit(25);
      const attachmentsByEvent = await listEntityAttachmentsByIds(
        ranchId,
        "EQUIPMENT_PART_EVENT",
        events.map((e) => e.id)
      );

      return reply.send({
        part: partRows[0],
        attachments: await listEntityAttachments(ranchId, "EQUIPMENT_PART", id),
        recentEvents: events.map((e) => ({ ...e, attachments: attachmentsByEvent[e.id] ?? [] })),
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to load equipment part detail", "Failed to load equipment part detail");
    }
  });

  app.get("/equipment/parts/:id/events", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id: partId } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const partRows = await db
        .select({ id: equipmentParts.id })
        .from(equipmentParts)
        .where(and(eq(equipmentParts.ranchId, ranchId), eq(equipmentParts.id, partId)))
        .limit(1);
      if (!partRows.length) return reply.status(404).send({ error: "Equipment part not found" });

      const events = await db
        .select()
        .from(equipmentPartInventoryEvents)
        .where(and(eq(equipmentPartInventoryEvents.ranchId, ranchId), eq(equipmentPartInventoryEvents.partId, partId)))
        .orderBy(desc(equipmentPartInventoryEvents.eventDate), desc(equipmentPartInventoryEvents.createdAt));
      const attachmentsByEvent = await listEntityAttachmentsByIds(
        ranchId,
        "EQUIPMENT_PART_EVENT",
        events.map((e) => e.id)
      );

      return reply.send({ events: events.map((e) => ({ ...e, attachments: attachmentsByEvent[e.id] ?? [] })) });
    } catch (err) {
      return withErrorHandling(
        req,
        reply,
        err,
        "Failed to list equipment part inventory events",
        "Failed to list equipment part inventory events"
      );
    }
  });

  app.post("/equipment/parts/:id/events", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id: partId } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const partRows = await db
        .select()
        .from(equipmentParts)
        .where(and(eq(equipmentParts.ranchId, ranchId), eq(equipmentParts.id, partId)))
        .limit(1);
      if (!partRows.length) return reply.status(404).send({ error: "Equipment part not found" });
      const part = partRows[0];

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const parsed = EquipmentPartEventBodySchema.safeParse(normalizeBody(rawBody));
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid part inventory event payload", details: parsed.error.flatten() });
      }
      const data = parsed.data;

      const eventType = normalizeEnum(data.eventType, PART_EVENT_TYPES) ?? "ADJUSTMENT";
      const quantityDelta = toNullableDecimalString(data.quantityDelta, {
        allowNegative: true,
        allowZero: false,
        fieldLabel: "quantityDelta",
      });
      if (!quantityDelta) return reply.status(400).send({ error: "quantityDelta is required." });
      if (eventType === "PURCHASE" && Number(quantityDelta) <= 0) {
        return reply.status(400).send({ error: "PURCHASE events must use a positive quantityDelta." });
      }

      const now = new Date();
      const id = crypto.randomUUID();
      const unit = data.unit?.trim() ? data.unit.trim() : part.defaultUnit ?? "each";

      await db.transaction(async (tx) => {
        await tx.insert(equipmentPartInventoryEvents).values({
          id,
          partId,
          ranchId,
          eventDate: parseIsoDateOrNull(data.eventDate, "eventDate") ?? todayIsoDate(),
          eventType,
          quantityDelta,
          unit,
          unitCost: toNullableDecimalString(data.unitCost, { allowZero: true, fieldLabel: "unitCost" }),
          vendor: data.vendor?.trim() ? data.vendor.trim() : null,
          notes: data.notes?.trim() ? data.notes.trim() : null,
          createdAt: now,
          updatedAt: now,
        });

        await tx
          .update(equipmentParts)
          .set({
            onHandQuantity: sql`${equipmentParts.onHandQuantity} + ${quantityDelta}`,
            updatedAt: now,
          })
          .where(and(eq(equipmentParts.ranchId, ranchId), eq(equipmentParts.id, partId)));
      });

      await saveEntityAttachments({ ranchId, entityType: "EQUIPMENT_PART_EVENT", entityId: id, files });

      const eventRows = await db
        .select()
        .from(equipmentPartInventoryEvents)
        .where(and(eq(equipmentPartInventoryEvents.ranchId, ranchId), eq(equipmentPartInventoryEvents.id, id)))
        .limit(1);
      const partAfterRows = await db
        .select({ id: equipmentParts.id, onHandQuantity: equipmentParts.onHandQuantity, updatedAt: equipmentParts.updatedAt })
        .from(equipmentParts)
        .where(and(eq(equipmentParts.ranchId, ranchId), eq(equipmentParts.id, partId)))
        .limit(1);

      return reply.status(201).send({
        event: eventRows[0],
        partBalance: partAfterRows[0] ?? null,
        attachments: await listEntityAttachments(ranchId, "EQUIPMENT_PART_EVENT", id),
      });
    } catch (err) {
      return withErrorHandling(
        req,
        reply,
        err,
        "Failed to create equipment part inventory event",
        "Failed to create equipment part inventory event"
      );
    }
  });

  app.get("/equipment/attachments", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const query = AttachmentListQuerySchema.parse(req.query ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId, query.ranchId ?? null);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const whereParts = [eq(attachments.ranchId, ranchId)] as any[];
      if (query.entityType?.trim()) {
        const entityType = normalizeEnum(query.entityType, ATTACHMENT_ENTITY_TYPES);
        if (!entityType) return reply.status(400).send({ error: "Invalid attachment entityType filter." });
        whereParts.push(eq(attachments.entityType, entityType));
      }
      if (query.entityId?.trim()) {
        whereParts.push(eq(attachments.entityId, query.entityId));
      }

      const rows = await db
        .select()
        .from(attachments)
        .where(whereParts.length > 1 ? and(...whereParts) : whereParts[0])
        .orderBy(desc(attachments.createdAt));

      return reply.send({ attachments: rows.map(toAttachmentResponse) });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to list attachments", "Failed to list attachments");
    }
  });

  app.post("/equipment/attachments", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const { body: rawBody, files } = await parseMultipartRequest(req);
      const parsed = AttachmentCreateBodySchema.safeParse(normalizeBody(rawBody));
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid attachment payload", details: parsed.error.flatten() });
      }
      if (!files.length) {
        return reply.status(400).send({ error: "At least one file is required." });
      }

      const entityType = normalizeEnum(parsed.data.entityType, ATTACHMENT_ENTITY_TYPES);
      if (!entityType) return reply.status(400).send({ error: "Invalid attachment entityType." });

      await ensureAttachmentEntityExists(ranchId, entityType, parsed.data.entityId);
      const ids = await saveEntityAttachments({
        ranchId,
        entityType,
        entityId: parsed.data.entityId,
        files,
      });

      const rows =
        ids.length > 0
          ? await db
              .select()
              .from(attachments)
              .where(inArray(attachments.id, ids))
              .orderBy(desc(attachments.createdAt))
          : [];

      return reply.status(201).send({ attachments: rows.map(toAttachmentResponse) });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to upload attachments", "Failed to upload attachments");
    }
  });

  app.delete("/equipment/attachments/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const rows = await db
        .select({ id: attachments.id, entityType: attachments.entityType, entityId: attachments.entityId, filePath: attachments.filePath })
        .from(attachments)
        .where(and(eq(attachments.ranchId, ranchId), eq(attachments.id, id)))
        .limit(1);
      if (!rows.length) return reply.status(404).send({ error: "Attachment not found." });

      await db.delete(attachments).where(and(eq(attachments.ranchId, ranchId), eq(attachments.id, id)));
      await removeAttachmentFiles([{ filePath: rows[0].filePath }]);

      return reply.send({
        deleted: {
          id: rows[0].id,
          entityType: rows[0].entityType,
          entityId: rows[0].entityId,
        },
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to delete attachment", "Failed to delete attachment");
    }
  });
}
