import { z } from "zod";

export const FeedUnitTypeSchema = z.enum(["WEIGHT", "COUNT", "VOLUME"]);

export const FeedSpeciesOptionsResponseSchema = z.object({
  species: z.array(z.string()),
});

export const FeedPhotoSchema = z.object({
  id: z.string().uuid(),
  purpose: z.string().optional(),
  filePath: z.string().nullable().optional(),
  storageUrl: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  originalFilename: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileSize: z.number().nullable().optional(),
  uploadedAt: z.union([z.string(), z.date()]).optional(),
});

export const FeedComponentRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  manufacturerName: z.string().nullable().optional(),
  unitType: z.union([FeedUnitTypeSchema, z.string()]).nullable().optional(),
  defaultUnit: z.string(),
  defaultPackageWeight: z.string().nullable().optional(),
  defaultPackageUnit: z.string().nullable().optional(),
  isBulkCommodity: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  eligibleSpecies: z.array(z.string()).optional(),
  eligibleSpeciesIsAll: z.boolean().optional(),
  quantityOnHand: z.string().optional(),
  balanceUpdatedAt: z.union([z.string(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const FeedComponentsResponseSchema = z.object({
  components: z.array(FeedComponentRowSchema),
});

export const FeedComponentDetailResponseSchema = z.object({
  component: FeedComponentRowSchema,
  photos: z.array(FeedPhotoSchema),
});

export const FeedBlendCurrentItemSchema = z.object({
  feedComponentId: z.string().uuid(),
  componentName: z.string(),
  percent: z.string(),
});

export const FeedBlendCurrentVersionSchema = z.object({
  id: z.string().uuid(),
  versionNumber: z.number(),
  notes: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  items: z.array(FeedBlendCurrentItemSchema),
  percentTotal: z.string().optional(),
});

export const FeedBlendRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  manufacturerName: z.string().nullable().optional(),
  unitType: z.union([FeedUnitTypeSchema, z.string()]).nullable().optional(),
  defaultUnit: z.string().optional(),
  defaultPackageWeight: z.string().nullable().optional(),
  defaultPackageUnit: z.string().nullable().optional(),
  isBulkCommodity: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  currentVersionId: z.string().uuid().nullable().optional(),
  eligibleSpecies: z.array(z.string()).optional(),
  eligibleSpeciesIsAll: z.boolean().optional(),
  currentVersion: FeedBlendCurrentVersionSchema.nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const FeedBlendsResponseSchema = z.object({
  blends: z.array(FeedBlendRowSchema),
});

export const FeedBlendDetailVersionSchema = z.object({
  id: z.string().uuid(),
  versionNumber: z.number(),
  isCurrent: z.boolean(),
  notes: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  items: z.array(FeedBlendCurrentItemSchema),
  percentTotal: z.string().optional(),
});

export const FeedBlendDetailResponseSchema = z.object({
  blend: FeedBlendRowSchema.extend({
    versions: z.array(FeedBlendDetailVersionSchema),
  }),
  photos: z.array(FeedPhotoSchema),
});

export const FeedPurchaseListRowSchema = z.object({
  id: z.string().uuid(),
  ranchId: z.string().uuid().optional(),
  purchaseDate: z.string(),
  supplierName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  itemCount: z.number().optional(),
});

export const FeedPurchasesResponseSchema = z.object({
  purchases: z.array(FeedPurchaseListRowSchema),
});

export const FeedPurchaseItemSchema = z.object({
  id: z.string().uuid(),
  entityType: z.enum(["COMPONENT", "BLEND"]),
  entityId: z.string().uuid().nullable().optional(),
  displayName: z.string().nullable().optional(),
  feedComponentId: z.string().uuid().nullable().optional(),
  feedBlendId: z.string().uuid().nullable().optional(),
  blendVersionId: z.string().uuid().nullable().optional(),
  unitType: z.union([FeedUnitTypeSchema, z.string()]).nullable().optional(),
  quantity: z.string(),
  unit: z.string(),
  packageWeight: z.string().nullable().optional(),
  packageWeightUnit: z.string().nullable().optional(),
  normalizedQuantity: z.string().nullable().optional(),
  normalizedUnit: z.string().nullable().optional(),
  unitPrice: z.string().nullable().optional(),
  lineTotal: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  eligibleSpecies: z.array(z.string()).optional(),
  eligibleSpeciesIsAll: z.boolean().optional(),
});

export const FeedPurchaseDetailResponseSchema = z.object({
  purchase: FeedPurchaseListRowSchema,
  items: z.array(FeedPurchaseItemSchema),
});

export const FeedInventoryRowSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid().nullable().optional(),
  displayName: z.string().nullable().optional(),
  unitType: z.union([FeedUnitTypeSchema, z.string()]).nullable().optional(),
  quantityOnHand: z.string(),
  unit: z.string(),
  normalizedOnHandQuantity: z.string().nullable().optional(),
  normalizedUnit: z.string().nullable().optional(),
  updatedAt: z.union([z.string(), z.date()]),
});

export const FeedInventoryResponseSchema = z.object({
  inventory: z.array(FeedInventoryRowSchema),
});

export type FeedComponentRow = z.infer<typeof FeedComponentRowSchema>;
export type FeedBlendRow = z.infer<typeof FeedBlendRowSchema>;
export type FeedPurchaseListRow = z.infer<typeof FeedPurchaseListRowSchema>;
export type FeedPurchaseItem = z.infer<typeof FeedPurchaseItemSchema>;
export type FeedInventoryRow = z.infer<typeof FeedInventoryRowSchema>;
