import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "../db";
import {
  animalHerdMembership,
  animals,
  equipmentAssets,
  equipmentMaintenanceEvents,
  equipmentParts,
  feedBlends,
  feedComponents,
  feedInventoryBalances,
  fuelInventoryBalances,
  fuelProducts,
  herds,
  ranchMedicationStandards,
  standardMedications,
  workingDayPlanItemEquipmentNeeds,
  workingDayPlanItemSupplyNeeds,
  workingDayPlanItems,
  workingDayPlans,
  workingDayTaskCatalog,
} from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";
import { getActiveRanchIdForUser } from "../lib/activeRanch";
import {
  WorkingDayPlanCategorySchema,
  WorkingDayPlanItemStatusSchema,
  WorkingDaySupplyTypeSchema,
} from "../contracts/workingDayPlan";

type AppError = Error & { statusCode?: number };
type WorkingDayCategory = z.infer<typeof WorkingDayPlanCategorySchema>;
type WorkingDayItemStatus = z.infer<typeof WorkingDayPlanItemStatusSchema>;
type WorkingDaySupplyType = z.infer<typeof WorkingDaySupplyTypeSchema>;
type SupplyReadinessStatus = "READY" | "SHORT" | "UNKNOWN" | "NO_REQUIRED_QUANTITY";
type EquipmentReadinessStatus = "READY" | "NOT_OPERATIONAL" | "NEEDS_SERVICE" | "UNKNOWN" | "UNLINKED";

const PLAN_CATEGORIES = new Set<WorkingDayCategory>(WorkingDayPlanCategorySchema.options as readonly WorkingDayCategory[]);
const PLAN_ITEM_STATUSES = new Set<WorkingDayItemStatus>(
  WorkingDayPlanItemStatusSchema.options as readonly WorkingDayItemStatus[]
);
const SUPPLY_TYPES = new Set<WorkingDaySupplyType>(WorkingDaySupplyTypeSchema.options as readonly WorkingDaySupplyType[]);

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
  if (typeof maybeAppErr?.statusCode === "number") return reply.status(maybeAppErr.statusCode).send({ error: maybeAppErr.message });
  req.log.error({ err }, logMessage);
  return reply.status(500).send({ error: defaultErrorMessage, message: (err as any)?.message });
}

function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrowIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysToIsoDate(isoDate: string, daysToAdd: number): string {
  const [yyyy, mm, dd] = isoDate.split("-").map((part) => Number(part));
  const date = new Date(yyyy, (mm || 1) - 1, dd || 1);
  date.setDate(date.getDate() + daysToAdd);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parsePeriodDays(value: unknown): 7 | 14 | 30 {
  if (value === null || value === undefined || value === "") return 7;
  const n = Number(value);
  if (n === 7 || n === 14 || n === 30) return n;
  throw appError(400, "periodDays must be one of 7, 14, or 30.");
}

function normalizeEnum<T extends string>(value: unknown, allowed: Set<T>): T | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase() as T;
  return allowed.has(normalized) ? normalized : null;
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

function parseIsoDateOrNull(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s.length) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw appError(400, `${field} must be YYYY-MM-DD.`);
  return s;
}

function parseTimeOrNull(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s.length) return null;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(s)) throw appError(400, `${field} must be HH:MM or HH:MM:SS.`);
  return s.length === 5 ? `${s}:00` : s;
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

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function labelFromTaskType(taskType: string): string {
  return taskType
    .trim()
    .split("_")
    .map((part) => (part.length ? part.charAt(0) + part.slice(1).toLowerCase() : ""))
    .join(" ");
}

function isLikelyTagSupplyNeed(need: {
  supplyType: string;
  linkedEntityType?: string | null;
  nameOverride?: string | null;
}): boolean {
  if (need.supplyType !== "PART_SUPPLY") return false;
  const text = `${need.nameOverride ?? ""} ${need.linkedEntityType ?? ""}`.toLowerCase();
  return /(^|[^a-z])tags?([^a-z]|$)/.test(text);
}

async function resolveRanchId(userId: string, requestedRanchId?: string | null): Promise<string | null> {
  const activeRanchId = await getActiveRanchIdForUser(userId);
  if (!activeRanchId) return null;
  if (requestedRanchId && requestedRanchId !== activeRanchId) throw appError(403, "Requested ranchId does not match your active ranch.");
  return activeRanchId;
}

async function ensureHerdInRanch(ranchId: string, herdId: string): Promise<void> {
  const rows = await db.select({ id: herds.id }).from(herds).where(and(eq(herds.id, herdId), eq(herds.ranchId, ranchId))).limit(1);
  if (!rows.length) throw appError(400, "herdId is not in the active ranch.");
}

async function ensureAnimalInRanch(ranchId: string, animalId: string): Promise<void> {
  const rows = await db
    .select({ id: animals.id })
    .from(animals)
    .innerJoin(animalHerdMembership, and(eq(animalHerdMembership.animalId, animals.id), isNull(animalHerdMembership.endAt)))
    .innerJoin(herds, eq(herds.id, animalHerdMembership.herdId))
    .where(and(eq(animals.id, animalId), eq(herds.ranchId, ranchId)))
    .limit(1);
  if (!rows.length) throw appError(400, "animalId is not currently in the active ranch.");
}

async function getPlanByDate(ranchId: string, date: string) {
  const rows = await db.select().from(workingDayPlans).where(and(eq(workingDayPlans.ranchId, ranchId), eq(workingDayPlans.planDate, date))).limit(1);
  return rows[0] ?? null;
}

async function ensurePlanScope(ranchId: string, planId: string) {
  const rows = await db.select().from(workingDayPlans).where(and(eq(workingDayPlans.id, planId), eq(workingDayPlans.ranchId, ranchId))).limit(1);
  if (!rows.length) throw appError(404, "Working day plan not found.");
  return rows[0];
}

async function ensureItemScope(ranchId: string, itemId: string) {
  const rows = await db
    .select({
      itemId: workingDayPlanItems.id,
      planId: workingDayPlanItems.planId,
      category: workingDayPlanItems.category,
      taskType: workingDayPlanItems.taskType,
      title: workingDayPlanItems.title,
      status: workingDayPlanItems.status,
      startTime: workingDayPlanItems.startTime,
      endTime: workingDayPlanItems.endTime,
      herdId: workingDayPlanItems.herdId,
      animalId: workingDayPlanItems.animalId,
      locationText: workingDayPlanItems.locationText,
      notes: workingDayPlanItems.notes,
      sortOrder: workingDayPlanItems.sortOrder,
      createdAt: workingDayPlanItems.createdAt,
      updatedAt: workingDayPlanItems.updatedAt,
      planDate: workingDayPlans.planDate,
    })
    .from(workingDayPlanItems)
    .innerJoin(workingDayPlans, eq(workingDayPlanItems.planId, workingDayPlans.id))
    .where(and(eq(workingDayPlanItems.id, itemId), eq(workingDayPlans.ranchId, ranchId)))
    .limit(1);
  if (!rows.length) throw appError(404, "Working day plan item not found.");
  return rows[0];
}

async function ensureSupplyNeedScope(ranchId: string, id: string) {
  const rows = await db
    .select()
    .from(workingDayPlanItemSupplyNeeds)
    .innerJoin(workingDayPlanItems, eq(workingDayPlanItemSupplyNeeds.planItemId, workingDayPlanItems.id))
    .innerJoin(workingDayPlans, eq(workingDayPlanItems.planId, workingDayPlans.id))
    .where(and(eq(workingDayPlanItemSupplyNeeds.id, id), eq(workingDayPlans.ranchId, ranchId)))
    .limit(1);
  if (!rows.length) throw appError(404, "Supply need not found.");
  return rows[0].working_day_plan_item_supply_needs;
}

async function ensureEquipmentNeedScope(ranchId: string, id: string) {
  const rows = await db
    .select()
    .from(workingDayPlanItemEquipmentNeeds)
    .innerJoin(workingDayPlanItems, eq(workingDayPlanItemEquipmentNeeds.planItemId, workingDayPlanItems.id))
    .innerJoin(workingDayPlans, eq(workingDayPlanItems.planId, workingDayPlans.id))
    .where(and(eq(workingDayPlanItemEquipmentNeeds.id, id), eq(workingDayPlans.ranchId, ranchId)))
    .limit(1);
  if (!rows.length) throw appError(404, "Equipment need not found.");
  return rows[0].working_day_plan_item_equipment_needs;
}

async function listTaskCatalog() {
  const rows = await db
    .select()
    .from(workingDayTaskCatalog)
    .where(eq(workingDayTaskCatalog.isActive, true))
    .orderBy(asc(workingDayTaskCatalog.category), asc(workingDayTaskCatalog.sortOrder), asc(workingDayTaskCatalog.label));

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    taskType: row.taskType,
    label: row.label,
    suggestedSupplyNeeds: Array.isArray(row.suggestedSupplyNeedsJson) ? row.suggestedSupplyNeedsJson : [],
    suggestedEquipmentNeeds: Array.isArray(row.suggestedEquipmentNeedsJson) ? row.suggestedEquipmentNeedsJson : [],
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  }));
}

async function getTaskByType(taskType: string) {
  const rows = await db
    .select()
    .from(workingDayTaskCatalog)
    .where(and(eq(workingDayTaskCatalog.taskType, taskType), eq(workingDayTaskCatalog.isActive, true)))
    .limit(1);
  return rows[0] ?? null;
}

async function computeSupplyReadiness(ranchId: string, supplyNeeds: Array<typeof workingDayPlanItemSupplyNeeds.$inferSelect>) {
  const normalizedNeeds = supplyNeeds.map((need) => ({
    ...need,
    linkedEntityType: need.linkedEntityType?.trim().toUpperCase() ?? null,
    linkedEntityId: need.linkedEntityId ?? null,
    nameOverride: need.nameOverride?.trim() ?? null,
  }));

  const feedComponentIds = Array.from(new Set(normalizedNeeds.filter((n) => n.linkedEntityType === "FEED_COMPONENT" && n.linkedEntityId).map((n) => n.linkedEntityId as string)));
  const feedBlendIds = Array.from(new Set(normalizedNeeds.filter((n) => n.linkedEntityType === "FEED_BLEND" && n.linkedEntityId).map((n) => n.linkedEntityId as string)));
  const fuelProductIds = Array.from(new Set(normalizedNeeds.filter((n) => n.linkedEntityType === "FUEL_PRODUCT" && n.linkedEntityId).map((n) => n.linkedEntityId as string)));
  const equipmentPartIds = Array.from(new Set(normalizedNeeds.filter((n) => n.linkedEntityType === "EQUIPMENT_PART" && n.linkedEntityId).map((n) => n.linkedEntityId as string)));
  const medicationStandardIds = Array.from(new Set(normalizedNeeds.filter((n) => n.linkedEntityType === "MEDICATION_STANDARD" && n.linkedEntityId).map((n) => n.linkedEntityId as string)));

  const tagNeedCount = normalizedNeeds.filter((need) => isLikelyTagSupplyNeed(need)).length;

  const [
    feedComponentsRows,
    feedBlendRows,
    fuelProductRows,
    equipmentPartRows,
    medicationRows,
    feedComponentBalanceRows,
    feedBlendBalanceRows,
    fuelBalanceRows,
    tagInventoryRows,
  ] =
    await Promise.all([
      feedComponentIds.length
        ? db.select({ id: feedComponents.id, name: feedComponents.name, defaultUnit: feedComponents.defaultUnit }).from(feedComponents).where(and(eq(feedComponents.ranchId, ranchId), inArray(feedComponents.id, feedComponentIds)))
        : Promise.resolve([] as Array<{ id: string; name: string; defaultUnit: string }>),
      feedBlendIds.length
        ? db.select({ id: feedBlends.id, name: feedBlends.name, defaultUnit: feedBlends.defaultUnit }).from(feedBlends).where(and(eq(feedBlends.ranchId, ranchId), inArray(feedBlends.id, feedBlendIds)))
        : Promise.resolve([] as Array<{ id: string; name: string; defaultUnit: string }>),
      fuelProductIds.length
        ? db.select({ id: fuelProducts.id, name: fuelProducts.name, defaultUnit: fuelProducts.defaultUnit }).from(fuelProducts).where(and(eq(fuelProducts.ranchId, ranchId), inArray(fuelProducts.id, fuelProductIds)))
        : Promise.resolve([] as Array<{ id: string; name: string; defaultUnit: string }>),
      equipmentPartIds.length
        ? db
            .select({ id: equipmentParts.id, name: equipmentParts.name, defaultUnit: equipmentParts.defaultUnit, onHandQuantity: equipmentParts.onHandQuantity })
            .from(equipmentParts)
            .where(and(eq(equipmentParts.ranchId, ranchId), inArray(equipmentParts.id, equipmentPartIds)))
        : Promise.resolve([] as Array<{ id: string; name: string; defaultUnit: string; onHandQuantity: string }>),
      medicationStandardIds.length
        ? db
            .select({
              id: ranchMedicationStandards.id,
              chemicalName: standardMedications.chemicalName,
              brandName: standardMedications.brandName,
            })
            .from(ranchMedicationStandards)
            .innerJoin(
              standardMedications,
              and(eq(standardMedications.id, ranchMedicationStandards.standardMedicationId), eq(standardMedications.ranchId, ranchId))
            )
            .where(and(eq(ranchMedicationStandards.ranchId, ranchId), inArray(ranchMedicationStandards.id, medicationStandardIds)))
        : Promise.resolve([] as Array<{ id: string; chemicalName: string; brandName: string }>),
      feedComponentIds.length
        ? db
            .select({ id: feedInventoryBalances.feedComponentId, quantityOnHand: feedInventoryBalances.quantityOnHand })
            .from(feedInventoryBalances)
            .where(and(eq(feedInventoryBalances.ranchId, ranchId), eq(feedInventoryBalances.entityType, "COMPONENT"), inArray(feedInventoryBalances.feedComponentId, feedComponentIds)))
        : Promise.resolve([] as Array<{ id: string | null; quantityOnHand: string }>),
      feedBlendIds.length
        ? db
            .select({ id: feedInventoryBalances.feedBlendId, quantityOnHand: feedInventoryBalances.quantityOnHand })
            .from(feedInventoryBalances)
            .where(and(eq(feedInventoryBalances.ranchId, ranchId), eq(feedInventoryBalances.entityType, "BLEND"), inArray(feedInventoryBalances.feedBlendId, feedBlendIds)))
        : Promise.resolve([] as Array<{ id: string | null; quantityOnHand: string }>),
      fuelProductIds.length
        ? db
            .select({ id: fuelInventoryBalances.fuelProductId, unit: fuelInventoryBalances.unit, onHandQuantity: fuelInventoryBalances.onHandQuantity })
            .from(fuelInventoryBalances)
            .where(and(eq(fuelInventoryBalances.ranchId, ranchId), inArray(fuelInventoryBalances.fuelProductId, fuelProductIds)))
        : Promise.resolve([] as Array<{ id: string; unit: string; onHandQuantity: string }>),
      tagNeedCount
        ? db
            .select({
              id: equipmentParts.id,
              defaultUnit: equipmentParts.defaultUnit,
              onHandQuantity: equipmentParts.onHandQuantity,
            })
            .from(equipmentParts)
            .where(
              and(
                eq(equipmentParts.ranchId, ranchId),
                eq(equipmentParts.isActive, true),
                sql`(
                  lower(coalesce(${equipmentParts.name}, '')) like '%tag%'
                  or lower(coalesce(${equipmentParts.partNumber}, '')) like '%tag%'
                  or lower(coalesce(${equipmentParts.description}, '')) like '%tag%'
                )`
              )
            )
        : Promise.resolve([] as Array<{ id: string; defaultUnit: string; onHandQuantity: string }>),
    ]);

  const componentById = new Map(feedComponentsRows.map((row) => [row.id, row]));
  const blendById = new Map(feedBlendRows.map((row) => [row.id, row]));
  const fuelById = new Map(fuelProductRows.map((row) => [row.id, row]));
  const partById = new Map(equipmentPartRows.map((row) => [row.id, row]));
  const medById = new Map(medicationRows.map((row) => [row.id, row]));

  const feedComponentOnHand = new Map<string, number>();
  for (const row of feedComponentBalanceRows) {
    if (!row.id) continue;
    const amount = Number(row.quantityOnHand ?? 0);
    if (!Number.isFinite(amount)) continue;
    feedComponentOnHand.set(row.id, (feedComponentOnHand.get(row.id) ?? 0) + amount);
  }

  const feedBlendOnHand = new Map<string, number>();
  for (const row of feedBlendBalanceRows) {
    if (!row.id) continue;
    const amount = Number(row.quantityOnHand ?? 0);
    if (!Number.isFinite(amount)) continue;
    feedBlendOnHand.set(row.id, (feedBlendOnHand.get(row.id) ?? 0) + amount);
  }

  const fuelOnHandByProduct = new Map<string, { total: number; byUnit: Map<string, number> }>();
  for (const row of fuelBalanceRows) {
    const amount = Number(row.onHandQuantity ?? 0);
    if (!Number.isFinite(amount)) continue;
    const bucket = fuelOnHandByProduct.get(row.id) ?? { total: 0, byUnit: new Map<string, number>() };
    bucket.total += amount;
    const unitKey = String(row.unit ?? "").trim().toLowerCase();
    if (unitKey) bucket.byUnit.set(unitKey, (bucket.byUnit.get(unitKey) ?? 0) + amount);
    fuelOnHandByProduct.set(row.id, bucket);
  }

  let tagOnHandTotal = 0;
  const tagUnitCounts = new Map<string, number>();
  for (const row of tagInventoryRows) {
    const amount = Number(row.onHandQuantity ?? 0);
    if (Number.isFinite(amount)) tagOnHandTotal += amount;
    const normalizedUnit = String(row.defaultUnit ?? "").trim().toLowerCase();
    if (normalizedUnit) tagUnitCounts.set(normalizedUnit, (tagUnitCounts.get(normalizedUnit) ?? 0) + 1);
  }
  const dominantTagUnit =
    [...tagUnitCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    null;
  const hasTagInventoryRows = tagInventoryRows.length > 0;

  const rows = normalizedNeeds.map((need) => {
    const linkedType = need.linkedEntityType;
    const linkedId = need.linkedEntityId;
    const requiredQuantity = toNumeric(need.requiredQuantity);
    const requiredUnit = need.unit?.trim() ? need.unit.trim() : null;
    const fallbackName = need.nameOverride?.trim() ? need.nameOverride.trim() : null;

    let name = fallbackName ?? "Supply need";
    let onHandQuantity: number | null = null;
    let onHandUnit: string | null = requiredUnit;
    let message = "";
    const isTagNeed = !linkedType && !linkedId && isLikelyTagSupplyNeed(need);

    if (linkedType === "FEED_COMPONENT" && linkedId) {
      const info = componentById.get(linkedId);
      name = fallbackName ?? info?.name ?? "Feed component";
      onHandQuantity = feedComponentOnHand.get(linkedId) ?? null;
      onHandUnit = requiredUnit ?? info?.defaultUnit ?? null;
      if (onHandQuantity === null) message = "No feed inventory balance found for this component.";
    } else if (linkedType === "FEED_BLEND" && linkedId) {
      const info = blendById.get(linkedId);
      name = fallbackName ?? info?.name ?? "Feed blend";
      onHandQuantity = feedBlendOnHand.get(linkedId) ?? null;
      onHandUnit = requiredUnit ?? info?.defaultUnit ?? null;
      if (onHandQuantity === null) message = "No feed inventory balance found for this blend.";
    } else if (linkedType === "FUEL_PRODUCT" && linkedId) {
      const info = fuelById.get(linkedId);
      name = fallbackName ?? info?.name ?? "Fuel/Fluid product";
      const bucket = fuelOnHandByProduct.get(linkedId);
      if (!bucket) {
        onHandQuantity = null;
        message = "No fuel inventory balance found for this product.";
      } else if (requiredUnit) {
        onHandQuantity = bucket.byUnit.get(requiredUnit.toLowerCase()) ?? null;
        if (onHandQuantity === null) message = "No fuel inventory balance found in the required unit.";
      } else {
        onHandQuantity = bucket.total;
        onHandUnit = info?.defaultUnit ?? null;
      }
    } else if (linkedType === "EQUIPMENT_PART" && linkedId) {
      const info = partById.get(linkedId);
      name = fallbackName ?? info?.name ?? "Part / Supply";
      onHandQuantity = info ? Number(info.onHandQuantity ?? 0) : null;
      onHandUnit = requiredUnit ?? info?.defaultUnit ?? null;
      if (!info) message = "Linked part not found in active ranch.";
    } else if (linkedType === "MEDICATION_STANDARD" && linkedId) {
      const info = medById.get(linkedId);
      name = fallbackName ?? (info ? `${info.brandName} (${info.chemicalName})` : "Medication standard");
      onHandQuantity = null;
      message = "Medication inventory balance is not tracked in v1.";
    } else if (isTagNeed) {
      name = fallbackName ?? "Tags";
      onHandQuantity = tagOnHandTotal;
      onHandUnit = requiredUnit ?? dominantTagUnit ?? "each";
      message = hasTagInventoryRows
        ? "Tag inventory is based on matching part/supply rows."
        : "No tag inventory rows found; treated as 0 on hand.";
    } else if (!linkedType || !linkedId) {
      name = fallbackName ?? "Unlinked supply";
      onHandQuantity = null;
      message = "Need is not linked to a trackable inventory item.";
    } else {
      name = fallbackName ?? linkedType;
      onHandQuantity = null;
      message = "Inventory not tracked for this linked entity type.";
    }

    let status: SupplyReadinessStatus = "UNKNOWN";
    if (requiredQuantity === null) {
      status = "NO_REQUIRED_QUANTITY";
      if (isTagNeed) {
        const unitLabel = onHandUnit ? ` ${onHandUnit}` : "";
        message = `No required quantity set. Current tag inventory: ${onHandQuantity ?? 0}${unitLabel}.`;
      } else {
        message = "No required quantity set.";
      }
    } else if (onHandQuantity === null) {
      status = "UNKNOWN";
      if (!message) message = "On-hand quantity is unknown.";
    } else if (onHandQuantity >= requiredQuantity) {
      status = "READY";
      message = isTagNeed
        ? "Current tag inventory meets required quantity."
        : "On-hand quantity meets required quantity.";
    } else {
      status = "SHORT";
      message = isTagNeed
        ? "Current tag inventory is below required quantity."
        : "On-hand quantity is below required quantity.";
    }

    return {
      id: need.id,
      planItemId: need.planItemId,
      supplyType: need.supplyType,
      linkedEntityType: linkedType,
      linkedEntityId: linkedId,
      name,
      requiredQuantity: need.requiredQuantity,
      unit: requiredUnit,
      onHandQuantity: onHandQuantity === null ? null : String(onHandQuantity),
      onHandUnit,
      status,
      message,
      notes: need.notes,
    };
  });

  const summary = {
    total: rows.length,
    ready: rows.filter((r) => r.status === "READY").length,
    short: rows.filter((r) => r.status === "SHORT").length,
    unknown: rows.filter((r) => r.status === "UNKNOWN").length,
    noRequiredQuantity: rows.filter((r) => r.status === "NO_REQUIRED_QUANTITY").length,
  };

  return { needs: rows, summary };
}

async function computeEquipmentReadiness(
  ranchId: string,
  planDate: string,
  equipmentNeeds: Array<typeof workingDayPlanItemEquipmentNeeds.$inferSelect>
) {
  const assetIds = Array.from(new Set(equipmentNeeds.map((need) => need.assetId).filter((id): id is string => Boolean(id))));

  const [assetRows, lastRows, nextRows] = await Promise.all([
    assetIds.length
      ? db
          .select({
            id: equipmentAssets.id,
            name: equipmentAssets.name,
            assetType: equipmentAssets.assetType,
            status: equipmentAssets.status,
            trackMaintenance: equipmentAssets.trackMaintenance,
          })
          .from(equipmentAssets)
          .where(and(eq(equipmentAssets.ranchId, ranchId), inArray(equipmentAssets.id, assetIds)))
      : Promise.resolve([] as Array<{ id: string; name: string; assetType: string; status: string; trackMaintenance: boolean }>),
    assetIds.length
      ? db
          .select({ assetId: equipmentMaintenanceEvents.assetId, lastEventDate: sql<string>`max(${equipmentMaintenanceEvents.eventDate})` })
          .from(equipmentMaintenanceEvents)
          .where(and(eq(equipmentMaintenanceEvents.ranchId, ranchId), inArray(equipmentMaintenanceEvents.assetId, assetIds)))
          .groupBy(equipmentMaintenanceEvents.assetId)
      : Promise.resolve([] as Array<{ assetId: string; lastEventDate: string | null }>),
    assetIds.length
      ? db
          .select({ assetId: equipmentMaintenanceEvents.assetId, nextDueDate: sql<string>`min(${equipmentMaintenanceEvents.nextDueDate})` })
          .from(equipmentMaintenanceEvents)
          .where(and(eq(equipmentMaintenanceEvents.ranchId, ranchId), inArray(equipmentMaintenanceEvents.assetId, assetIds), sql`${equipmentMaintenanceEvents.nextDueDate} IS NOT NULL`))
          .groupBy(equipmentMaintenanceEvents.assetId)
      : Promise.resolve([] as Array<{ assetId: string; nextDueDate: string | null }>),
  ]);

  const assetById = new Map(assetRows.map((row) => [row.id, row]));
  const lastByAssetId = new Map(lastRows.map((row) => [row.assetId, row.lastEventDate ?? null]));
  const nextByAssetId = new Map(nextRows.map((row) => [row.assetId, row.nextDueDate ?? null]));

  const rows = equipmentNeeds.map((need) => {
    if (!need.assetId) {
      return {
        id: need.id,
        planItemId: need.planItemId,
        assetId: null,
        assetName: null,
        assetType: null,
        assetStatus: null,
        trackMaintenance: null,
        lastMaintenanceDate: null,
        nextDueDate: null,
        mustBeOperational: need.mustBeOperational,
        status: "UNLINKED" as EquipmentReadinessStatus,
        message: "Not linked to an asset.",
        notes: need.notes,
        assetTypeHint: need.assetTypeHint,
      };
    }

    const asset = assetById.get(need.assetId);
    if (!asset) {
      return {
        id: need.id,
        planItemId: need.planItemId,
        assetId: need.assetId,
        assetName: null,
        assetType: null,
        assetStatus: null,
        trackMaintenance: null,
        lastMaintenanceDate: null,
        nextDueDate: null,
        mustBeOperational: need.mustBeOperational,
        status: "UNKNOWN" as EquipmentReadinessStatus,
        message: "Linked asset not found in active ranch.",
        notes: need.notes,
        assetTypeHint: need.assetTypeHint,
      };
    }

    const lastMaintenanceDate = lastByAssetId.get(asset.id) ?? null;
    const nextDueDate = nextByAssetId.get(asset.id) ?? null;
    const isOverdue = Boolean(nextDueDate && nextDueDate < planDate);

    let status: EquipmentReadinessStatus = "READY";
    let message = "Asset appears ready for the planned date.";
    if (need.mustBeOperational && asset.status !== "ACTIVE") {
      status = "NOT_OPERATIONAL";
      message = `Asset status is ${asset.status}.`;
    } else if (need.mustBeOperational && asset.trackMaintenance && isOverdue) {
      status = "NEEDS_SERVICE";
      message = `Maintenance is overdue as of ${planDate}.`;
    } else if (asset.trackMaintenance && !lastMaintenanceDate && !nextDueDate) {
      status = "UNKNOWN";
      message = "Maintenance tracking is enabled but no maintenance history exists yet.";
    } else if (!need.mustBeOperational && asset.status !== "ACTIVE") {
      status = "READY";
      message = `Asset status is ${asset.status}, but operational readiness is not required for this need.`;
    }

    return {
      id: need.id,
      planItemId: need.planItemId,
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.assetType,
      assetStatus: asset.status,
      trackMaintenance: asset.trackMaintenance,
      lastMaintenanceDate,
      nextDueDate,
      mustBeOperational: need.mustBeOperational,
      status,
      message,
      notes: need.notes,
      assetTypeHint: need.assetTypeHint,
    };
  });

  const summary = {
    total: rows.length,
    ready: rows.filter((r) => r.status === "READY").length,
    blocked: rows.filter((r) => r.status === "NOT_OPERATIONAL" || r.status === "NEEDS_SERVICE").length,
    unknown: rows.filter((r) => r.status === "UNKNOWN").length,
    unlinked: rows.filter((r) => r.status === "UNLINKED").length,
  };

  return { needs: rows, summary };
}

async function loadPlanResponse(ranchId: string, planDate: string, includeTaskCatalog = true) {
  const plan = await getPlanByDate(ranchId, planDate);
  const taskCatalog = includeTaskCatalog ? await listTaskCatalog() : [];

  if (!plan) {
    return {
      plan: null,
      planDate,
      items: [],
      readiness: {
        supplies: { needs: [], summary: { total: 0, ready: 0, short: 0, unknown: 0, noRequiredQuantity: 0 } },
        equipment: { needs: [], summary: { total: 0, ready: 0, blocked: 0, unknown: 0, unlinked: 0 } },
      },
      taskCatalog,
    };
  }

  const itemRows = await db
    .select()
    .from(workingDayPlanItems)
    .where(eq(workingDayPlanItems.planId, plan.id))
    .orderBy(asc(workingDayPlanItems.sortOrder), asc(workingDayPlanItems.createdAt));
  const itemIds = itemRows.map((row) => row.id);

  const [supplyNeeds, equipmentNeeds] = await Promise.all([
    itemIds.length
      ? db.select().from(workingDayPlanItemSupplyNeeds).where(inArray(workingDayPlanItemSupplyNeeds.planItemId, itemIds)).orderBy(asc(workingDayPlanItemSupplyNeeds.createdAt))
      : Promise.resolve([] as Array<typeof workingDayPlanItemSupplyNeeds.$inferSelect>),
    itemIds.length
      ? db.select().from(workingDayPlanItemEquipmentNeeds).where(inArray(workingDayPlanItemEquipmentNeeds.planItemId, itemIds)).orderBy(asc(workingDayPlanItemEquipmentNeeds.createdAt))
      : Promise.resolve([] as Array<typeof workingDayPlanItemEquipmentNeeds.$inferSelect>),
  ]);

  const herdIds = Array.from(new Set(itemRows.map((row) => row.herdId).filter((id): id is string => Boolean(id))));
  const animalIds = Array.from(new Set(itemRows.map((row) => row.animalId).filter((id): id is string => Boolean(id))));
  const [herdRows, animalRows] = await Promise.all([
    herdIds.length
      ? db.select({ id: herds.id, name: herds.name }).from(herds).where(and(eq(herds.ranchId, ranchId), inArray(herds.id, herdIds)))
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    animalIds.length
      ? db.select({ id: animals.id, species: animals.species, breed: animals.breed, tag: animals.tag }).from(animals).where(inArray(animals.id, animalIds))
      : Promise.resolve([] as Array<{ id: string; species: string | null; breed: string | null; tag: string | null }>),
  ]);

  const herdNameById = new Map(herdRows.map((row) => [row.id, row.name]));
  const animalLabelById = new Map(
    animalRows.map((row) => {
      const parts = [row.tag, row.species, row.breed].filter((part) => part && String(part).trim().length > 0);
      return [row.id, parts.length ? parts.join(" • ") : row.id] as const;
    })
  );

  const supplyNeedsByItemId = new Map<string, Array<typeof workingDayPlanItemSupplyNeeds.$inferSelect>>();
  for (const need of supplyNeeds) {
    const existing = supplyNeedsByItemId.get(need.planItemId) ?? [];
    existing.push(need);
    supplyNeedsByItemId.set(need.planItemId, existing);
  }

  const equipmentNeedsByItemId = new Map<string, Array<typeof workingDayPlanItemEquipmentNeeds.$inferSelect>>();
  for (const need of equipmentNeeds) {
    const existing = equipmentNeedsByItemId.get(need.planItemId) ?? [];
    existing.push(need);
    equipmentNeedsByItemId.set(need.planItemId, existing);
  }

  const readiness = {
    supplies: await computeSupplyReadiness(ranchId, supplyNeeds),
    equipment: await computeEquipmentReadiness(ranchId, planDate, equipmentNeeds),
  };

  const items = itemRows.map((item) => ({
    ...item,
    herdName: item.herdId ? herdNameById.get(item.herdId) ?? null : null,
    animalLabel: item.animalId ? animalLabelById.get(item.animalId) ?? null : null,
    supplyNeeds: supplyNeedsByItemId.get(item.id) ?? [],
    equipmentNeeds: equipmentNeedsByItemId.get(item.id) ?? [],
  }));

  return { plan, planDate, items, readiness, taskCatalog };
}

const RanchScopedSchema = z.object({ ranchId: z.string().uuid().optional().nullable() });
const PlanIdParamSchema = z.object({ planId: z.string().uuid() });
const ItemIdParamSchema = z.object({ itemId: z.string().uuid() });
const UuidParamSchema = z.object({ id: z.string().uuid() });

const PlanQuerySchema = RanchScopedSchema.extend({
  date: z.string().optional().nullable(),
  includeTaskCatalog: z.union([z.boolean(), z.string()]).optional().nullable(),
});

const PlanInventoryQuerySchema = RanchScopedSchema.extend({
  startDate: z.string().optional().nullable(),
  periodDays: z.union([z.string(), z.number()]).optional().nullable(),
});

const PlanCreateBodySchema = z.object({
  ranchId: z.string().uuid().optional().nullable(),
  date: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const PlanItemCreateBodySchema = z.object({
  category: z.string().optional().nullable(),
  taskType: z.string().min(1),
  title: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  herdId: z.string().uuid().optional().nullable(),
  animalId: z.string().uuid().optional().nullable(),
  locationText: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  sortOrder: z.union([z.string(), z.number()]).optional().nullable(),
  applySuggestedNeeds: z.union([z.boolean(), z.string()]).optional().nullable(),
});

const PlanItemUpdateBodySchema = z.object({
  category: z.string().optional().nullable(),
  taskType: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  herdId: z.string().uuid().optional().nullable(),
  animalId: z.string().uuid().optional().nullable(),
  locationText: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  sortOrder: z.union([z.string(), z.number()]).optional().nullable(),
});

const SupplyNeedCreateBodySchema = z.object({
  supplyType: z.string().optional().nullable(),
  linkedEntityType: z.string().optional().nullable(),
  linkedEntityId: z.string().uuid().optional().nullable(),
  nameOverride: z.string().optional().nullable(),
  requiredQuantity: z.union([z.string(), z.number()]).optional().nullable(),
  unit: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const SupplyNeedUpdateBodySchema = SupplyNeedCreateBodySchema.partial();

const EquipmentNeedCreateBodySchema = z.object({
  assetId: z.string().uuid().optional().nullable(),
  assetTypeHint: z.string().optional().nullable(),
  mustBeOperational: z.union([z.boolean(), z.string()]).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const EquipmentNeedUpdateBodySchema = EquipmentNeedCreateBodySchema.partial();

export async function workingDayRoutes(app: FastifyInstance) {
  app.get("/working-day/task-catalog", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const query = RanchScopedSchema.parse(req.query ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId, query.ranchId ?? null);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      return reply.send({ tasks: await listTaskCatalog() });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to list working day task catalog", "Failed to list working day task catalog");
    }
  });

  app.get("/working-day/plan", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const query = PlanQuerySchema.parse(req.query ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId, query.ranchId ?? null);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      const planDate = parseIsoDateOrNull(query.date, "date") ?? tomorrowIsoDate();
      const includeTaskCatalog = toBooleanLike(query.includeTaskCatalog, true);
      return reply.send(await loadPlanResponse(ranchId, planDate, includeTaskCatalog));
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to load working day plan", "Failed to load working day plan");
    }
  });

  app.get("/working-day/plan-inventory", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const query = PlanInventoryQuerySchema.parse(req.query ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId, query.ranchId ?? null);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const startDate = parseIsoDateOrNull(query.startDate, "startDate") ?? todayIsoDate();
      const periodDays = parsePeriodDays(query.periodDays);
      const endDate = addDaysToIsoDate(startDate, periodDays - 1);

      const plans = await db
        .select({
          id: workingDayPlans.id,
          planDate: workingDayPlans.planDate,
          title: workingDayPlans.title,
          notes: workingDayPlans.notes,
          updatedAt: workingDayPlans.updatedAt,
        })
        .from(workingDayPlans)
        .where(and(eq(workingDayPlans.ranchId, ranchId), gte(workingDayPlans.planDate, startDate), lte(workingDayPlans.planDate, endDate)))
        .orderBy(asc(workingDayPlans.planDate));

      const planIds = plans.map((plan) => plan.id);
      const itemRows = planIds.length
        ? await db
            .select({
              planId: workingDayPlanItems.planId,
              category: workingDayPlanItems.category,
              status: workingDayPlanItems.status,
            })
            .from(workingDayPlanItems)
            .where(inArray(workingDayPlanItems.planId, planIds))
        : [];

      const perPlanCounts = new Map<
        string,
        {
          totalItems: number;
          statusSummary: { planned: number; inProgress: number; done: number; skipped: number };
          categorySummary: { herdWork: number; animalWork: number; ranchWork: number };
        }
      >();

      for (const planId of planIds) {
        perPlanCounts.set(planId, {
          totalItems: 0,
          statusSummary: { planned: 0, inProgress: 0, done: 0, skipped: 0 },
          categorySummary: { herdWork: 0, animalWork: 0, ranchWork: 0 },
        });
      }

      for (const row of itemRows) {
        const bucket = perPlanCounts.get(row.planId);
        if (!bucket) continue;
        bucket.totalItems += 1;

        const normalizedStatus = String(row.status ?? "").toUpperCase();
        if (normalizedStatus === "PLANNED") bucket.statusSummary.planned += 1;
        else if (normalizedStatus === "IN_PROGRESS") bucket.statusSummary.inProgress += 1;
        else if (normalizedStatus === "DONE") bucket.statusSummary.done += 1;
        else if (normalizedStatus === "SKIPPED") bucket.statusSummary.skipped += 1;

        const normalizedCategory = String(row.category ?? "").toUpperCase();
        if (normalizedCategory === "HERD_WORK") bucket.categorySummary.herdWork += 1;
        else if (normalizedCategory === "ANIMAL_WORK") bucket.categorySummary.animalWork += 1;
        else if (normalizedCategory === "RANCH_WORK") bucket.categorySummary.ranchWork += 1;
      }

      const planSummaries = plans.map((plan) => {
        const counts = perPlanCounts.get(plan.id) ?? {
          totalItems: 0,
          statusSummary: { planned: 0, inProgress: 0, done: 0, skipped: 0 },
          categorySummary: { herdWork: 0, animalWork: 0, ranchWork: 0 },
        };
        return {
          ...plan,
          ...counts,
        };
      });

      const summary = {
        planCount: planSummaries.length,
        totalItems: planSummaries.reduce((acc, row) => acc + row.totalItems, 0),
        statusSummary: {
          planned: planSummaries.reduce((acc, row) => acc + row.statusSummary.planned, 0),
          inProgress: planSummaries.reduce((acc, row) => acc + row.statusSummary.inProgress, 0),
          done: planSummaries.reduce((acc, row) => acc + row.statusSummary.done, 0),
          skipped: planSummaries.reduce((acc, row) => acc + row.statusSummary.skipped, 0),
        },
        categorySummary: {
          herdWork: planSummaries.reduce((acc, row) => acc + row.categorySummary.herdWork, 0),
          animalWork: planSummaries.reduce((acc, row) => acc + row.categorySummary.animalWork, 0),
          ranchWork: planSummaries.reduce((acc, row) => acc + row.categorySummary.ranchWork, 0),
        },
      };

      return reply.send({
        startDate,
        endDate,
        periodDays,
        plans: planSummaries,
        summary,
      });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to load working day plan inventory", "Failed to load working day plan inventory");
    }
  });

  app.post("/working-day/plan", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const body = PlanCreateBodySchema.parse(req.body ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId, body.ranchId ?? null);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      const planDate = parseIsoDateOrNull(body.date, "date") ?? tomorrowIsoDate();
      const existing = await getPlanByDate(ranchId, planDate);
      if (existing) return reply.send({ created: false, plan: existing });

      const now = new Date();
      const planId = crypto.randomUUID();
      await db.insert(workingDayPlans).values({
        id: planId,
        ranchId,
        planDate,
        title: body.title?.trim() ? body.title.trim() : "Working Day Plan",
        notes: body.notes?.trim() ? body.notes.trim() : null,
        createdAt: now,
        updatedAt: now,
      });
      const rows = await db.select().from(workingDayPlans).where(and(eq(workingDayPlans.id, planId), eq(workingDayPlans.ranchId, ranchId))).limit(1);
      return reply.status(201).send({ created: true, plan: rows[0] ?? null });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to create working day plan", "Failed to create working day plan");
    }
  });

  app.post("/working-day/plan/:planId/items", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { planId } = PlanIdParamSchema.parse(req.params ?? {});
      const body = PlanItemCreateBodySchema.parse(req.body ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      await ensurePlanScope(ranchId, planId);
      const taskType = body.taskType.trim().toUpperCase();
      const task = await getTaskByType(taskType);
      if (!task) return reply.status(400).send({ error: "Unknown or inactive taskType." });

      const categoryFromTask = task.category as WorkingDayCategory;
      const category = body.category ? normalizeEnum(body.category, PLAN_CATEGORIES) : categoryFromTask;
      if (!category) return reply.status(400).send({ error: "Invalid category." });
      if (category !== categoryFromTask) return reply.status(400).send({ error: "category does not match taskType catalog category." });

      const status = normalizeEnum(body.status, PLAN_ITEM_STATUSES) ?? "PLANNED";
      const startTime = parseTimeOrNull(body.startTime, "startTime");
      const endTime = parseTimeOrNull(body.endTime, "endTime");
      if (startTime && endTime && startTime > endTime) return reply.status(400).send({ error: "endTime must be equal to or after startTime." });

      const herdId = body.herdId ?? null;
      const animalId = body.animalId ?? null;
      if (herdId) await ensureHerdInRanch(ranchId, herdId);
      if (animalId) await ensureAnimalInRanch(ranchId, animalId);

      let sortOrder = toNullableInteger(body.sortOrder, { allowZero: true, allowNegative: false, fieldLabel: "sortOrder" });
      if (sortOrder === null) {
        const maxRows = await db.select({ maxSortOrder: sql<string>`max(${workingDayPlanItems.sortOrder})` }).from(workingDayPlanItems).where(eq(workingDayPlanItems.planId, planId));
        sortOrder = Number(maxRows[0]?.maxSortOrder ?? 0) + 10;
      }

      const title = body.title?.trim() ? body.title.trim() : task.label?.trim() || labelFromTaskType(taskType);
      const now = new Date();
      const itemId = crypto.randomUUID();

      await db.transaction(async (tx) => {
        await tx.insert(workingDayPlanItems).values({
          id: itemId,
          planId,
          category,
          taskType,
          title,
          status,
          startTime,
          endTime,
          herdId,
          animalId,
          locationText: body.locationText?.trim() ? body.locationText.trim() : null,
          notes: body.notes?.trim() ? body.notes.trim() : null,
          sortOrder,
          createdAt: now,
          updatedAt: now,
        });

        const applySuggestedNeeds = toBooleanLike(body.applySuggestedNeeds, true);
        if (!applySuggestedNeeds) return;

        const suggestedSupplyNeeds = Array.isArray(task.suggestedSupplyNeedsJson) ? task.suggestedSupplyNeedsJson : [];
        const suggestedEquipmentNeeds = Array.isArray(task.suggestedEquipmentNeedsJson) ? task.suggestedEquipmentNeedsJson : [];

        for (const rawNeed of suggestedSupplyNeeds) {
          const entry = rawNeed as Record<string, unknown>;
          const supplyType = normalizeEnum(entry.supplyType, SUPPLY_TYPES) ?? "OTHER";
          const nameOverride = typeof entry.name === "string" && entry.name.trim().length > 0 ? entry.name.trim() : null;
          const linkedEntityType =
            typeof entry.linkedEntityType === "string" && entry.linkedEntityType.trim().length > 0
              ? entry.linkedEntityType.trim().toUpperCase()
              : null;
          const linkedEntityId = typeof entry.linkedEntityId === "string" && entry.linkedEntityId.trim().length > 0 ? entry.linkedEntityId : null;
          if (!linkedEntityId && !nameOverride) continue;
          let requiredQuantity = toNullableDecimalString(entry.requiredQuantity, {
            allowZero: true,
            allowNegative: false,
            fieldLabel: "requiredQuantity",
          });
          let unit = typeof entry.unit === "string" && entry.unit.trim().length > 0 ? entry.unit.trim() : null;

          // Tag / ID work for a selected animal should assume one tag is required by default.
          if (
            taskType === "TAG_ID" &&
            Boolean(animalId) &&
            requiredQuantity === null &&
            isLikelyTagSupplyNeed({ supplyType, linkedEntityType, nameOverride })
          ) {
            requiredQuantity = "1";
            if (!unit) unit = "each";
          }

          await tx.insert(workingDayPlanItemSupplyNeeds).values({
            id: crypto.randomUUID(),
            planItemId: itemId,
            supplyType,
            linkedEntityType,
            linkedEntityId,
            nameOverride,
            requiredQuantity,
            unit,
            notes: typeof entry.notes === "string" && entry.notes.trim().length > 0 ? entry.notes.trim() : null,
            createdAt: now,
            updatedAt: now,
          });
        }

        for (const rawNeed of suggestedEquipmentNeeds) {
          const entry = rawNeed as Record<string, unknown>;
          const assetTypeHint = typeof entry.assetTypeHint === "string" && entry.assetTypeHint.trim().length > 0 ? entry.assetTypeHint.trim() : null;
          const assetId = typeof entry.assetId === "string" && entry.assetId.trim().length > 0 ? entry.assetId : null;
          if (!assetId && !assetTypeHint) continue;
          await tx.insert(workingDayPlanItemEquipmentNeeds).values({
            id: crypto.randomUUID(),
            planItemId: itemId,
            assetId,
            assetTypeHint,
            mustBeOperational: toBooleanLike(entry.mustBeOperational, true),
            notes: typeof entry.notes === "string" && entry.notes.trim().length > 0 ? entry.notes.trim() : null,
            createdAt: now,
            updatedAt: now,
          });
        }
      });

      const rows = await db.select().from(workingDayPlanItems).where(eq(workingDayPlanItems.id, itemId)).limit(1);
      return reply.status(201).send({ item: rows[0] ?? null });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to create working day plan item", "Failed to create working day plan item");
    }
  });

  app.put("/working-day/items/:itemId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { itemId } = ItemIdParamSchema.parse(req.params ?? {});
      const body = PlanItemUpdateBodySchema.parse(req.body ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const existing = await ensureItemScope(ranchId, itemId);
      const updateSet: Record<string, any> = { updatedAt: new Date() };
      let taskType = existing.taskType;
      let category = existing.category;

      if (body.taskType !== undefined && body.taskType !== null) {
        const task = await getTaskByType(body.taskType.trim().toUpperCase());
        if (!task) return reply.status(400).send({ error: "Unknown or inactive taskType." });
        taskType = task.taskType;
        category = task.category;
        updateSet.taskType = taskType;
        if (body.category === undefined || body.category === null) updateSet.category = category;
      }

      if (body.category !== undefined) {
        const nextCategory = normalizeEnum(body.category, PLAN_CATEGORIES);
        if (!nextCategory) return reply.status(400).send({ error: "Invalid category." });
        category = nextCategory;
        updateSet.category = category;
      }

      if (body.title !== undefined) updateSet.title = body.title?.trim() ? body.title.trim() : labelFromTaskType(taskType);
      if (body.status !== undefined) updateSet.status = normalizeEnum(body.status, PLAN_ITEM_STATUSES) ?? "PLANNED";
      if (body.startTime !== undefined) updateSet.startTime = parseTimeOrNull(body.startTime, "startTime");
      if (body.endTime !== undefined) updateSet.endTime = parseTimeOrNull(body.endTime, "endTime");

      const startTime = updateSet.startTime ?? existing.startTime;
      const endTime = updateSet.endTime ?? existing.endTime;
      if (startTime && endTime && startTime > endTime) return reply.status(400).send({ error: "endTime must be equal to or after startTime." });

      if (body.herdId !== undefined) {
        updateSet.herdId = body.herdId ?? null;
        if (body.herdId) await ensureHerdInRanch(ranchId, body.herdId);
      }
      if (body.animalId !== undefined) {
        updateSet.animalId = body.animalId ?? null;
        if (body.animalId) await ensureAnimalInRanch(ranchId, body.animalId);
      }
      if (body.locationText !== undefined) updateSet.locationText = body.locationText?.trim() ? body.locationText.trim() : null;
      if (body.notes !== undefined) updateSet.notes = body.notes?.trim() ? body.notes.trim() : null;
      if (body.sortOrder !== undefined) updateSet.sortOrder = toNullableInteger(body.sortOrder, { allowZero: true, allowNegative: false, fieldLabel: "sortOrder" });

      await db.update(workingDayPlanItems).set(updateSet).where(eq(workingDayPlanItems.id, itemId));
      const rows = await db.select().from(workingDayPlanItems).where(eq(workingDayPlanItems.id, itemId)).limit(1);
      return reply.send({ item: rows[0] ?? null });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to update working day plan item", "Failed to update working day plan item");
    }
  });

  app.delete("/working-day/items/:itemId", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { itemId } = ItemIdParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      await ensureItemScope(ranchId, itemId);

      await db.transaction(async (tx) => {
        await tx.delete(workingDayPlanItemSupplyNeeds).where(eq(workingDayPlanItemSupplyNeeds.planItemId, itemId));
        await tx.delete(workingDayPlanItemEquipmentNeeds).where(eq(workingDayPlanItemEquipmentNeeds.planItemId, itemId));
        await tx.delete(workingDayPlanItems).where(eq(workingDayPlanItems.id, itemId));
      });

      return reply.send({ deleted: { itemId } });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to delete working day plan item", "Failed to delete working day plan item");
    }
  });

  app.post("/working-day/items/:itemId/supply-needs", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { itemId } = ItemIdParamSchema.parse(req.params ?? {});
      const body = SupplyNeedCreateBodySchema.parse(req.body ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      await ensureItemScope(ranchId, itemId);

      const supplyType = normalizeEnum(body.supplyType, SUPPLY_TYPES) ?? "OTHER";
      const linkedEntityType = body.linkedEntityType?.trim() ? body.linkedEntityType.trim().toUpperCase() : null;
      const linkedEntityId = body.linkedEntityId ?? null;
      const nameOverride = body.nameOverride?.trim() ? body.nameOverride.trim() : null;
      if (!linkedEntityId && !nameOverride) return reply.status(400).send({ error: "Supply need requires linkedEntityId or nameOverride." });

      const now = new Date();
      const id = crypto.randomUUID();
      await db.insert(workingDayPlanItemSupplyNeeds).values({
        id,
        planItemId: itemId,
        supplyType,
        linkedEntityType,
        linkedEntityId,
        nameOverride,
        requiredQuantity: toNullableDecimalString(body.requiredQuantity, { allowZero: true, allowNegative: false, fieldLabel: "requiredQuantity" }),
        unit: body.unit?.trim() ? body.unit.trim() : null,
        notes: body.notes?.trim() ? body.notes.trim() : null,
        createdAt: now,
        updatedAt: now,
      });

      const rows = await db.select().from(workingDayPlanItemSupplyNeeds).where(eq(workingDayPlanItemSupplyNeeds.id, id)).limit(1);
      return reply.status(201).send({ supplyNeed: rows[0] ?? null });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to create supply need", "Failed to create supply need");
    }
  });

  app.put("/working-day/supply-needs/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id } = UuidParamSchema.parse(req.params ?? {});
      const body = SupplyNeedUpdateBodySchema.parse(req.body ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      const existing = await ensureSupplyNeedScope(ranchId, id);

      const updateSet: Record<string, any> = { updatedAt: new Date() };
      if (body.supplyType !== undefined) updateSet.supplyType = normalizeEnum(body.supplyType, SUPPLY_TYPES) ?? "OTHER";
      if (body.linkedEntityType !== undefined) updateSet.linkedEntityType = body.linkedEntityType?.trim() ? body.linkedEntityType.trim().toUpperCase() : null;
      if (body.linkedEntityId !== undefined) updateSet.linkedEntityId = body.linkedEntityId ?? null;
      if (body.nameOverride !== undefined) updateSet.nameOverride = body.nameOverride?.trim() ? body.nameOverride.trim() : null;
      if (body.requiredQuantity !== undefined) updateSet.requiredQuantity = toNullableDecimalString(body.requiredQuantity, { allowZero: true, allowNegative: false, fieldLabel: "requiredQuantity" });
      if (body.unit !== undefined) updateSet.unit = body.unit?.trim() ? body.unit.trim() : null;
      if (body.notes !== undefined) updateSet.notes = body.notes?.trim() ? body.notes.trim() : null;

      const nextLinkedEntityId = updateSet.linkedEntityId !== undefined ? updateSet.linkedEntityId : existing.linkedEntityId;
      const nextNameOverride = updateSet.nameOverride !== undefined ? updateSet.nameOverride : existing.nameOverride;
      if (!nextLinkedEntityId && !(typeof nextNameOverride === "string" && nextNameOverride.trim().length > 0)) {
        return reply.status(400).send({ error: "Supply need requires linkedEntityId or nameOverride." });
      }

      await db.update(workingDayPlanItemSupplyNeeds).set(updateSet).where(eq(workingDayPlanItemSupplyNeeds.id, id));
      const rows = await db.select().from(workingDayPlanItemSupplyNeeds).where(eq(workingDayPlanItemSupplyNeeds.id, id)).limit(1);
      return reply.send({ supplyNeed: rows[0] ?? null });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to update supply need", "Failed to update supply need");
    }
  });

  app.delete("/working-day/supply-needs/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      await ensureSupplyNeedScope(ranchId, id);
      await db.delete(workingDayPlanItemSupplyNeeds).where(eq(workingDayPlanItemSupplyNeeds.id, id));
      return reply.send({ deleted: { id } });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to delete supply need", "Failed to delete supply need");
    }
  });

  app.post("/working-day/items/:itemId/equipment-needs", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { itemId } = ItemIdParamSchema.parse(req.params ?? {});
      const body = EquipmentNeedCreateBodySchema.parse(req.body ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      await ensureItemScope(ranchId, itemId);

      const assetId = body.assetId ?? null;
      const assetTypeHint = body.assetTypeHint?.trim() ? body.assetTypeHint.trim() : null;
      if (!assetId && !assetTypeHint) return reply.status(400).send({ error: "Equipment need requires assetId or assetTypeHint." });
      if (assetId) {
        const assetRows = await db.select({ id: equipmentAssets.id }).from(equipmentAssets).where(and(eq(equipmentAssets.ranchId, ranchId), eq(equipmentAssets.id, assetId))).limit(1);
        if (!assetRows.length) return reply.status(400).send({ error: "assetId is not in the active ranch." });
      }

      const id = crypto.randomUUID();
      const now = new Date();
      await db.insert(workingDayPlanItemEquipmentNeeds).values({
        id,
        planItemId: itemId,
        assetId,
        assetTypeHint,
        mustBeOperational: toBooleanLike(body.mustBeOperational, true),
        notes: body.notes?.trim() ? body.notes.trim() : null,
        createdAt: now,
        updatedAt: now,
      });

      const rows = await db.select().from(workingDayPlanItemEquipmentNeeds).where(eq(workingDayPlanItemEquipmentNeeds.id, id)).limit(1);
      return reply.status(201).send({ equipmentNeed: rows[0] ?? null });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to create equipment need", "Failed to create equipment need");
    }
  });

  app.put("/working-day/equipment-needs/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id } = UuidParamSchema.parse(req.params ?? {});
      const body = EquipmentNeedUpdateBodySchema.parse(req.body ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      const existing = await ensureEquipmentNeedScope(ranchId, id);

      const updateSet: Record<string, any> = { updatedAt: new Date() };
      if (body.assetId !== undefined) {
        updateSet.assetId = body.assetId ?? null;
        if (body.assetId) {
          const assetRows = await db.select({ id: equipmentAssets.id }).from(equipmentAssets).where(and(eq(equipmentAssets.ranchId, ranchId), eq(equipmentAssets.id, body.assetId))).limit(1);
          if (!assetRows.length) return reply.status(400).send({ error: "assetId is not in the active ranch." });
        }
      }
      if (body.assetTypeHint !== undefined) updateSet.assetTypeHint = body.assetTypeHint?.trim() ? body.assetTypeHint.trim() : null;
      if (body.mustBeOperational !== undefined) updateSet.mustBeOperational = toBooleanLike(body.mustBeOperational, true);
      if (body.notes !== undefined) updateSet.notes = body.notes?.trim() ? body.notes.trim() : null;

      const nextAssetId = updateSet.assetId !== undefined ? updateSet.assetId : existing.assetId;
      const nextAssetTypeHint = updateSet.assetTypeHint !== undefined ? updateSet.assetTypeHint : existing.assetTypeHint;
      if (!nextAssetId && !(typeof nextAssetTypeHint === "string" && nextAssetTypeHint.trim().length > 0)) {
        return reply.status(400).send({ error: "Equipment need requires assetId or assetTypeHint." });
      }

      await db.update(workingDayPlanItemEquipmentNeeds).set(updateSet).where(eq(workingDayPlanItemEquipmentNeeds.id, id));
      const rows = await db.select().from(workingDayPlanItemEquipmentNeeds).where(eq(workingDayPlanItemEquipmentNeeds.id, id)).limit(1);
      return reply.send({ equipmentNeed: rows[0] ?? null });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to update equipment need", "Failed to update equipment need");
    }
  });

  app.delete("/working-day/equipment-needs/:id", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { id } = UuidParamSchema.parse(req.params ?? {});
      const ranchId = await resolveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });
      await ensureEquipmentNeedScope(ranchId, id);
      await db.delete(workingDayPlanItemEquipmentNeeds).where(eq(workingDayPlanItemEquipmentNeeds.id, id));
      return reply.send({ deleted: { id } });
    } catch (err) {
      return withErrorHandling(req, reply, err, "Failed to delete equipment need", "Failed to delete equipment need");
    }
  });

  app.get("/working-day/today", { preHandler: requireAuth }, async (_req, reply) => {
    return reply.send({ today: todayIsoDate(), tomorrow: tomorrowIsoDate() });
  });
}
