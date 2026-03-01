-- GrazeTrack Equipment maintenance metadata fields (v1.1)
-- Adds optional valuation/reporting-grade maintenance columns.
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-03-01

BEGIN;

ALTER TABLE equipment_maintenance_events
  ADD COLUMN IF NOT EXISTS performed_by text,
  ADD COLUMN IF NOT EXISTS has_invoice boolean,
  ADD COLUMN IF NOT EXISTS downtime_hours numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_maintenance_events_performed_by_chk'
  ) THEN
    ALTER TABLE equipment_maintenance_events
      ADD CONSTRAINT equipment_maintenance_events_performed_by_chk
      CHECK (performed_by IS NULL OR performed_by IN ('OWNER', 'EMPLOYEE', 'CONTRACTOR', 'DEALER', 'UNKNOWN'));
  END IF;
END
$$;

COMMIT;

