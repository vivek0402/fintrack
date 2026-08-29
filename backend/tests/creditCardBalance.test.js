const {
    fetchCreditCardsWithCycleBreakdown,
    fetchTotalCreditCardOutstanding,
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

describe('fetchCreditCardsWithCycleBreakdown', () => {
    it('returns nulls for a card with no billing date rather than inventing one', async () => {
        const pool = fakePool({ rows: [card({ billing_date: null })] });
        const [out] = await fetchCreditCardsWithCycleBreakdown(pool, 'u1');

        expect(out.statement_balance).toBeNull();
        expect(out.new_charges_since_statement).toBeNull();
        expect(out.last_statement_close_date).toBeNull();
        expect(out.statement_due_date).toBeNull();
    });

    it('leaves the existing balance fields untouched when it cannot compute a cycle', async () => {
        // The breakdown is additive; nothing about it may change what the
        // Accounts page already showed for the card's outstanding balance.
        const pool = fakePool({ rows: [card({ billing_date: null })] });
        const [out] = await fetchCreditCardsWithCycleBreakdown(pool, 'u1');

        expect(out.current_outstanding_balance).toBe('12000');
        expect(out.outstanding_balance).toBe('10000');
        expect(out.id).toBe(1);
    });

    it('derives a statement close date and a due date from the billing date', async () => {
        const pool = fakePool(
            { rows: [card()] },
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
            { rows: [{ statement_balance: '500' }] },
        );
        const [out] = await fetchCreditCardsWithCycleBreakdown(pool, 'u1');

        const close = new Date(out.last_statement_close_date);
        expect(close.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('splits the balance into statement plus new charges', async () => {
        const pool = fakePool(
            { rows: [card({ current_outstanding_balance: '12000' })] },
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
        const pool = fakePool({ rows: [card()] }, { rows: [] });
        const [out] = await fetchCreditCardsWithCycleBreakdown(pool, 'u1');
        expect(out.statement_balance).toBe(10000); // outstanding_balance
    });

    it('handles a user with no cards', async () => {
        const pool = fakePool({ rows: [] });
        await expect(fetchCreditCardsWithCycleBreakdown(pool, 'u1')).resolves.toEqual([]);
    });
});

describe('fetchTotalCreditCardOutstanding', () => {
    it('sums the current outstanding across cards', async () => {
        const pool = fakePool({ rows: [
            card({ id: 1, current_outstanding_balance: '12000' }),
            card({ id: 2, current_outstanding_balance: '3500.50' }),
        ] });
        await expect(fetchTotalCreditCardOutstanding(pool, 'u1')).resolves.toBeCloseTo(15500.5, 2);
    });

    it('is zero, not NaN, when a card has no balance recorded', async () => {
        // Values arrive from pg as strings and may be null; parseFloat(null)
        // is NaN, which would poison the whole sum and every net-worth figure
        // derived from it.
        const pool = fakePool({ rows: [
            card({ current_outstanding_balance: null }),
            card({ current_outstanding_balance: '1000' }),
        ] });
        const total = await fetchTotalCreditCardOutstanding(pool, 'u1');
        expect(Number.isNaN(total)).toBe(false);
        expect(total).toBe(1000);
    });

    it('is zero for a user with no cards', async () => {
        const pool = fakePool({ rows: [] });
        await expect(fetchTotalCreditCardOutstanding(pool, 'u1')).resolves.toBe(0);
    });
});
