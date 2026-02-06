import type { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import path from "path";

import { ensureRanchStructure, saveUploadedFile } from "../../lib/storage.js";
import { db } from "../db";
import { ranches, userRanches, herds, ranchSpecies, ranchAgeBands } from "../db/schema";
import { requireAuth } from "../plugins/requireAuth";

function toNullIfEmpty(s?: string): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}

/**
 * Resolve the active ranch for the authenticated user.
 */
async function getActiveRanchId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ ranchId: userRanches.ranchId })
    .from(userRanches)
    .where(eq(userRanches.userId, userId))
    .limit(1);

  return rows[0]?.ranchId ?? null;
}

/**
 * Default species vocabulary + age bands (seed templates).
 * These are only applied when a species is newly added AND no age bands exist yet for that ranch/species.
 *
 * NOTE:
 * - Keys must match whatever species strings you use in the app (we assume Title Case from your examples).
 * - Ranchers can fully edit after seeding.
 */
type SpeciesVocabTemplate = {
  maleDesc?: string | null;
  femaleDesc?: string | null;
  maleNeutDesc?: string | null;
  femaleNeutDesc?: string | null;
  babyDesc?: string | null;
};

type AgeBandTemplate = {
  minMonths: number;
  maxMonths: number | null;
  label: string;
  teethDesc?: string | null;

  maleTerm?: string | null;
  femaleTerm?: string | null;
  maleNeutTerm?: string | null;
  femaleNeutTerm?: string | null;
};

const DEFAULT_SPECIES_VOCAB: Record<string, SpeciesVocabTemplate> = {
  Bison: {
    maleDesc: "Bull",
    femaleDesc: "Cow",
    babyDesc: "Calf",
    maleNeutDesc: "Steer",
    femaleNeutDesc: null,
  },
  Cattle: {
    maleDesc: "Bull",
    femaleDesc: "Cow",
    babyDesc: "Calf",
    maleNeutDesc: "Steer",
    femaleNeutDesc: null,
  },
  Sheep: {
    maleDesc: "Ram",
    femaleDesc: "Ewe",
    babyDesc: "Lamb",
    maleNeutDesc: "Wether",
    femaleNeutDesc: null,
  },
  Goats: {
    maleDesc: "Buck",
    femaleDesc: "Doe",
    babyDesc: "Kid",
    maleNeutDesc: "Wether",
    femaleNeutDesc: null,
  },
  Pigs: {
    maleDesc: "Boar",
    femaleDesc: "Sow",
    babyDesc: "Piglet",
    maleNeutDesc: "Barrow",
    femaleNeutDesc: null,
  },
};

const DEFAULT_AGE_BANDS: Record<string, AgeBandTemplate[]> = {
  Bison: [
    { minMonths: 0, maxMonths: 12, label: "Calf", teethDesc: "Milk teeth" },
    { minMonths: 12, maxMonths: 18, label: "Yearling", teethDesc: "Emerging permanent teeth" },
    { minMonths: 19, maxMonths: 23, label: "Long Yearling", teethDesc: "Partial permanent teeth" },
    { minMonths: 24, maxMonths: 35, label: "Two-Year-Old", teethDesc: "2-6 permanent teeth" },
    {
      minMonths: 36,
      maxMonths: null,
      label: "Adult",
      teethDesc: "Full permanent teeth (8)",
      maleTerm: "Bull",
      femaleTerm: "Cow",
    },
  ],
  Cattle: [
    {
      minMonths: 0,
      maxMonths: 10,
      label: "Calf",
      teethDesc: "Milk teeth",
      maleTerm: "Bull Calf",
      femaleTerm: "Heifer Calf",
      maleNeutTerm: "Steer Calf",
    },
    { minMonths: 10, maxMonths: 12, label: "Weaner", teethDesc: "Milk teeth, post-weaning" },
    {
      minMonths: 12,
      maxMonths: 24,
      label: "Yearling",
      teethDesc: "0-2 permanent teeth",
      maleTerm: "Bull",
      femaleTerm: "Heifer",
      maleNeutTerm: "Steer",
    },
    { minMonths: 24, maxMonths: 30, label: "Two-Tooth / Two-Year-Old", teethDesc: "2 permanent teeth" },
    { minMonths: 30, maxMonths: 36, label: "Four-Tooth", teethDesc: "4 permanent teeth" },
    { minMonths: 36, maxMonths: 42, label: "Six-Tooth", teethDesc: "6 permanent teeth" },
    {
      minMonths: 42,
      maxMonths: null,
      label: "Full Mouth Adult",
      teethDesc: "8 permanent teeth",
      maleTerm: "Bull",
      femaleTerm: "Cow",
      maleNeutTerm: "Steer",
    },
  ],
  Sheep: [
    {
      minMonths: 0,
      maxMonths: 12,
      label: "Lamb",
      teethDesc: "Milk teeth (no permanent)",
      femaleTerm: "Ewe Lamb",
      maleTerm: "Ram Lamb",
      maleNeutTerm: "Wether Lamb",
    },
    {
      minMonths: 12,
      maxMonths: 18,
      label: "Yearling / Two-Tooth (Hogget)",
      teethDesc: "2 permanent teeth",
      femaleTerm: "Ewe Hogget",
      maleTerm: "Ram Hogget",
      maleNeutTerm: "Wether Hogget",
    },
    { minMonths: 18, maxMonths: 24, label: "Four-Tooth Hogget", teethDesc: "4 permanent teeth" },
    { minMonths: 24, maxMonths: 36, label: "Six-Tooth (Young Adult)", teethDesc: "6 permanent teeth" },
    {
      minMonths: 36,
      maxMonths: null,
      label: "Full Mouth Adult",
      teethDesc: "8 permanent teeth",
      femaleTerm: "Ewe",
      maleTerm: "Ram",
      maleNeutTerm: "Wether",
    },
  ],
  Goats: [
    {
      minMonths: 0,
      maxMonths: 4,
      label: "Junior Kid",
      teethDesc: "Milk teeth",
      femaleTerm: "Doeling",
      maleTerm: "Buckling",
    },
    { minMonths: 4, maxMonths: 7, label: "Senior Kid", teethDesc: "Milk teeth" },
    { minMonths: 7, maxMonths: 12, label: "Junior Yearling", teethDesc: "Milk teeth" },
    {
      minMonths: 12,
      maxMonths: 18,
      label: "Senior Yearling / Two-Tooth",
      teethDesc: "2 permanent teeth",
      femaleTerm: "Doe",
      maleTerm: "Buck",
    },
    { minMonths: 18, maxMonths: 24, label: "Four-Tooth", teethDesc: "4 permanent teeth" },
    { minMonths: 24, maxMonths: 36, label: "Six-Tooth", teethDesc: "6 permanent teeth" },
    {
      minMonths: 36,
      maxMonths: null,
      label: "Full Mouth Adult",
      teethDesc: "8 permanent teeth",
      femaleTerm: "Doe",
      maleTerm: "Buck",
      maleNeutTerm: "Wether",
    },
  ],
  Pigs: [
    { minMonths: 0, maxMonths: 2, label: "Piglet / Suckling Pig", teethDesc: "Milk teeth" },
    { minMonths: 1, maxMonths: 3, label: "Weaner / Shoat", teethDesc: "Early permanent emerging" },
    { minMonths: 3, maxMonths: 6, label: "Grower / Feeder Pig", teethDesc: "Developing teeth" },
    {
      minMonths: 6,
      maxMonths: 9,
      label: "Finisher",
      teethDesc: "Near full dentition",
      femaleTerm: "Gilt",
      maleNeutTerm: "Barrow",
    },
    {
      minMonths: 9,
      maxMonths: null,
      label: "Adult",
      teethDesc: "Full permanent teeth",
      femaleTerm: "Sow",
      maleTerm: "Boar",
      maleNeutTerm: "Barrow",
    },
  ],
};

/**
 * Ranch create payload (multipart or JSON)
 */
const ranchPayloadSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  dba: z.string().optional(),
  phone: z.string().optional(),

  phys_street: z.string().optional(),
  phys_city: z.string().optional(),
  phys_state: z.string().optional(),
  phys_zip: z.string().optional(),

  mail_street: z.string().optional(),
  mail_city: z.string().optional(),
  mail_state: z.string().optional(),
  mail_zip: z.string().optional(),
});

const ranchUpdateSchema = ranchPayloadSchema.partial();

async function parseRanchRequest(req: any): Promise<{
  body: Record<string, any>;
  files: any[];
}> {
  const contentType = String(req.headers?.["content-type"] ?? "");
  const isMultipart = contentType.includes("multipart/form-data");

  if (isMultipart && typeof req.saveRequestFiles === "function") {
    const files = await req.saveRequestFiles();
    return { body: (req.body ?? {}) as Record<string, any>, files };
  }

  return { body: (req.body ?? {}) as Record<string, any>, files: [] as any[] };
}

/**
 * Ranch Settings payload
 *
 * API keys:
 * - species array is explicit and includes per-species vocabulary
 * - age_bands is a flat list; each row includes species and the term fields
 *
 * We keep snake_case for DB-backed fields where it helps frontend consistency.
 */
const ranchSpeciesItemSchema = z.object({
  species: z.string().min(1),

  male_desc: z.string().optional().nullable(),
  female_desc: z.string().optional().nullable(),
  baby_desc: z.string().optional().nullable(),

  male_neut_desc: z.string().optional().nullable(),
  female_neut_desc: z.string().optional().nullable(),
});

const ranchAgeBandItemSchema = z.object({
  id: z.string().uuid().optional(),
  species: z.string().min(1),

  label: z.string().min(1),
  teeth_desc: z.string().optional().nullable(),

  male_term: z.string().optional().nullable(),
  female_term: z.string().optional().nullable(),
  male_neut_term: z.string().optional().nullable(),
  female_neut_term: z.string().optional().nullable(),

  min_months: z.number().int().min(0),
  max_months: z.number().int().min(0).optional().nullable(),
  sort_order: z.number().int().optional(),
});

const ranchSettingsPutSchema = z.object({
  species: z.array(ranchSpeciesItemSchema),
  age_bands: z.array(ranchAgeBandItemSchema).optional(),
});

export async function ranchRoutes(app: FastifyInstance) {
  /**
   * CREATE ranch
   */
  app.post("/ranches", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { body, files } = await parseRanchRequest(req);

      const parsed = ranchPayloadSchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid ranch payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const ranchId = uuid();

      const ranchRoot = await ensureRanchStructure(ranchId);

      let logoUrl: string | null = null;
      let brandUrl: string | null = null;

      for (const file of files) {
        const field = file.fieldname;

        if (field === "logo") {
          const saved = await saveUploadedFile(file, path.join(ranchRoot, "logo"));
          logoUrl = saved.filename;
        }

        if (field === "brand") {
          const saved = await saveUploadedFile(file, path.join(ranchRoot, "brand"));
          brandUrl = saved.filename;
        }
      }

      await db.insert(ranches).values({
        id: ranchId,
        name: data.name,
        description: toNullIfEmpty(data.description),
        dba: toNullIfEmpty(data.dba),
        phone: toNullIfEmpty(data.phone),

        phys_street: toNullIfEmpty(data.phys_street),
        phys_city: toNullIfEmpty(data.phys_city),
        phys_state: toNullIfEmpty(data.phys_state),
        phys_zip: toNullIfEmpty(data.phys_zip),

        mail_street: toNullIfEmpty(data.mail_street),
        mail_city: toNullIfEmpty(data.mail_city),
        mail_state: toNullIfEmpty(data.mail_state),
        mail_zip: toNullIfEmpty(data.mail_zip),

        logo_image_url: logoUrl,
        brand_image_url: brandUrl,
      });

      await db.insert(userRanches).values({
        userId: req.auth!.userId,
        ranchId,
        role: "owner",
      });

      // Default Transfer herd (full schema-friendly)
      const existingTransfer = await db
        .select({ id: herds.id })
        .from(herds)
        .where(and(eq(herds.ranchId, ranchId), eq(herds.name, "Transfer")))
        .limit(1);

      if (!existingTransfer.length) {
        await db.insert(herds).values({
          id: uuid(),
          ranchId,
          name: "Transfer",
          shortDescription: "System-managed holding herd.",
          longDescription:
            "System-managed holding herd. Animals may be placed here temporarily for transfers.",
          species: null,
          breed: null,
          maleDesc: null,
          femaleDesc: null,
          babyDesc: null,
        });
      }

      return reply.send({ id: ranchId });
    } catch (err: any) {
      req.log.error({ err }, "Failed to create ranch");
      return reply.status(500).send({
        error: "Failed to create ranch",
        message: err?.message,
      });
    }
  });

/**
 * GET ranch by id (used by Ranch Settings UI)
 *
 * Access: only the active ranch for this user.
 */
app.get("/ranches/:id", { preHandler: requireAuth }, async (req, reply) => {
  try {
    const { id } = req.params as { id: string };

    const activeRanchId = await getActiveRanchId(req.auth!.userId);
    if (!activeRanchId) return reply.status(400).send({ error: "No ranch selected" });
    if (activeRanchId !== id) return reply.status(403).send({ error: "Forbidden" });

    const ranchRows = await db
      .select({
        id: ranches.id,
        name: ranches.name,
        description: ranches.description,
        dba: ranches.dba,
        phone: ranches.phone,

        phys_street: ranches.phys_street,
        phys_city: ranches.phys_city,
        phys_state: ranches.phys_state,
        phys_zip: ranches.phys_zip,

        mail_street: ranches.mail_street,
        mail_city: ranches.mail_city,
        mail_state: ranches.mail_state,
        mail_zip: ranches.mail_zip,

        logo_image_url: ranches.logo_image_url,
        brand_image_url: ranches.brand_image_url,
      })
      .from(ranches)
      .where(eq(ranches.id, id))
      .limit(1);

    const ranch = ranchRows[0] ?? null;
    if (!ranch) return reply.status(404).send({ error: "Ranch not found" });

    return reply.send(ranch);
  } catch (err: any) {
    req.log.error({ err }, "Failed to load ranch");
    return reply.status(500).send({ error: "Failed to load ranch", message: err?.message });
  }
});

/**
 * UPDATE ranch by id (used by Ranch Settings UI Save Ranch for base fields)
 *
 * Supports multipart file upload for "logo" and "brand" fields.
 * Access: only the active ranch for this user.
 */
app.put("/ranches/:id", { preHandler: requireAuth }, async (req, reply) => {
  try {
    const { id } = req.params as { id: string };

    const activeRanchId = await getActiveRanchId(req.auth!.userId);
    if (!activeRanchId) return reply.status(400).send({ error: "No ranch selected" });
    if (activeRanchId !== id) return reply.status(403).send({ error: "Forbidden" });

    const { body, files } = await parseRanchRequest(req);

    const parsed = ranchUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid ranch payload",
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    // Handle optional uploads
    const ranchRoot = await ensureRanchStructure(id);

    let logoUrl: string | null | undefined = undefined;
    let brandUrl: string | null | undefined = undefined;

    for (const file of files) {
      const field = file.fieldname;

      if (field === "logo") {
        const saved = await saveUploadedFile(file, path.join(ranchRoot, "logo"));
        logoUrl = saved.filename;
      }

      if (field === "brand") {
        const saved = await saveUploadedFile(file, path.join(ranchRoot, "brand"));
        brandUrl = saved.filename;
      }
    }

    await db
      .update(ranches)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined
          ? { description: toNullIfEmpty(data.description) }
          : {}),
        ...(data.dba !== undefined ? { dba: toNullIfEmpty(data.dba) } : {}),
        ...(data.phone !== undefined ? { phone: toNullIfEmpty(data.phone) } : {}),

        ...(data.phys_street !== undefined
          ? { phys_street: toNullIfEmpty(data.phys_street) }
          : {}),
        ...(data.phys_city !== undefined ? { phys_city: toNullIfEmpty(data.phys_city) } : {}),
        ...(data.phys_state !== undefined
          ? { phys_state: toNullIfEmpty(data.phys_state) }
          : {}),
        ...(data.phys_zip !== undefined ? { phys_zip: toNullIfEmpty(data.phys_zip) } : {}),

        ...(data.mail_street !== undefined
          ? { mail_street: toNullIfEmpty(data.mail_street) }
          : {}),
        ...(data.mail_city !== undefined ? { mail_city: toNullIfEmpty(data.mail_city) } : {}),
        ...(data.mail_state !== undefined
          ? { mail_state: toNullIfEmpty(data.mail_state) }
          : {}),
        ...(data.mail_zip !== undefined ? { mail_zip: toNullIfEmpty(data.mail_zip) } : {}),

        ...(logoUrl !== undefined ? { logo_image_url: logoUrl } : {}),
        ...(brandUrl !== undefined ? { brand_image_url: brandUrl } : {}),
      })
      .where(eq(ranches.id, id));

    return reply.send({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to update ranch");
    return reply.status(500).send({ error: "Failed to update ranch", message: err?.message });
  }
});

  /**
   * GET Ranch Settings (active ranch)
   */
  app.get("/ranch-settings", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const ranchRows = await db
        .select({
          id: ranches.id,
          name: ranches.name,
          description: ranches.description,
          dba: ranches.dba,
          phone: ranches.phone,

          phys_street: ranches.phys_street,
          phys_city: ranches.phys_city,
          phys_state: ranches.phys_state,
          phys_zip: ranches.phys_zip,

          mail_street: ranches.mail_street,
          mail_city: ranches.mail_city,
          mail_state: ranches.mail_state,
          mail_zip: ranches.mail_zip,

          logo_image_url: ranches.logo_image_url,
          brand_image_url: ranches.brand_image_url,
        })
        .from(ranches)
        .where(eq(ranches.id, ranchId))
        .limit(1);

      const ranch = ranchRows[0] ?? null;
      if (!ranch) return reply.status(404).send({ error: "Ranch not found" });

      const speciesRows = await db
        .select({
          species: ranchSpecies.species,

          male_desc: ranchSpecies.maleDesc,
          female_desc: ranchSpecies.femaleDesc,
          baby_desc: ranchSpecies.babyDesc,

          male_neut_desc: ranchSpecies.maleNeutDesc,
          female_neut_desc: ranchSpecies.femaleNeutDesc,
        })
        .from(ranchSpecies)
        .where(eq(ranchSpecies.ranchId, ranchId))
        .orderBy(ranchSpecies.species);

      const ageBandRows = await db
        .select({
          id: ranchAgeBands.id,
          species: ranchAgeBands.species,

          label: ranchAgeBands.label,
          teeth_desc: ranchAgeBands.teethDesc,

          min_months: ranchAgeBands.minMonths,
          max_months: ranchAgeBands.maxMonths,
          sort_order: ranchAgeBands.sortOrder,
        })
        .from(ranchAgeBands)
        .where(eq(ranchAgeBands.ranchId, ranchId))
        .orderBy(ranchAgeBands.species, ranchAgeBands.sortOrder);

      return reply.send({
        ranch,
        species: speciesRows,
        age_bands: ageBandRows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to load ranch settings");
      return reply.status(500).send({ error: "Failed to load ranch settings" });
    }
  });

  /**
   * PUT Ranch Settings (active ranch)
   *
   * Behavior:
   * - Reconciles ranch_species to match payload (delete missing, upsert present)
   * - Seeds default age bands for newly added species ONLY when that ranch/species has 0 existing age bands
   *   AND the payload does not include any age_bands rows for that species.
   * - If payload includes age_bands, we replace per-species for the species present in the payload.
   */
  app.put("/ranch-settings", { preHandler: requireAuth }, async (req, reply) => {
    try {
      const ranchId = await getActiveRanchId(req.auth!.userId);
      if (!ranchId) return reply.status(400).send({ error: "No ranch selected" });

      const parsed = ranchSettingsPutSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid ranch settings payload",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const incomingSpecies = data.species.map((s) => s.species.trim()).filter(Boolean);

      // Map of species -> incoming age bands (if provided)
      const incomingAgeBands = data.age_bands ?? [];
      const bandsBySpecies = new Map<string, typeof incomingAgeBands>();
      for (const b of incomingAgeBands) {
        const sp = b.species.trim();
        if (!bandsBySpecies.has(sp)) bandsBySpecies.set(sp, []);
        bandsBySpecies.get(sp)!.push(b);
      }

      // Transaction for consistency
      await db.transaction(async (tx) => {
        // Existing species for this ranch
        const existingSpeciesRows = await tx
          .select({ species: ranchSpecies.species })
          .from(ranchSpecies)
          .where(eq(ranchSpecies.ranchId, ranchId));

        const existingSpecies = new Set(existingSpeciesRows.map((r) => r.species));

        // 1) Delete species removed
        if (incomingSpecies.length === 0) {
          // If rancher clears all species, remove all ranch_species + age bands
          await tx.delete(ranchSpecies).where(eq(ranchSpecies.ranchId, ranchId));
          await tx.delete(ranchAgeBands).where(eq(ranchAgeBands.ranchId, ranchId));
        }
        
        // Drizzle typing for inArray + computed lists can be painful; do deletions explicitly.
        const toDelete = existingSpeciesRows
          .map((r) => r.species)
          .filter((sp) => !incomingSpecies.includes(sp));
        if (toDelete.length) {
          await tx
            .delete(ranchSpecies)
            .where(and(eq(ranchSpecies.ranchId, ranchId), inArray(ranchSpecies.species, toDelete)));
          await tx
            .delete(ranchAgeBands)
            .where(and(eq(ranchAgeBands.ranchId, ranchId), inArray(ranchAgeBands.species, toDelete)));
        }

        // 2) Upsert ranch_species rows
        for (const s of data.species) {
          const species = s.species.trim();
          const defaults = DEFAULT_SPECIES_VOCAB[species] ?? {};

          await tx
            .insert(ranchSpecies)
            .values({
              ranchId,
              species,

              maleDesc: toNullIfEmpty(s.male_desc ?? defaults.maleDesc ?? undefined),
              femaleDesc: toNullIfEmpty(s.female_desc ?? defaults.femaleDesc ?? undefined),
              babyDesc: toNullIfEmpty(s.baby_desc ?? defaults.babyDesc ?? undefined),

              maleNeutDesc: toNullIfEmpty(s.male_neut_desc ?? defaults.maleNeutDesc ?? undefined),
              femaleNeutDesc: toNullIfEmpty(s.female_neut_desc ?? defaults.femaleNeutDesc ?? undefined),

              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [ranchSpecies.ranchId, ranchSpecies.species],
              set: {
                maleDesc: toNullIfEmpty(s.male_desc ?? defaults.maleDesc ?? undefined),
                femaleDesc: toNullIfEmpty(s.female_desc ?? defaults.femaleDesc ?? undefined),
                babyDesc: toNullIfEmpty(s.baby_desc ?? defaults.babyDesc ?? undefined),

                maleNeutDesc: toNullIfEmpty(s.male_neut_desc ?? defaults.maleNeutDesc ?? undefined),
                femaleNeutDesc: toNullIfEmpty(s.female_neut_desc ?? defaults.femaleNeutDesc ?? undefined),

                updatedAt: new Date(),
              },
            });
        }

        // 3) Seed defaults for newly added species (only if no existing age bands AND no payload age bands for that species)
        for (const species of incomingSpecies) {
          const isNew = !existingSpecies.has(species);

          // only seed for truly newly-added species (prevents accidental re-seeding)
          if (!isNew) continue;

          const hasIncomingBands = (bandsBySpecies.get(species)?.length ?? 0) > 0;
          if (hasIncomingBands) continue;

          const existingBands = await tx
            .select({ id: ranchAgeBands.id })
            .from(ranchAgeBands)
            .where(and(eq(ranchAgeBands.ranchId, ranchId), eq(ranchAgeBands.species, species)))
            .limit(1);

          if (existingBands.length) continue;

          const templates = DEFAULT_AGE_BANDS[species];
          if (!templates?.length) continue;

          await tx.insert(ranchAgeBands).values(
            templates.map((t, idx) => ({
              id: uuid(),
              ranchId,
              species,

              label: t.label,
              teethDesc: t.teethDesc ?? null,

              maleTerm: t.maleTerm ?? null,
              femaleTerm: t.femaleTerm ?? null,
              maleNeutTerm: t.maleNeutTerm ?? null,
              femaleNeutTerm: t.femaleNeutTerm ?? null,

              minMonths: t.minMonths,
              maxMonths: t.maxMonths,

              sortOrder: idx,
              createdAt: new Date(),
              updatedAt: new Date(),
            }))
          );
        }

        // 4) Replace age bands per species included in payload
        // We only touch species that appear in incoming age_bands (prevents accidental deletion).
        for (const [species, bands] of bandsBySpecies.entries()) {
          // delete existing
          await tx
            .delete(ranchAgeBands)
            .where(and(eq(ranchAgeBands.ranchId, ranchId), eq(ranchAgeBands.species, species)));

          // insert new
          const sorted = [...bands].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          await tx.insert(ranchAgeBands).values(
            sorted.map((b, idx) => ({
              id: b.id ?? uuid(),
              ranchId,
              species,

              label: b.label,
              teethDesc: b.teeth_desc ?? null,

              maleTerm: b.male_term ?? null,
              femaleTerm: b.female_term ?? null,
              maleNeutTerm: b.male_neut_term ?? null,
              femaleNeutTerm: b.female_neut_term ?? null,

              minMonths: b.min_months,
              maxMonths: b.max_months ?? null,

              sortOrder: b.sort_order ?? idx,
              createdAt: new Date(),
              updatedAt: new Date(),
            }))
          );
        }
      });

      return reply.send({ ok: true });
    } catch (err: any) {
      // Exclusion constraint overlap violation is usually SQLSTATE 23P01
      const code = err?.code as string | undefined;

      if (code === "23P01") {
        return reply.status(400).send({
          error: "Invalid age bands",
          message:
            "Age bands overlap for at least one species. Please adjust min/max months so ranges do not overlap.",
        });
      }

      req.log.error({ err }, "Failed to save ranch settings");
      return reply.status(500).send({
        error: "Failed to save ranch settings",
        message: err?.message,
      });
    }
  });
}
