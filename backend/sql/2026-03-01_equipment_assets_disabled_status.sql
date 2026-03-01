-- GrazeTrack Equipment asset status expansion (v1.2)
-- Adds DISABLED as a valid equipment asset status.
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-03-01

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.equipment_assets') IS NULL THEN
    RAISE NOTICE 'equipment_assets table not found; skipping status constraint update.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_assets_status_chk'
  ) THEN
    ALTER TABLE equipment_assets DROP CONSTRAINT equipment_assets_status_chk;
  END IF;

  ALTER TABLE equipment_assets
    ADD CONSTRAINT equipment_assets_status_chk
    CHECK (status IN ('ACTIVE', 'DISABLED', 'SOLD', 'RETIRED', 'LOST', 'RENTED', 'LEASED'));
END
$$;

COMMIT;
