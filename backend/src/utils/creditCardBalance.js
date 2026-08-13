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

module.exports = {
    fetchCreditCardsWithBalance,
    fetchCreditCardWithBalance,
    fetchTotalCreditCardOutstanding,
};
