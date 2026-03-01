-- GrazeTrack Equipment Parts (used_for_asset_types)
-- Adds an asset-type applicability array for equipment parts/supplies.
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-03-01

BEGIN;

ALTER TABLE equipment_parts
  ADD COLUMN IF NOT EXISTS used_for_asset_types text[] NOT NULL DEFAULT '{}';

COMMIT;
