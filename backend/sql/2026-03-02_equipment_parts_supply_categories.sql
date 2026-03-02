-- GrazeTrack Equipment Parts: add working-day supply categories
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-03-02

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_parts_category_chk'
  ) THEN
    ALTER TABLE equipment_parts
      DROP CONSTRAINT equipment_parts_category_chk;
  END IF;

  ALTER TABLE equipment_parts
    ADD CONSTRAINT equipment_parts_category_chk
    CHECK (category IN (
      'FENCING',
      'HARDWARE',
      'PLUMBING',
      'ELECTRICAL',
      'LIVESTOCK_HANDLING',
      'IMPLEMENT_PART',
      'VEHICLE_PART',
      'IDENTIFICATION',
      'MED_SUPPLIES',
      'OTHER'
    ));
END
$$;

COMMIT;
