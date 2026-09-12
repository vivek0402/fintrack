// Per-user multinomial Naive Bayes over transaction features. No I/O here --
// persistence lives in txClassifierStore.js. train/untrain/learn mutate the
// target in place.
const ALPHA = 0.5;
const MIN_SAMPLES = 20;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function tokenize(description) {
    const words = String(description || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .map(w => w.replace(/\d+$/, ''))
        .filter(w => w.length >= 2);
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) bigrams.push(`${words[i]}_${words[i + 1]}`);
    return [...words, ...bigrams];
}

function istHour(ts) {
    if (!ts) return null;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getTime() + IST_OFFSET_MS).getUTCHours();
}

function weekday(date) {
    const d = date instanceof Date ? date : new Date(`${String(date).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d.getDay();
}

function featurize({ description, amount, date, type, hour }) {
    const features = tokenize(description).map(t => `w:${t}`);
    const amt = Number(amount);
    if (Number.isFinite(amt) && amt > 0) features.push(`amt:${Math.floor(Math.log2(amt))}`);
    if (date) { const dow = weekday(date); if (dow !== null) features.push(`dow:${dow}`); }
    if (Number.isInteger(hour)) features.push(`hr:${Math.floor(hour / 4)}`);
    if (type) features.push(`type:${type}`);
    return [...new Set(features)];
}

function createTarget() {
    return { classCounts: {}, featureCounts: {}, featureTotals: {}, total: 0 };
}

function createModel() {
    return { version: 1, category: createTarget(), payment: createTarget() };
}

function bump(obj, key, delta) {
    const prev = obj[key] || 0;
    const next = Math.max(0, prev + delta);
    if (next === 0) delete obj[key];
    else obj[key] = next;
    return next - prev;
}

function train(target, features, label, sign = 1) {
    if (!label) return;
    const applied = bump(target.classCounts, label, sign);
    if (applied === 0) return;
    target.total += applied;
    for (const f of features) {
        const row = target.featureCounts[f] || (target.featureCounts[f] = {});
        const fApplied = bump(row, label, sign);
        if (Object.keys(row).length === 0) delete target.featureCounts[f];
        if (fApplied !== 0) bump(target.featureTotals, label, fApplied);
    }
}

function untrain(target, features, label) {
    train(target, features, label, -1);
}

function predict(target, features) {
    const labels = Object.keys(target.classCounts);
    if (labels.length === 0) return [];
    const vocab = Object.keys(target.featureCounts).length;
    const known = features.filter(f => target.featureCounts[f]);
    const logs = labels.map(label => {
        let lp = Math.log((target.classCounts[label] + ALPHA) / (target.total + ALPHA * labels.length));
        const denom = (target.featureTotals[label] || 0) + ALPHA * vocab;
        for (const f of known) lp += Math.log(((target.featureCounts[f][label] || 0) + ALPHA) / denom);
        return lp;
    });
    const max = Math.max(...logs);
    const exps = logs.map(l => Math.exp(l - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return labels
        .map((label, i) => ({ label, prob: exps[i] / sum }))
        .sort((a, b) => b.prob - a.prob || a.label.localeCompare(b.label));
}

function labelsFor(tx) {
    const tags = tx.tags || [];
    if (tags.includes('transfer') || tags.includes('credit_card_payment')) return { category: null, payment: null };
    return {
        category: tx.category_id ? String(tx.category_id) : null,
        payment: tx.type === 'expense' && tx.payment_method ? tx.payment_method : null,
    };
}

function learn(model, tx, sign = 1) {
    const features = featurize({
        description: tx.description, amount: tx.amount, date: tx.date, type: tx.type,
        hour: istHour(tx.created_at),
    });
    const { category, payment } = labelsFor(tx);
    train(model.category, features, category, sign);
    train(model.payment, features, payment, sign);
}

module.exports = {
    ALPHA, MIN_SAMPLES,
    tokenize, istHour, featurize,
    createModel, createTarget, train, untrain, predict, labelsFor, learn,
};
