import {pgTable, text, timestamp, primaryKey, decimal, customType, date, boolean, index, uniqueIndex} from "drizzle-orm/pg-core";

/**
 * Ranches
 */
export const ranches = pgTable("ranches", {
  id: text("id").primaryKey(),

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
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  firebaseUid: text("firebase_uid").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * User ↔ Ranch membership
 */
export const userRanches = pgTable(
  "user_ranches",
  {
    userId: text("user_id").notNull(),
    ranchId: text("ranch_id").notNull(),
    role: text("role").default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.ranchId] }),
  })
);

/**
 * Herds (full schema)
 */
export const herds = pgTable("herds", {
  id: text("id").primaryKey(),
  ranchId: text("ranch_id").notNull(),

  name: text("name").notNull(),
  shortDescription: text("short_description"),

  species: text("species"),
  breed: text("breed"),

  maleDesc: text("male_desc"),
  femaleDesc: text("female_desc"),
  babyDesc: text("baby_desc"),

  longDescription: text("long_description"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Animals
 */
export const animals = pgTable("animals", {
  id: text("id").primaryKey(),
  ranchId: text("ranch_id").notNull(),
  tag: text("tag"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Zones (pastures/grazing areas) - PostGIS geometry
 */
const geometry = customType<{ data: any; driverData: any }>({
  dataType() {
    return "geometry";
  },
});

export const zones = pgTable("zones", {
  id: text("id").primaryKey(),
  ranchId: text("ranch_id").notNull(),

  name: text("name").notNull(),
  description: text("description"),

  areaAcres: decimal("area_acres"),
  geom: geometry("geom"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Animal ↔ Herd membership
 */
export const animalHerdMembership = pgTable(
  "animal_herd_membership",
  {
    animalId: text("animal_id").notNull(),
    herdId: text("herd_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.animalId, t.herdId] }),
  })
);

/* =========================================================================================
 * Medication Module (v1)
 * ========================================================================================= */

/**
 * Suppliers (vendor upsert target)
 */
export const suppliers = pgTable(
  "suppliers",
  {
    id: text("id").primaryKey(),
    ranchId: text("ranch_id").notNull(),

    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("suppliers_ranch_idx").on(t.ranchId),
    ranchNameUnique: uniqueIndex("suppliers_ranch_name_unique").on(
      t.ranchId,
      t.nameNormalized
    ),
  })
);

/**
 * Standard Medications: the "thing they usually buy" (dropdown source)
 * Scoped to ranch.
 */
export const standardMedications = pgTable(
  "standard_medications",
  {
    id: text("id").primaryKey(),
    ranchId: text("ranch_id").notNull(),

    chemicalName: text("chemical_name").notNull(), // Ibuprofen, Ivermectin, Vitamin D...
    format: text("format").notNull(), // pill, liquid, powder, paste, injectable, other

    // Concentration is optional because some products are "1 bottle" etc.
    concentrationValue: decimal("concentration_value"), // "200", "5" (as string via drizzle)
    concentrationUnit: text("concentration_unit"), // "mg", "%", "mg/mL", etc.

    manufacturerName: text("manufacturer_name").notNull(), // allow "Generic"
    brandName: text("brand_name").notNull(), // allow "Generic"

    onLabelDoseText: text("on_label_dose_text"), // freeform

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("standard_meds_ranch_idx").on(t.ranchId),
    chemicalIdx: index("standard_meds_chemical_idx").on(t.ranchId, t.chemicalName),
  })
);

/**
 * Ranch Medication Standards: time-ranged (endDate null = active)
 * This is where off-label vs on-label practice lives.
 */
export const ranchMedicationStandards = pgTable(
  "ranch_medication_standards",
  {
    id: text("id").primaryKey(),
    ranchId: text("ranch_id").notNull(),
    standardMedicationId: text("standard_medication_id").notNull(),

    usesOffLabel: boolean("uses_off_label").notNull(),
    standardDoseText: text("standard_dose_text").notNull(),

    startDate: date("start_date").notNull(),
    endDate: date("end_date"), // null = active

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("ranch_standards_ranch_idx").on(t.ranchId),
    medIdx: index("ranch_standards_med_idx").on(t.ranchId, t.standardMedicationId),
    activeLookupIdx: index("ranch_standards_active_lookup_idx").on(
      t.ranchId,
      t.standardMedicationId,
      t.endDate
    ),
  })
);

/**
 * Medication Purchases: append-only
 * Inventory is derived from purchases (and later decremented by treatments).
 */
export const medicationPurchases = pgTable(
  "medication_purchases",
  {
    id: text("id").primaryKey(),
    ranchId: text("ranch_id").notNull(),
    standardMedicationId: text("standard_medication_id").notNull(),

    supplierId: text("supplier_id"), // nullable
    purchaseDate: date("purchase_date").notNull(),

    quantity: decimal("quantity").notNull(),
    purchaseUnit: text("purchase_unit").notNull(), // pills, bottles, mL, cc, doses, etc.
    totalPrice: decimal("total_price"), // optional

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ranchIdx: index("med_purchases_ranch_idx").on(t.ranchId),
    medIdx: index("med_purchases_med_idx").on(t.ranchId, t.standardMedicationId),
    supplierIdx: index("med_purchases_supplier_idx").on(t.ranchId, t.supplierId),
    dateIdx: index("med_purchases_date_idx").on(t.ranchId, t.purchaseDate),
  })
);
