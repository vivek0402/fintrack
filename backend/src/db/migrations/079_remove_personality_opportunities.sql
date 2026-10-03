-- The financial personality feature was removed, and its opportunity card
-- pointed at the deleted /personality page. Nothing creates these anymore,
-- so clearing them once is enough (and replaying it is a no-op).
DELETE FROM opportunities WHERE type = 'personality_insight';
