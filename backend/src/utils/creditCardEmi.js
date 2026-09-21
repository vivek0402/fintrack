const { istAddMonths, istDateStr } = require('./istDate');

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

// Turns a generateAmortization() result into the rows convert-to-emi needs
// to insert into credit_card_emi_installments -- pure, DB-free, and
// deliberately separated from the route so it can be unit-tested directly
// instead of only indirectly through a mocked pg client. This is the write
// side's equivalent of what the fetch* helpers above are for reads.
//
// generateAmortization is only ever used by the route for its
// principal/interest-component math -- its own internal schedule dates
// (computed from server-local `new Date()` plain JS month arithmetic) are
// discarded here and recomputed via istAddMonths off purchaseDate instead,
// so due dates are IST-safe. See istDate.js's header comment for the bug
// history this avoids, and amortization.js's own comments -- it's shared
// with loans.js/debt.js and is deliberately left untouched rather than
// taught a start-date parameter.
//
// First installment is due one month after the purchase date -- the
// standard EMI convention (a purchase made today isn't due immediately).
//
// Throws rather than silently truncating/padding if the amortization
// schedule's length doesn't match tenure_months exactly (possible in
// principle on a rounding edge case) -- a silent mismatch here would mean
// installment rows summing to less than the purchase amount, with nothing
// ever surfacing an error about it.
function buildEmiInstallmentSchedule(amortization, purchaseDate, tenureMonths) {
    const schedule = amortization.schedule;
    if (schedule.length !== tenureMonths) {
        throw new Error(
            `EMI amortization schedule length (${schedule.length}) does not match tenure_months (${tenureMonths}) -- refusing to silently truncate/pad the installment schedule.`
        );
    }
    return schedule.map((monthEntry, i) => {
        const installmentNumber = i + 1;
        return {
            installment_number: installmentNumber,
            due_date: istAddMonths(purchaseDate, installmentNumber),
            amount: monthEntry.emi,
            principal_component: monthEntry.principal_component,
            interest_component: monthEntry.interest_component,
        };
    });
}

// Selects every credit_card_emi_installments row that's due and hasn't
// posted yet, joined up to its parent EMI for the fields the posting cron
// needs (credit_card_id, a human-readable description, category_id, and
// tenure_months for the "N/M" label). posted_at IS NULL AND due_date <= $1
// is exactly the predicate idx_credit_card_emi_installments_due_unposted
// (migration 073) was built for, so this stays index-only on the
// installments side regardless of table size.
const DUE_UNPOSTED_INSTALLMENTS_QUERY = `
    SELECT ci.*, e.credit_card_id, e.description AS emi_description, e.category_id, e.tenure_months
    FROM credit_card_emi_installments ci
    JOIN credit_card_emis e ON e.id = ci.emi_id
    WHERE ci.posted_at IS NULL AND ci.due_date <= $1
    ORDER BY ci.due_date ASC
`;

// Posts every due, unposted EMI installment as a real expense transaction
// and marks the installment posted -- this is what makes an EMI's future
// installments actually show up as spend and count toward the card's
// balance (via creditCardBalance.js's transaction-sum logic) on schedule,
// without the app ever needing to be opened. Structurally the sibling of
// the recurring-transactions cron in index.js: same per-row try/catch
// isolation so one installment's failure can't block the rest from
// posting.
//
// The installment's own posted_at/due_date are the sole source of truth
// for "is this due" -- no extra filtering on the EMI's own active/
// completed status is needed, since a fully-posted EMI naturally has no
// unposted installment rows left to match this query in the first place.
//
// No-cost vs. interest-bearing EMIs are posted identically here: amount/
// principal_component/interest_component were already computed correctly
// by buildEmiInstallmentSchedule back at EMI creation time (an even split
// for no-cost, an amortized split otherwise) -- this function's only job
// is to post `amount` as a transaction on schedule, regardless of how it
// was split.
//
// Each installment's transaction insert + posted_at/transaction_id update
// run inside one BEGIN/COMMIT on a dedicated client (not two independent
// pool.query calls) so they can never be observed apart -- if the update
// failed after the insert succeeded, the installment would still look
// unposted and get re-inserted as a duplicate transaction on the next run.
async function postDueEmiInstallments(pool, today = istDateStr()) {
    const due = await pool.query(DUE_UNPOSTED_INSTALLMENTS_QUERY, [today]);

    let processed = 0;
    for (const installment of due.rows) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const label = `EMI installment ${installment.installment_number}/${installment.tenure_months} — ${installment.emi_description}`;
            const txResult = await client.query(
                `INSERT INTO transactions (user_id, category_id, type, amount, description, date, credit_card_id)
                 VALUES ($1,$2,'expense',$3,$4,$5,$6)
                 RETURNING id`,
                [installment.user_id, installment.category_id, installment.amount, label, installment.due_date, installment.credit_card_id]
            );
            const transactionId = txResult.rows[0].id;

            await client.query(
                `UPDATE credit_card_emi_installments SET posted_at = NOW(), transaction_id = $1 WHERE id = $2`,
                [transactionId, installment.id]
            );

            await client.query('COMMIT');
            processed++;
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            console.error(`[Cron] Failed to post EMI installment ${installment.id} (emi ${installment.emi_id}, user ${installment.user_id}):`, err.message);
        } finally {
            client.release();
        }
    }

    return { processed, due: due.rows.length };
}

module.exports = {
    fetchCreditCardEmisWithBalance,
    fetchCreditCardEmiWithBalance,
    fetchActiveEmiPrincipalByCard,
    deriveStatus,
    buildEmiInstallmentSchedule,
    postDueEmiInstallments,
};
