-- GrazeTrack Equipment (v1)
-- Tracks equipment assets, maintenance, parts/supplies inventory events,
-- and reusable attachments (images + PDFs) for equipment entities.
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-03-01

BEGIN;

CREATE TABLE IF NOT EXISTS equipment_assets (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  name text NOT NULL,
  asset_type text NOT NULL DEFAULT 'OTHER',
  make text,
  model text,
  model_year integer,
  status text NOT NULL DEFAULT 'ACTIVE',
  acquisition_type text NOT NULL DEFAULT 'PURCHASED',
  acquisition_date date,
  purchase_price numeric,
  current_value_estimate numeric,
  track_maintenance boolean NOT NULL DEFAULT false,
  meter_type text NOT NULL DEFAULT 'NONE',
  default_meter_unit_label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_assets_asset_type_chk'
  ) THEN
    ALTER TABLE equipment_assets
      ADD CONSTRAINT equipment_assets_asset_type_chk
      CHECK (asset_type IN (
        'VEHICLE',
        'TRACTOR',
        'ATV_UTV',
        'TRAILER',
        'IMPLEMENT',
        'LIVESTOCK_HANDLING',
        'POWER_TOOL',
        'ELECTRONICS',
        'GENERATOR',
        'PUMP',
        'OTHER'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_assets_status_chk'
  ) THEN
    ALTER TABLE equipment_assets
      ADD CONSTRAINT equipment_assets_status_chk
      CHECK (status IN ('ACTIVE', 'SOLD', 'RETIRED', 'LOST', 'RENTED', 'LEASED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_assets_acquisition_type_chk'
  ) THEN
    ALTER TABLE equipment_assets
      ADD CONSTRAINT equipment_assets_acquisition_type_chk
      CHECK (acquisition_type IN ('PURCHASED', 'LEASED', 'RENTED', 'INHERITED', 'OTHER'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_assets_meter_type_chk'
  ) THEN
    ALTER TABLE equipment_assets
      ADD CONSTRAINT equipment_assets_meter_type_chk
      CHECK (meter_type IN ('NONE', 'HOURS', 'MILES', 'OTHER'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS equipment_assets_ranch_idx
  ON equipment_assets (ranch_id);

CREATE INDEX IF NOT EXISTS equipment_assets_lookup_idx
  ON equipment_assets (ranch_id, asset_type, status, name);

CREATE INDEX IF NOT EXISTS equipment_assets_maintenance_idx
  ON equipment_assets (ranch_id, track_maintenance, updated_at);

CREATE TABLE IF NOT EXISTS equipment_asset_identifiers (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL,
  identifier_type text NOT NULL,
  identifier_value text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_asset_identifiers_type_chk'
  ) THEN
    ALTER TABLE equipment_asset_identifiers
      ADD CONSTRAINT equipment_asset_identifiers_type_chk
      CHECK (identifier_type IN (
        'VIN',
        'PIN',
        'SERIAL',
        'ENGINE_SERIAL',
        'LICENSE_PLATE',
        'TAG',
        'OTHER'
      ));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS equipment_asset_identifiers_asset_idx
  ON equipment_asset_identifiers (asset_id);

CREATE INDEX IF NOT EXISTS equipment_asset_identifiers_lookup_idx
  ON equipment_asset_identifiers (asset_id, identifier_type, identifier_value);

CREATE TABLE IF NOT EXISTS equipment_maintenance_events (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL,
  ranch_id uuid NOT NULL,
  event_date date NOT NULL,
  event_type text NOT NULL DEFAULT 'SERVICE',
  title text NOT NULL,
  description text,
  provider text,
  labor_cost numeric,
  parts_cost numeric,
  total_cost numeric,
  meter_reading numeric,
  meter_type text,
  next_due_date date,
  next_due_meter numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_maintenance_events_type_chk'
  ) THEN
    ALTER TABLE equipment_maintenance_events
      ADD CONSTRAINT equipment_maintenance_events_type_chk
      CHECK (event_type IN ('SERVICE', 'REPAIR', 'INSPECTION', 'MODIFICATION', 'WARRANTY', 'OTHER'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_maintenance_events_meter_type_chk'
  ) THEN
    ALTER TABLE equipment_maintenance_events
      ADD CONSTRAINT equipment_maintenance_events_meter_type_chk
      CHECK (meter_type IS NULL OR meter_type IN ('NONE', 'HOURS', 'MILES', 'OTHER'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS equipment_maintenance_events_asset_idx
  ON equipment_maintenance_events (asset_id);

CREATE INDEX IF NOT EXISTS equipment_maintenance_events_ranch_date_idx
  ON equipment_maintenance_events (ranch_id, event_date, created_at);

CREATE TABLE IF NOT EXISTS equipment_parts (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'OTHER',
  description text,
  manufacturer text,
  part_number text,
  used_for_asset_types text[] NOT NULL DEFAULT '{}',
  unit_type text NOT NULL DEFAULT 'COUNT',
  default_unit text NOT NULL DEFAULT 'each',
  on_hand_quantity numeric NOT NULL DEFAULT 0,
  reorder_threshold numeric,
  reorder_target numeric,
  vendor text,
  cost_per_unit numeric,
  storage_location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_parts_category_chk'
  ) THEN
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
        'OTHER'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_parts_unit_type_chk'
  ) THEN
    ALTER TABLE equipment_parts
      ADD CONSTRAINT equipment_parts_unit_type_chk
      CHECK (unit_type IN ('COUNT', 'LENGTH', 'WEIGHT'));
  END IF;

END
$$;

CREATE INDEX IF NOT EXISTS equipment_parts_ranch_idx
  ON equipment_parts (ranch_id);

CREATE INDEX IF NOT EXISTS equipment_parts_lookup_idx
  ON equipment_parts (ranch_id, category, is_active, name);

CREATE INDEX IF NOT EXISTS equipment_parts_reorder_idx
  ON equipment_parts (ranch_id, reorder_threshold, on_hand_quantity);

CREATE TABLE IF NOT EXISTS equipment_part_inventory_events (
  id uuid PRIMARY KEY,
  part_id uuid NOT NULL,
  ranch_id uuid NOT NULL,
  event_date date NOT NULL,
  event_type text NOT NULL DEFAULT 'ADJUSTMENT',
  quantity_delta numeric NOT NULL,
  unit text NOT NULL DEFAULT 'each',
  unit_cost numeric,
  vendor text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_part_inventory_events_type_chk'
  ) THEN
    ALTER TABLE equipment_part_inventory_events
      ADD CONSTRAINT equipment_part_inventory_events_type_chk
      CHECK (event_type IN ('PURCHASE', 'ADJUSTMENT', 'USE', 'OTHER'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS equipment_part_inventory_events_part_idx
  ON equipment_part_inventory_events (part_id);

CREATE INDEX IF NOT EXISTS equipment_part_inventory_events_ranch_date_idx
  ON equipment_part_inventory_events (ranch_id, event_date, created_at);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  file_path text,
  storage_url text,
  original_filename text,
  mime_type text,
  file_size integer,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attachments_entity_type_chk'
  ) THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_entity_type_chk
      CHECK (entity_type IN (
        'EQUIPMENT_ASSET',
        'EQUIPMENT_MAINTENANCE',
        'EQUIPMENT_PART',
        'EQUIPMENT_PART_EVENT'
      ));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS attachments_ranch_idx
  ON attachments (ranch_id);

CREATE INDEX IF NOT EXISTS attachments_lookup_idx
  ON attachments (ranch_id, entity_type, entity_id, created_at);

COMMIT;
