-- GrazeTrack Active Ranch Context
-- Adds an explicit per-user active ranch pointer.
-- Apply manually against Postgres (same DB as backend).
-- Date: 2026-02-28

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_ranch_id uuid;

CREATE INDEX IF NOT EXISTS users_active_ranch_idx
  ON users (active_ranch_id);

-- Backfill active_ranch_id from the most recent membership for users missing it.
WITH ranked AS (
  SELECT
    ur.user_id,
    ur.ranch_id,
    ROW_NUMBER() OVER (
      PARTITION BY ur.user_id
      ORDER BY ur.created_at DESC, ur.ranch_id
    ) AS rn
  FROM user_ranches ur
)
UPDATE users u
SET active_ranch_id = r.ranch_id
FROM ranked r
WHERE u.id = r.user_id
  AND u.active_ranch_id IS NULL
  AND r.rn = 1;

COMMIT;
