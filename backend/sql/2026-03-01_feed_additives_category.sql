-- GrazeTrack Feed Management v3
-- Add component categorization to support Additives module overlays.
-- Non-breaking migration: no table splits/duplication.
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-03-01

BEGIN;

ALTER TABLE feed_components
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS delivery_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_components_category_chk'
  ) THEN
    ALTER TABLE feed_components
      ADD CONSTRAINT feed_components_category_chk
      CHECK (category IN ('FORAGE', 'GRAIN', 'MINERAL', 'SUPPLEMENT', 'ADDITIVE', 'OTHER'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_components_delivery_method_chk'
  ) THEN
    ALTER TABLE feed_components
      ADD CONSTRAINT feed_components_delivery_method_chk
      CHECK (
        delivery_method IS NULL OR
        delivery_method IN ('FREE_CHOICE', 'MIXED_IN_FEED', 'WATER', 'TOP_DRESS', 'OTHER')
      );
  END IF;
END
$$;

UPDATE feed_components
SET category = 'OTHER'
WHERE category IS NULL OR btrim(category) = '';

CREATE INDEX IF NOT EXISTS feed_components_category_idx
  ON feed_components (ranch_id, category);

CREATE INDEX IF NOT EXISTS feed_components_delivery_method_idx
  ON feed_components (ranch_id, delivery_method);

COMMIT;
