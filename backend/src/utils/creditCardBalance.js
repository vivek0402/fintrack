// Canonical credit card balance computation -- every route that needs a card's
// current outstanding balance should go through this, not read the raw
// credit_cards.outstanding_balance column directly. That column is a baseline
// snapshot (mirrors bank_accounts.starting_balance/balance_as_of), not a live
// value; the actual current balance also accounts for linked transaction
// activity since the snapshot date. Centralizing this avoids the six+ read
// sites drifting into reporting different numbers for the same card, the same
// reasoning debt.js's computeCreditUtilization already documents for itself.
//
// Sign convention is inverted from a bank account: an expense transaction
// linked to a card INCREASES what's owed; an income transaction linked to a
// card (used by the bill-payment flow) DECREASES it.
const CARDS_WITH_BALANCE_QUERY = `
    SELECT c.*,
        COALESCE(c.outstanding_balance, 0)
            + COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0)
            AS current_outstanding_balance
    FROM credit_cards c
    LEFT JOIN transactions t
        ON t.credit_card_id = c.id
        AND t.user_id = c.user_id
        AND t.date >= COALESCE(c.balance_as_of, '1970-01-01')
    WHERE c.user_id = $1
    GROUP BY c.id
    ORDER BY c.created_at ASC
`;

const CARD_WITH_BALANCE_SINGLE_QUERY = `
    SELECT c.*,
        COALESCE(c.outstanding_balance, 0)
            + COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0)
            AS current_outstanding_balance
    FROM credit_cards c
    LEFT JOIN transactions t
        ON t.credit_card_id = c.id
        AND t.user_id = c.user_id
        AND t.date >= COALESCE(c.balance_as_of, '1970-01-01')
    WHERE c.user_id = $1 AND c.id = $2
    GROUP BY c.id
`;

async function fetchCreditCardsWithBalance(pool, userId) {
    const { rows } = await pool.query(CARDS_WITH_BALANCE_QUERY, [userId]);
    return rows;
}

async function fetchCreditCardWithBalance(pool, userId, cardId) {
    const { rows } = await pool.query(CARD_WITH_BALANCE_SINGLE_QUERY, [userId, cardId]);
    return rows[0] || null;
}

async function fetchTotalCreditCardOutstanding(pool, userId) {
    const cards = await fetchCreditCardsWithBalance(pool, userId);
    return cards.reduce((sum, c) => sum + parseFloat(c.current_outstanding_balance || 0), 0);
}

// The most recent calendar occurrence of billing_date (1-28) that isn't in
// the future -- i.e. when the card's last statement closed. If this month's
// billing_date hasn't happened yet, that means the last close was last month.
function getLastStatementCloseDate(billingDate, today = new Date()) {
    if (!billingDate) return null;
    let close = new Date(today.getFullYear(), today.getMonth(), billingDate);
    if (close > today) close = new Date(today.getFullYear(), today.getMonth() - 1, billingDate);
    return close;
}

function toDateStr(d) {
    return d.toISOString().split('T')[0];
}

const STATEMENT_BALANCE_QUERY = `
    SELECT
        COALESCE(c.outstanding_balance, 0)
            + COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0)
            AS statement_balance
    FROM credit_cards c
    LEFT JOIN transactions t
        ON t.credit_card_id = c.id
        AND t.user_id = c.user_id
        AND t.date >= COALESCE(c.balance_as_of, '1970-01-01')
        AND t.date <= $2
    WHERE c.id = $1
    GROUP BY c.id
`;

// Additive, display-only breakdown of each card's outstanding balance into
// "statement balance" (frozen as of the last billing-cycle close -- what's
// actually due) and "new charges since statement" (not yet due). Only used
// by GET /api/credit-cards -- every other consumer of
// fetchCreditCardsWithBalance/fetchCreditCardWithBalance/
// fetchTotalCreditCardOutstanding (net worth, DTI, utilization, interest
// estimates) is untouched and keeps reading current_outstanding_balance
// exactly as before. Cards with no billing_date get null for all three new
// fields -- there's no cycle to compute.
async function fetchCreditCardsWithCycleBreakdown(pool, userId) {
    const cards = await fetchCreditCardsWithBalance(pool, userId);
    return Promise.all(cards.map(async card => {
        if (!card.billing_date) {
            return { ...card, statement_balance: null, new_charges_since_statement: null, last_statement_close_date: null, statement_due_date: null };
        }
        const closeDate = getLastStatementCloseDate(card.billing_date);
        const closeDateStr = toDateStr(closeDate);
        const { rows } = await pool.query(STATEMENT_BALANCE_QUERY, [card.id, closeDateStr]);
        const statementBalance = parseFloat(rows[0]?.statement_balance ?? card.outstanding_balance);
        const currentOutstanding = parseFloat(card.current_outstanding_balance);
        const dueDate = new Date(closeDate);
        dueDate.setDate(dueDate.getDate() + (card.due_days || 0));
        return {
            ...card,
            statement_balance: statementBalance,
            new_charges_since_statement: parseFloat((currentOutstanding - statementBalance).toFixed(2)),
            last_statement_close_date: closeDateStr,
            statement_due_date: toDateStr(dueDate),
        };
    }));
}

module.exports = {
    fetchCreditCardsWithBalance,
    fetchCreditCardWithBalance,
    fetchTotalCreditCardOutstanding,
    fetchCreditCardsWithCycleBreakdown,
};
