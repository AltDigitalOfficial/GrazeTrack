import { z } from "zod";

export const ZoneListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  areaAcres: z.string().nullable(),
  createdAt: z.string(),
});

export const ZonesListResponseSchema = z.array(ZoneListItemSchema);

export type ZoneListItem = z.infer<typeof ZoneListItemSchema>;
