import { z } from "zod";

const NumericValueSchema = z.union([z.string(), z.number()]);

export const EquipmentAssetTypeSchema = z.enum([
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

export const EquipmentAssetStatusSchema = z.enum(["ACTIVE", "SOLD", "RETIRED", "LOST", "RENTED", "LEASED"]);
export const EquipmentAcquisitionTypeSchema = z.enum(["PURCHASED", "LEASED", "RENTED", "INHERITED", "OTHER"]);
export const EquipmentMeterTypeSchema = z.enum(["NONE", "HOURS", "MILES", "OTHER"]);
export const EquipmentMaintenanceEventTypeSchema = z.enum([
  "SERVICE",
  "REPAIR",
  "INSPECTION",
  "MODIFICATION",
  "WARRANTY",
  "OTHER",
]);
export const EquipmentAssetIdentifierTypeSchema = z.enum([
  "VIN",
  "PIN",
  "SERIAL",
  "ENGINE_SERIAL",
  "LICENSE_PLATE",
  "TAG",
  "OTHER",
]);
export const EquipmentPartCategorySchema = z.enum([
  "FENCING",
  "HARDWARE",
  "PLUMBING",
  "ELECTRICAL",
  "LIVESTOCK_HANDLING",
  "IMPLEMENT_PART",
  "VEHICLE_PART",
  "OTHER",
]);
export const EquipmentPartUnitTypeSchema = z.enum(["COUNT", "LENGTH", "WEIGHT"]);
export const EquipmentPartEventTypeSchema = z.enum(["PURCHASE", "ADJUSTMENT", "USE", "OTHER"]);

export const EquipmentAttachmentSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  purpose: z.string().optional(),
  filePath: z.string().nullable().optional(),
  storageUrl: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  originalFilename: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileSize: z.number().nullable().optional(),
  metadataJson: z.unknown().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const EquipmentAssetIdentifierSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  identifierType: z.union([EquipmentAssetIdentifierTypeSchema, z.string()]),
  identifierValue: z.string(),
  notes: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const EquipmentMaintenanceEventSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  ranchId: z.string().uuid(),
  eventDate: z.string(),
  eventType: z.union([EquipmentMaintenanceEventTypeSchema, z.string()]),
  title: z.string(),
  description: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  laborCost: NumericValueSchema.nullable().optional(),
  partsCost: NumericValueSchema.nullable().optional(),
  totalCost: NumericValueSchema.nullable().optional(),
  meterReading: NumericValueSchema.nullable().optional(),
  meterType: z.union([EquipmentMeterTypeSchema, z.string()]).nullable().optional(),
  nextDueDate: z.string().nullable().optional(),
  nextDueMeter: NumericValueSchema.nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const EquipmentMaintenanceEventWithAttachmentsSchema = EquipmentMaintenanceEventSchema.extend({
  attachments: z.array(EquipmentAttachmentSchema),
});

export const EquipmentAssetRowSchema = z.object({
  id: z.string().uuid(),
  ranchId: z.string().uuid(),
  name: z.string(),
  assetType: z.union([EquipmentAssetTypeSchema, z.string()]),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  modelYear: z.number().nullable().optional(),
  status: z.union([EquipmentAssetStatusSchema, z.string()]),
  acquisitionType: z.union([EquipmentAcquisitionTypeSchema, z.string()]),
  acquisitionDate: z.string().nullable().optional(),
  purchasePrice: z.string().nullable().optional(),
  currentValueEstimate: z.string().nullable().optional(),
  trackMaintenance: z.boolean(),
  meterType: z.union([EquipmentMeterTypeSchema, z.string()]),
  defaultMeterUnitLabel: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const EquipmentPartRowSchema = z.object({
  id: z.string().uuid(),
  ranchId: z.string().uuid(),
  name: z.string(),
  category: z.union([EquipmentPartCategorySchema, z.string()]),
  description: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  partNumber: z.string().nullable().optional(),
  usedForAssetTypes: z.array(z.union([EquipmentAssetTypeSchema, z.string()])).optional().default([]),
  unitType: z.union([EquipmentPartUnitTypeSchema, z.string()]),
  defaultUnit: z.string(),
  onHandQuantity: NumericValueSchema,
  reorderThreshold: NumericValueSchema.nullable().optional(),
  reorderTarget: NumericValueSchema.nullable().optional(),
  vendor: z.string().nullable().optional(),
  costPerUnit: NumericValueSchema.nullable().optional(),
  storageLocation: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const EquipmentPartInventoryEventSchema = z.object({
  id: z.string().uuid(),
  partId: z.string().uuid(),
  ranchId: z.string().uuid(),
  eventDate: z.string(),
  eventType: z.union([EquipmentPartEventTypeSchema, z.string()]),
  quantityDelta: NumericValueSchema,
  unit: z.string(),
  unitCost: NumericValueSchema.nullable().optional(),
  vendor: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const EquipmentPartInventoryEventWithAttachmentsSchema = EquipmentPartInventoryEventSchema.extend({
  attachments: z.array(EquipmentAttachmentSchema),
});

export const EquipmentAssetsResponseSchema = z.object({
  assets: z.array(EquipmentAssetRowSchema),
});

export const EquipmentAssetDetailResponseSchema = z.object({
  asset: EquipmentAssetRowSchema,
  identifiers: z.array(EquipmentAssetIdentifierSchema),
  attachments: z.array(EquipmentAttachmentSchema),
  maintenanceSummary: z.object({
    eventCount: z.number(),
    lastEventDate: z.string().nullable(),
    nextDueDate: z.string().nullable(),
    nextDueMeter: z.string().nullable(),
  }),
});

export const EquipmentAttachmentsResponseSchema = z.object({
  attachments: z.array(EquipmentAttachmentSchema),
});

export const EquipmentMaintenanceEventsResponseSchema = z.object({
  events: z.array(EquipmentMaintenanceEventWithAttachmentsSchema),
});

export const EquipmentMaintenanceEventResponseSchema = z.object({
  event: EquipmentMaintenanceEventSchema,
  attachments: z.array(EquipmentAttachmentSchema),
});

export const EquipmentPartsResponseSchema = z.object({
  parts: z.array(EquipmentPartRowSchema),
});

export const EquipmentPartDetailResponseSchema = z.object({
  part: EquipmentPartRowSchema,
  attachments: z.array(EquipmentAttachmentSchema),
  recentEvents: z.array(EquipmentPartInventoryEventWithAttachmentsSchema),
});

export const EquipmentPartEventsResponseSchema = z.object({
  events: z.array(EquipmentPartInventoryEventWithAttachmentsSchema),
});

export const EquipmentPartEventCreateResponseSchema = z.object({
  event: EquipmentPartInventoryEventSchema,
  partBalance: z
    .object({
      id: z.string().uuid(),
      onHandQuantity: NumericValueSchema,
      updatedAt: z.union([z.string(), z.date()]).optional(),
    })
    .nullable()
    .optional(),
  attachments: z.array(EquipmentAttachmentSchema),
});

export type EquipmentAssetType = z.infer<typeof EquipmentAssetTypeSchema>;
export type EquipmentAssetStatus = z.infer<typeof EquipmentAssetStatusSchema>;
export type EquipmentAcquisitionType = z.infer<typeof EquipmentAcquisitionTypeSchema>;
export type EquipmentMeterType = z.infer<typeof EquipmentMeterTypeSchema>;
export type EquipmentMaintenanceEventType = z.infer<typeof EquipmentMaintenanceEventTypeSchema>;
export type EquipmentAssetIdentifierType = z.infer<typeof EquipmentAssetIdentifierTypeSchema>;
export type EquipmentPartCategory = z.infer<typeof EquipmentPartCategorySchema>;
export type EquipmentPartUnitType = z.infer<typeof EquipmentPartUnitTypeSchema>;
export type EquipmentPartEventType = z.infer<typeof EquipmentPartEventTypeSchema>;
export type EquipmentAssetRow = z.infer<typeof EquipmentAssetRowSchema>;
export type EquipmentAssetIdentifier = z.infer<typeof EquipmentAssetIdentifierSchema>;
export type EquipmentAttachment = z.infer<typeof EquipmentAttachmentSchema>;
export type EquipmentMaintenanceEvent = z.infer<typeof EquipmentMaintenanceEventSchema>;
export type EquipmentMaintenanceEventWithAttachments = z.infer<typeof EquipmentMaintenanceEventWithAttachmentsSchema>;
export type EquipmentPartRow = z.infer<typeof EquipmentPartRowSchema>;
export type EquipmentPartInventoryEvent = z.infer<typeof EquipmentPartInventoryEventSchema>;
export type EquipmentPartInventoryEventWithAttachments = z.infer<typeof EquipmentPartInventoryEventWithAttachmentsSchema>;
