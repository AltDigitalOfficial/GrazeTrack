-- GrazeTrack Feed Management (v1)
-- Adds feed components, blends, purchases, inventory balances, eligible species joins,
-- and generic feed photos for future OCR/CV pipelines.
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-02-28

BEGIN;

CREATE TABLE IF NOT EXISTS feed_components (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  name text NOT NULL,
  manufacturer_name text,
  default_unit text NOT NULL DEFAULT 'lb',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_components_ranch_idx
  ON feed_components (ranch_id);

CREATE INDEX IF NOT EXISTS feed_components_ranch_name_idx
  ON feed_components (ranch_id, name);

CREATE TABLE IF NOT EXISTS feed_component_eligible_species (
  ranch_id uuid NOT NULL,
  feed_component_id uuid NOT NULL,
  species text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_component_id, species)
);

CREATE INDEX IF NOT EXISTS feed_component_eligible_species_ranch_idx
  ON feed_component_eligible_species (ranch_id);

CREATE INDEX IF NOT EXISTS feed_component_eligible_species_lookup_idx
  ON feed_component_eligible_species (ranch_id, feed_component_id, species);

CREATE TABLE IF NOT EXISTS feed_blends (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  name text NOT NULL,
  manufacturer_name text,
  notes text,
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_blends_ranch_idx
  ON feed_blends (ranch_id);

CREATE INDEX IF NOT EXISTS feed_blends_ranch_name_idx
  ON feed_blends (ranch_id, name);

CREATE TABLE IF NOT EXISTS feed_blend_eligible_species (
  ranch_id uuid NOT NULL,
  feed_blend_id uuid NOT NULL,
  species text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_blend_id, species)
);

CREATE INDEX IF NOT EXISTS feed_blend_eligible_species_ranch_idx
  ON feed_blend_eligible_species (ranch_id);

CREATE INDEX IF NOT EXISTS feed_blend_eligible_species_lookup_idx
  ON feed_blend_eligible_species (ranch_id, feed_blend_id, species);

CREATE TABLE IF NOT EXISTS feed_blend_versions (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  feed_blend_id uuid NOT NULL,
  version_number integer NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS feed_blend_versions_unique_idx
  ON feed_blend_versions (ranch_id, feed_blend_id, version_number);

CREATE INDEX IF NOT EXISTS feed_blend_versions_lookup_idx
  ON feed_blend_versions (ranch_id, feed_blend_id, is_current, created_at);

CREATE TABLE IF NOT EXISTS feed_blend_version_items (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  feed_blend_version_id uuid NOT NULL,
  feed_component_id uuid NOT NULL,
  percent decimal(8, 4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS feed_blend_version_items_unique_idx
  ON feed_blend_version_items (feed_blend_version_id, feed_component_id);

CREATE INDEX IF NOT EXISTS feed_blend_version_items_lookup_idx
  ON feed_blend_version_items (ranch_id, feed_blend_version_id);

CREATE TABLE IF NOT EXISTS feed_purchases (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  purchase_date date NOT NULL,
  supplier_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_purchases_ranch_idx
  ON feed_purchases (ranch_id);

CREATE INDEX IF NOT EXISTS feed_purchases_date_idx
  ON feed_purchases (purchase_date);

CREATE TABLE IF NOT EXISTS feed_purchase_items (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  feed_purchase_id uuid NOT NULL,
  entity_type text NOT NULL,
  feed_component_id uuid,
  feed_blend_id uuid,
  blend_version_id uuid,
  quantity decimal NOT NULL,
  unit text NOT NULL DEFAULT 'lb',
  unit_price decimal,
  line_total decimal,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_purchase_items_purchase_idx
  ON feed_purchase_items (feed_purchase_id);

CREATE INDEX IF NOT EXISTS feed_purchase_items_ranch_idx
  ON feed_purchase_items (ranch_id);

CREATE INDEX IF NOT EXISTS feed_purchase_items_component_idx
  ON feed_purchase_items (feed_component_id);

CREATE INDEX IF NOT EXISTS feed_purchase_items_blend_idx
  ON feed_purchase_items (feed_blend_id);

CREATE TABLE IF NOT EXISTS feed_inventory_balances (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  entity_type text NOT NULL,
  feed_component_id uuid,
  feed_blend_id uuid,
  quantity_on_hand decimal NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS feed_inventory_balances_component_unique_idx
  ON feed_inventory_balances (ranch_id, feed_component_id)
  WHERE entity_type = 'COMPONENT';

CREATE UNIQUE INDEX IF NOT EXISTS feed_inventory_balances_blend_unique_idx
  ON feed_inventory_balances (ranch_id, feed_blend_id)
  WHERE entity_type = 'BLEND';

CREATE INDEX IF NOT EXISTS feed_inventory_balances_lookup_idx
  ON feed_inventory_balances (ranch_id, entity_type, updated_at);

CREATE TABLE IF NOT EXISTS feed_photos (
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

CREATE INDEX IF NOT EXISTS feed_photos_ranch_idx
  ON feed_photos (ranch_id);

CREATE INDEX IF NOT EXISTS feed_photos_lookup_idx
  ON feed_photos (ranch_id, entity_type, entity_id, uploaded_at);

COMMIT;
