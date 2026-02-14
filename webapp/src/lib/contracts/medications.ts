import { z } from "zod";

export const MedicationInventoryRowSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  quantity: z.string(),
  unit: z.string(),
  lastPurchaseDate: z.string().nullable(),
});

export const MedicationInventoryResponseSchema = z.object({
  inventory: z.array(MedicationInventoryRowSchema),
});

export type MedicationInventoryRow = z.infer<typeof MedicationInventoryRowSchema>;

export const MedicationStandardRowSchema = z.object({
  id: z.string().uuid(),
  standardMedicationId: z.string().uuid(),
  medicationDisplayName: z.string(),
  usesOffLabel: z.boolean(),
  standardDoseText: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]),
});

export const MedicationStandardsResponseSchema = z.object({
  standards: z.array(MedicationStandardRowSchema),
});

export type MedicationStandardRow = z.infer<typeof MedicationStandardRowSchema>;
