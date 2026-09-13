const { inr, ordinal, istTimeLabel, detectDuplicate, detectAnomaly } = require('../src/utils/txEntrySignals');

const pool = () => ({ query: jest.fn() });

describe('helpers', () => {
    test('inr formats rounded Indian-grouped currency with sign', () => {
        expect(inr(1234567.6)).toBe('₹12,34,568');
        expect(inr(-450)).toBe('-₹450');
    });
    test('ordinal', () => {
        expect(ordinal(1)).toBe('1st'); expect(ordinal(2)).toBe('2nd'); expect(ordinal(3)).toBe('3rd');
        expect(ordinal(4)).toBe('4th'); expect(ordinal(11)).toBe('11th'); expect(ordinal(22)).toBe('22nd');
    });
    test('istTimeLabel converts UTC to a 12-hour IST label', () => {
        expect(istTimeLabel('2026-09-12T07:44:00Z')).toBe('1:14 pm');
        expect(istTimeLabel('2026-09-12T18:30:00Z')).toBe('12:00 am');
    });
});

describe('detectDuplicate', () => {
    test('warns when the same amount+description exists on that date', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ created_at: '2026-09-12T07:44:00Z' }] });
        const s = await detectDuplicate(p, 'u1', { amount: 450, description: 'Swiggy', date: '2026-09-12', exclude_id: null });
        expect(s).toEqual({ kind: 'duplicate', level: 'warn', text: 'Looks like you already added ₹450 for "Swiggy" on this date (1:14 pm).' });
        expect(p.query.mock.calls[0][1]).toEqual(['u1', 450, 'Swiggy', '2026-09-12', null]);
    });
    test('returns null without a match or without a description', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [] });
        expect(await detectDuplicate(p, 'u1', { amount: 450, description: 'Swiggy', date: '2026-09-12' })).toBeNull();
        expect(await detectDuplicate(p, 'u1', { amount: 450, description: '  ', date: '2026-09-12' })).toBeNull();
        expect(p.query).toHaveBeenCalledTimes(1);
    });
});

describe('detectAnomaly', () => {
    test('warns when amount is 3x the description median (n>=3)', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ n: 4, median: '450' }] });
        const s = await detectAnomaly(p, 'u1', { type: 'expense', amount: 4500, description: 'Swiggy', category_id: 'c1' });
        expect(s.kind).toBe('anomaly');
        expect(s.text).toBe('Higher than your usual ₹450 for "Swiggy" — double-check the amount?');
    });
    test('stays quiet when the description has history but amount is normal', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ n: 4, median: '450' }] });
        expect(await detectAnomaly(p, 'u1', { type: 'expense', amount: 500, description: 'Swiggy', category_id: 'c1' })).toBeNull();
        expect(p.query).toHaveBeenCalledTimes(1);
    });
    test('falls back to the category median (n>=5) when the description is new', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ n: 1, median: '300' }] })
            .mockResolvedValueOnce({ rows: [{ name: 'Food & Dining', n: 12, median: '400' }] });
        const s = await detectAnomaly(p, 'u1', { type: 'expense', amount: 2000, description: 'New place', category_id: 'c1' });
        expect(s.text).toBe('About 5× your typical Food & Dining entry (₹400).');
    });
    test('ignores income', async () => {
        const p = pool();
        expect(await detectAnomaly(p, 'u1', { type: 'income', amount: 99999, description: 'Bonus' })).toBeNull();
        expect(p.query).not.toHaveBeenCalled();
    });

    test('never returns another user\'s category, even if somehow matched', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ n: 1, median: '300' }] })
            .mockResolvedValueOnce({ rows: [] }); // category query correctly scoped by user_id returns nothing
        expect(await detectAnomaly(p, 'u1', { type: 'expense', amount: 2000, description: 'New place', category_id: 'c1' })).toBeNull();
        expect(p.query.mock.calls[1][0]).toMatch(/WHERE c\.id = \$2 AND c\.user_id = \$1/);
    });
});

const { detectCard, detectCategoryPace, detectAccountProjection } = require('../src/utils/txEntrySignals');

describe('detectCard', () => {
    const card = { bank_name: 'HDFC', card_name: 'Regalia', credit_limit: '100000', current_outstanding_balance: '80000', billing_date: 18 };
    test('shows headroom and days to statement close', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [card] });
        const s = await detectCard(p, 'u1', { type: 'expense', amount: 1600, payment_method: 'Credit Card', credit_card_id: 3, date: '2026-09-12' });
        expect(s).toEqual({ kind: 'card_headroom', level: 'info', text: '₹18,400 left on HDFC Regalia after this · statement closes in 6 days.' });
    });
    test('warns when the charge exceeds the limit', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [card] });
        const s = await detectCard(p, 'u1', { type: 'expense', amount: 25000, payment_method: 'Credit Card', credit_card_id: 3, date: '2026-09-12' });
        expect(s).toEqual({ kind: 'card_over_limit', level: 'warn', text: 'This takes HDFC Regalia ₹5,000 over its ₹1,00,000 limit.' });
    });
    test('rolls the close date into next month when billing_date already passed', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ ...card, billing_date: 5 }] });
        const s = await detectCard(p, 'u1', { type: 'expense', amount: 100, payment_method: 'Credit Card', credit_card_id: 3, date: '2026-09-12' });
        expect(s.text).toMatch(/statement closes in 23 days/);
    });
    test('skips when not a card payment or no card chosen', async () => {
        const p = pool();
        expect(await detectCard(p, 'u1', { type: 'expense', amount: 100, payment_method: 'UPI', credit_card_id: 3, date: '2026-09-12' })).toBeNull();
        expect(await detectCard(p, 'u1', { type: 'expense', amount: 100, payment_method: 'Credit Card', credit_card_id: null, date: '2026-09-12' })).toBeNull();
        expect(p.query).not.toHaveBeenCalled();
    });
    test('passes exclude_id through so editing the transaction being priced does not double-count it', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [card] });
        await detectCard(p, 'u1', { type: 'expense', amount: 1600, payment_method: 'Credit Card', credit_card_id: 3, date: '2026-09-12', exclude_id: 't1' });
        expect(p.query.mock.calls[0][1]).toEqual(['u1', 3, 't1']);
    });
});

describe('detectCategoryPace', () => {
    test('reports budget pace when under budget', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Dining', budget: '8000', spent: '5800' }] });
        const s = await detectCategoryPace(p, 'u1', { type: 'expense', amount: 400, category_id: 'c1', date: '2026-09-12' });
        expect(s).toEqual({ kind: 'budget_pace', level: 'info', text: '₹6,200 of ₹8,000 Dining budget after this (78%).' });
        expect(p.query.mock.calls[0][1]).toEqual(['u1', 9, 2026, '2026-09', null, 'c1']);
    });
    test('warns when this entry pushes the category over budget', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Dining', budget: '8000', spent: '7800' }] });
        const s = await detectCategoryPace(p, 'u1', { type: 'expense', amount: 400, category_id: 'c1', date: '2026-09-12' });
        expect(s).toEqual({ kind: 'budget_over', level: 'warn', text: 'Puts Dining ₹200 over its ₹8,000 budget this month.' });
    });
    test('compares with the same day last month when there is no budget', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ name: 'Dining', budget: null, spent: '5800' }] })
            .mockResolvedValueOnce({ rows: [{ total: '4100' }] });
        const s = await detectCategoryPace(p, 'u1', { type: 'expense', amount: 400, category_id: 'c1', date: '2026-09-12' });
        expect(s).toEqual({ kind: 'month_pace', level: 'info', text: 'Dining: ₹6,200 by the 12th vs ₹4,100 at this point last month.' });
        expect(p.query.mock.calls[1][1]).toEqual(['u1', 'c1', '2026-08-01', '2026-08-12']);
    });
    test('clamps the comparison day to the shorter previous month', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ name: 'Dining', budget: null, spent: '100' }] })
            .mockResolvedValueOnce({ rows: [{ total: '900' }] });
        await detectCategoryPace(p, 'u1', { type: 'expense', amount: 1, category_id: 'c1', date: '2026-03-31' });
        expect(p.query.mock.calls[1][1]).toEqual(['u1', 'c1', '2026-02-01', '2026-02-28']);
    });
    test('stays quiet when last month is too small to compare', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ name: 'Dining', budget: null, spent: '100' }] })
            .mockResolvedValueOnce({ rows: [{ total: '120' }] });
        expect(await detectCategoryPace(p, 'u1', { type: 'expense', amount: 1, category_id: 'c1', date: '2026-09-12' })).toBeNull();
    });
});

describe('detectAccountProjection', () => {
    test('projects the balance and upcoming bills', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ name: 'HDFC', current_balance: '42500' }] })
            .mockResolvedValueOnce({ rows: [{ n: 3, total: '12300' }] });
        const s = await detectAccountProjection(p, 'u1', { type: 'expense', amount: 400, payment_method: 'UPI', account_id: 1, date: '2026-09-12' });
        expect(s).toEqual({ kind: 'account_projection', level: 'info', text: 'HDFC after this: ₹42,100 · 3 bills (₹12,300) due in the next 30 days.' });
    });
    test('warns when the account would go negative', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ name: 'HDFC', current_balance: '300' }] })
            .mockResolvedValueOnce({ rows: [{ n: 0, total: '0' }] });
        const s = await detectAccountProjection(p, 'u1', { type: 'expense', amount: 400, payment_method: 'UPI', account_id: 1, date: '2026-09-12' });
        expect(s).toEqual({ kind: 'account_negative', level: 'warn', text: 'HDFC would go to -₹100 after this.' });
    });
    test('skips card payments and income', async () => {
        const p = pool();
        expect(await detectAccountProjection(p, 'u1', { type: 'expense', amount: 1, payment_method: 'Credit Card', account_id: 1, date: '2026-09-12' })).toBeNull();
        expect(await detectAccountProjection(p, 'u1', { type: 'income', amount: 1, payment_method: 'UPI', account_id: 1, date: '2026-09-12' })).toBeNull();
        expect(p.query).not.toHaveBeenCalled();
    });
});

const { detectGoalImpact, detectLateNight, detectSplitHint, collectEntrySignals } = require('../src/utils/txEntrySignals');

describe('detectGoalImpact', () => {
    test('reports progress, remaining and monthly pace to the deadline', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-09-12T00:00:00Z'));
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Emergency Fund', target_amount: '100000', saved_amount: '55000', deadline: '2026-12-31' }] });
        const s = await detectGoalImpact(p, 'u1', { amount: 6000, goal_id: 'g1' });
        expect(s).toEqual({ kind: 'goal_impact', level: 'info', text: 'Emergency Fund → 61% (₹39,000 to go) · ₹9,750/month to hit Dec 2026.' });
        jest.useRealTimers();
    });
    test('announces completion', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Trip', target_amount: '10000', saved_amount: '9500', deadline: null }] });
        const s = await detectGoalImpact(p, 'u1', { amount: 600, goal_id: 'g1' });
        expect(s.text).toBe('Trip reaches 100% with this.');
    });
    test('subtracts the transaction being edited from saved_amount', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ name: 'Trip', target_amount: '10000', saved_amount: '5000', deadline: null }] })
            .mockResolvedValueOnce({ rows: [{ amount: '1000' }] });
        const s = await detectGoalImpact(p, 'u1', { amount: 1500, goal_id: 'g1', exclude_id: 't1' });
        expect(s.text).toBe('Trip → 55% (₹4,500 to go).');
    });
    test('null without a goal', async () => {
        expect(await detectGoalImpact(pool(), 'u1', { amount: 1, goal_id: null })).toBeNull();
    });
});

describe('detectLateNight', () => {
    test('counts this week\'s late-night entries in the category', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Food', n: 3 }] });
        const s = await detectLateNight(p, 'u1', { type: 'expense', category_id: 'c1', hour: 23, date: '2026-09-12' });
        expect(s).toEqual({ kind: 'late_night', level: 'info', text: '4th late-night Food entry this week.' });
    });
    test('quiet during the day or below two prior entries', async () => {
        const p = pool();
        expect(await detectLateNight(p, 'u1', { type: 'expense', category_id: 'c1', hour: 14, date: '2026-09-12' })).toBeNull();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Food', n: 1 }] });
        expect(await detectLateNight(p, 'u1', { type: 'expense', category_id: 'c1', hour: 1, date: '2026-09-12' })).toBeNull();
    });
    test('excludes the transaction being edited from its own count', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Food', n: 3 }] });
        await detectLateNight(p, 'u1', { type: 'expense', category_id: 'c1', hour: 23, date: '2026-09-12', exclude_id: 't1' });
        expect(p.query.mock.calls[0][1]).toEqual(['u1', 'c1', '2026-09-12', 't1']);
    });
});

describe('detectSplitHint', () => {
    test('suggests splitting a large "with"-style expense', () => {
        expect(detectSplitHint({ type: 'expense', amount: 3200, description: 'Dinner with Raj and Priya' }))
            .toEqual({ kind: 'split_hint', level: 'info', text: 'Shared expense? Split it with a group.', action: 'split' });
    });
    test('null for small amounts, income, or no sharing words', () => {
        expect(detectSplitHint({ type: 'expense', amount: 300, description: 'Dinner with Raj' })).toBeNull();
        expect(detectSplitHint({ type: 'income', amount: 3000, description: 'Split refund' })).toBeNull();
        expect(detectSplitHint({ type: 'expense', amount: 3000, description: 'Rent' })).toBeNull();
    });
});

describe('collectEntrySignals', () => {
    test('runs every detector, drops nulls and failures, sorts by priority', async () => {
        const p = pool();
        // Every query resolves empty except the goal lookup, which errors, and
        // the split hint (sync) — so we expect only split_hint to survive.
        p.query.mockImplementation(sql => {
            if (/savings_goals/.test(sql)) return Promise.reject(new Error('boom'));
            return Promise.resolve({ rows: [] });
        });
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const out = await collectEntrySignals(p, 'u1', {
            type: 'expense', amount: 5000, description: 'Trip with friends', date: '2026-09-12',
            category_id: null, payment_method: 'UPI', credit_card_id: null, account_id: null, goal_id: 'g1', exclude_id: null, hour: 12,
        });
        expect(out.map(s => s.kind)).toEqual(['split_hint']);
        expect(errSpy).toHaveBeenCalled();
        errSpy.mockRestore();
    });

    test('orders warnings before info by PRIORITY', async () => {
        const p = pool();
        p.query.mockImplementation(sql => {
            if (/SELECT created_at FROM transactions/.test(sql)) return Promise.resolve({ rows: [{ created_at: '2026-09-12T07:44:00Z' }] });
            if (/percentile_cont/.test(sql)) return Promise.resolve({ rows: [{ n: 0, median: null }] });
            return Promise.resolve({ rows: [] });
        });
        const out = await collectEntrySignals(p, 'u1', {
            type: 'expense', amount: 5000, description: 'Trip with friends', date: '2026-09-12',
            category_id: null, payment_method: 'UPI', credit_card_id: null, account_id: null, goal_id: null, exclude_id: null, hour: 12,
        });
        expect(out.map(s => s.kind)).toEqual(['duplicate', 'split_hint']);
    });
});
