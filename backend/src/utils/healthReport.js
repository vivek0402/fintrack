// ─── Health report helpers ───────────────────────────────────────────
// The health score is computed on the client by frontend/lib/healthScore.ts
// (calculateHealthScore). The AI report explains that number -- it must never
// produce a score of its own -- so the client sends the score and its factor
// breakdown here, and everything below treats them as untrusted input.

// Must mirror the ids and max points in frontend/lib/healthScore.ts.
const HEALTH_FACTORS = {
    savings:    { name: 'Savings Rate',          max: 20 },
    momentum:   { name: 'Savings Momentum',      max: 10 },
    stability:  { name: 'Income Stability',      max: 10 },
    efficiency: { name: 'Spending Efficiency',   max: 15 },
    investment: { name: 'Investment Discipline', max: 15 },
    debt:       { name: 'Debt Health',           max: 15 },
    goals:      { name: 'Goal Progress',         max: 10 },
    budgets:    { name: 'Budget Adherence',      max: 5 },
};
const FACTOR_IDS = Object.keys(HEALTH_FACTORS);

const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

/**
 * Validates `{ score, factors }` from the request body.
 * Returns `{ ok: true, score, factors }` with factors normalised to the
 * canonical order (and server-side names/max), or `{ ok: false, error }`.
 */
function validateHealthScoreInput(body) {
    const { score, factors } = body || {};
    if (!isInt(score) || score < 0 || score > 100) {
        return { ok: false, error: 'score must be an integer from 0 to 100.' };
    }
    if (!Array.isArray(factors) || factors.length !== FACTOR_IDS.length) {
        return { ok: false, error: `factors must list all ${FACTOR_IDS.length} health score factors.` };
    }
    const byId = {};
    for (const f of factors) {
        if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !HEALTH_FACTORS[f.id]) {
            return { ok: false, error: 'Unknown health score factor.' };
        }
        if (byId[f.id]) return { ok: false, error: `Duplicate factor: ${f.id}.` };
        const { max } = HEALTH_FACTORS[f.id];
        if (!isInt(f.score) || f.score < 0 || f.score > max) {
            return { ok: false, error: `Factor ${f.id} score must be an integer from 0 to ${max}.` };
        }
        byId[f.id] = f.score;
    }
    const total = FACTOR_IDS.reduce((s, id) => s + byId[id], 0);
    if (total !== score) {
        return { ok: false, error: 'score must equal the sum of its factor scores.' };
    }
    return {
        ok: true,
        score,
        factors: FACTOR_IDS.map(id => ({ id, name: HEALTH_FACTORS[id].name, score: byId[id], max: HEALTH_FACTORS[id].max })),
    };
}

/** Cache fingerprint: any change in month, score or a factor regenerates the report. */
function healthReportFingerprint({ month, year, score, factors }) {
    return `${year}-${String(month).padStart(2, '0')}|${score}|${factors.map(f => `${f.id}:${f.score}`).join(',')}`;
}

const cleanList = (v, max = 4) =>
    (Array.isArray(v) ? v : [])
        .filter(s => typeof s === 'string' && s.trim())
        .slice(0, max)
        .map(s => s.trim().slice(0, 400));

/**
 * Keeps only the explanation fields from the AI output. Any score/grade the
 * model returns anyway is discarded; the score always comes from the
 * validated client input.
 */
function shapeHealthReport(ai, { score, factors, month, year, generatedAt }) {
    const src = ai && typeof ai === 'object' ? ai : {};
    return {
        score,
        factors,
        narrative: typeof src.narrative === 'string' ? src.narrative.trim().slice(0, 1200) : '',
        strengths: cleanList(src.strengths),
        weak_spots: cleanList(src.weak_spots),
        next_steps: cleanList(src.next_steps),
        month,
        year,
        generated_at: generatedAt,
    };
}

module.exports = { HEALTH_FACTORS, validateHealthScoreInput, healthReportFingerprint, shapeHealthReport };
