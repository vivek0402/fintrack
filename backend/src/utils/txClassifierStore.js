const { createModel, learn, featurize, predict, MIN_SAMPLES } = require('./txClassifier');

const BOOTSTRAP_LIMIT = 5000;

async function loadModel(db, userId) {
    const { rows } = await db.query(
        'SELECT model, trained_count FROM tx_classifier_models WHERE user_id = $1',
        [userId]
    );
    if (!rows.length) return null;
    return { model: rows[0].model, trainedCount: rows[0].trained_count };
}

async function saveModel(db, userId, model, trainedCount) {
    await db.query(
        `INSERT INTO tx_classifier_models (user_id, model, trained_count, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET model = EXCLUDED.model, trained_count = EXCLUDED.trained_count, updated_at = NOW()`,
        [userId, JSON.stringify(model), trainedCount]
    );
}

async function bootstrapModel(db, userId) {
    const { rows } = await db.query(
        `SELECT description, amount, date, type, category_id, payment_method, tags, created_at
         FROM transactions WHERE user_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [userId, BOOTSTRAP_LIMIT]
    );
    const model = createModel();
    for (const tx of rows) learn(model, tx);
    await saveModel(db, userId, model, rows.length);
    return { model, trainedCount: rows.length };
}

async function getOrBootstrapModel(db, userId) {
    return (await loadModel(db, userId)) || bootstrapModel(db, userId);
}

const round2 = n => Math.round(n * 100) / 100;

async function suggest(pool, userId, input) {
    const { model, trainedCount } = await getOrBootstrapModel(pool, userId);
    const ready = trainedCount >= MIN_SAMPLES;
    if (!ready) return { ready: false, trained: trainedCount, category: [], payment_method: [] };
    const features = featurize(input);
    return {
        ready: true,
        trained: trainedCount,
        category: predict(model.category, features).slice(0, 3)
            .map(p => ({ id: p.label, prob: round2(p.prob) })),
        payment_method: input.type === 'expense'
            ? predict(model.payment, features).slice(0, 2).map(p => ({ method: p.label, prob: round2(p.prob) }))
            : [],
    };
}

// Serialises read-modify-write per user so two saves landing together (e.g.
// a fast double-submit) can't drop each other's counts. If no model row exists
// yet, bootstrapping from history already reflects the row being learned or
// unlearned, so fn is skipped in that case.
async function withModelLock(pool, userId, fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`txclf:${userId}`]);
        const stored = await loadModel(client, userId);
        if (stored) await fn(stored, client);
        else await bootstrapModel(client, userId);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

function learnTransaction(pool, userId, tx) {
    return withModelLock(pool, userId, async ({ model, trainedCount }, client) => {
        learn(model, tx, 1);
        await saveModel(client, userId, model, trainedCount + 1);
    });
}

function unlearnTransaction(pool, userId, tx) {
    return withModelLock(pool, userId, async ({ model, trainedCount }, client) => {
        learn(model, tx, -1);
        await saveModel(client, userId, model, Math.max(0, trainedCount - 1));
    });
}

function relearnTransaction(pool, userId, before, after) {
    return withModelLock(pool, userId, async ({ model, trainedCount }, client) => {
        learn(model, before, -1);
        learn(model, after, 1);
        await saveModel(client, userId, model, trainedCount);
    });
}

// Routes call these after responding; the model is a convenience, never a
// reason to fail or slow a write.
function learnInBackground(pool, userId, tx) {
    setImmediate(() => learnTransaction(pool, userId, tx).catch(err => console.error('[TxClassifier] learn failed:', err.message)));
}
function unlearnInBackground(pool, userId, tx) {
    setImmediate(() => unlearnTransaction(pool, userId, tx).catch(err => console.error('[TxClassifier] unlearn failed:', err.message)));
}
function relearnInBackground(pool, userId, before, after) {
    setImmediate(() => relearnTransaction(pool, userId, before, after).catch(err => console.error('[TxClassifier] relearn failed:', err.message)));
}

module.exports = {
    BOOTSTRAP_LIMIT, loadModel, saveModel, bootstrapModel, getOrBootstrapModel, suggest,
    learnTransaction, unlearnTransaction, relearnTransaction,
    learnInBackground, unlearnInBackground, relearnInBackground,
};
