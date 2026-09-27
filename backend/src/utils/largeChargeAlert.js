// "Large charge" push after POST /api/transactions. Replaces the old flat
// ₹5,000 rule (which fired on rent, EMIs and every normal big purchase) with
// the same category-relative check the add-form warning uses: push when the
// amount is anomalous for its description/category history, and fall back to
// a high absolute threshold only when there isn't enough history to judge.
const { isNonSavingsExpense } = require('./savingsRate');
const { assessAnomaly, inr } = require('./txEntrySignals');

// Used only when assessAnomaly has too little history to have an opinion.
const LARGE_CHARGE_FALLBACK_THRESHOLD = 25000;

// Unchanged from the flat-threshold version so existing notification_log
// dedup rows stay valid.
function largeChargeAlertKey(txId) {
    return `large_tx:${txId}`;
}

// Expenses the user expects and shouldn't be nudged about: income, transfers
// and card payments, goal/investment contributions and personal-loan legs.
// Needs `is_investment_category` on the row (see isNonSavingsExpense).
function isAlertableExpense(tx) {
    if (!tx || tx.transfer_group_id) return false;
    return isNonSavingsExpense(tx);
}

/**
 * Pure decision: the push to send for a newly created transaction, or null.
 * @param tx       created transaction row (+ is_investment_category, goal_id)
 * @param anomaly  assessAnomaly() result for tx, or null when not computed
 * @param opts     { fallbackThreshold }
 * @returns {{ alertKey, title, body, data } | null}
 */
function buildLargeChargeAlert(tx, anomaly, opts = {}) {
    const fallbackThreshold = opts.fallbackThreshold ?? LARGE_CHARGE_FALLBACK_THRESHOLD;
    if (!isAlertableExpense(tx)) return null;
    const amount = parseFloat(tx.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const description = (tx.description || '').trim() || 'this transaction';
    const data = { type: 'info', deepLink: '/transactions', tx_id: String(tx.id) };

    const judged = anomaly && (anomaly.status === 'anomaly' || anomaly.status === 'normal')
        && parseFloat(anomaly.median) > 0;

    if (judged) {
        if (anomaly.status !== 'anomaly') return null;
        const median = parseFloat(anomaly.median);
        const ratio = Math.round(amount / median);
        const why = anomaly.basis === 'description'
            ? `about ${ratio}× what you usually spend there (${inr(median)})`
            : `about ${ratio}× your usual ${anomaly.label || 'category'} transaction (${inr(median)})`;
        return {
            alertKey: largeChargeAlertKey(tx.id),
            title: 'Unusual Spend Spotted 👀',
            body: `${inr(amount)} on ${description} is ${why}. Worth a quick check.`,
            data,
        };
    }

    if (amount < fallbackThreshold) return null;
    return {
        alertKey: largeChargeAlertKey(tx.id),
        title: 'Big Spend Alert 💸',
        body: `${inr(amount)} spent on ${description}. Unusually large, worth a quick check.`,
        data,
    };
}

// Runs the history lookup only for expenses that pass the skip rules.
async function checkLargeCharge(pool, userId, tx) {
    if (!isAlertableExpense(tx)) return null;
    const anomaly = await assessAnomaly(pool, userId, {
        type: tx.type,
        amount: parseFloat(tx.amount),
        description: tx.description,
        category_id: tx.category_id,
        exclude_id: tx.id, // judge against past entries, not this one
    });
    return buildLargeChargeAlert(tx, anomaly);
}

module.exports = {
    LARGE_CHARGE_FALLBACK_THRESHOLD, largeChargeAlertKey, isAlertableExpense,
    buildLargeChargeAlert, checkLargeCharge,
};
