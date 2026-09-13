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
