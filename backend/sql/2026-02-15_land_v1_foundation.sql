-- GrazeTrack Land Management v1 foundation
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-02-15

BEGIN;

CREATE TABLE IF NOT EXISTS zone_subzones (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  zone_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  area_acres numeric,
  geom geometry,
  target_rest_days integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zone_subzones_ranch_idx ON zone_subzones (ranch_id);
CREATE INDEX IF NOT EXISTS zone_subzones_zone_idx ON zone_subzones (zone_id);
CREATE UNIQUE INDEX IF NOT EXISTS zone_subzones_ranch_zone_name_unique ON zone_subzones (ranch_id, zone_id, name);

CREATE TABLE IF NOT EXISTS grazing_sessions (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  zone_id uuid NOT NULL,
  subzone_id uuid,
  herd_id uuid,
  head_count integer,
  stock_density_au_per_acre numeric,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grazing_sessions_ranch_idx ON grazing_sessions (ranch_id);
CREATE INDEX IF NOT EXISTS grazing_sessions_zone_idx ON grazing_sessions (zone_id);
CREATE INDEX IF NOT EXISTS grazing_sessions_herd_idx ON grazing_sessions (herd_id);
CREATE INDEX IF NOT EXISTS grazing_sessions_started_idx ON grazing_sessions (started_at);

CREATE TABLE IF NOT EXISTS soil_samples (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  zone_id uuid NOT NULL,
  subzone_id uuid,
  sampled_at date NOT NULL,
  ph numeric,
  organic_matter_pct numeric,
  nitrogen_ppm numeric,
  phosphorus_ppm numeric,
  potassium_ppm numeric,
  moisture_pct numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS soil_samples_ranch_idx ON soil_samples (ranch_id);
CREATE INDEX IF NOT EXISTS soil_samples_zone_idx ON soil_samples (zone_id);
CREATE INDEX IF NOT EXISTS soil_samples_sampled_idx ON soil_samples (sampled_at);

CREATE TABLE IF NOT EXISTS forage_samples (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  zone_id uuid NOT NULL,
  subzone_id uuid,
  sampled_at date NOT NULL,
  species_observed text[],
  biomass_lb_per_acre numeric,
  ground_cover_pct numeric,
  avg_canopy_inches numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forage_samples_ranch_idx ON forage_samples (ranch_id);
CREATE INDEX IF NOT EXISTS forage_samples_zone_idx ON forage_samples (zone_id);
CREATE INDEX IF NOT EXISTS forage_samples_sampled_idx ON forage_samples (sampled_at);

CREATE TABLE IF NOT EXISTS zone_weather_daily (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  zone_id uuid NOT NULL,
  subzone_id uuid,
  weather_date date NOT NULL,
  min_temp_f numeric,
  max_temp_f numeric,
  rain_inches numeric,
  forecast_rain_inches_next_3d numeric,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zone_weather_daily_ranch_idx ON zone_weather_daily (ranch_id);
CREATE INDEX IF NOT EXISTS zone_weather_daily_zone_date_idx ON zone_weather_daily (zone_id, weather_date);
CREATE UNIQUE INDEX IF NOT EXISTS zone_weather_daily_unique
  ON zone_weather_daily (ranch_id, zone_id, subzone_id, weather_date);

CREATE TABLE IF NOT EXISTS zone_daily_states (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  zone_id uuid NOT NULL,
  subzone_id uuid,
  state_date date NOT NULL,
  rest_days integer,
  estimated_forage_lb_per_acre numeric,
  utilization_pct numeric,
  moisture_stress_score integer,
  recovery_stage text,
  needs_rest boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zone_daily_states_ranch_idx ON zone_daily_states (ranch_id);
CREATE INDEX IF NOT EXISTS zone_daily_states_zone_date_idx ON zone_daily_states (zone_id, state_date);
CREATE UNIQUE INDEX IF NOT EXISTS zone_daily_states_unique
  ON zone_daily_states (ranch_id, zone_id, subzone_id, state_date);

CREATE TABLE IF NOT EXISTS land_recommendations (
  id uuid PRIMARY KEY,
  ranch_id uuid NOT NULL,
  zone_id uuid NOT NULL,
  subzone_id uuid,
  recommendation_date date NOT NULL,
  recommendation_type text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  rationale text NOT NULL,
  action_by_date date,
  confidence_score numeric,
  status text NOT NULL DEFAULT 'open',
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS land_recommendations_ranch_idx ON land_recommendations (ranch_id);
CREATE INDEX IF NOT EXISTS land_recommendations_zone_date_idx ON land_recommendations (zone_id, recommendation_date);
CREATE INDEX IF NOT EXISTS land_recommendations_status_idx ON land_recommendations (status);

COMMIT;
