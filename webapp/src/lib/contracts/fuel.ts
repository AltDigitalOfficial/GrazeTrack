import { z } from "zod";

export const FuelUnitTypeSchema = z.enum(["WEIGHT", "VOLUME", "COUNT"]);
export const FuelCategorySchema = z.enum([
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

export const FuelPhotoSchema = z.object({
  id: z.string().uuid(),
  purpose: z.string().optional(),
  filePath: z.string().nullable().optional(),
  storageUrl: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  originalFilename: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileSize: z.number().nullable().optional(),
  uploadedAt: z.union([z.string(), z.date()]).optional(),
  metadataJson: z.unknown().optional(),
});

export const FuelPhotosResponseSchema = z.object({
  photos: z.array(FuelPhotoSchema),
});

export const FuelProductRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.union([FuelCategorySchema, z.string()]),
  defaultUnit: z.string(),
  unitType: z.union([FuelUnitTypeSchema, z.string()]).nullable().optional(),
  defaultPackageSize: z.string().nullable().optional(),
  defaultPackageUnit: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const FuelProductsResponseSchema = z.object({
  products: z.array(FuelProductRowSchema),
});

export const FuelProductDetailResponseSchema = z.object({
  product: FuelProductRowSchema,
  photos: z.array(FuelPhotoSchema),
});

export const FuelPurchaseListRowSchema = z.object({
  id: z.string().uuid(),
  ranchId: z.string().uuid().optional(),
  purchaseDate: z.string(),
  vendor: z.string().nullable().optional(),
  invoiceRef: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  itemCount: z.number().optional(),
  totalCost: z.string().optional(),
});

export const FuelPurchasesResponseSchema = z.object({
  purchases: z.array(FuelPurchaseListRowSchema),
});

export const FuelPurchaseItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string().optional(),
  productCategory: z.union([FuelCategorySchema, z.string()]).optional(),
  quantity: z.string(),
  unit: z.string(),
  unitCost: z.string().nullable().optional(),
  totalCost: z.string().nullable().optional(),
  unitType: z.union([FuelUnitTypeSchema, z.string()]).nullable().optional(),
  normalizedQuantity: z.string().nullable().optional(),
  normalizedUnit: z.string().nullable().optional(),
  packageSize: z.string().nullable().optional(),
  packageUnit: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
});

export const FuelPurchaseDetailResponseSchema = z.object({
  purchase: FuelPurchaseListRowSchema,
  items: z.array(FuelPurchaseItemSchema),
});

export const FuelInventoryRowSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  unit: z.string(),
  onHandQuantity: z.string(),
  normalizedOnHandQuantity: z.string().nullable().optional(),
  normalizedUnit: z.string().nullable().optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  productName: z.string().optional(),
  productCategory: z.union([FuelCategorySchema, z.string()]).optional(),
  unitType: z.union([FuelUnitTypeSchema, z.string()]).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const FuelInventoryResponseSchema = z.object({
  inventory: z.array(FuelInventoryRowSchema),
});

export type FuelCategory = z.infer<typeof FuelCategorySchema>;
export type FuelUnitType = z.infer<typeof FuelUnitTypeSchema>;
export type FuelProductRow = z.infer<typeof FuelProductRowSchema>;
export type FuelPurchaseListRow = z.infer<typeof FuelPurchaseListRowSchema>;
export type FuelPurchaseItem = z.infer<typeof FuelPurchaseItemSchema>;
export type FuelInventoryRow = z.infer<typeof FuelInventoryRowSchema>;
