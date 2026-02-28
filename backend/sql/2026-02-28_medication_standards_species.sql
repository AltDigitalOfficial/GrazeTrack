-- GrazeTrack Medication Standards: species-specific dosing support
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-02-28

BEGIN;

ALTER TABLE ranch_medication_standards
  ADD COLUMN IF NOT EXISTS species text;

CREATE INDEX IF NOT EXISTS ranch_med_standards_species_lookup_idx
  ON ranch_medication_standards (ranch_id, standard_medication_id, species, end_date);

COMMIT;
