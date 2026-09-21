const {
    fetchCreditCardsWithCycleBreakdown,
    fetchTotalCreditCardOutstanding,
    fetchCreditCardWithBalance,
    fetchCreditCardsWithBalance,
} = require('../src/utils/creditCardBalance');

// The billing-cycle breakdown behind the Accounts page's "Statement: ₹X · due
// ..." and "New charges: +₹Y" lines. It is additive on top of
// current_outstanding_balance and must not disturb it -- a card with no
// billing_date has no statement close to compute against and has to degrade to
// nulls rather than guessing, or the UI would present an invented statement
// balance as fact.

const fakePool = (...queryResults) => {
    const query = jest.fn();
    for (const r of queryResults) query.mockResolvedValueOnce(r);
    query.mockResolvedValue({ rows: [] });
    return { query };
};

const card = (over = {}) => ({
    id: 1,
    billing_date: 5,
    due_days: 20,
    outstanding_balance: '10000',
    current_outstanding_balance: '12000',
    ...over,
});

// No active EMIs -- fetchCreditCardsWithBalance/fetchCreditCardWithBalance now
// issue a second query (fetchActiveEmiPrincipalByCard) after the cards query,
// so every fakePool sequence below that goes through them needs this empty
// result slotted in at that position. It represents the common, EMI-less case.
const NO_EMIS = { rows: [] };

// Shape returned by EMI_WITH_BALANCE_QUERY in creditCardEmi.js: enough fields
// for deriveStatus (installments_posted vs installments_total) and for
// fetchActiveEmiPrincipalByCard's remaining_principal sum.
const emiRow = (over = {}) => ({
    id: 'emi-1',
    credit_card_id: 1,
    remaining_principal: '3000.00',
    installments_posted: 4,
    installments_total: 10,
    ...over,
});

describe('fetchCreditCardsWithCycleBreakdown', () => {
    it('returns nulls for a card with no billing date rather than inventing one', async () => {
        const pool = fakePool({ rows: [card({ billing_date: null })] }, NO_EMIS, NO_EMIS);
        const [out] = await fetchCreditCardsWithCycleBreakdown(pool, 'u1');

        expect(out.statement_balance).toBeNull();
        expect(out.new_charges_since_statement).toBeNull();
        expect(out.last_statement_close_date).toBeNull();
        expect(out.statement_due_date).toBeNull();
    });

    it('leaves the existing balance fields untouched when it cannot compute a cycle', async () => {
        // The breakdown is additive; nothing about it may change what the
        // Accounts page already showed for the card's outstanding balance.
        const pool = fakePool({ rows: [card({ billing_date: null })] }, NO_EMIS, NO_EMIS);
        const [out] = await fetchCreditCardsWithCycleBreakdown(pool, 'u1');

        expect(out.current_outstanding_balance).toBe('12000');
        expect(out.outstanding_balance).toBe('10000');
        expect(out.id).toBe(1);
    });

    it('derives a statement close date and a due date from the billing date', async () => {
        const pool = fakePool(
            { rows: [card()] },
            NO_EMIS,
            NO_EMIS,
            { rows: [{ statement_balance: '8000' }] },
        );
        const [out] = await fetchCreditCardsWithCycleBreakdown(pool, 'u1');

        expect(out.last_statement_close_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(out.statement_due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // due = close + due_days, so it must land strictly after the close.
        expect(new Date(out.statement_due_date) > new Date(out.last_statement_close_date)).toBe(true);
    });

    it('never dates the last statement close in the future', async () => {
        // billing_date is 1-28; if this month's has not arrived yet the last
        // close was last month. Getting this wrong would show a statement that
        // has not been issued.
        const pool = fakePool(
            { rows: [card({ billing_date: 28 })] },
            NO_EMIS,
            NO_EMIS,
            { rows: [{ statement_balance: '500' }] },
        );
        const [out] = await fetchCreditCardsWithCycleBreakdown(pool, 'u1');

        const close = new Date(out.last_statement_close_date);
        expect(close.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('splits the balance into statement plus new charges', async () => {
        const pool = fakePool(
            { rows: [card({ current_outstanding_balance: '12000' })] },
            NO_EMIS,
            NO_EMIS,
            { rows: [{ statement_balance: '8000' }] },
        );
        const [out] = await fetchCreditCardsWithCycleBreakdown(pool, 'u1');

        expect(out.statement_balance).toBe(8000);
        // Whatever is outstanding beyond the statement was charged after it
        // closed -- the two must reconcile to the current balance.
        expect(out.statement_balance + out.new_charges_since_statement)
            .toBeCloseTo(parseFloat(out.current_outstanding_balance), 2);
    });

    it('falls back to the stored balance when the cycle query returns nothing', async () => {
        const pool = fakePool({ rows: [card()] }, NO_EMIS, NO_EMIS, { rows: [] });
        const [out] = await fetchCreditCardsWithCycleBreakdown(pool, 'u1');
        expect(out.statement_balance).toBe(10000); // outstanding_balance
    });

    it('handles a user with no cards', async () => {
        const pool = fakePool({ rows: [] }, NO_EMIS, NO_EMIS);
        await expect(fetchCreditCardsWithCycleBreakdown(pool, 'u1')).resolves.toEqual([]);
    });

    it('does not let active EMI principal leak into new_charges_since_statement', async () => {
        // The EMI's 3000 remaining principal is already inside
        // current_outstanding_balance (12000 = 9000 transaction-based +
        // 3000 EMI). The statement query (transaction-based only, as EMIs
        // don't appear on a real statement) returns 8000. If EMI principal
        // were allowed to flow straight through, new_charges_since_statement
        // would come out to 12000 - 8000 = 4000, wrongly implying 3000 of
        // "new" spending that never happened. It must instead land at 1000
        // (9000 - 8000), the genuine new transaction activity.
        const pool = fakePool(
            { rows: [card({ current_outstanding_balance: '9000' })] }, // pre-EMI transaction total
            { rows: [emiRow({ credit_card_id: 1, remaining_principal: '3000' })] }, // fetchCreditCardsWithBalance's EMI query
            { rows: [emiRow({ credit_card_id: 1, remaining_principal: '3000' })] }, // cycle breakdown's own EMI query
            { rows: [{ statement_balance: '8000' }] },
        );
        const [out] = await fetchCreditCardsWithCycleBreakdown(pool, 'u1');

        expect(out.current_outstanding_balance).toBe('12000.00');
        expect(out.statement_balance).toBe(11000); // 8000 + 3000 EMI
        expect(out.new_charges_since_statement).toBe(1000);
    });
});

describe('fetchTotalCreditCardOutstanding', () => {
    it('sums the current outstanding across cards', async () => {
        const pool = fakePool({ rows: [
            card({ id: 1, current_outstanding_balance: '12000' }),
            card({ id: 2, current_outstanding_balance: '3500.50' }),
        ] }, NO_EMIS);
        await expect(fetchTotalCreditCardOutstanding(pool, 'u1')).resolves.toBeCloseTo(15500.5, 2);
    });

    it('is zero, not NaN, when a card has no balance recorded', async () => {
        // Values arrive from pg as strings and may be null; parseFloat(null)
        // is NaN, which would poison the whole sum and every net-worth figure
        // derived from it.
        const pool = fakePool({ rows: [
            card({ current_outstanding_balance: null }),
            card({ current_outstanding_balance: '1000' }),
        ] }, NO_EMIS);
        const total = await fetchTotalCreditCardOutstanding(pool, 'u1');
        expect(Number.isNaN(total)).toBe(false);
        expect(total).toBe(1000);
    });

    it('is zero for a user with no cards', async () => {
        const pool = fakePool({ rows: [] }, NO_EMIS);
        await expect(fetchTotalCreditCardOutstanding(pool, 'u1')).resolves.toBe(0);
    });

    it('picks up EMI principal automatically through fetchCreditCardsWithBalance', async () => {
        const pool = fakePool(
            { rows: [
                card({ id: 1, current_outstanding_balance: '2000' }),
                card({ id: 2, current_outstanding_balance: '500' }),
            ] },
            { rows: [emiRow({ credit_card_id: 2, remaining_principal: '1500' })] },
        );
        const total = await fetchTotalCreditCardOutstanding(pool, 'u1');
        expect(total).toBeCloseTo(2000 + 2000, 2); // card 2: 500 + 1500 EMI
    });
});

describe('fetchCreditCardWithBalance', () => {
    test('excludes a given transaction id when provided', async () => {
        const pool = fakePool({ rows: [card({ id: 3 })] }, NO_EMIS);
        await fetchCreditCardWithBalance(pool, 'u1', 3, 't1');
        expect(pool.query.mock.calls[0][1]).toEqual(['u1', 3, 't1']);
    });

    test('defaults exclude to null when not passed', async () => {
        const pool = fakePool({ rows: [card({ id: 3 })] }, NO_EMIS);
        await fetchCreditCardWithBalance(pool, 'u1', 3);
        expect(pool.query.mock.calls[0][1]).toEqual(['u1', 3, null]);
    });

    test('returns null without querying EMIs when the card is not found', async () => {
        const pool = fakePool({ rows: [] });
        const result = await fetchCreditCardWithBalance(pool, 'u1', 999);
        expect(result).toBeNull();
        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test('adds active EMI remaining principal to the single card lookup', async () => {
        const pool = fakePool(
            { rows: [card({ id: 3, current_outstanding_balance: '5000' })] },
            { rows: [emiRow({ credit_card_id: 3, remaining_principal: '2500' })] },
        );
        const result = await fetchCreditCardWithBalance(pool, 'u1', 3);
        expect(result.current_outstanding_balance).toBe('7500.00');
    });

    test('a completed EMI on the card contributes nothing', async () => {
        const pool = fakePool(
            { rows: [card({ id: 3, current_outstanding_balance: '5000' })] },
            { rows: [emiRow({ credit_card_id: 3, remaining_principal: '0', installments_posted: 10, installments_total: 10 })] },
        );
        const result = await fetchCreditCardWithBalance(pool, 'u1', 3);
        expect(result.current_outstanding_balance).toBe('5000');
    });
});

// MANDATORY regression coverage for fetchCreditCardsWithBalance: the EMI
// addition must be fully invisible for the common, EMI-less case --
// current_outstanding_balance must come out byte-identical (same value, same
// type/precision -- a raw pg numeric string, untouched) to what the query
// alone already produced. creditCardBalance.js is read by six-plus consumers
// (net worth, DTI, utilization, interest estimates, ...); any drift here for
// the no-EMI case would be a silent bug across the whole app.
describe('fetchCreditCardsWithBalance', () => {
    it('REGRESSION: a card with zero active EMIs is byte-identical to the raw query result', async () => {
        const rawRow = card({ id: 1, current_outstanding_balance: '12000.50' });
        const pool = fakePool({ rows: [rawRow] }, NO_EMIS);

        const [out] = await fetchCreditCardsWithBalance(pool, 'u1');

        expect(out.current_outstanding_balance).toBe('12000.50'); // same value
        expect(typeof out.current_outstanding_balance).toBe('string'); // same type
        expect(out).toBe(rawRow); // same object -- nothing rebuilt/reshaped
    });

    it('adds an active EMI card remaining principal to current_outstanding_balance', async () => {
        const pool = fakePool(
            { rows: [card({ id: 1, current_outstanding_balance: '12000' })] },
            { rows: [emiRow({ credit_card_id: 1, remaining_principal: '4321.75' })] },
        );

        const [out] = await fetchCreditCardsWithBalance(pool, 'u1');

        expect(out.current_outstanding_balance).toBe('16321.75');
    });

    it('does not add anything for a completed EMI (only active EMIs count)', async () => {
        // installments_posted (10) >= installments_total (10) -> deriveStatus
        // returns 'completed', which fetchActiveEmiPrincipalByCard already
        // filters out before this function ever sees it -- this test verifies
        // the integration holds, not just the utility in isolation.
        const pool = fakePool(
            { rows: [card({ id: 1, current_outstanding_balance: '12000' })] },
            { rows: [emiRow({ credit_card_id: 1, remaining_principal: '0', installments_posted: 10, installments_total: 10 })] },
        );

        const [out] = await fetchCreditCardsWithBalance(pool, 'u1');

        expect(out.current_outstanding_balance).toBe('12000');
    });

    it('still merges (does not return the cached row) when the EMI map has a genuine 0-value entry', async () => {
        // Distinguishes emiByCard.has(row.id) from a truthiness check on the
        // looked-up value. This EMI is active (4 of 10 installments posted)
        // but its remaining_principal happens to be 0 -- fetchActiveEmiPrincipalByCard
        // still includes it (only status is filtered, not the amount), so the
        // map genuinely has an entry for this card. addEmiPrincipal must not
        // treat that entry as "no EMI" and hand back the raw cached row.
        const rawRow = card({ id: 1, current_outstanding_balance: '12000' });
        const pool = fakePool(
            { rows: [rawRow] },
            { rows: [emiRow({ credit_card_id: 1, remaining_principal: '0', installments_posted: 4, installments_total: 10 })] },
        );

        const [out] = await fetchCreditCardsWithBalance(pool, 'u1');

        expect(out.current_outstanding_balance).toBe('12000.00'); // went through the merge (.toFixed(2)), not the raw '12000' passthrough
        expect(out).not.toBe(rawRow); // freshly built, not the stale cached reference
    });

    it('only adds EMI principal to the matching card, not others', async () => {
        const pool = fakePool(
            { rows: [
                card({ id: 1, current_outstanding_balance: '1000' }),
                card({ id: 2, current_outstanding_balance: '2000' }),
            ] },
            { rows: [emiRow({ credit_card_id: 2, remaining_principal: '500' })] },
        );

        const [c1, c2] = await fetchCreditCardsWithBalance(pool, 'u1');

        expect(c1.current_outstanding_balance).toBe('1000');
        expect(c2.current_outstanding_balance).toBe('2500.00');
    });
});
