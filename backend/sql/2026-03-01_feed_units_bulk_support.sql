-- GrazeTrack Feed Management v2
-- Unit abstraction + bulk support + optional normalized quantity tracking.
-- Non-breaking additive migration.
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-03-01

BEGIN;

ALTER TABLE feed_components
  ADD COLUMN IF NOT EXISTS unit_type text,
  ADD COLUMN IF NOT EXISTS default_package_weight numeric,
  ADD COLUMN IF NOT EXISTS default_package_unit text,
  ADD COLUMN IF NOT EXISTS is_bulk_commodity boolean NOT NULL DEFAULT false;

ALTER TABLE feed_blends
  ADD COLUMN IF NOT EXISTS unit_type text,
  ADD COLUMN IF NOT EXISTS default_unit text NOT NULL DEFAULT 'lb',
  ADD COLUMN IF NOT EXISTS default_package_weight numeric,
  ADD COLUMN IF NOT EXISTS default_package_unit text,
  ADD COLUMN IF NOT EXISTS is_bulk_commodity boolean NOT NULL DEFAULT false;

ALTER TABLE feed_purchase_items
  ADD COLUMN IF NOT EXISTS unit_type text,
  ADD COLUMN IF NOT EXISTS normalized_quantity numeric,
  ADD COLUMN IF NOT EXISTS normalized_unit text,
  ADD COLUMN IF NOT EXISTS package_weight numeric,
  ADD COLUMN IF NOT EXISTS package_weight_unit text;

ALTER TABLE feed_inventory_balances
  ADD COLUMN IF NOT EXISTS normalized_on_hand_quantity numeric,
  ADD COLUMN IF NOT EXISTS normalized_unit text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_components_unit_type_chk'
  ) THEN
    ALTER TABLE feed_components
      ADD CONSTRAINT feed_components_unit_type_chk
      CHECK (unit_type IS NULL OR unit_type IN ('WEIGHT', 'COUNT', 'VOLUME'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_blends_unit_type_chk'
  ) THEN
    ALTER TABLE feed_blends
      ADD CONSTRAINT feed_blends_unit_type_chk
      CHECK (unit_type IS NULL OR unit_type IN ('WEIGHT', 'COUNT', 'VOLUME'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_purchase_items_unit_type_chk'
  ) THEN
    ALTER TABLE feed_purchase_items
      ADD CONSTRAINT feed_purchase_items_unit_type_chk
      CHECK (unit_type IS NULL OR unit_type IN ('WEIGHT', 'COUNT', 'VOLUME'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS feed_components_unit_type_idx
  ON feed_components (ranch_id, unit_type);

CREATE INDEX IF NOT EXISTS feed_blends_unit_type_idx
  ON feed_blends (ranch_id, unit_type);

CREATE INDEX IF NOT EXISTS feed_purchase_items_unit_type_idx
  ON feed_purchase_items (ranch_id, unit_type);

CREATE INDEX IF NOT EXISTS feed_inventory_balances_normalized_idx
  ON feed_inventory_balances (ranch_id, normalized_unit, updated_at);

-- Backfill component unit_type based on existing default_unit.
UPDATE feed_components
SET unit_type = CASE
  WHEN lower(default_unit) IN ('lb','lbs','pound','pounds','kg','kgs','kilogram','kilograms','ton','tons') THEN 'WEIGHT'
  WHEN lower(default_unit) IN ('bag','bags','tub','tubs','bale','bales','pallet','pallets','sack','sacks') THEN 'COUNT'
  WHEN lower(default_unit) IN ('gal','gallon','gallons','l','liter','liters') THEN 'VOLUME'
  ELSE NULL
END
WHERE unit_type IS NULL;

-- Backfill blend unit_type from default_unit.
UPDATE feed_blends
SET unit_type = CASE
  WHEN lower(default_unit) IN ('lb','lbs','pound','pounds','kg','kgs','kilogram','kilograms','ton','tons') THEN 'WEIGHT'
  WHEN lower(default_unit) IN ('bag','bags','tub','tubs','bale','bales','pallet','pallets','sack','sacks') THEN 'COUNT'
  WHEN lower(default_unit) IN ('gal','gallon','gallons','l','liter','liters') THEN 'VOLUME'
  ELSE NULL
END
WHERE unit_type IS NULL;

-- If package weight exists but package unit is omitted, use lb.
UPDATE feed_components
SET default_package_unit = 'lb'
WHERE default_package_weight IS NOT NULL
  AND (default_package_unit IS NULL OR btrim(default_package_unit) = '');

UPDATE feed_blends
SET default_package_unit = 'lb'
WHERE default_package_weight IS NOT NULL
  AND (default_package_unit IS NULL OR btrim(default_package_unit) = '');

-- Backfill purchase item unit_type from referenced component/blend if available.
UPDATE feed_purchase_items i
SET unit_type = COALESCE(
  (
    SELECT c.unit_type
    FROM feed_components c
    WHERE c.id = i.feed_component_id
      AND c.ranch_id = i.ranch_id
    LIMIT 1
  ),
  (
    SELECT b.unit_type
    FROM feed_blends b
    WHERE b.id = i.feed_blend_id
      AND b.ranch_id = i.ranch_id
    LIMIT 1
  )
)
WHERE i.unit_type IS NULL;

-- Normalize missing normalized_unit labels where normalized quantities already exist.
UPDATE feed_purchase_items
SET normalized_unit = 'lb'
WHERE normalized_quantity IS NOT NULL
  AND (normalized_unit IS NULL OR btrim(normalized_unit) = '');

UPDATE feed_inventory_balances
SET normalized_unit = 'lb'
WHERE normalized_on_hand_quantity IS NOT NULL
  AND (normalized_unit IS NULL OR btrim(normalized_unit) = '');

COMMIT;
