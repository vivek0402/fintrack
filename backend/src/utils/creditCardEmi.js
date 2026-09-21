// Centralizes "what's the current state of a credit card EMI" the same way
// personalLoans.js centralizes it for personal loans. Status is never stored
// -- it's derived fresh from tenure_months vs. how many installments have
// actually posted every time, so a forgotten update after an installment
// posts can never leave it stale (the same class of bug personalLoans.js
// guards against for written_off_at/repaid_amount).
const EMI_WITH_BALANCE_QUERY = `
    SELECT e.*,
        COALESCE(i.posted_principal, 0) AS posted_principal,
        e.principal_amount - COALESCE(i.posted_principal, 0) AS remaining_principal,
        COALESCE(i.installments_posted, 0) AS installments_posted,
        e.tenure_months AS installments_total
    FROM credit_card_emis e
    -- installments_total reads straight off credit_card_emis.tenure_months
    -- rather than COUNT(*)-ing the installments rows: tenure_months is the
    -- contractual plan length and is always populated the moment the EMI is
    -- created (before any installment rows may even exist yet), so it's the
    -- more directly queryable and more reliably-present source of truth.
    LEFT JOIN (
        SELECT emi_id,
            SUM(principal_component) FILTER (WHERE posted_at IS NOT NULL) AS posted_principal,
            COUNT(*) FILTER (WHERE posted_at IS NOT NULL) AS installments_posted
        FROM credit_card_emi_installments
        WHERE user_id = $1
        GROUP BY emi_id
    ) i ON i.emi_id = e.id
    WHERE e.user_id = $1
    ORDER BY e.created_at DESC
`;

const EMI_WITH_BALANCE_SINGLE_QUERY = `
    SELECT e.*,
        COALESCE(i.posted_principal, 0) AS posted_principal,
        e.principal_amount - COALESCE(i.posted_principal, 0) AS remaining_principal,
        COALESCE(i.installments_posted, 0) AS installments_posted,
        e.tenure_months AS installments_total
    FROM credit_card_emis e
    LEFT JOIN (
        SELECT emi_id,
            SUM(principal_component) FILTER (WHERE posted_at IS NOT NULL) AS posted_principal,
            COUNT(*) FILTER (WHERE posted_at IS NOT NULL) AS installments_posted
        FROM credit_card_emi_installments
        WHERE emi_id = $2 AND user_id = $1
        GROUP BY emi_id
    ) i ON i.emi_id = e.id
    WHERE e.user_id = $1 AND e.id = $2
`;

// No written_off/partially_repaid concept here -- an EMI just runs its
// tenure or it doesn't. installments_posted/installments_total arrive as
// strings/numbers from pg depending on the aggregate; coerce before
// comparing.
function deriveStatus(emi) {
    const posted = parseInt(emi.installments_posted, 10) || 0;
    const total = parseInt(emi.installments_total, 10) || 0;
    return posted < total ? 'active' : 'completed';
}

function withStatus(emi) {
    return { ...emi, status: deriveStatus(emi) };
}

async function fetchCreditCardEmisWithBalance(pool, userId) {
    const { rows } = await pool.query(EMI_WITH_BALANCE_QUERY, [userId]);
    return rows.map(withStatus);
}

async function fetchCreditCardEmiWithBalance(pool, userId, emiId) {
    const { rows } = await pool.query(EMI_WITH_BALANCE_SINGLE_QUERY, [userId, emiId]);
    return rows[0] ? withStatus(rows[0]) : null;
}

// Returns one row per credit_card_id: { credit_card_id, remaining_principal }
// (a plain array, not an object map) -- the same shape
// fetchCreditCardsWithBalance in creditCardBalance.js already returns per
// card, so a future join there is a straight `.find(r => r.credit_card_id
// === card.id)` (or a Map built from this array) rather than reshaping
// anything. Only active (not-yet-fully-posted) EMIs are summed; a completed
// EMI contributes 0, same reasoning as personalLoans' repaid/written_off
// loans contributing 0 to fetchPersonalLoanTotals.
async function fetchActiveEmiPrincipalByCard(pool, userId) {
    const emis = await fetchCreditCardEmisWithBalance(pool, userId);
    const totals = new Map();
    for (const emi of emis) {
        if (emi.status !== 'active') continue;
        const cardId = emi.credit_card_id;
        const remaining = parseFloat(emi.remaining_principal) || 0;
        totals.set(cardId, (totals.get(cardId) || 0) + remaining);
    }
    return Array.from(totals, ([credit_card_id, remaining_principal]) => ({ credit_card_id, remaining_principal }));
}

module.exports = {
    fetchCreditCardEmisWithBalance,
    fetchCreditCardEmiWithBalance,
    fetchActiveEmiPrincipalByCard,
    deriveStatus,
};
