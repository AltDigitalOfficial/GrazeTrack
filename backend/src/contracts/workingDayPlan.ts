import { z } from "zod";

export const WorkingDayPlanCategorySchema = z.enum(["HERD_WORK", "ANIMAL_WORK", "RANCH_WORK"]);
export const WorkingDayPlanItemStatusSchema = z.enum(["PLANNED", "IN_PROGRESS", "DONE", "SKIPPED"]);
export const WorkingDaySupplyTypeSchema = z.enum(["MEDICATION", "FEED", "ADDITIVE", "FUEL_FLUID", "PART_SUPPLY", "OTHER"]);

export const WorkingDayTaskTypeSchema = z.enum([
  "MOVE_HERD",
  "WEIGH_HERD",
  "GROUP_MEDICATION",
  "VACCINATE_GROUP",
  "SORT_GROUP",
  "REASSIGN_ANIMALS",
  "WEIGH_ANIMAL",
  "MEDICATE_ANIMAL",
  "VET_TREATMENT",
  "MOVE_ANIMAL",
  "TAG_ID",
  "EQUIPMENT_MAINTENANCE",
  "DISTRIBUTE_FEED",
  "ADD_WATER_ADDITIVES",
  "FENCE_CHECK",
  "SURVEY_LAND",
  "OTHER_TASK",
]);

export const WorkingDaySuggestedSupplyNeedSchema = z.object({
  supplyType: WorkingDaySupplyTypeSchema,
  linkedEntityType: z.string().trim().min(1).optional(),
  linkedEntityId: z.string().uuid().optional(),
  name: z.string().trim().min(1).optional(),
  requiredQuantity: z.union([z.number(), z.string()]).optional(),
  unit: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
});

export const WorkingDaySuggestedEquipmentNeedSchema = z.object({
  assetId: z.string().uuid().optional(),
  assetTypeHint: z.string().trim().min(1).optional(),
  mustBeOperational: z.boolean().optional(),
  notes: z.string().trim().min(1).optional(),
});

export const WorkingDayTaskCatalogSeedEntrySchema = z.object({
  category: WorkingDayPlanCategorySchema,
  taskType: WorkingDayTaskTypeSchema,
  label: z.string().trim().min(1),
  sortOrder: z.number().int().min(0),
  suggestedSupplyNeeds: z.array(WorkingDaySuggestedSupplyNeedSchema),
  suggestedEquipmentNeeds: z.array(WorkingDaySuggestedEquipmentNeedSchema),
});

export type WorkingDayPlanCategory = z.infer<typeof WorkingDayPlanCategorySchema>;
export type WorkingDayPlanItemStatus = z.infer<typeof WorkingDayPlanItemStatusSchema>;
export type WorkingDaySupplyType = z.infer<typeof WorkingDaySupplyTypeSchema>;
export type WorkingDayTaskType = z.infer<typeof WorkingDayTaskTypeSchema>;
export type WorkingDaySuggestedSupplyNeed = z.infer<typeof WorkingDaySuggestedSupplyNeedSchema>;
export type WorkingDaySuggestedEquipmentNeed = z.infer<typeof WorkingDaySuggestedEquipmentNeedSchema>;
export type WorkingDayTaskCatalogSeedEntry = z.infer<typeof WorkingDayTaskCatalogSeedEntrySchema>;

// Keep this seed map aligned with backend/sql/2026-03-01_working_day_plan_v1.sql.
// Later, SOP mappings can layer on top of these defaults.
export const WORKING_DAY_TASK_CATALOG_SEED: WorkingDayTaskCatalogSeedEntry[] = [
  {
    category: "HERD_WORK",
    taskType: "MOVE_HERD",
    label: "Move Herd",
    sortOrder: 10,
    suggestedSupplyNeeds: [],
    suggestedEquipmentNeeds: [{ assetTypeHint: "ATV/UTV", mustBeOperational: true }],
  },
  {
    category: "HERD_WORK",
    taskType: "WEIGH_HERD",
    label: "Weigh Herd",
    sortOrder: 20,
    suggestedSupplyNeeds: [],
    suggestedEquipmentNeeds: [
      { assetTypeHint: "Scale", mustBeOperational: true },
      { assetTypeHint: "Chute", mustBeOperational: true },
    ],
  },
  {
    category: "HERD_WORK",
    taskType: "GROUP_MEDICATION",
    label: "Group Medication",
    sortOrder: 30,
    suggestedSupplyNeeds: [{ supplyType: "MEDICATION", name: "Medication supplies" }],
    suggestedEquipmentNeeds: [{ assetTypeHint: "Chute", mustBeOperational: true }],
  },
  {
    category: "HERD_WORK",
    taskType: "VACCINATE_GROUP",
    label: "Vaccinate Group",
    sortOrder: 40,
    suggestedSupplyNeeds: [{ supplyType: "MEDICATION", name: "Vaccine supplies" }],
    suggestedEquipmentNeeds: [{ assetTypeHint: "Chute", mustBeOperational: true }],
  },
  {
    category: "HERD_WORK",
    taskType: "SORT_GROUP",
    label: "Sort Group",
    sortOrder: 50,
    suggestedSupplyNeeds: [],
    suggestedEquipmentNeeds: [{ assetTypeHint: "Panels/Alley", mustBeOperational: true }],
  },
  {
    category: "HERD_WORK",
    taskType: "REASSIGN_ANIMALS",
    label: "Reassign Animals",
    sortOrder: 60,
    suggestedSupplyNeeds: [],
    suggestedEquipmentNeeds: [{ assetTypeHint: "Handling setup", mustBeOperational: true }],
  },
  {
    category: "ANIMAL_WORK",
    taskType: "WEIGH_ANIMAL",
    label: "Weigh Animal",
    sortOrder: 70,
    suggestedSupplyNeeds: [],
    suggestedEquipmentNeeds: [{ assetTypeHint: "Scale", mustBeOperational: true }],
  },
  {
    category: "ANIMAL_WORK",
    taskType: "MEDICATE_ANIMAL",
    label: "Medicate Animal",
    sortOrder: 80,
    suggestedSupplyNeeds: [{ supplyType: "MEDICATION", name: "Medication supplies" }],
    suggestedEquipmentNeeds: [{ assetTypeHint: "Handling setup", mustBeOperational: true }],
  },
  {
    category: "ANIMAL_WORK",
    taskType: "VET_TREATMENT",
    label: "Vet Treatment",
    sortOrder: 90,
    suggestedSupplyNeeds: [{ supplyType: "MEDICATION", name: "Treatment supplies" }],
    suggestedEquipmentNeeds: [{ assetTypeHint: "Handling setup", mustBeOperational: true }],
  },
  {
    category: "ANIMAL_WORK",
    taskType: "MOVE_ANIMAL",
    label: "Move Animal",
    sortOrder: 100,
    suggestedSupplyNeeds: [],
    suggestedEquipmentNeeds: [{ assetTypeHint: "ATV/UTV or Trailer", mustBeOperational: true }],
  },
  {
    category: "ANIMAL_WORK",
    taskType: "TAG_ID",
    label: "Tag / ID",
    sortOrder: 110,
    suggestedSupplyNeeds: [{ supplyType: "PART_SUPPLY", name: "Tags and ID supplies", requiredQuantity: 1, unit: "each" }],
    suggestedEquipmentNeeds: [{ assetTypeHint: "Handling setup", mustBeOperational: true }],
  },
  {
    category: "RANCH_WORK",
    taskType: "EQUIPMENT_MAINTENANCE",
    label: "Equipment Maintenance",
    sortOrder: 120,
    suggestedSupplyNeeds: [
      { supplyType: "PART_SUPPLY", name: "Repair parts/supplies" },
      { supplyType: "FUEL_FLUID", name: "Fuel/fluids" },
    ],
    suggestedEquipmentNeeds: [{ assetTypeHint: "Target equipment asset", mustBeOperational: false }],
  },
  {
    category: "RANCH_WORK",
    taskType: "DISTRIBUTE_FEED",
    label: "Distribute Feed",
    sortOrder: 130,
    suggestedSupplyNeeds: [{ supplyType: "FEED", name: "Feed or feed blend" }],
    suggestedEquipmentNeeds: [{ assetTypeHint: "Tractor/Feeder", mustBeOperational: true }],
  },
  {
    category: "RANCH_WORK",
    taskType: "ADD_WATER_ADDITIVES",
    label: "Add Water Additives",
    sortOrder: 140,
    suggestedSupplyNeeds: [{ supplyType: "ADDITIVE", name: "Water additives" }],
    suggestedEquipmentNeeds: [{ assetTypeHint: "Pump/Sprayer", mustBeOperational: true }],
  },
  {
    category: "RANCH_WORK",
    taskType: "FENCE_CHECK",
    label: "Fence Check",
    sortOrder: 150,
    suggestedSupplyNeeds: [{ supplyType: "PART_SUPPLY", name: "Fence repair supplies" }],
    suggestedEquipmentNeeds: [{ assetTypeHint: "ATV/UTV", mustBeOperational: true }],
  },
  {
    category: "RANCH_WORK",
    taskType: "SURVEY_LAND",
    label: "Survey Land",
    sortOrder: 160,
    suggestedSupplyNeeds: [],
    suggestedEquipmentNeeds: [{ assetTypeHint: "ATV/UTV or Drone", mustBeOperational: true }],
  },
  {
    category: "RANCH_WORK",
    taskType: "OTHER_TASK",
    label: "Other Task",
    sortOrder: 170,
    suggestedSupplyNeeds: [],
    suggestedEquipmentNeeds: [],
  },
];
