-- GrazeTrack Medications: purpose + dosing model on standard definitions
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-03-02

BEGIN;

ALTER TABLE standard_medications
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS dosing_basis text,
  ADD COLUMN IF NOT EXISTS dose_value numeric,
  ADD COLUMN IF NOT EXISTS dose_unit text,
  ADD COLUMN IF NOT EXISTS dose_weight_unit text;

UPDATE standard_medications
SET purpose = 'OTHER'
WHERE purpose IS NULL OR btrim(purpose) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'standard_medications_purpose_chk'
  ) THEN
    ALTER TABLE standard_medications
      ADD CONSTRAINT standard_medications_purpose_chk
      CHECK (purpose IN (
        'VACCINATION',
        'ANTIBIOTIC',
        'DEWORMER',
        'ANTI_INFLAMMATORY',
        'VITAMIN_SUPPLEMENT',
        'TOPICAL_WOUND',
        'OTHER'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'standard_medications_dosing_basis_chk'
  ) THEN
    ALTER TABLE standard_medications
      ADD CONSTRAINT standard_medications_dosing_basis_chk
      CHECK (dosing_basis IS NULL OR dosing_basis IN ('PER_HEAD', 'PER_WEIGHT'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'standard_medications_dosing_fields_chk'
  ) THEN
    ALTER TABLE standard_medications
      ADD CONSTRAINT standard_medications_dosing_fields_chk
      CHECK (
        (
          dosing_basis IS NULL
          AND dose_value IS NULL
          AND dose_unit IS NULL
          AND dose_weight_unit IS NULL
        )
        OR (
          dosing_basis = 'PER_HEAD'
          AND dose_value IS NOT NULL
          AND dose_unit IS NOT NULL
          AND btrim(dose_unit) <> ''
          AND dose_weight_unit IS NULL
        )
        OR (
          dosing_basis = 'PER_WEIGHT'
          AND dose_value IS NOT NULL
          AND dose_unit IS NOT NULL
          AND btrim(dose_unit) <> ''
          AND dose_weight_unit IS NOT NULL
          AND btrim(dose_weight_unit) <> ''
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS standard_meds_purpose_lookup_idx
  ON standard_medications (ranch_id, purpose, brand_name, chemical_name);

COMMIT;
