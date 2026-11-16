import { describe, it, expect } from 'vitest';
import { shareRows, comparePeriod, dayOfWeekSummary } from './analytics';

describe('shareRows', () => {
    it('sorts biggest first and keeps colours', () => {
        const rows = shareRows([
            { name: 'A', total: 10, color: '#111' },
            { name: 'B', total: 30 },
        ]);
        expect(rows.map(r => r.name)).toEqual(['B', 'A']);
        expect(rows[1].color).toBe('#111');
        expect(rows[0].color).toBeUndefined();
    });

    it('percentages add up to exactly 100', () => {
        const rows = shareRows([
            { name: 'A', total: 1 }, { name: 'B', total: 1 }, { name: 'C', total: 1 },
        ]);
        expect(rows.reduce((s, r) => s + r.pct, 0)).toBe(100);
        const many = shareRows(Array.from({ length: 5 }, (_, i) => ({ name: `N${i}`, total: 7 + i })));
        expect(many.reduce((s, r) => s + r.pct, 0)).toBe(100);
    });

    it('folds everything past maxRows into Everything else', () => {
        const items = Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, total: 100 - i }));
        const rows = shareRows(items, 6);
        expect(rows).toHaveLength(7);
        expect(rows[6].name).toBe('Everything else');
        expect(rows[6].total).toBe(94 + 93 + 92);
        expect(rows.reduce((s, r) => s + r.pct, 0)).toBe(100);
    });

    it('has no Everything else bucket at or under maxRows', () => {
        const rows = shareRows(Array.from({ length: 6 }, (_, i) => ({ name: `C${i}`, total: i + 1 })), 6);
        expect(rows).toHaveLength(6);
        expect(rows.some(r => r.name === 'Everything else')).toBe(false);
    });

    it('drops zero and negative totals; empty input gives []', () => {
        expect(shareRows([])).toEqual([]);
        expect(shareRows([{ name: 'A', total: 0 }, { name: 'B', total: -5 }])).toEqual([]);
        const rows = shareRows([{ name: 'A', total: 0 }, { name: 'B', total: 5 }]);
        expect(rows).toEqual([{ name: 'B', total: 5, pct: 100 }]);
    });
});

describe('comparePeriod', () => {
    it('has nothing to compare against when previous is missing or zero', () => {
        const none = { value: '—', detail: 'No earlier period to compare', tone: 'neutral' };
        expect(comparePeriod(100, null, 'May')).toEqual(none);
        expect(comparePeriod(100, 0, 'May')).toEqual(none);
        expect(comparePeriod(100, -4, 'May')).toEqual(none);
    });

    it('spending down is good, with a Unicode minus', () => {
        expect(comparePeriod(81850, 93000, 'May')).toEqual({ value: '−12%', detail: '₹11,150 less than May', tone: 'good' });
    });

    it('spending up is caution', () => {
        expect(comparePeriod(56700, 52500, 'May')).toEqual({ value: '+8%', detail: '₹4,200 more than May', tone: 'caution' });
    });

    it('tiny changes read as the same', () => {
        expect(comparePeriod(10040, 10000, 'May')).toEqual({ value: '0%', detail: 'Same as May', tone: 'neutral' });
        expect(comparePeriod(9960, 10000, 'May').value).toBe('0%');
    });

    it('higherIsGood flips the tone for income', () => {
        expect(comparePeriod(110, 100, 'May', true).tone).toBe('good');
        expect(comparePeriod(90, 100, 'May', true).tone).toBe('caution');
    });
});

describe('dayOfWeekSummary', () => {
    it('orders Monday first', () => {
        const s = dayOfWeekSummary([1, 2, 3, 4, 5, 6, 7]); // Sun..Sat
        expect(s.order.map(d => d.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
        expect(s.order.map(d => d.amount)).toEqual([2, 3, 4, 5, 6, 7, 1]);
    });

    it('finds the busiest day and the weekend share', () => {
        const s = dayOfWeekSummary([100, 0, 0, 0, 0, 0, 300]);
        expect(s.busiest).toEqual({ day: 'Sat', amount: 300, full: 'Saturday' });
        expect(s.weekendPct).toBe(100);
        const t = dayOfWeekSummary([10, 20, 20, 20, 20, 5, 5]);
        expect(t.weekendPct).toBe(15);
        expect(t.busiest?.full).toBe('Monday');
    });

    it('a zero total has no busiest day and 0%', () => {
        const s = dayOfWeekSummary([0, 0, 0, 0, 0, 0, 0]);
        expect(s.busiest).toBeNull();
        expect(s.weekendPct).toBe(0);
    });
});
