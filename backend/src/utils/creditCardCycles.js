// Per-billing-cycle statement history for a credit card. Complements
// creditCardBalance.js's running-total view (current_outstanding_balance,
// statement_balance/new_charges_since_statement) with a list of distinct,
// non-overlapping cycles so users can see "June's statement" separately from
// "July's statement" instead of one cumulative number -- the actual fix for
// the "two months mixed together" confusion. Deliberately does not touch
// creditCardBalance.js/getLastStatementCloseDate; this is a parallel,
// additive concept computed the same way creditCardEmi.js keeps its
// boundary/schedule math (computeCycleBoundaries) separate from its DB-query
// functions (fetchCyclesWithTotals).
const { istAddMonths, istDateStr, istMostRecentDayOfMonth } = require('./istDate');

const MAX_CYCLES = 24;

// Calendar-date-only "day after" -- takes a 'YYYY-MM-DD' string and returns
// the next calendar day, also as a 'YYYY-MM-DD' string. Uses Date.UTC the
// same way istAddMonths/istDaysInMonth do: purely as a UTC-anchored calendar
// calculator for a date that's already resolved, never to derive "today"
// from the server's own clock/timezone -- so this stays IST-safe by
// construction, same reasoning istDate.js's own header documents.
function dayAfter(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().split('T')[0];
}

// Pure, DB-free: given a card's billing_date (1-28) and how far back the app
// actually has data for (balanceAsOf), returns up to `count` cycle
// boundaries, most recent first. Entry 0 is always the current, still-open
// cycle (end: null). Every subsequent entry is one calendar month, stepped
// backward via istAddMonths -- never raw `Date` month arithmetic, which is
// what the IST-boundary fixes elsewhere in this app (istDate.js's header,
// the EMI feature's own due-date tests) exist to avoid.
//
// A statement closes ON the billing day and includes it (see the close-day
// note above buildStatementBalanceQuery), so a closed cycle runs from the
// day after the previous close through its own close: billing day 5 gives
// Aug 6 - Sep 5, and the open cycle starts the day after the latest close.
// On the billing day itself that is tomorrow: today's charges belong to the
// statement that closed today. Windows, totals and statement_balance all use
// this one definition, so a closed cycle's total is exactly the activity
// its statement billed.
//
// `today`/`balanceAsOf` are both 'YYYY-MM-DD' strings (or omitted/null) --
// never `Date` objects -- so this function never constructs a server-
// timezone Date from ambiguous input, the same discipline istAddMonths
// documents for itself.
function computeCycleBoundaries(billingDate, count, balanceAsOf, today) {
    if (!billingDate) return [];

    const cappedCount = Math.min(count, MAX_CYCLES);
    if (cappedCount <= 0) return [];

    const t = today || istDateStr();

    // Latest close: the most recent occurrence of billingDate that isn't in
    // the future, shared with getLastStatementCloseDate in
    // creditCardBalance.js via istMostRecentDayOfMonth (istDate.js), which
    // is what keeps this IST-safe.
    let close = istMostRecentDayOfMonth(billingDate, t);

    const boundaries = [];
    let end = null; // open-ended for the current cycle only

    for (let i = 0; i < cappedCount; i++) {
        let start = dayAfter(close);
        // At or before balanceAsOf is where the app's data begins: clip the
        // start to it and stop, since any older cycle would be empty.
        const clipped = Boolean(balanceAsOf && start <= balanceAsOf);
        if (clipped) start = balanceAsOf;
        boundaries.push({ start, end, is_current: i === 0 });
        if (clipped) break;

        // The next, older cycle closes on this one's previous billing day.
        end = close;
        close = istAddMonths(close, -1);
    }

    return boundaries;
}

// Builds the VALUES-row bucketing query for however many cycles were
// actually computed. Chose a VALUES-join over a hand-built CASE expression
// with one SUM(CASE...) column per cycle: the cycle count is caller-
// controlled (up to MAX_CYCLES) and a CASE-per-column approach would need a
// dynamically-sized SELECT list, which node-postgres/callers can't consume
// as a uniform shape. A VALUES-derived table joined against transactions and
// GROUP BY'd instead always returns one row per cycle with the same three
// columns regardless of how many cycles were requested -- easy to map back
// onto the `boundaries` array in order, and it's one round trip regardless
// of N, same as the requirement asks for.
const IS_BILL_PAYMENT = `COALESCE('credit_card_payment' = ANY(t.tags), false)`;

function buildBucketQuery(boundaries) {
    const valuesRows = [];
    const params = [];
    let paramIndex = 3; // $1 = cardId, $2 = userId in fetchCyclesWithTotals below

    boundaries.forEach((b, idx) => {
        valuesRows.push(`($${paramIndex}::int, $${paramIndex + 1}::date, $${paramIndex + 2}::date)`);
        params.push(idx, b.start, b.end); // b.end null is fine -- cast to ::date stays NULL
        paramIndex += 3;
    });

    // charges + payments = total: charges are purchases net of refunds (any
    // card income that isn't a bill payment), the same split the Pay Bill
    // picker's "new charges" uses; payments are bill payments, recognised the
    // way cardDueAlerts.js's CARD_PAYMENTS_SINCE_QUERY does (the card-side
    // income leg of POST /:id/pay, tagged 'credit_card_payment').
    const sql = `
        SELECT cyc.idx,
            COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0)
                AS total,
            COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount
                              WHEN t.type = 'income' AND NOT ${IS_BILL_PAYMENT} THEN -t.amount
                              ELSE 0 END), 0) AS charges,
            COALESCE(SUM(CASE WHEN t.type = 'income' AND ${IS_BILL_PAYMENT} THEN t.amount ELSE 0 END), 0)
                AS payments
        FROM (VALUES ${valuesRows.join(', ')}) AS cyc(idx, cycle_start, cycle_end)
        LEFT JOIN transactions t
            ON t.credit_card_id = $1
            AND t.user_id = $2
            AND t.date >= cyc.cycle_start
            AND (cyc.cycle_end IS NULL OR t.date <= cyc.cycle_end)
        GROUP BY cyc.idx
        ORDER BY cyc.idx
    `;
    return { sql, params };
}

// Close-day boundary -- ONE definition for every "what did a statement
// bill" number: a statement closes ON the billing day and includes every
// transaction dated on or before that day. That is how STATEMENT_BALANCE_QUERY
// (creditCardBalance.js) prices the latest statement, how statement_paid
// counts payments (strictly after the close, cardDueAlerts.js), how
// new_charges_since_statement splits the balance, and how the cycle windows
// above are cut. So a closed cycle's statement_close_date is its `end`, and
// its statement_balance is the running balance as of that date.
//
// Same formula as STATEMENT_BALANCE_QUERY -- baseline snapshot plus activity
// from balance_as_of through the close -- and, like statement_amount_due, no
// blocked EMI principal (it is not on any real statement; installments that
// have posted are ordinary transactions and do count). One query for every
// closed cycle: a VALUES list of close dates cross-joined onto the card.
function buildStatementBalanceQuery(closes) {
    const valuesRows = [];
    const params = [];
    let paramIndex = 3; // $1 = cardId, $2 = userId
    closes.forEach(({ idx, close }) => {
        valuesRows.push(`($${paramIndex}::int, $${paramIndex + 1}::date)`);
        params.push(idx, close);
        paramIndex += 2;
    });
    const sql = `
        SELECT cyc.idx,
            COALESCE(c.outstanding_balance, 0)
                + COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0)
                AS statement_balance
        FROM credit_cards c
        CROSS JOIN (VALUES ${valuesRows.join(', ')}) AS cyc(idx, close_date)
        LEFT JOIN transactions t
            ON t.credit_card_id = c.id
            AND t.user_id = c.user_id
            AND t.date >= COALESCE(c.balance_as_of, '1970-01-01')
            AND t.date <= cyc.close_date
        WHERE c.id = $1 AND c.user_id = $2
        GROUP BY cyc.idx, c.outstanding_balance
        ORDER BY cyc.idx
    `;
    return { sql, params };
}

const round2 = (x) => Math.round(x * 100) / 100;

const CARD_CYCLE_INPUTS_QUERY = `
    SELECT billing_date, balance_as_of, outstanding_balance
    FROM credit_cards
    WHERE id = $1 AND user_id = $2
`;

// Three DB round trips total, none of which scales with `count`: one to
// read the card's billing_date/balance_as_of/outstanding_balance (needed
// before boundaries can even be computed), and one -- built by
// buildBucketQuery above -- that sums every cycle's transactions in a
// single query regardless of how many cycles were requested, plus one --
// buildStatementBalanceQuery -- pricing every closed cycle's statement at
// once (skipped when only the current cycle exists). The last two are what
// the "not one query per cycle" requirement is actually guarding against;
// this is not an N+1 over cycles, and a card with no
// billing_date (or not found) short-circuits before ever running it.
//
// current_outstanding_balance (creditCardBalance.js's
// CARDS_WITH_BALANCE_QUERY) is COALESCE(c.outstanding_balance, 0) +
// transaction activity since balance_as_of -- the baseline snapshot of
// what was owed AS OF balance_as_of, plus everything tracked since. Cycle
// totals here only bucket transaction activity, so that baseline has to be
// folded in somewhere or the cycle totals would under-count relative to
// current_outstanding_balance for any card with a nonzero snapshot. It
// belongs on the OLDEST cycle returned (the last entry, most-recent-first)
// -- that's the cycle whose start is clipped to (or lands exactly on)
// balance_as_of by construction, i.e. "everything before this point,
// collapsed" is precisely what the baseline represents.
//
// Active EMI remaining principal (also folded into
// current_outstanding_balance, via fetchActiveEmiPrincipalByCard/
// addEmiPrincipal in creditCardBalance.js) is deliberately left OUT of
// every cycle total here: it's not-yet-posted future liability with no
// transaction and therefore no date to bucket by. Once an installment
// actually posts it becomes an ordinary transaction and already lands in
// the correct cycle via the bucket query below -- nothing extra needed for
// that case. So the true reconciliation against current_outstanding_balance
// is sum(cycle totals) + active_emi_remaining_principal, not sum(cycle
// totals) alone -- see the regression test in creditCardCycles.test.js.
async function fetchCyclesWithTotals(pool, userId, cardId, count) {
    const { rows } = await pool.query(CARD_CYCLE_INPUTS_QUERY, [cardId, userId]);
    const card = rows[0];
    if (!card) return [];

    // card.balance_as_of is a Postgres DATE column. node-postgres's default
    // type parser turns that into a JS Date at server-local midnight (not a
    // 'YYYY-MM-DD' string) -- exactly the raw-Date trap istDate.js's header
    // comment documents this app's earlier IST bugs coming from. Route it
    // through istDateStr the same way every other "turn a moment into the
    // correct IST calendar day" conversion in this codebase does, so a
    // real pg DATE and a test's plain 'YYYY-MM-DD' string mock both resolve
    // to the same value.
    const balanceAsOf = card.balance_as_of ? istDateStr(new Date(card.balance_as_of)) : null;
    const boundaries = computeCycleBoundaries(card.billing_date, count, balanceAsOf, undefined);
    if (boundaries.length === 0) return [];

    const { sql, params } = buildBucketQuery(boundaries);
    const { rows: totalsRows } = await pool.query(sql, [cardId, userId, ...params]);
    const rowByIdx = new Map(totalsRows.map(r => [Number(r.idx), r]));

    // charges/payments (numbers at 2dp) are this window's own activity only;
    // the baseline folded into the oldest `total` below is in neither.
    const results = boundaries.map((b, idx) => {
        const r = rowByIdx.get(idx);
        return {
            ...b,
            total: r ? r.total : '0',
            charges: round2(parseFloat(r?.charges) || 0),
            payments: round2(parseFloat(r?.payments) || 0),
        };
    });

    // Fold the baseline snapshot into the oldest cycle -- the last entry,
    // since `results` is most-recent-first. parseFloat/COALESCE-to-0 same
    // as CARDS_WITH_BALANCE_QUERY does for outstanding_balance.
    const oldest = results[results.length - 1];
    const baseline = parseFloat(card.outstanding_balance) || 0;
    oldest.total = (parseFloat(oldest.total) + baseline).toFixed(2);

    // Additive: what each CLOSED cycle's statement billed (see
    // buildStatementBalanceQuery for the close-day definition). null on the
    // open current cycle. A number at 2dp, like statement_amount_due, so the
    // latest statement's figure matches it exactly.
    const closes = results
        .map((c, idx) => ({ idx, close: c.end }))
        .filter(c => c.close);
    const balanceByIdx = new Map();
    if (closes.length) {
        const { sql: sbSql, params: sbParams } = buildStatementBalanceQuery(closes);
        const { rows: sbRows } = await pool.query(sbSql, [cardId, userId, ...sbParams]);
        for (const r of sbRows) balanceByIdx.set(Number(r.idx), round2(parseFloat(r.statement_balance) || 0));
    }
    const closeByIdx = new Map(closes.map(c => [c.idx, c.close]));

    return results.map((c, idx) => ({
        ...c,
        statement_close_date: closeByIdx.get(idx) ?? null,
        statement_balance: balanceByIdx.has(idx) ? balanceByIdx.get(idx) : null,
    }));
}

module.exports = {
    computeCycleBoundaries,
    dayAfter,
    fetchCyclesWithTotals,
};
