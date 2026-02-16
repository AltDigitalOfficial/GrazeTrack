// backend/src/db/schema.ts
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  decimal,
  customType,
  date,
  boolean,
  index,
  uniqueIndex,
  integer,
  jsonb,
  uuid as pgUuid,
} from "drizzle-orm/pg-core";

/* =========================================================================================
 * Core tables
 * ========================================================================================= */

/**
 * Ranches
 */
export const ranches = pgTable("ranches", {
  id: pgUuid("id").primaryKey(),

  name: text("name"),
  description: text("description"),

  dba: text("dba"),
  phone: text("phone"),

  phys_street: text("phys_street"),
  phys_city: text("phys_city"),
  phys_state: text("phys_state"),
  phys_zip: text("phys_zip"),

  mail_street: text("mail_street"),
  mail_city: text("mail_city"),
  mail_state: text("mail_state"),
  mail_zip: text("mail_zip"),

  logo_image_url: text("logo_image_url"),
  brand_image_url: text("brand_image_url"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Users (local mirror of Firebase users)
 *
 * NOTE:
 * - We keep users.id as TEXT because it is (or is treated like) the Firebase UID in auth flows.
 * - Converting users.id to UUID would require a broader auth/membership refactor.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  firebaseUid: text("firebase_uid").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * User ↔ Ranch membership
 *
 * user_id remains TEXT (Firebase UID).
 * ranch_id is UUID (standard).
 */
export const userRanches = pgTable(
  "user_ranches",
  {
    userId: text("user_id").notNull(),
    ranchId: pgUuid("ranch_id").notNull(),
    role: text("role").default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.ranchId] }),
    ranchIdx: index("user_ranches_ranch_idx").on(t.ranchId),
    userIdx: index("user_ranches_user_idx").on(t.userId),
  })
);

/**
 * Ranch ↔ Species (animals raised) + per-species vocabulary
 *
 * Note: composite primary key (ranch_id, species)
 */
export const ranchSpecies = pgTable(
  "ranch_species",
  {
    ranchId: pgUuid("ranch_id").notNull(),
    species: text("species").notNull(),

    maleDesc: text("male_desc"),
    femaleDesc: text("female_desc"),
    maleNeutDesc: text("male_neut_desc"),
    femaleNeutDesc: text("female_neut_desc"),
    babyDesc: text("baby_desc"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ranchId, t.species] }),
    ranchIdx: index("ranch_species_ranch_idx").on(t.ranchId),
  })
);

/**
 * Ranch Age Bands (per species)
 *
 * Note: no age-band gender-specific terms in this version.
 */
export const ranchAgeBands = pgTable(
  "ranch_age_bands",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),
    species: text("species").notNull(),

    label: text("label").notNull(),
    teethDesc: text("teeth_desc"),

    minMonths: integer("min_months").notNull(),
    maxMonths: integer("max_months"),

    sortOrder: integer("sort_order").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    lookupIdx: index("ranch_age_bands_lookup_idx").on(t.ranchId, t.species, t.sortOrder),
  })
);

/**
 * Herds
 */
export const herds = pgTable(
  "herds",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),

    name: text("name").notNull(),
    shortDescription: text("short_description"),

    species: text("species"),
    breed: text("breed"),

    maleDesc: text("male_desc"),
    femaleDesc: text("female_desc"),
    babyDesc: text("baby_desc"),

    // NEW: species-specific labels for neutered animals
    maleNeutDesc: text("male_neut_desc"),
    femaleNeutDesc: text("female_neut_desc"),

    longDescription: text("long_description"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("herds_ranch_idx").on(t.ranchId),
    ranchNameIdx: index("herds_ranch_name_idx").on(t.ranchId, t.name),
  })
);

/**
 * Zones (pastures/grazing areas) - PostGIS geometry
 */
const geometry = customType<{ data: any; driverData: any }>({
  dataType() {
    return "geometry";
  },
});

export const zones = pgTable(
  "zones",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),

    name: text("name").notNull(),
    description: text("description"),

    areaAcres: decimal("area_acres"),
    geom: geometry("geom"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("zones_ranch_idx").on(t.ranchId),
    ranchNameIdx: index("zones_ranch_name_idx").on(t.ranchId, t.name),
  })
);

/**
 * Zone Subzones (paddocks / fenced areas inside a zone)
 */
export const zoneSubzones = pgTable(
  "zone_subzones",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),
    zoneId: pgUuid("zone_id").notNull(),

    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"), // active | resting | inactive

    areaAcres: decimal("area_acres"),
    geom: geometry("geom"),

    targetRestDays: integer("target_rest_days"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("zone_subzones_ranch_idx").on(t.ranchId),
    zoneIdx: index("zone_subzones_zone_idx").on(t.zoneId),
    ranchZoneNameIdx: uniqueIndex("zone_subzones_ranch_zone_name_unique").on(t.ranchId, t.zoneId, t.name),
  })
);

/**
 * Grazing sessions (history by herd and zone/subzone)
 */
export const grazingSessions = pgTable(
  "grazing_sessions",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),
    zoneId: pgUuid("zone_id").notNull(),
    subzoneId: pgUuid("subzone_id"),

    herdId: pgUuid("herd_id"),
    headCount: integer("head_count"),
    stockDensityAuPerAcre: decimal("stock_density_au_per_acre"),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("grazing_sessions_ranch_idx").on(t.ranchId),
    zoneIdx: index("grazing_sessions_zone_idx").on(t.zoneId),
    herdIdx: index("grazing_sessions_herd_idx").on(t.herdId),
    startedIdx: index("grazing_sessions_started_idx").on(t.startedAt),
  })
);

/**
 * Soil samples
 */
export const soilSamples = pgTable(
  "soil_samples",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),
    zoneId: pgUuid("zone_id").notNull(),
    subzoneId: pgUuid("subzone_id"),

    sampledAt: date("sampled_at").notNull(),

    ph: decimal("ph"),
    organicMatterPct: decimal("organic_matter_pct"),
    nitrogenPpm: decimal("nitrogen_ppm"),
    phosphorusPpm: decimal("phosphorus_ppm"),
    potassiumPpm: decimal("potassium_ppm"),
    moisturePct: decimal("moisture_pct"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("soil_samples_ranch_idx").on(t.ranchId),
    zoneIdx: index("soil_samples_zone_idx").on(t.zoneId),
    sampledIdx: index("soil_samples_sampled_idx").on(t.sampledAt),
  })
);

/**
 * Forage observations/samples
 */
export const forageSamples = pgTable(
  "forage_samples",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),
    zoneId: pgUuid("zone_id").notNull(),
    subzoneId: pgUuid("subzone_id"),

    sampledAt: date("sampled_at").notNull(),
    speciesObserved: text("species_observed").array(),

    biomassLbPerAcre: decimal("biomass_lb_per_acre"),
    groundCoverPct: decimal("ground_cover_pct"),
    avgCanopyInches: decimal("avg_canopy_inches"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("forage_samples_ranch_idx").on(t.ranchId),
    zoneIdx: index("forage_samples_zone_idx").on(t.zoneId),
    sampledIdx: index("forage_samples_sampled_idx").on(t.sampledAt),
  })
);

/**
 * Daily weather snapshot per zone/subzone
 */
export const zoneWeatherDaily = pgTable(
  "zone_weather_daily",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),
    zoneId: pgUuid("zone_id").notNull(),
    subzoneId: pgUuid("subzone_id"),

    weatherDate: date("weather_date").notNull(),
    minTempF: decimal("min_temp_f"),
    maxTempF: decimal("max_temp_f"),
    rainInches: decimal("rain_inches"),
    forecastRainInchesNext3d: decimal("forecast_rain_inches_next_3d"),

    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("zone_weather_daily_ranch_idx").on(t.ranchId),
    zoneDateIdx: index("zone_weather_daily_zone_date_idx").on(t.zoneId, t.weatherDate),
    uniqueDailyIdx: uniqueIndex("zone_weather_daily_unique").on(t.ranchId, t.zoneId, t.subzoneId, t.weatherDate),
  })
);

/**
 * Daily computed/entered zone state
 */
export const zoneDailyStates = pgTable(
  "zone_daily_states",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),
    zoneId: pgUuid("zone_id").notNull(),
    subzoneId: pgUuid("subzone_id"),

    stateDate: date("state_date").notNull(),
    restDays: integer("rest_days"),
    estimatedForageLbPerAcre: decimal("estimated_forage_lb_per_acre"),
    utilizationPct: decimal("utilization_pct"),
    moistureStressScore: integer("moisture_stress_score"), // 0..10
    recoveryStage: text("recovery_stage"), // poor | early | mid | full

    needsRest: boolean("needs_rest"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("zone_daily_states_ranch_idx").on(t.ranchId),
    zoneDateIdx: index("zone_daily_states_zone_date_idx").on(t.zoneId, t.stateDate),
    uniqueDailyIdx: uniqueIndex("zone_daily_states_unique").on(t.ranchId, t.zoneId, t.subzoneId, t.stateDate),
  })
);

/**
 * Actionable recommendations for land and grazing operations
 */
export const landRecommendations = pgTable(
  "land_recommendations",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),
    zoneId: pgUuid("zone_id").notNull(),
    subzoneId: pgUuid("subzone_id"),

    recommendationDate: date("recommendation_date").notNull(),
    recommendationType: text("recommendation_type").notNull(), // rest | graze | seed | caution
    priority: text("priority").notNull().default("medium"), // low | medium | high
    title: text("title").notNull(),
    rationale: text("rationale").notNull(),
    actionByDate: date("action_by_date"),
    confidenceScore: decimal("confidence_score"),
    status: text("status").notNull().default("open"), // open | accepted | dismissed | completed
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("land_recommendations_ranch_idx").on(t.ranchId),
    zoneDateIdx: index("land_recommendations_zone_date_idx").on(t.zoneId, t.recommendationDate),
    statusIdx: index("land_recommendations_status_idx").on(t.status),
  })
);

/* =========================================================================================
 * Animals (Animal Inventory v1)
 *
 * IMPORTANT:
 * - animals are NOT directly attached to a ranch.
 * - ranch context is derived via herd membership.
 * - we still store ranch_id snapshots on event/media rows for fast queries + historical truth.
 *
 * UUID Standard:
 * - All id / *_id columns in animal domain are UUID.
 * ========================================================================================= */

export const animals = pgTable(
  "animals",
  {
    id: pgUuid("id").primaryKey(),

    // kept for flexibility / backward compatibility
    tag: text("tag"),
    notes: text("notes"),

    // core identity
    species: text("species"),
    breed: text("breed"),
    sex: text("sex"), // male | female | unknown (enforced in routes)

    birthDate: date("birth_date"),
    birthDateIsEstimated: boolean("birth_date_is_estimated").notNull().default(false),

    // status
    status: text("status").notNull().default("active"), // active | sold | deceased | transferred
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),

    // lineage (no FK)
    damAnimalId: pgUuid("dam_animal_id"),
    sireAnimalId: pgUuid("sire_animal_id"),

    // repro
    neutered: boolean("neutered").notNull().default(false),
    neuteredDate: date("neutered_date"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("animals_status_idx").on(t.status),
    speciesIdx: index("animals_species_idx").on(t.species),
  })
);
/* =========================================================================================
 * Animal ↔ Tag History (time-ranged)
 * ========================================================================================= */

export const animalTagHistory = pgTable(
  "animal_tag_history",
  {
    id: pgUuid("id").primaryKey(),

    animalId: pgUuid("animal_id").notNull(),

    tagNumber: text("tag_number"),
    tagColor: text("tag_color"),
    tagEar: text("tag_ear"),

    changeReason: text("change_reason"),
    changedBy: text("changed_by_user_id"),

    startAt: timestamp("start_at", { withTimezone: true }).defaultNow().notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    animalIdx: index("animal_tag_history_animal_idx").on(t.animalId),
    animalCurrentIdx: index("animal_tag_history_current_idx").on(t.animalId, t.endAt),
  })
);

/* =========================================================================================
 * Animal ↔ Herd membership (time-ranged)
 * ========================================================================================= */

export const animalHerdMembership = pgTable(
  "animal_herd_membership",
  {
    id: pgUuid("id").primaryKey(),

    animalId: pgUuid("animal_id").notNull(),
    herdId: pgUuid("herd_id").notNull(),

    startAt: timestamp("start_at", { withTimezone: true }).defaultNow().notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    animalIdx: index("animal_herd_membership_animal_idx").on(t.animalId),
    herdIdx: index("animal_herd_membership_herd_idx").on(t.herdId),
    animalCurrentIdx: index("animal_herd_membership_animal_current_idx").on(t.animalId, t.endAt),
  })
);

/* =========================================================================================
 * Animal Inventory Module tables (ranch + herd snapshots on rows)
 * ========================================================================================= */

/**
 * Intake events (append-only)
 * intakeType: birth | purchase
 */
export const animalIntakeEvents = pgTable(
  "animal_intake_events",
  {
    id: pgUuid("id").primaryKey(),

    ranchId: pgUuid("ranch_id").notNull(), // snapshot
    herdId: pgUuid("herd_id").notNull(), // snapshot
    animalId: pgUuid("animal_id").notNull(),

    intakeType: text("intake_type").notNull(),
    eventDate: date("event_date").notNull(),

    // birth
    bornOnRanch: boolean("born_on_ranch"),
    damAnimalId: pgUuid("dam_animal_id"),
    sireAnimalId: pgUuid("sire_animal_id"),

    // purchase
    supplierName: text("supplier_name"),
    purchasePriceCents: integer("purchase_price_cents"),
    purchaseCurrency: text("purchase_currency"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchAnimalCreatedIdx: index("animal_intake_events_ranch_animal_created_idx").on(
      t.ranchId,
      t.animalId,
      t.createdAt
    ),
    herdAnimalCreatedIdx: index("animal_intake_events_herd_animal_created_idx").on(
      t.herdId,
      t.animalId,
      t.createdAt
    ),
    ranchTypeDateIdx: index("animal_intake_events_ranch_type_date_idx").on(
      t.ranchId,
      t.intakeType,
      t.eventDate
    ),
  })
);

/**
 * Measurements (append-only)
 */
export const animalMeasurements = pgTable(
  "animal_measurements",
  {
    id: pgUuid("id").primaryKey(),

    ranchId: pgUuid("ranch_id").notNull(), // snapshot
    herdId: pgUuid("herd_id").notNull(), // snapshot
    animalId: pgUuid("animal_id").notNull(),

    measurementType: text("measurement_type").notNull(), // weight | temperature | body_condition_score | other
    valueNumber: decimal("value_number"),
    valueText: text("value_text"),
    unit: text("unit"),
    notes: text("notes"),

    measuredAt: timestamp("measured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchAnimalMeasuredIdx: index("animal_measurements_ranch_animal_measured_idx").on(
      t.ranchId,
      t.animalId,
      t.measuredAt
    ),
    herdAnimalMeasuredIdx: index("animal_measurements_herd_animal_measured_idx").on(
      t.herdId,
      t.animalId,
      t.measuredAt
    ),
    ranchTypeMeasuredIdx: index("animal_measurements_ranch_type_measured_idx").on(
      t.ranchId,
      t.measurementType,
      t.measuredAt
    ),
  })
);

/**
 * Notes (append-only)
 */
export const animalNotes = pgTable(
  "animal_notes",
  {
    id: pgUuid("id").primaryKey(),

    ranchId: pgUuid("ranch_id").notNull(), // snapshot
    herdId: pgUuid("herd_id").notNull(), // snapshot
    animalId: pgUuid("animal_id").notNull(),

    noteType: text("note_type"),
    content: text("content").notNull(),

    noteAt: timestamp("note_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchAnimalCreatedIdx: index("animal_notes_ranch_animal_created_idx").on(t.ranchId, t.animalId, t.createdAt),
    herdAnimalCreatedIdx: index("animal_notes_herd_animal_created_idx").on(t.herdId, t.animalId, t.createdAt),
  })
);

/**
 * Photos (disk metadata; animalId nullable; tags drive "contains animal")
 */
export const animalPhotos = pgTable(
  "animal_photos",
  {
    id: pgUuid("id").primaryKey(),

    ranchId: pgUuid("ranch_id").notNull(), // snapshot
    herdId: pgUuid("herd_id").notNull(), // snapshot

    animalId: pgUuid("animal_id"),

    purpose: text("purpose").notNull(), // profile | side | tag | misc
    storedFilename: text("stored_filename").notNull(),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),

    width: integer("width"),
    height: integer("height"),

    capturedAt: timestamp("captured_at", { withTimezone: true }),
    caption: text("caption"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchCreatedIdx: index("animal_photos_ranch_created_idx").on(t.ranchId, t.createdAt),
    herdCreatedIdx: index("animal_photos_herd_created_idx").on(t.herdId, t.createdAt),
    ranchAnimalCreatedIdx: index("animal_photos_ranch_animal_created_idx").on(t.ranchId, t.animalId, t.createdAt),
  })
);

/**
 * Documents (disk metadata)
 */
export const animalDocuments = pgTable(
  "animal_documents",
  {
    id: pgUuid("id").primaryKey(),

    ranchId: pgUuid("ranch_id").notNull(), // snapshot
    herdId: pgUuid("herd_id").notNull(), // snapshot
    animalId: pgUuid("animal_id").notNull(),

    purpose: text("purpose").notNull(), // medical | insurance | registration | misc
    storedFilename: text("stored_filename").notNull(),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),

    caption: text("caption"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchAnimalCreatedIdx: index("animal_documents_ranch_animal_created_idx").on(t.ranchId, t.animalId, t.createdAt),
    herdAnimalCreatedIdx: index("animal_documents_herd_animal_created_idx").on(t.herdId, t.animalId, t.createdAt),
  })
);

/**
 * Photo tags (many animals per photo; bbox deferred)
 */
export const animalPhotoTags = pgTable(
  "animal_photo_tags",
  {
    id: pgUuid("id").primaryKey(),

    ranchId: pgUuid("ranch_id").notNull(), // snapshot
    photoId: pgUuid("photo_id").notNull(),
    animalId: pgUuid("animal_id").notNull(),

    tagType: text("tag_type").notNull().default("contains"), // contains | primary | uncertain
    confidence: decimal("confidence"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueTag: uniqueIndex("animal_photo_tags_unique").on(t.ranchId, t.photoId, t.animalId),
    ranchAnimalCreatedIdx: index("animal_photo_tags_ranch_animal_created_idx").on(t.ranchId, t.animalId, t.createdAt),
    ranchPhotoIdx: index("animal_photo_tags_ranch_photo_idx").on(t.ranchId, t.photoId),
  })
);

/* =========================================================================================
 * Medication Module (v1)
 * UUID Standard:
 * - All PK ids and *_id relationship columns are UUID (except user_id).
 * ========================================================================================= */

/**
 * Suppliers (vendor upsert target)
 */
export const suppliers = pgTable(
  "suppliers",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),

    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("suppliers_ranch_idx").on(t.ranchId),
    ranchNameUnique: uniqueIndex("suppliers_ranch_name_unique").on(t.ranchId, t.nameNormalized),
  })
);

/**
 * Standard Medications
 */
export const standardMedications = pgTable(
  "standard_medications",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),

    chemicalName: text("chemical_name").notNull(),
    format: text("format").notNull(),

    concentrationValue: decimal("concentration_value"),
    concentrationUnit: text("concentration_unit"),

    manufacturerName: text("manufacturer_name").notNull(),
    brandName: text("brand_name").notNull(),

    onLabelDoseText: text("on_label_dose_text"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

    // Which ranch species this medication applies to.
    // Stored as an array of the species strings from Ranch Settings.
    applicableSpecies: text("applicable_species").array(),

    // Structured on-label dose (for future dosage math)
    // Example: 1.0 mL per 100 lb -> doseAmount=1.0, doseUnit="mL", perAmount=100, perUnit="lb"
    onLabelDoseAmount: decimal("on_label_dose_amount"),
    onLabelDoseUnit: text("on_label_dose_unit"),
    onLabelPerAmount: decimal("on_label_per_amount"),
    onLabelPerUnit: text("on_label_per_unit"),

},
  (t) => ({
    ranchIdx: index("standard_meds_ranch_idx").on(t.ranchId),
    chemicalIdx: index("standard_meds_chemical_idx").on(t.ranchId, t.chemicalName),
  })
);

/**
 * Ranch Medication Standards: time-ranged (endDate null = active)
 */
export const ranchMedicationStandards = pgTable(
  "ranch_medication_standards",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),
    standardMedicationId: pgUuid("standard_medication_id").notNull(),

    usesOffLabel: boolean("uses_off_label").notNull(),
    standardDoseText: text("standard_dose_text").notNull(),

    startDate: date("start_date").notNull(),
    endDate: date("end_date"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

    // Structured ranch standard dose (for future dosage math)
    standardDoseAmount: decimal("standard_dose_amount"),
    standardDoseUnit: text("standard_dose_unit"),
    standardPerAmount: decimal("standard_per_amount"),
    standardPerUnit: text("standard_per_unit"),
  },
  (t) => ({
    ranchIdx: index("ranch_med_standards_ranch_idx").on(t.ranchId),
    medIdx: index("ranch_med_standards_med_idx").on(t.standardMedicationId),
    activeLookupIdx: index("ranch_med_standards_active_lookup_idx").on(t.ranchId, t.standardMedicationId, t.endDate),
  })
);

/**
 * Medication Purchases (append-only)
 */
export const medicationPurchases = pgTable(
  "medication_purchases",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),

    standardMedicationId: pgUuid("standard_medication_id").notNull(),
    supplierId: pgUuid("supplier_id"),

    purchaseDate: date("purchase_date").notNull(),

    quantity: decimal("quantity").notNull(),

    totalPrice: decimal("total_price"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("medication_purchases_ranch_idx").on(t.ranchId),
    medIdx: index("medication_purchases_med_idx").on(t.standardMedicationId),
    supplierIdx: index("medication_purchases_supplier_idx").on(t.supplierId),
    dateIdx: index("medication_purchases_purchase_date_idx").on(t.purchaseDate),
  })
);

/**
 * Medication Purchase Images
 */
export const medicationPurchaseImages = pgTable(
  "medication_purchase_images",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),

    medicationPurchaseId: pgUuid("medication_purchase_id").notNull(),

    purpose: text("purpose").notNull(),
    storedFilename: text("stored_filename").notNull(),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("medication_purchase_images_ranch_idx").on(t.ranchId),
    purchaseIdx: index("medication_purchase_images_purchase_idx").on(t.medicationPurchaseId),
  })
);

/**
 * Standard Medication Images
 */
export const standardMedicationImages = pgTable(
  "standard_medication_images",
  {
    id: pgUuid("id").primaryKey(),
    ranchId: pgUuid("ranch_id").notNull(),

    standardMedicationId: pgUuid("standard_medication_id").notNull(),

    purpose: text("purpose").notNull(),
    storedFilename: text("stored_filename").notNull(),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("standard_medication_images_ranch_idx").on(t.ranchId),
    medIdx: index("standard_medication_images_med_idx").on(t.standardMedicationId),
  })
);
