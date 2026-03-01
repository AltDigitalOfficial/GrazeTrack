-- GrazeTrack Working Day Plan (v1)
-- Tracks daily plans, plan items, resource needs, and seeded task catalog.
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-03-01

BEGIN;

CREATE TABLE IF NOT EXISTS working_day_task_catalog (
  id uuid PRIMARY KEY,
  category text NOT NULL,
  task_type text NOT NULL,
  label text NOT NULL,
  suggested_supply_needs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_equipment_needs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'working_day_task_catalog_category_chk'
  ) THEN
    ALTER TABLE working_day_task_catalog
      ADD CONSTRAINT working_day_task_catalog_category_chk
      CHECK (category IN ('HERD_WORK', 'ANIMAL_WORK', 'RANCH_WORK'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS working_day_task_catalog_task_type_unique_idx
  ON working_day_task_catalog (task_type);

CREATE INDEX IF NOT EXISTS working_day_task_catalog_category_lookup_idx
  ON working_day_task_catalog (category, is_active, sort_order, label);

INSERT INTO working_day_task_catalog (
  id,
  category,
  task_type,
  label,
  suggested_supply_needs_json,
  suggested_equipment_needs_json,
  is_active,
  sort_order,
  created_at,
  updated_at
)
VALUES
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a001',
    'HERD_WORK',
    'MOVE_HERD',
    'Move Herd',
    '[]'::jsonb,
    '[{"assetTypeHint":"ATV/UTV","mustBeOperational":true}]'::jsonb,
    true,
    10,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a002',
    'HERD_WORK',
    'WEIGH_HERD',
    'Weigh Herd',
    '[]'::jsonb,
    '[{"assetTypeHint":"Scale","mustBeOperational":true},{"assetTypeHint":"Chute","mustBeOperational":true}]'::jsonb,
    true,
    20,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a003',
    'HERD_WORK',
    'GROUP_MEDICATION',
    'Group Medication',
    '[{"supplyType":"MEDICATION","name":"Medication supplies"}]'::jsonb,
    '[{"assetTypeHint":"Chute","mustBeOperational":true}]'::jsonb,
    true,
    30,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a004',
    'HERD_WORK',
    'VACCINATE_GROUP',
    'Vaccinate Group',
    '[{"supplyType":"MEDICATION","name":"Vaccine supplies"}]'::jsonb,
    '[{"assetTypeHint":"Chute","mustBeOperational":true}]'::jsonb,
    true,
    40,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a005',
    'HERD_WORK',
    'SORT_GROUP',
    'Sort Group',
    '[]'::jsonb,
    '[{"assetTypeHint":"Panels/Alley","mustBeOperational":true}]'::jsonb,
    true,
    50,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a006',
    'HERD_WORK',
    'REASSIGN_ANIMALS',
    'Reassign Animals',
    '[]'::jsonb,
    '[{"assetTypeHint":"Handling setup","mustBeOperational":true}]'::jsonb,
    true,
    60,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a007',
    'ANIMAL_WORK',
    'WEIGH_ANIMAL',
    'Weigh Animal',
    '[]'::jsonb,
    '[{"assetTypeHint":"Scale","mustBeOperational":true}]'::jsonb,
    true,
    70,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a008',
    'ANIMAL_WORK',
    'MEDICATE_ANIMAL',
    'Medicate Animal',
    '[{"supplyType":"MEDICATION","name":"Medication supplies"}]'::jsonb,
    '[{"assetTypeHint":"Handling setup","mustBeOperational":true}]'::jsonb,
    true,
    80,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a009',
    'ANIMAL_WORK',
    'VET_TREATMENT',
    'Vet Treatment',
    '[{"supplyType":"MEDICATION","name":"Treatment supplies"}]'::jsonb,
    '[{"assetTypeHint":"Handling setup","mustBeOperational":true}]'::jsonb,
    true,
    90,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a010',
    'ANIMAL_WORK',
    'MOVE_ANIMAL',
    'Move Animal',
    '[]'::jsonb,
    '[{"assetTypeHint":"ATV/UTV or Trailer","mustBeOperational":true}]'::jsonb,
    true,
    100,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a011',
    'ANIMAL_WORK',
    'TAG_ID',
    'Tag / ID',
    '[{"supplyType":"PART_SUPPLY","name":"Tags and ID supplies"}]'::jsonb,
    '[{"assetTypeHint":"Handling setup","mustBeOperational":true}]'::jsonb,
    true,
    110,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a012',
    'RANCH_WORK',
    'EQUIPMENT_MAINTENANCE',
    'Equipment Maintenance',
    '[{"supplyType":"PART_SUPPLY","name":"Repair parts/supplies"},{"supplyType":"FUEL_FLUID","name":"Fuel/fluids"}]'::jsonb,
    '[{"assetTypeHint":"Target equipment asset","mustBeOperational":false}]'::jsonb,
    true,
    120,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a013',
    'RANCH_WORK',
    'DISTRIBUTE_FEED',
    'Distribute Feed',
    '[{"supplyType":"FEED","name":"Feed or feed blend"}]'::jsonb,
    '[{"assetTypeHint":"Tractor/Feeder","mustBeOperational":true}]'::jsonb,
    true,
    130,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a014',
    'RANCH_WORK',
    'ADD_WATER_ADDITIVES',
    'Add Water Additives',
    '[{"supplyType":"ADDITIVE","name":"Water additives"}]'::jsonb,
    '[{"assetTypeHint":"Pump/Sprayer","mustBeOperational":true}]'::jsonb,
    true,
    140,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a015',
    'RANCH_WORK',
    'FENCE_CHECK',
    'Fence Check',
    '[{"supplyType":"PART_SUPPLY","name":"Fence repair supplies"}]'::jsonb,
    '[{"assetTypeHint":"ATV/UTV","mustBeOperational":true}]'::jsonb,
    true,
    150,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a016',
    'RANCH_WORK',
    'SURVEY_LAND',
    'Survey Land',
    '[]'::jsonb,
    '[{"assetTypeHint":"ATV/UTV or Drone","mustBeOperational":true}]'::jsonb,
    true,
    160,
    now(),
    now()
  ),
  (
    'f88e7e11-25d4-4f03-ae2a-444e9158a017',
    'RANCH_WORK',
    'OTHER_TASK',
    'Other Task',
    '[]'::jsonb,
    '[]'::jsonb,
    true,
    170,
    now(),
    now()
  )
ON CONFLICT (task_type) DO UPDATE
SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  suggested_supply_needs_json = EXCLUDED.suggested_supply_needs_json,
  suggested_equipment_needs_json = EXCLUDED.suggested_equipment_needs_json,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

CREATE TABLE IF NOT EXISTS working_day_plans (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  plan_date date NOT NULL,
  title text DEFAULT 'Working Day Plan',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS working_day_plans_ranch_date_unique_idx
  ON working_day_plans (ranch_id, plan_date);

CREATE INDEX IF NOT EXISTS working_day_plans_ranch_date_lookup_idx
  ON working_day_plans (ranch_id, plan_date, updated_at);

CREATE TABLE IF NOT EXISTS working_day_plan_items (
  id uuid PRIMARY KEY,
  plan_id uuid NOT NULL,
  category text NOT NULL,
  task_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'PLANNED',
  start_time time,
  end_time time,
  herd_id uuid,
  animal_id uuid,
  location_text text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'working_day_plan_items_category_chk'
  ) THEN
    ALTER TABLE working_day_plan_items
      ADD CONSTRAINT working_day_plan_items_category_chk
      CHECK (category IN ('HERD_WORK', 'ANIMAL_WORK', 'RANCH_WORK'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'working_day_plan_items_status_chk'
  ) THEN
    ALTER TABLE working_day_plan_items
      ADD CONSTRAINT working_day_plan_items_status_chk
      CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS working_day_plan_items_plan_idx
  ON working_day_plan_items (plan_id);

CREATE INDEX IF NOT EXISTS working_day_plan_items_plan_sort_idx
  ON working_day_plan_items (plan_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS working_day_plan_items_plan_category_sort_idx
  ON working_day_plan_items (plan_id, category, sort_order, created_at);

CREATE INDEX IF NOT EXISTS working_day_plan_items_herd_idx
  ON working_day_plan_items (herd_id);

CREATE INDEX IF NOT EXISTS working_day_plan_items_animal_idx
  ON working_day_plan_items (animal_id);

CREATE TABLE IF NOT EXISTS working_day_plan_item_supply_needs (
  id uuid PRIMARY KEY,
  plan_item_id uuid NOT NULL,
  supply_type text NOT NULL,
  linked_entity_type text,
  linked_entity_id uuid,
  name_override text,
  required_quantity numeric,
  unit text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'working_day_plan_item_supply_needs_type_chk'
  ) THEN
    ALTER TABLE working_day_plan_item_supply_needs
      ADD CONSTRAINT working_day_plan_item_supply_needs_type_chk
      CHECK (supply_type IN ('MEDICATION', 'FEED', 'ADDITIVE', 'FUEL_FLUID', 'PART_SUPPLY', 'OTHER'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'working_day_plan_item_supply_needs_name_or_link_chk'
  ) THEN
    ALTER TABLE working_day_plan_item_supply_needs
      ADD CONSTRAINT working_day_plan_item_supply_needs_name_or_link_chk
      CHECK (
        linked_entity_id IS NOT NULL
        OR (name_override IS NOT NULL AND btrim(name_override) <> '')
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS working_day_plan_item_supply_needs_plan_item_idx
  ON working_day_plan_item_supply_needs (plan_item_id);

CREATE INDEX IF NOT EXISTS working_day_plan_item_supply_needs_supply_type_idx
  ON working_day_plan_item_supply_needs (supply_type);

CREATE INDEX IF NOT EXISTS working_day_plan_item_supply_needs_linked_entity_idx
  ON working_day_plan_item_supply_needs (linked_entity_type, linked_entity_id);

CREATE TABLE IF NOT EXISTS working_day_plan_item_equipment_needs (
  id uuid PRIMARY KEY,
  plan_item_id uuid NOT NULL,
  asset_id uuid,
  asset_type_hint text,
  must_be_operational boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'working_day_plan_item_equipment_needs_asset_or_hint_chk'
  ) THEN
    ALTER TABLE working_day_plan_item_equipment_needs
      ADD CONSTRAINT working_day_plan_item_equipment_needs_asset_or_hint_chk
      CHECK (
        asset_id IS NOT NULL
        OR (asset_type_hint IS NOT NULL AND btrim(asset_type_hint) <> '')
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS working_day_plan_item_equipment_needs_plan_item_idx
  ON working_day_plan_item_equipment_needs (plan_item_id);

CREATE INDEX IF NOT EXISTS working_day_plan_item_equipment_needs_asset_idx
  ON working_day_plan_item_equipment_needs (asset_id);

COMMIT;
