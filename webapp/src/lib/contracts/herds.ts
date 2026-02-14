import { z } from "zod";

export const HerdBreedsResponseSchema = z.object({
  breeds: z.array(z.string()),
});

export type HerdBreedsResponse = z.infer<typeof HerdBreedsResponseSchema>;

export const HerdListItemSchema = z.object({
  id: z.string().uuid(),
  ranchId: z.string().uuid(),
  name: z.string(),
  shortDescription: z.string().nullable(),
  species: z.string().nullable(),
  breed: z.string().nullable(),
  longDescription: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  counts: z
    .object({
      male: z.number().optional(),
      male_neut: z.number().optional(),
      female: z.number().optional(),
      female_neut: z.number().optional(),
      baby: z.number().optional(),
    })
    .optional(),
});

export type HerdListItem = z.infer<typeof HerdListItemSchema>;
