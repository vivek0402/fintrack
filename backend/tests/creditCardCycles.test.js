const { computeCycleBoundaries, fetchCyclesWithTotals } = require('../src/utils/creditCardCycles');
const { fetchCreditCardsWithBalance, getLastStatementCloseDate } = require('../src/utils/creditCardBalance');
const { amountDueOnStatement } = require('../src/utils/cardDueAlerts');

function mockPool(...results) {
    const query = jest.fn();
    for (const r of results) query.mockResolvedValueOnce(r);
    query.mockResolvedValue({ rows: [] });
    return { query };
}

describe('computeCycleBoundaries', () => {
    test('current cycle is the first entry, open-ended, when billingDate has already occurred this month', () => {
        const boundaries = computeCycleBoundaries(5, 3, null, '2026-06-20');
        expect(boundaries[0]).toEqual({ start: '2026-06-05', end: null, is_current: true });
    });

    test('current cycle rolls back to last month when this month\'s billingDate has not happened yet', () => {
        const boundaries = computeCycleBoundaries(25, 3, null, '2026-06-20');
        expect(boundaries[0]).toEqual({ start: '2026-05-25', end: null, is_current: true });
    });

    test('billingDate exactly today counts as already occurred (not future)', () => {
        const boundaries = computeCycleBoundaries(20, 1, null, '2026-06-20');
        expect(boundaries[0]).toEqual({ start: '2026-06-20', end: null, is_current: true });
    });

    test('closed cycles step backward one calendar month at a time, ending the day before the next cycle starts', () => {
        const boundaries = computeCycleBoundaries(5, 3, null, '2026-06-20');
        expect(boundaries).toEqual([
            { start: '2026-06-05', end: null, is_current: true },
            { start: '2026-05-05', end: '2026-06-04', is_current: false },
            { start: '2026-04-05', end: '2026-05-04', is_current: false },
        ]);
    });

    // Same spirit as the EMI feature's IST-boundary tests: stepping backward
    // across a year boundary (Jan -> Dec of the PRIOR year) is exactly the
    // kind of thing naive `new Date(y, m - 1, d)` arithmetic gets wrong when
    // combined with a server-timezone "today" -- istAddMonths does pure
    // integer year*12+month math instead, and this function only ever feeds
    // it 'YYYY-MM-DD' strings (never a `Date` built from an ambiguous
    // "today"), so the year correctly decrements here.
    test('closed cycles correctly cross a year boundary via istAddMonths, not raw Date arithmetic', () => {
        const boundaries = computeCycleBoundaries(10, 3, null, '2026-01-15');
        expect(boundaries).toEqual([
            { start: '2026-01-10', end: null, is_current: true },
            { start: '2025-12-10', end: '2026-01-09', is_current: false },
            { start: '2025-11-10', end: '2025-12-09', is_current: false },
        ]);
    });

    test('clips the oldest cycle\'s start to balanceAsOf and stops generating further cycles', () => {
        // Without clipping this would keep going back to 2026-02-05,
        // 2026-01-05, etc. balanceAsOf lands mid-cycle (03-10), so the
        // oldest cycle's start must clip to it and generation must stop --
        // no 2026-02-xx entry should appear at all.
        const boundaries = computeCycleBoundaries(5, 6, '2026-03-10', '2026-06-20');
        expect(boundaries).toEqual([
            { start: '2026-06-05', end: null, is_current: true },
            { start: '2026-05-05', end: '2026-06-04', is_current: false },
            { start: '2026-04-05', end: '2026-05-04', is_current: false },
            { start: '2026-03-10', end: '2026-04-04', is_current: false },
        ]);
    });

    test('clips even the current (first) cycle when balanceAsOf falls inside it', () => {
        const boundaries = computeCycleBoundaries(5, 6, '2026-06-15', '2026-06-20');
        expect(boundaries).toEqual([
            { start: '2026-06-15', end: null, is_current: true },
        ]);
    });

    test('balanceAsOf exactly on a cycle start is not clipped (start stays that date, unaffected by the equal-boundary case)', () => {
        const boundaries = computeCycleBoundaries(5, 2, '2026-05-05', '2026-06-20');
        expect(boundaries).toEqual([
            { start: '2026-06-05', end: null, is_current: true },
            { start: '2026-05-05', end: '2026-06-04', is_current: false },
        ]);
    });

    test('null balanceAsOf means no clipping at all', () => {
        const boundaries = computeCycleBoundaries(5, 2, null, '2026-06-20');
        expect(boundaries).toHaveLength(2);
    });

    test('returns [] when billingDate is null', () => {
        expect(computeCycleBoundaries(null, 5, null, '2026-06-20')).toEqual([]);
    });

    test('returns [] when billingDate is falsy (0/undefined)', () => {
        expect(computeCycleBoundaries(undefined, 5, null, '2026-06-20')).toEqual([]);
        expect(computeCycleBoundaries(0, 5, null, '2026-06-20')).toEqual([]);
    });

    test('count is capped at 24 internally even if a much larger count is requested', () => {
        const boundaries = computeCycleBoundaries(5, 1000, null, '2026-06-20');
        expect(boundaries).toHaveLength(24);
    });

    test('defaults `today` to the real current IST date when omitted', () => {
        // Just prove it doesn't throw and produces a sane, non-future start.
        const boundaries = computeCycleBoundaries(5, 1, null);
        expect(boundaries).toHaveLength(1);
        expect(boundaries[0].start <= new Date().toISOString().split('T')[0]).toBe(true);
    });
});

describe('fetchCyclesWithTotals', () => {
    test('issues exactly one bucketing query regardless of how many cycles are requested (no N+1)', async () => {
        const cardRow = { rows: [{ billing_date: 5, balance_as_of: null }] };
        const bucketRows = { rows: Array.from({ length: 24 }, (_, i) => ({ idx: i, total: '0' })) };
        const pool = mockPool(cardRow, bucketRows);

        await fetchCyclesWithTotals(pool, 'u1', 1, 24);

        // Two calls total: (1) reading billing_date/balance_as_of, which is
        // unavoidable input to computeCycleBoundaries, and (2) the single
        // bucketing query built from however many boundaries came out of
        // it. Neither call count nor either individual query's shape grows
        // with the number of cycles requested -- that's the regression this
        // asserts against (a naive per-cycle-loop implementation would have
        // made 1 + N calls here, i.e. 25, not 2). A third, equally
        // constant call prices every closed cycle's statement_balance at once.
        expect(pool.query).toHaveBeenCalledTimes(3);
    });

    test('the bucketing query itself is one query no matter the cycle count (3 vs 24 cycles cost the same number of calls)', async () => {
        const poolFew = mockPool({ rows: [{ billing_date: 5, balance_as_of: null }] }, { rows: [] });
        await fetchCyclesWithTotals(poolFew, 'u1', 1, 3);
        const callsFew = poolFew.query.mock.calls.length;

        const poolMany = mockPool({ rows: [{ billing_date: 5, balance_as_of: null }] }, { rows: [] });
        await fetchCyclesWithTotals(poolMany, 'u1', 1, 24);
        const callsMany = poolMany.query.mock.calls.length;

        expect(callsFew).toBe(callsMany);
    });

    test('returns [] without running the bucket query when the card has no billing_date', async () => {
        const pool = mockPool({ rows: [{ billing_date: null, balance_as_of: null }] });
        const result = await fetchCyclesWithTotals(pool, 'u1', 1, 6);
        expect(result).toEqual([]);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the card-info lookup
    });

    test('returns [] when the card is not found for this user', async () => {
        const pool = mockPool({ rows: [] });
        const result = await fetchCyclesWithTotals(pool, 'u1', 999, 6);
        expect(result).toEqual([]);
        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test('maps bucket totals back onto the right cycle by idx, correct per-cycle bucketing shape', async () => {
        const pool = mockPool(
            { rows: [{ billing_date: 5, balance_as_of: '2026-04-05' }] },
            { rows: [
                { idx: 0, total: '1500.00' },
                { idx: 1, total: '3200.50' },
                { idx: 2, total: '900.00' },
            ] },
        );

        const result = await fetchCyclesWithTotals(pool, 'u1', 1, 3);

        // `today` defaults to the real current date here (fetchCyclesWithTotals
        // doesn't take a `today` override), so the exact cycle start dates
        // depend on when the test runs -- computeCycleBoundaries' own tests
        // above already pin down that date math precisely. This test only
        // cares that the bucket query's { idx, total } rows get mapped back
        // onto the right boundary in the right order.
        expect(result).toEqual([
            expect.objectContaining({ start: expect.any(String), end: null, is_current: true, total: '1500.00' }),
            expect.objectContaining({ start: expect.any(String), end: expect.any(String), is_current: false, total: '3200.50' }),
            expect.objectContaining({ start: expect.any(String), end: expect.any(String), is_current: false, total: '900.00' }),
        ]);
    });

    test('a cycle missing from the bucket query result (no transactions at all) defaults to a zero total', async () => {
        const pool = mockPool(
            { rows: [{ billing_date: 5, balance_as_of: null }] },
            { rows: [{ idx: 0, total: '500.00' }] }, // idx 1 absent -- LEFT JOIN with no matching rows just group-drops it in some engines
        );
        const result = await fetchCyclesWithTotals(pool, 'u1', 1, 2);
        // '0.00', not '0' -- the oldest cycle (idx 1 here) always gets the
        // baseline snapshot folded in via .toFixed(2), even when that
        // baseline is itself 0 (no outstanding_balance on this card mock).
        expect(result[1].total).toBe('0.00');
    });

    // Pins the "credit balance" case: a mid-cycle bill payment (an
    // income-type transaction, per buildBucketQuery's sign convention) that
    // exceeds that cycle's expenses makes total = SUM(expense) - SUM(income)
    // go negative. That's a real credit, not debt -- the frontend cycles page
    // must render this with a distinguishing sign/color rather than
    // Math.abs()-ing it away. Explicitly pinned here per this branch's own
    // testing discipline, even though it already falls out of the existing
    // SQL/sign convention.
    test('a cycle where a bill payment exceeds that cycle\'s charges produces a negative total (credit balance)', async () => {
        const pool = mockPool(
            { rows: [{ billing_date: 5, balance_as_of: null }] },
            { rows: [{ idx: 0, total: '-500.00' }] }, // 200 in charges, 700 payment -> net -500
        );
        const result = await fetchCyclesWithTotals(pool, 'u1', 1, 1);
        expect(result[0].total).toBe('-500.00');
        expect(parseFloat(result[0].total)).toBeLessThan(0);
    });

    test('folds the card\'s outstanding_balance baseline snapshot into the oldest cycle only, not every cycle', async () => {
        const pool = mockPool(
            { rows: [{ billing_date: 5, balance_as_of: '2026-04-05', outstanding_balance: '2500.00' }] },
            { rows: [
                { idx: 0, total: '100.00' },
                { idx: 1, total: '200.00' },
                { idx: 2, total: '50.00' },
            ] },
        );
        const result = await fetchCyclesWithTotals(pool, 'u1', 1, 3);

        expect(result[0].total).toBe('100.00'); // current cycle: untouched
        expect(result[1].total).toBe('200.00'); // a middle closed cycle: untouched
        expect(result[2].total).toBe('2550.00'); // oldest cycle: 50.00 + 2500.00 baseline
    });

    // Mirrors buildBucketQuery's WHERE clause -- t.date >= cycle.start AND
    // (cycle.end IS NULL OR t.date <= cycle.end) -- and its sign convention
    // (expense adds, income subtracts), computed from each transaction's
    // ACTUAL date rather than hand-assigned to a cycle. Used to build the
    // mocked bucket-query rows fed to the pool below, so the test also
    // exercises date-range edge behavior (a transaction dated exactly on a
    // cycle's start/end) instead of only the JS-side idx-to-cycle mapping.
    function bucketByDateRange(transactions, boundaries) {
        return boundaries.map(c => {
            const net = transactions
                .filter(t => t.date >= c.start && (c.end === null || t.date <= c.end))
                .reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : -t.amount), 0);
            return net.toFixed(2);
        });
    }

    // The critical regression-class check: sum(cycle totals) +
    // active_emi_remaining_principal must equal current_outstanding_balance
    // from fetchCreditCardsWithBalance, when the cycles fully cover the same
    // span the balance query covers (balance_as_of through today) -- no
    // gaps, no double-counting across a cycle boundary. The full formula
    // (creditCardBalance.js's CARDS_WITH_BALANCE_QUERY):
    //   current_outstanding_balance
    //     = COALESCE(outstanding_balance, 0)      -- baseline snapshot as of balance_as_of
    //     + transaction activity since balance_as_of
    //     + active EMI remaining principal          -- addEmiPrincipal, not tied to any date
    // fetchCyclesWithTotals folds the baseline into the oldest cycle (Fix 1)
    // but deliberately leaves EMI remaining principal out of every cycle
    // (it has no transaction/date to bucket by until it posts) -- so the
    // two sides only reconcile once the EMI term is added back on the
    // cycles side, which is exactly what's asserted below.
    test('sum(cycle totals) + active EMI remaining principal equals current_outstanding_balance, cycles fully covering the span, nonzero baseline', async () => {
        const billingDate = 5;
        const today = '2026-06-20';
        const balanceAsOf = '2026-04-05';
        const outstandingBaseline = 5000; // nonzero -- exercises Fix 1
        const emiRemainingPrincipal = 1200; // not tied to any transaction date -- excluded from cycle totals

        // Real production boundary computation, not reimplemented here --
        // 3 cycles exactly covers [balanceAsOf, today] with billingDate 5.
        const boundaries = computeCycleBoundaries(billingDate, 3, balanceAsOf, today);
        expect(boundaries).toEqual([
            { start: '2026-06-05', end: null, is_current: true },
            { start: '2026-05-05', end: '2026-06-04', is_current: false },
            { start: '2026-04-05', end: '2026-05-04', is_current: false },
        ]);

        // Dated transactions, including two placed exactly on a cycle
        // boundary (05-04 = the oldest cycle's last day, 05-05 = the middle
        // cycle's first day) to exercise the >=/<= edges.
        const transactions = [
            { date: '2026-04-10', type: 'expense', amount: 1000 },
            { date: '2026-04-20', type: 'income', amount: 200 },
            { date: '2026-05-04', type: 'expense', amount: 30 }, // oldest cycle's last day
            { date: '2026-05-05', type: 'expense', amount: 50 }, // middle cycle's first day
            { date: '2026-05-10', type: 'expense', amount: 2500 },
            { date: '2026-06-01', type: 'expense', amount: 700.5 },
            { date: '2026-06-15', type: 'income', amount: 100 },
        ];
        const bucketTotals = bucketByDateRange(transactions, boundaries);
        // Hand-verified against the fixture above: cycle0 (06-05..open) =
        // -100; cycle1 (05-05..06-04) = 50+2500+700.5 = 3250.50; cycle2
        // (04-05..05-04, oldest) = 1000-200+30 = 830.00.
        expect(bucketTotals).toEqual(['-100.00', '3250.50', '830.00']);

        const cyclesPool = mockPool(
            { rows: [{ billing_date: billingDate, balance_as_of: balanceAsOf, outstanding_balance: String(outstandingBaseline) }] },
            { rows: bucketTotals.map((total, idx) => ({ idx, total })) },
        );
        const cycles = await fetchCyclesWithTotals(cyclesPool, 'u1', 1, 3);

        // Fix 1, concretely: the oldest cycle carries the baseline on top
        // of its own bucketed total; nothing else does.
        expect(cycles[2].total).toBe((830 + outstandingBaseline).toFixed(2));
        expect(cycles[0].total).toBe('-100.00');
        expect(cycles[1].total).toBe('3250.50');

        // fetchCreditCardsWithBalance, mocked consistently with the same
        // fixture: current_outstanding_balance = baseline + tx activity
        // (what CARDS_WITH_BALANCE_QUERY's aggregation would produce) with
        // the active EMI's remaining principal folded in by addEmiPrincipal
        // (fetchActiveEmiPrincipalByCard's underlying query, mocked here).
        const txActivitySum = transactions.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : -t.amount), 0);
        const balancePool = mockPool(
            { rows: [{ id: 1, outstanding_balance: String(outstandingBaseline), current_outstanding_balance: (outstandingBaseline + txActivitySum).toFixed(2) }] },
            { rows: [{ id: 'e1', credit_card_id: 1, principal_amount: '2000', posted_principal: '800', remaining_principal: String(emiRemainingPrincipal), installments_posted: 4, installments_total: 10 }] },
        );
        const [cardWithBalance] = await fetchCreditCardsWithBalance(balancePool, 'u1');

        const sumOfCycleTotals = cycles.reduce((sum, c) => sum + parseFloat(c.total), 0);
        expect(sumOfCycleTotals + emiRemainingPrincipal).toBeCloseTo(parseFloat(cardWithBalance.current_outstanding_balance), 2);
    });
});

// Per-closed-cycle statement_balance: the running balance as of each
// statement's close, close day INCLUDED (the STATEMENT_BALANCE_QUERY
// definition). The mocked pool evaluates the real SQL's WHERE semantics
// against a fixture: t.date >= balance_as_of AND t.date <= close_date,
// baseline + expense - income. EMI blocked principal is never added.
describe('fetchCyclesWithTotals -- per-cycle statement_balance', () => {
    const RealDate = Date;
    const TODAY = '2026-09-20T06:30:00.000Z'; // IST 2026-09-20; billing day 5 -> current cycle Sep 5 - present
    beforeAll(() => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new RealDate(TODAY));
    });
    afterAll(() => jest.useRealTimers());

    const STATEMENT_SQL = /AS cyc\(idx, close_date\)/;

    function statementRows(card, transactions, params) {
        const rows = [];
        for (let i = 2; i < params.length; i += 2) {
            const idx = params[i];
            const close = params[i + 1];
            const net = transactions
                .filter(t => t.date >= (card.balance_as_of || '1970-01-01') && t.date <= close)
                .reduce((s, t) => s + (t.type === 'expense' ? t.amount : -t.amount), 0);
            rows.push({ idx, statement_balance: (parseFloat(card.outstanding_balance || 0) + net).toFixed(2) });
        }
        return rows;
    }

    function fixturePool(card, transactions) {
        const query = jest.fn(async (sql, params) => {
            if (STATEMENT_SQL.test(sql)) return { rows: statementRows(card, transactions, params) };
            if (/AS cyc\(idx, cycle_start, cycle_end\)/.test(sql)) return { rows: [] };
            if (/FROM credit_cards\s+WHERE id = \$1/.test(sql)) return { rows: [card] };
            throw new Error('unexpected query');
        });
        return { query };
    }

    const card = { billing_date: 5, balance_as_of: '2026-06-01', outstanding_balance: '1000.00' };
    const txs = [
        { date: '2026-06-10', type: 'expense', amount: 2000 },
        { date: '2026-07-05', type: 'expense', amount: 300 },  // close day of the Jun 5 - Jul 4 statement
        { date: '2026-07-06', type: 'expense', amount: 400 },
        { date: '2026-07-20', type: 'income', amount: 3300 },  // pays that statement in full
        { date: '2026-08-05', type: 'expense', amount: 50 },   // close day of the July statement
        { date: '2026-08-12', type: 'expense', amount: 5000 },
        { date: '2026-09-05', type: 'expense', amount: 25 },   // close day of the latest statement
        { date: '2026-09-10', type: 'expense', amount: 999 },  // current cycle: in no statement
    ];

    test('each closed cycle carries its close date (day after end) and the balance as of it, close day included', async () => {
        const cycles = await fetchCyclesWithTotals(fixturePool(card, txs), 'u1', 1, 6);
        expect(cycles.map(c => [c.start, c.end, c.statement_close_date])).toEqual([
            ['2026-09-05', null, null],
            ['2026-08-05', '2026-09-04', '2026-09-05'],
            ['2026-07-05', '2026-08-04', '2026-08-05'],
            ['2026-06-05', '2026-07-04', '2026-07-05'],
            ['2026-06-01', '2026-06-04', '2026-06-05'], // oldest, clipped to balance_as_of
        ]);
        expect(cycles[4].statement_balance).toBe(1000); // baseline only
        expect(cycles[3].statement_balance).toBe(3300); // 1000 + 2000 + 300 (close day)
        expect(cycles[2].statement_balance).toBe(450);  // 3300 + 400 - 3300 + 50
        expect(cycles[1].statement_balance).toBe(5475); // 450 + 5000 + 25; the Sep 10 charge is excluded
        expect(cycles[0].statement_balance).toBeNull();
    });

    test('the latest statement equals statement_amount_due from GET /api/credit-cards (EMI card)', async () => {
        const emiPrincipal = 12000;
        const cycles = await fetchCyclesWithTotals(fixturePool(card, txs), 'u1', 1, 6);

        // What the card endpoint does for the same card: STATEMENT_BALANCE_QUERY at
        // getLastStatementCloseDate, + blocked EMI principal (fetchCreditCardsWithCycleBreakdown),
        // - that principal again (amountDueOnStatement), rounded to 2dp (withStatementRemaining).
        const close = getLastStatementCloseDate(card.billing_date).toISOString().split('T')[0];
        expect(close).toBe(cycles[1].statement_close_date);
        const [row] = statementRows(card, txs, [1, 'u1', 0, close]);
        const cardFields = { statement_balance: parseFloat(row.statement_balance) + emiPrincipal, emi_blocked_principal: emiPrincipal };
        const amountDue = Math.round(amountDueOnStatement(cardFields) * 100) / 100;

        expect(cycles[1].statement_balance).toBe(amountDue);
        expect(cycles[1].statement_balance).toBe(5475); // no EMI principal leaked in
    });

    test('one statement query for all closed cycles, whatever the count', async () => {
        const pool = fixturePool({ ...card, balance_as_of: null }, txs);
        await fetchCyclesWithTotals(pool, 'u1', 1, 24);
        const sbCalls = pool.query.mock.calls.filter(([sql]) => STATEMENT_SQL.test(sql));
        expect(sbCalls).toHaveLength(1);
        expect(sbCalls[0][1]).toHaveLength(2 + 23 * 2); // cardId, userId + (idx, close) per closed cycle
        expect(pool.query).toHaveBeenCalledTimes(3);
    });

    test('skips the statement query when only the current cycle exists', async () => {
        const pool = fixturePool({ ...card, balance_as_of: '2026-09-08' }, txs);
        const cycles = await fetchCyclesWithTotals(pool, 'u1', 1, 6);
        expect(cycles).toHaveLength(1);
        expect(cycles[0].statement_balance).toBeNull();
        expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test('the statement query is parameterized and scoped to the user', async () => {
        const pool = fixturePool(card, txs);
        await fetchCyclesWithTotals(pool, 'u1', 1, 3);
        const [sql] = pool.query.mock.calls.find(([q]) => STATEMENT_SQL.test(q));
        expect(sql).not.toMatch(/2026-/);
        expect(sql).toMatch(/WHERE c\.id = \$1 AND c\.user_id = \$2/);
    });
});
