// SQL fragment: true when a row should NOT be excluded from "spending" --
// i.e. it's a real expense, not investing, not a goal contribution, not an
// internal transfer. Only meaningful for type='expense' rows; wrapping in
// `NOT (${alias}.type = 'expense' AND ...)` lets it drop into WHERE clauses
// that also select income rows in the same query.
function nonSpendingExclusionSQL(alias = 'transactions') {
    return `NOT (${alias}.type = 'expense' AND (
        EXISTS (SELECT 1 FROM categories cat WHERE cat.id = ${alias}.category_id AND cat.is_investment_category = true)
        OR ${alias}.goal_id IS NOT NULL
    ))
    AND NOT (COALESCE(${alias}.tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])`;
}

// JS-side mirror for code paths that fetch full transaction rows and reduce
// in JS instead of aggregating in SQL. Requires the row to include
// `is_investment_category` (join categories and select it) alongside the
// existing `tags`/`goal_id` columns transactions already have.
function isNonSavingsExpense(tx) {
    if (tx.type !== 'expense') return false;
    if (tx.is_investment_category) return false;
    if (tx.goal_id) return false;
    const tags = tx.tags || [];
    if (tags.includes('transfer') || tags.includes('credit_card_payment')) return false;
    return true;
}

// Symmetric income-side check: real income, not an internal transfer.
function isRealIncome(tx) {
    if (tx.type !== 'income') return false;
    const tags = tx.tags || [];
    if (tags.includes('transfer') || tags.includes('credit_card_payment')) return false;
    return true;
}

module.exports = { nonSpendingExclusionSQL, isNonSavingsExpense, isRealIncome };
