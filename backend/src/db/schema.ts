import { pgTable, text, timestamp, primaryKey, decimal } from "drizzle-orm/pg-core";

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
 * User ↔ Ranch membership with role
 * role: "owner" | "admin" | "staff"
 */
export const userRanches = pgTable(
  "user_ranches",
  {
    userId: text("user_id").notNull(),
    ranchId: text("ranch_id").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.ranchId] }),
  })
);

/**
 * Herds
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
 * Zones (pastures/grazing areas)
 */
export const zones = pgTable("zones", {
  id: text("id").primaryKey(),
  ranchId: text("ranch_id").notNull(),

  name: text("name").notNull(),
  description: text("description"),

  areaAcres: decimal("area_acres"),
  geom: text("geom"), // PostGIS geometry as WKT or GeoJSON

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
