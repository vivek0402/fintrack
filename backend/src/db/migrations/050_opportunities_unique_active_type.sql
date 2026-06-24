-- Partial unique index backing an ON CONFLICT upsert in POST /opportunities/detect.
-- Previously detect() did a SELECT-then-INSERT/UPDATE loop per opportunity, which is
-- both an N+1 and a race: two concurrent /detect calls could each pass the
-- existence check and both INSERT, creating duplicate active opportunities of the
-- same type for one user.

-- That exact race already left duplicate active (user_id, type) rows in place, which
-- blocks the index below. Resolve them first: keep the most recently detected row
-- per (user_id, type) active, and dismiss the older duplicates instead of deleting
-- them, so the detection history is preserved.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, type
           ORDER BY detected_at DESC, id DESC
         ) AS rn
  FROM opportunities
  WHERE status = 'active'
)
UPDATE opportunities
SET status = 'dismissed', dismissed_at = NOW()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_user_type_active
    ON opportunities(user_id, type) WHERE status = 'active';
