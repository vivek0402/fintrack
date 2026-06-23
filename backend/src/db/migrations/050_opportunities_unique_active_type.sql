-- Partial unique index backing an ON CONFLICT upsert in POST /opportunities/detect.
-- Previously detect() did a SELECT-then-INSERT/UPDATE loop per opportunity, which is
-- both an N+1 and a race: two concurrent /detect calls could each pass the
-- existence check and both INSERT, creating duplicate active opportunities of the
-- same type for one user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_user_type_active
    ON opportunities(user_id, type) WHERE status = 'active';
