// Per-user multinomial Naive Bayes over transaction features. Pure functions
// only -- persistence lives in txClassifierStore.js.
const ALPHA = 0.5;
const MIN_SAMPLES = 20;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function tokenize(description) {
    const words = String(description || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .map(w => {
            const stripped = w.replace(/\d+$/, '');
            return stripped.length >= 3 ? stripped : w;
        })
        .filter(w => w.length >= 2 && !/^\d+$/.test(w));
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

function dateString(date) {
    if (date instanceof Date) return date.toISOString().slice(0, 10);
    return String(date).slice(0, 10);
}

function featurize({ description, amount, date, type, hour }) {
    const features = tokenize(description).map(t => `w:${t}`);
    const amt = parseFloat(amount);
    if (Number.isFinite(amt) && amt > 0) features.push(`amt:${Math.floor(Math.log2(amt))}`);
    if (date) {
        const d = new Date(`${dateString(date)}T00:00:00`);
        if (!Number.isNaN(d.getTime())) features.push(`dow:${d.getDay()}`);
    }
    if (Number.isInteger(hour)) features.push(`hr:${Math.floor(hour / 4)}`);
    if (type) features.push(`type:${type}`);
    return features;
}

module.exports = { ALPHA, MIN_SAMPLES, tokenize, istHour, featurize };
