import { z } from "zod";

export const ExistingInventoryIntakePayloadSchema = z.object({
  nickname: z.string().trim().max(100).nullable(),
  species: z.string().trim().min(1),
  breed: z.string().trim().min(1),
  sex: z.enum(["female", "male", "neutered", "unknown"]),
  birthDate: z.string().trim().nullable(),
  isBirthDateEstimated: z.boolean(),
  tag: z.object({
    tagNumber: z.string().trim().min(1),
    tagColor: z.string().trim(),
    tagEar: z.enum(["left", "right"]),
  }),
  initialWeightLbs: z.number().positive().nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

export type ExistingInventoryIntakePayload = z.infer<typeof ExistingInventoryIntakePayloadSchema>;

export const ExistingInventoryIntakeResponseSchema = z.object({
  animalId: z.string().uuid(),
  herdId: z.string().uuid(),
  ranchId: z.string().uuid(),
  membershipId: z.string().uuid(),
  intakeEventId: z.string().uuid(),
});

export type ExistingInventoryIntakeResponse = z.infer<typeof ExistingInventoryIntakeResponseSchema>;
