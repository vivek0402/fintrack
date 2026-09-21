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
const { fetchActiveEmiPrincipalByCard } = require('./creditCardEmi');

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
        AND ($3::uuid IS NULL OR t.id <> $3)
    WHERE c.user_id = $1 AND c.id = $2
    GROUP BY c.id
`;

// A real bank blocks a card's full remaining EMI principal against the
// credit limit the moment a purchase is converted to EMI -- not just the
// portion paid off installment by installment. So current_outstanding_balance
// must include it, on top of what the query above already aggregates from
// posted transactions. Only ACTIVE EMIs count (fetchActiveEmiPrincipalByCard
// already filters that); a fully-posted EMI has nothing left to block.
//
// Implemented as a second query + JS merge rather than folding a third join
// into CARDS_WITH_BALANCE_QUERY: that query is already a non-trivial
// conditional-SUM aggregation, and credit_card_emis/its installments table
// have their own aggregation (fetchActiveEmiPrincipalByCard, itself a
// LEFT JOIN + FILTER query) with different grouping semantics. Combining
// both into one query would mean a LEFT JOIN of a LEFT JOIN with an extra
// GROUP BY, in a query whose current shape is copy-pasted between the list
// and single-card variants below -- worse to read and to keep in sync than
// two focused queries merged by credit_card_id in JS.
//
// Cards with no active EMI are returned untouched (same object reference
// coming out of pg, not just same value) so a card with zero EMIs is
// byte-identical to current behaviour -- see the mandatory regression test
// in tests/creditCardBalance.test.js.
function addEmiPrincipal(rows, emiPrincipals) {
    const emiByCard = new Map(emiPrincipals.map(e => [e.credit_card_id, e.remaining_principal]));
    return rows.map(row => {
        // .has(), not a truthiness check on the looked-up value: a card with
        // no entry in the map (the common case) must short-circuit, but a
        // card that legitimately has a 0-remaining-principal entry must
        // still go through the merge rather than silently keeping the stale
        // cached row. fetchActiveEmiPrincipalByCard only ever emits entries
        // with a positive sum today, so this distinction is currently moot
        // -- but that invariant lives in a different file and isn't
        // enforced here, so don't rely on it.
        if (!emiByCard.has(row.id)) return row;
        const emiPrincipal = emiByCard.get(row.id);
        return {
            ...row,
            current_outstanding_balance: (parseFloat(row.current_outstanding_balance) + emiPrincipal).toFixed(2),
        };
    });
}

async function fetchCreditCardsWithBalance(pool, userId) {
    const { rows } = await pool.query(CARDS_WITH_BALANCE_QUERY, [userId]);
    const emiPrincipals = await fetchActiveEmiPrincipalByCard(pool, userId);
    return addEmiPrincipal(rows, emiPrincipals);
}

// excludeId lets a caller pricing an in-flight edit (e.g. detectCard) leave
// the transaction being edited out of the balance -- otherwise its old
// amount (already baked into the stored/aggregated balance) and its
// newly-typed amount would both count. Defaults to null, a no-op, for the
// read-only callers below that have no such transaction in flight.
async function fetchCreditCardWithBalance(pool, userId, cardId, excludeId = null) {
    const { rows } = await pool.query(CARD_WITH_BALANCE_SINGLE_QUERY, [userId, cardId, excludeId]);
    if (!rows[0]) return null;
    const emiPrincipals = await fetchActiveEmiPrincipalByCard(pool, userId);
    return addEmiPrincipal(rows, emiPrincipals)[0];
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
    // EMI principal is blocked against the limit the instant the plan is
    // created, independent of any billing cycle -- it's not "new" just
    // because it happened after the last statement closed, and it's not
    // part of the statement balance either (no bank ever put "block the
    // full EMI amount" on an actual statement). So it must not leak into
    // new_charges_since_statement (currentOutstanding - statementBalance)
    // the way a fresh transaction would. Fix: add the same EMI amount to
    // statementBalance that fetchCreditCardsWithBalance already baked into
    // current_outstanding_balance above, so it cancels out of the diff and
    // only genuine transaction activity since the last close shows up as
    // "new charges". A second, small query -- re-deriving it from the
    // merged card object isn't possible since the addition already happened
    // inside fetchCreditCardsWithBalance and isn't returned separately.
    const emiPrincipals = await fetchActiveEmiPrincipalByCard(pool, userId);
    const emiByCard = new Map(emiPrincipals.map(e => [e.credit_card_id, e.remaining_principal]));
    return Promise.all(cards.map(async card => {
        const emiPrincipal = emiByCard.get(card.id) || 0;
        if (!card.billing_date) {
            return { ...card, statement_balance: null, new_charges_since_statement: null, last_statement_close_date: null, statement_due_date: null };
        }
        const closeDate = getLastStatementCloseDate(card.billing_date);
        const closeDateStr = toDateStr(closeDate);
        const { rows } = await pool.query(STATEMENT_BALANCE_QUERY, [card.id, closeDateStr]);
        const statementBalance = parseFloat(rows[0]?.statement_balance ?? card.outstanding_balance) + emiPrincipal;
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
