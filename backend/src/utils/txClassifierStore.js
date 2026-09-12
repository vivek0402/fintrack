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

module.exports = { BOOTSTRAP_LIMIT, loadModel, saveModel, bootstrapModel, getOrBootstrapModel, suggest };
