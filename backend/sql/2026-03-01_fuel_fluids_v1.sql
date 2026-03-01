-- GrazeTrack Fuel & Fluids (v1)
-- Tracks fuel/fluid products, purchases, inventory balances, and photos.
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-03-01

BEGIN;

CREATE TABLE IF NOT EXISTS fuel_products (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'OTHER',
  default_unit text NOT NULL DEFAULT 'gal',
  unit_type text NOT NULL DEFAULT 'VOLUME',
  default_package_size numeric,
  default_package_unit text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fuel_products_category_chk'
  ) THEN
    ALTER TABLE fuel_products
      ADD CONSTRAINT fuel_products_category_chk
      CHECK (category IN (
        'GASOLINE',
        'DIESEL',
        'OIL_2_CYCLE',
        'MOTOR_OIL',
        'HYDRAULIC_FLUID',
        'GREASE_LUBRICANT',
        'DEF',
        'COOLANT',
        'OTHER'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fuel_products_unit_type_chk'
  ) THEN
    ALTER TABLE fuel_products
      ADD CONSTRAINT fuel_products_unit_type_chk
      CHECK (unit_type IN ('WEIGHT', 'VOLUME', 'COUNT'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS fuel_products_ranch_idx
  ON fuel_products (ranch_id);

CREATE INDEX IF NOT EXISTS fuel_products_lookup_idx
  ON fuel_products (ranch_id, category, is_active, name);

CREATE TABLE IF NOT EXISTS fuel_purchases (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  purchase_date date NOT NULL,
  vendor text,
  invoice_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fuel_purchases_ranch_idx
  ON fuel_purchases (ranch_id);

CREATE INDEX IF NOT EXISTS fuel_purchases_date_idx
  ON fuel_purchases (purchase_date);

CREATE TABLE IF NOT EXISTS fuel_purchase_items (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  fuel_purchase_id uuid NOT NULL,
  fuel_product_id uuid NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL DEFAULT 'gal',
  unit_cost numeric,
  total_cost numeric,
  unit_type text,
  normalized_quantity numeric,
  normalized_unit text,
  package_size numeric,
  package_unit text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fuel_purchase_items_unit_type_chk'
  ) THEN
    ALTER TABLE fuel_purchase_items
      ADD CONSTRAINT fuel_purchase_items_unit_type_chk
      CHECK (unit_type IS NULL OR unit_type IN ('WEIGHT', 'VOLUME', 'COUNT'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS fuel_purchase_items_purchase_idx
  ON fuel_purchase_items (fuel_purchase_id);

CREATE INDEX IF NOT EXISTS fuel_purchase_items_ranch_idx
  ON fuel_purchase_items (ranch_id);

CREATE INDEX IF NOT EXISTS fuel_purchase_items_product_idx
  ON fuel_purchase_items (fuel_product_id);

CREATE TABLE IF NOT EXISTS fuel_inventory_balances (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  fuel_product_id uuid NOT NULL,
  unit text NOT NULL,
  on_hand_quantity numeric NOT NULL DEFAULT 0,
  normalized_on_hand_quantity numeric,
  normalized_unit text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fuel_inventory_balances_unique_idx
  ON fuel_inventory_balances (ranch_id, fuel_product_id, unit);

CREATE INDEX IF NOT EXISTS fuel_inventory_balances_ranch_idx
  ON fuel_inventory_balances (ranch_id, updated_at);

CREATE TABLE IF NOT EXISTS fuel_photos (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  file_path text,
  storage_url text,
  original_filename text,
  mime_type text,
  file_size integer,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  metadata_json jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fuel_photos_entity_type_chk'
  ) THEN
    ALTER TABLE fuel_photos
      ADD CONSTRAINT fuel_photos_entity_type_chk
      CHECK (entity_type IN ('PRODUCT', 'PURCHASE'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS fuel_photos_ranch_idx
  ON fuel_photos (ranch_id);

CREATE INDEX IF NOT EXISTS fuel_photos_lookup_idx
  ON fuel_photos (ranch_id, entity_type, entity_id, uploaded_at);

COMMIT;
