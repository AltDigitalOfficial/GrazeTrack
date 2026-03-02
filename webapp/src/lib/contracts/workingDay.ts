import { z } from "zod";

const NumericLikeSchema = z.union([z.string(), z.number()]);

export const WorkingDayPlanCategorySchema = z.enum(["HERD_WORK", "ANIMAL_WORK", "RANCH_WORK"]);
export const WorkingDayPlanItemStatusSchema = z.enum(["PLANNED", "IN_PROGRESS", "DONE", "SKIPPED"]);
export const WorkingDaySupplyTypeSchema = z.enum(["MEDICATION", "FEED", "ADDITIVE", "FUEL_FLUID", "PART_SUPPLY", "OTHER"]);
export const WorkingDaySupplyReadinessStatusSchema = z.enum(["READY", "SHORT", "UNKNOWN", "NO_REQUIRED_QUANTITY"]);
export const WorkingDayEquipmentReadinessStatusSchema = z.enum([
  "READY",
  "NOT_OPERATIONAL",
  "NEEDS_SERVICE",
  "UNKNOWN",
  "UNLINKED",
]);

export const WorkingDayTaskCatalogItemSchema = z.object({
  id: z.string().uuid(),
  category: z.union([WorkingDayPlanCategorySchema, z.string()]),
  taskType: z.string(),
  label: z.string(),
  suggestedSupplyNeeds: z.array(z.unknown()).optional().default([]),
  suggestedEquipmentNeeds: z.array(z.unknown()).optional().default([]),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export const WorkingDaySupplyOptionPartSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.string(),
  description: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  partNumber: z.string().nullable().optional(),
  defaultUnit: z.string(),
  onHandQuantity: NumericLikeSchema,
  isActive: z.boolean(),
});

export const WorkingDaySupplyOptionsPartsResponseSchema = z.object({
  parts: z.array(WorkingDaySupplyOptionPartSchema),
});

export const WorkingDaySupplyOptionMedicationSchema = z.object({
  standardId: z.string().uuid(),
  standardMedicationId: z.string().uuid(),
  displayName: z.string(),
  purpose: z.string().nullable().optional(),
  dosingBasis: z.string().nullable().optional(),
  doseValue: NumericLikeSchema.nullable().optional(),
  doseUnit: z.string().nullable().optional(),
  doseWeightUnit: z.string().nullable().optional(),
  species: z.string().nullable().optional(),
  applicableSpecies: z.array(z.string()).nullable().optional(),
  onHandQuantity: NumericLikeSchema.nullable().optional(),
  onHandUnit: z.string().nullable().optional(),
});

export const WorkingDaySupplyOptionsMedicationsResponseSchema = z.object({
  medications: z.array(WorkingDaySupplyOptionMedicationSchema),
});

export const WorkingDayMedicationEstimateSchema = z.object({
  itemId: z.string().uuid(),
  standardId: z.string().uuid(),
  medicationDisplayName: z.string(),
  dosingBasis: z.string().nullable().optional(),
  doseValue: NumericLikeSchema.nullable().optional(),
  doseUnit: z.string().nullable().optional(),
  doseWeightUnit: z.string().nullable().optional(),
  animalCount: z.number(),
  measuredWeightCount: z.number(),
  missingWeightCount: z.number(),
  fallbackAverageWeight: NumericLikeSchema.nullable().optional(),
  fallbackWeightUnit: z.string().nullable().optional(),
  totalWeightInDoseWeightUnit: NumericLikeSchema.nullable().optional(),
  measuredOnlyEstimatedQuantity: NumericLikeSchema.nullable().optional(),
  estimatedRequiredQuantity: NumericLikeSchema.nullable().optional(),
  estimatedUnit: z.string().nullable().optional(),
  requiresFallbackForFullEstimate: z.boolean(),
  hasMissingWeights: z.boolean(),
  growthBufferMultiplier: NumericLikeSchema,
  message: z.string(),
});

export const WorkingDayMedicationEstimateResponseSchema = z.object({
  estimate: WorkingDayMedicationEstimateSchema,
});

export const WorkingDayPlanSchema = z.object({
  id: z.string().uuid(),
  ranchId: z.string().uuid(),
  planDate: z.string(),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const WorkingDayPlanItemSupplyNeedSchema = z.object({
  id: z.string().uuid(),
  planItemId: z.string().uuid(),
  supplyType: z.union([WorkingDaySupplyTypeSchema, z.string()]),
  linkedEntityType: z.string().nullable().optional(),
  linkedEntityId: z.string().uuid().nullable().optional(),
  nameOverride: z.string().nullable().optional(),
  requiredQuantity: NumericLikeSchema.nullable().optional(),
  unit: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const WorkingDayPlanItemEquipmentNeedSchema = z.object({
  id: z.string().uuid(),
  planItemId: z.string().uuid(),
  assetId: z.string().uuid().nullable().optional(),
  assetTypeHint: z.string().nullable().optional(),
  mustBeOperational: z.boolean(),
  notes: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const WorkingDayPlanItemSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  category: z.union([WorkingDayPlanCategorySchema, z.string()]),
  taskType: z.string(),
  title: z.string(),
  status: z.union([WorkingDayPlanItemStatusSchema, z.string()]),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  herdId: z.string().uuid().nullable().optional(),
  animalId: z.string().uuid().nullable().optional(),
  locationText: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  herdName: z.string().nullable().optional(),
  animalLabel: z.string().nullable().optional(),
  supplyNeeds: z.array(WorkingDayPlanItemSupplyNeedSchema).optional().default([]),
  equipmentNeeds: z.array(WorkingDayPlanItemEquipmentNeedSchema).optional().default([]),
});

export const WorkingDaySupplyReadinessNeedSchema = z.object({
  id: z.string().uuid(),
  planItemId: z.string().uuid(),
  supplyType: z.union([WorkingDaySupplyTypeSchema, z.string()]),
  linkedEntityType: z.string().nullable().optional(),
  linkedEntityId: z.string().uuid().nullable().optional(),
  name: z.string(),
  requiredQuantity: NumericLikeSchema.nullable().optional(),
  unit: z.string().nullable().optional(),
  onHandQuantity: NumericLikeSchema.nullable().optional(),
  onHandUnit: z.string().nullable().optional(),
  status: z.union([WorkingDaySupplyReadinessStatusSchema, z.string()]),
  message: z.string(),
  notes: z.string().nullable().optional(),
});

export const WorkingDayEquipmentReadinessNeedSchema = z.object({
  id: z.string().uuid(),
  planItemId: z.string().uuid(),
  assetId: z.string().uuid().nullable().optional(),
  assetName: z.string().nullable().optional(),
  assetType: z.string().nullable().optional(),
  assetStatus: z.string().nullable().optional(),
  trackMaintenance: z.boolean().nullable().optional(),
  lastMaintenanceDate: z.string().nullable().optional(),
  nextDueDate: z.string().nullable().optional(),
  mustBeOperational: z.boolean(),
  status: z.union([WorkingDayEquipmentReadinessStatusSchema, z.string()]),
  message: z.string(),
  notes: z.string().nullable().optional(),
  assetTypeHint: z.string().nullable().optional(),
});

export const WorkingDayPlanResponseSchema = z.object({
  plan: WorkingDayPlanSchema.nullable(),
  planDate: z.string(),
  items: z.array(WorkingDayPlanItemSchema),
  readiness: z.object({
    supplies: z.object({
      needs: z.array(WorkingDaySupplyReadinessNeedSchema),
      summary: z.object({
        total: z.number(),
        ready: z.number(),
        short: z.number(),
        unknown: z.number(),
        noRequiredQuantity: z.number(),
      }),
    }),
    equipment: z.object({
      needs: z.array(WorkingDayEquipmentReadinessNeedSchema),
      summary: z.object({
        total: z.number(),
        ready: z.number(),
        blocked: z.number(),
        unknown: z.number(),
        unlinked: z.number(),
      }),
    }),
  }),
  taskCatalog: z.array(WorkingDayTaskCatalogItemSchema),
});

export const WorkingDayPlanInventoryStatusSummarySchema = z.object({
  planned: z.number(),
  inProgress: z.number(),
  done: z.number(),
  skipped: z.number(),
});

export const WorkingDayPlanInventoryCategorySummarySchema = z.object({
  herdWork: z.number(),
  animalWork: z.number(),
  ranchWork: z.number(),
});

export const WorkingDayPlanInventoryRowSchema = z.object({
  id: z.string().uuid(),
  planDate: z.string(),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  totalItems: z.number(),
  statusSummary: WorkingDayPlanInventoryStatusSummarySchema,
  categorySummary: WorkingDayPlanInventoryCategorySummarySchema,
});

export const WorkingDayPlanInventoryResponseSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  periodDays: z.union([z.literal(7), z.literal(14), z.literal(30), z.number()]),
  plans: z.array(WorkingDayPlanInventoryRowSchema),
  summary: z.object({
    planCount: z.number(),
    totalItems: z.number(),
    statusSummary: WorkingDayPlanInventoryStatusSummarySchema,
    categorySummary: WorkingDayPlanInventoryCategorySummarySchema,
  }),
});

export const WorkingDayPlanCreateResponseSchema = z.object({
  created: z.boolean(),
  plan: WorkingDayPlanSchema.nullable(),
});

export const WorkingDayPlanItemResponseSchema = z.object({
  item: WorkingDayPlanItemSchema,
});

export const WorkingDaySupplyNeedResponseSchema = z.object({
  supplyNeed: WorkingDayPlanItemSupplyNeedSchema,
});

export const WorkingDayEquipmentNeedResponseSchema = z.object({
  equipmentNeed: WorkingDayPlanItemEquipmentNeedSchema,
});

export const WorkingDayDeleteResponseSchema = z.object({
  deleted: z.record(z.string(), z.string()),
});

export type WorkingDayPlanCategory = z.infer<typeof WorkingDayPlanCategorySchema>;
export type WorkingDayPlanItemStatus = z.infer<typeof WorkingDayPlanItemStatusSchema>;
export type WorkingDaySupplyType = z.infer<typeof WorkingDaySupplyTypeSchema>;
export type WorkingDayTaskCatalogItem = z.infer<typeof WorkingDayTaskCatalogItemSchema>;
export type WorkingDaySupplyOptionPart = z.infer<typeof WorkingDaySupplyOptionPartSchema>;
export type WorkingDaySupplyOptionMedication = z.infer<typeof WorkingDaySupplyOptionMedicationSchema>;
export type WorkingDayMedicationEstimate = z.infer<typeof WorkingDayMedicationEstimateSchema>;
export type WorkingDayPlan = z.infer<typeof WorkingDayPlanSchema>;
export type WorkingDayPlanItem = z.infer<typeof WorkingDayPlanItemSchema>;
export type WorkingDayPlanItemSupplyNeed = z.infer<typeof WorkingDayPlanItemSupplyNeedSchema>;
export type WorkingDayPlanItemEquipmentNeed = z.infer<typeof WorkingDayPlanItemEquipmentNeedSchema>;
export type WorkingDaySupplyReadinessNeed = z.infer<typeof WorkingDaySupplyReadinessNeedSchema>;
export type WorkingDayEquipmentReadinessNeed = z.infer<typeof WorkingDayEquipmentReadinessNeedSchema>;
export type WorkingDayPlanResponse = z.infer<typeof WorkingDayPlanResponseSchema>;
export type WorkingDayPlanInventoryRow = z.infer<typeof WorkingDayPlanInventoryRowSchema>;
export type WorkingDayPlanInventoryResponse = z.infer<typeof WorkingDayPlanInventoryResponseSchema>;
