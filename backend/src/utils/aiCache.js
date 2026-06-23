// ─── AI Cache Helpers (configurable TTL stored in users.ai_cache) ───
const getCached = async (pool, userId, key, ttlMs = 6 * 60 * 60 * 1000) => {
    const result = await pool.query('SELECT ai_cache FROM users WHERE id = $1', [userId]);
    const cache = result.rows[0]?.ai_cache || {};
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - new Date(entry.generated_at).getTime() > ttlMs) return null;
    return entry.data;
};

const setCached = async (pool, userId, key, data) => {
    // Atomic jsonb_set instead of read-modify-write — concurrent setCached calls for
    // different keys (e.g. dashboard firing several AI endpoints in parallel) would
    // otherwise race and silently drop each other's entries.
    const entry = { data, generated_at: new Date().toISOString() };
    await pool.query(
        `UPDATE users SET ai_cache = jsonb_set(COALESCE(ai_cache, '{}'::jsonb), $1::text[], $2::jsonb) WHERE id = $3`,
        [[key], JSON.stringify(entry), userId]
    );
};

module.exports = { getCached, setCached };
