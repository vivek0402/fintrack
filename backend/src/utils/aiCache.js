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
    const result = await pool.query('SELECT ai_cache FROM users WHERE id = $1', [userId]);
    const cache = result.rows[0]?.ai_cache || {};
    cache[key] = { data, generated_at: new Date().toISOString() };
    await pool.query('UPDATE users SET ai_cache = $1 WHERE id = $2', [JSON.stringify(cache), userId]);
};

module.exports = { getCached, setCached };
