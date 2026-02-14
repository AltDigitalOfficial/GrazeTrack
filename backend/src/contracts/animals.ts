import { z } from "zod";

export const ExistingInventoryIntakeSchema = z.object({
  nickname: z.string().trim().max(100).optional().nullable(),
  species: z.string().trim().min(1),
  breed: z.string().trim().min(1),
  sex: z.enum(["female", "male", "neutered", "unknown"]),
  birthDate: z.string().trim().optional().nullable(),
  isBirthDateEstimated: z.boolean().optional(),
  tag: z
    .object({
      tagNumber: z.string().trim().min(1),
      tagColor: z.string().trim().optional().nullable(),
      tagEar: z.enum(["left", "right"]).optional().nullable(),
    })
    .optional(),
  initialWeightLbs: z.number().positive().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type ExistingInventoryIntake = z.infer<typeof ExistingInventoryIntakeSchema>;
