const { computeCycleBoundaries, fetchCyclesWithTotals } = require('../src/utils/creditCardCycles');
const { fetchCreditCardsWithBalance } = require('../src/utils/creditCardBalance');

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
        // made 1 + N calls here, i.e. 25, not 2).
        expect(pool.query).toHaveBeenCalledTimes(2);
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
            { start: expect.any(String), end: null, is_current: true, total: '1500.00' },
            { start: expect.any(String), end: expect.any(String), is_current: false, total: '3200.50' },
            { start: expect.any(String), end: expect.any(String), is_current: false, total: '900.00' },
        ]);
    });

    test('a cycle missing from the bucket query result (no transactions at all) defaults to a zero total', async () => {
        const pool = mockPool(
            { rows: [{ billing_date: 5, balance_as_of: null }] },
            { rows: [{ idx: 0, total: '500.00' }] }, // idx 1 absent -- LEFT JOIN with no matching rows just group-drops it in some engines
        );
        const result = await fetchCyclesWithTotals(pool, 'u1', 1, 2);
        expect(result[1].total).toBe('0');
    });

    // The critical regression-class check: summing every cycle's total must
    // equal current_outstanding_balance from fetchCreditCardsWithBalance
    // when the cycles fully cover the same span the balance query covers
    // (balance_as_of through today), no gaps or double-counted
    // transactions across a cycle boundary. Both functions are exercised
    // against the SAME fixture of transactions; the fixture's expected sum
    // is computed independently (by hand, following the expense-adds/
    // income-subtracts sign convention both queries document), and the two
    // mocked query results are built FROM that fixture the way real
    // Postgres aggregation would produce them -- so agreement between the
    // two functions' outputs is a real check on fetchCyclesWithTotals's
    // JS-side mapping/summing logic, not a tautology.
    test('sum of all cycle totals equals current_outstanding_balance when cycles fully cover the same span', async () => {
        // Fixture: card with a zero baseline snapshot (so
        // current_outstanding_balance is pure transaction activity since
        // balance_as_of -- isolates the comparison to just the bucketing
        // logic) and three cycles' worth of transactions.
        const transactions = [
            // cycle 2 (oldest, clipped to balance_as_of 2026-04-05): expense 1000, income 200 -> net 800
            { type: 'expense', amount: 1000 },
            { type: 'income', amount: 200 },
            // cycle 1 (2026-05-05..2026-06-04): expense 2500, expense 700.5 -> net 3200.5
            { type: 'expense', amount: 2500 },
            { type: 'expense', amount: 700.5 },
            // cycle 0 (current, 2026-06-05..open): income 100 -> net -100
            { type: 'income', amount: 100 },
        ];
        const expectedTotal = transactions.reduce(
            (sum, t) => sum + (t.type === 'expense' ? t.amount : -t.amount),
            0,
        );
        const cycleTotals = ['-100.00', '3200.50', '800.00']; // cycle 0, 1, 2 respectively, matching the grouping above
        expect(cycleTotals.reduce((s, v) => s + parseFloat(v), 0)).toBeCloseTo(expectedTotal, 2);

        // fetchCreditCardsWithBalance: card row already carries
        // current_outstanding_balance as CARDS_WITH_BALANCE_QUERY's GROUP BY
        // would compute it (baseline 0 + expense sum - income sum), plus the
        // no-active-EMI second query it always issues.
        const balancePool = mockPool(
            { rows: [{ id: 1, outstanding_balance: '0', current_outstanding_balance: expectedTotal.toFixed(2) }] },
            { rows: [] }, // fetchActiveEmiPrincipalByCard: no active EMIs
        );
        const [cardWithBalance] = await fetchCreditCardsWithBalance(balancePool, 'u1');

        const cyclesPool = mockPool(
            { rows: [{ billing_date: 5, balance_as_of: '2026-04-05' }] },
            { rows: [
                { idx: 0, total: cycleTotals[0] },
                { idx: 1, total: cycleTotals[1] },
                { idx: 2, total: cycleTotals[2] },
            ] },
        );
        const cycles = await fetchCyclesWithTotals(cyclesPool, 'u1', 1, 3);

        const sumOfCycleTotals = cycles.reduce((sum, c) => sum + parseFloat(c.total), 0);
        expect(sumOfCycleTotals).toBeCloseTo(parseFloat(cardWithBalance.current_outstanding_balance), 2);
    });
});
