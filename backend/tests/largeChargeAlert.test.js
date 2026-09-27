const {
    LARGE_CHARGE_FALLBACK_THRESHOLD, largeChargeAlertKey, buildLargeChargeAlert, checkLargeCharge,
} = require('../src/utils/largeChargeAlert');
const { assessAnomaly } = require('../src/utils/txEntrySignals');

const expense = (overrides = {}) => ({
    id: 'tx-1', type: 'expense', amount: '8400.00', description: 'Swiggy',
    category_id: 'cat-food', tags: [], goal_id: null, personal_loan_id: null,
    transfer_group_id: null, is_investment_category: false, ...overrides,
});
const insufficient = { status: 'insufficient' };

describe('largeChargeAlertKey', () => {
    test('keeps the legacy large_tx:<id> format', () => {
        expect(largeChargeAlertKey('abc-123')).toBe('large_tx:abc-123');
        expect(buildLargeChargeAlert(expense({ amount: '30000' }), insufficient).alertKey).toBe('large_tx:tx-1');
    });
});

describe('buildLargeChargeAlert', () => {
    test('description anomaly explains the multiple against the usual spend there', () => {
        const alert = buildLargeChargeAlert(expense(), { status: 'anomaly', basis: 'description', label: 'Swiggy', median: 2100, n: 8 });
        expect(alert).toEqual({
            alertKey: 'large_tx:tx-1',
            title: 'Unusual Spend Spotted 👀',
            body: '₹8,400 on Swiggy is about 4× what you usually spend there (₹2,100). Worth a quick check.',
            data: { type: 'info', deepLink: '/transactions', tx_id: 'tx-1' },
        });
    });

    test('category anomaly names the category', () => {
        const alert = buildLargeChargeAlert(expense(), { status: 'anomaly', basis: 'category', label: 'Food & Dining', median: 2800, n: 40 });
        expect(alert.body).toBe('₹8,400 on Swiggy is about 3× your usual Food & Dining transaction (₹2,800). Worth a quick check.');
    });

    test('no anomaly with enough history means no alert, even at ₹20,000', () => {
        const normal = { status: 'normal', basis: 'category', label: 'Rent', median: 18000, n: 12 };
        expect(buildLargeChargeAlert(expense({ amount: '20000', description: 'Rent' }), normal)).toBeNull();
        // ...and even above the fallback threshold: history outranks the absolute rule.
        expect(buildLargeChargeAlert(expense({ amount: '40000', description: 'Rent' }), { ...normal, median: 38000 })).toBeNull();
    });

    test('no history + ₹30,000 falls back to the absolute alert', () => {
        const alert = buildLargeChargeAlert(expense({ amount: '32000', description: 'Laptop' }), insufficient);
        expect(alert).toEqual({
            alertKey: 'large_tx:tx-1',
            title: 'Big Spend Alert 💸',
            body: '₹32,000 spent on Laptop. Unusually large, worth a quick check.',
            data: { type: 'info', deepLink: '/transactions', tx_id: 'tx-1' },
        });
        expect(buildLargeChargeAlert(expense({ amount: '30000' }), null)).not.toBeNull();
    });

    test('no history + ₹10,000 stays quiet', () => {
        expect(buildLargeChargeAlert(expense({ amount: '10000' }), insufficient)).toBeNull();
        expect(buildLargeChargeAlert(expense({ amount: '10000' }), null)).toBeNull();
    });

    test('fallback threshold is ₹25,000 and overridable', () => {
        expect(LARGE_CHARGE_FALLBACK_THRESHOLD).toBe(25000);
        expect(buildLargeChargeAlert(expense({ amount: '24999' }), insufficient)).toBeNull();
        expect(buildLargeChargeAlert(expense({ amount: '25000' }), insufficient)).not.toBeNull();
        expect(buildLargeChargeAlert(expense({ amount: '10000' }), insufficient, { fallbackThreshold: 5000 })).not.toBeNull();
    });

    test('income, transfers, card payments, goal/investment and loan txns never alert', () => {
        const anomaly = { status: 'anomaly', basis: 'description', label: 'X', median: 100, n: 5 };
        const big = { amount: '90000' };
        for (const tx of [
            expense({ ...big, type: 'income' }),
            expense({ ...big, tags: ['transfer'] }),
            expense({ ...big, tags: ['credit_card_payment'] }),
            expense({ ...big, transfer_group_id: 'grp-1' }),
            expense({ ...big, goal_id: 'goal-1' }),
            expense({ ...big, is_investment_category: true }),
            expense({ ...big, personal_loan_id: 'loan-1' }),
        ]) {
            expect(buildLargeChargeAlert(tx, anomaly)).toBeNull();
            expect(buildLargeChargeAlert(tx, insufficient)).toBeNull();
        }
    });
});

describe('checkLargeCharge', () => {
    const pool = () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) });

    test('skipped transactions never query history', async () => {
        const p = pool();
        expect(await checkLargeCharge(p, 'u1', expense({ type: 'income', amount: '90000' }))).toBeNull();
        expect(await checkLargeCharge(p, 'u1', expense({ goal_id: 'g1', amount: '90000' }))).toBeNull();
        expect(p.query).not.toHaveBeenCalled();
    });

    test('judges against past entries, excluding the new transaction itself', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ n: 6, median: '2000' }] });
        const alert = await checkLargeCharge(p, 'u1', expense({ amount: '8000' }));
        expect(p.query).toHaveBeenCalledTimes(1);
        expect(p.query.mock.calls[0][1]).toEqual(['u1', 'Swiggy', 'tx-1']);
        expect(alert.body).toBe('₹8,000 on Swiggy is about 4× what you usually spend there (₹2,000). Worth a quick check.');
    });
});

describe('assessAnomaly', () => {
    const pool = () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) });

    test('uses description history when it has 3+ entries', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ n: 3, median: '1000' }] });
        expect(await assessAnomaly(p, 'u1', { type: 'expense', amount: 2999, description: 'Swiggy', category_id: 'c1' }))
            .toEqual({ status: 'normal', basis: 'description', label: 'Swiggy', median: 1000, n: 3 });
        expect(p.query).toHaveBeenCalledTimes(1);
    });

    test('falls back to category history with 5+ entries', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ n: 1, median: '500' }] })
            .mockResolvedValueOnce({ rows: [{ name: 'Food & Dining', n: 5, median: '400' }] });
        expect(await assessAnomaly(p, 'u1', { type: 'expense', amount: 1200, description: 'New place', category_id: 'c1' }))
            .toEqual({ status: 'anomaly', basis: 'category', label: 'Food & Dining', median: 400, n: 5 });
    });

    test('reports insufficient history rather than an opinion', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ n: 2, median: '500' }] })
            .mockResolvedValueOnce({ rows: [{ name: 'Food', n: 4, median: '400' }] });
        expect(await assessAnomaly(p, 'u1', { type: 'expense', amount: 9000, description: 'X', category_id: 'c1' }))
            .toEqual({ status: 'insufficient' });
        expect(await assessAnomaly(pool(), 'u1', { type: 'expense', amount: 9000, description: '' })).toEqual({ status: 'insufficient' });
    });

    test('returns null for income', async () => {
        expect(await assessAnomaly(pool(), 'u1', { type: 'income', amount: 9000 })).toBeNull();
    });
});
