import { describe, it, expect } from 'vitest';
import { entryDate, entryYear, groupByYear, oneTimeSummary, byCategory, itemsByDay, dateRangeLabel, type OneTimeEntry } from './oneTime';

const entry = (o: Partial<OneTimeEntry>): OneTimeEntry => ({
    id: 'e', title: 'Goa', category: 'Travel', total_amount: 100, item_count: 0, items: [], ...o,
});
const item = (date: string | undefined, amount: number | string, description = 'x') =>
    ({ id: description + date, description, amount, category: 'Other', date, payment_method: 'Cash' });

describe('entryDate / entryYear', () => {
    it('prefers start_date, then the earliest item, then created_at', () => {
        expect(entryDate(entry({ start_date: '2026-03-04', items: [item('2026-01-01', 1)] }))).toBe('2026-03-04');
        expect(entryDate(entry({ items: [item('2026-05-02T10:00:00Z', 1), item('2026-02-09', 1)] }))).toBe('2026-02-09');
        expect(entryDate(entry({ created_at: '2025-12-31T23:00:00.000Z' }))).toBe('2025-12-31');
        expect(entryDate(entry({}))).toBeNull();
    });
    it('falls back to the given year when there is no date', () => {
        expect(entryYear(entry({ start_date: '2024-06-01' }), 2026)).toBe(2024);
        expect(entryYear(entry({}), 2026)).toBe(2026);
    });
});

describe('groupByYear', () => {
    it('orders years descending, entries newest first, undated last, and totals each year', () => {
        const groups = groupByYear([
            entry({ id: 'a', start_date: '2026-01-05', total_amount: 10 }),
            entry({ id: 'b', start_date: '2025-07-01', total_amount: '20' }),
            entry({ id: 'c', start_date: '2026-09-01', total_amount: 30 }),
            entry({ id: 'd', total_amount: 'junk' }),
        ], 2026);
        expect(groups.map(g => g.year)).toEqual([2026, 2025]);
        expect(groups[0].entries.map(e => e.id)).toEqual(['c', 'a', 'd']);
        expect(groups[0].total).toBe(40);
        expect(groups[1].total).toBe(20);
    });
});

describe('oneTimeSummary', () => {
    const list = [
        entry({ id: 'a', title: 'Goa', start_date: '2026-01-05', total_amount: 500 }),
        entry({ id: 'b', title: 'Laptop', start_date: '2026-09-01', total_amount: 300 }),
        entry({ id: 'c', title: 'Old trip', start_date: '2024-02-01', total_amount: 900 }),
    ];
    it('summarises the year and all time', () => {
        const s = oneTimeSummary(list, 2026);
        expect(s.yearTotal).toBe(800);
        expect(s.yearCount).toBe(2);
        expect(s.biggest).toEqual({ title: 'Goa', amount: 500 });
        expect(s.latest).toEqual({ title: 'Laptop', amount: 300 });
        expect(s.allTimeTotal).toBe(1700);
        expect(s.allTimeCount).toBe(3);
    });
    it('returns null biggest and latest for an empty year', () => {
        const s = oneTimeSummary(list, 2030);
        expect(s.yearCount).toBe(0);
        expect(s.biggest).toBeNull();
        expect(s.latest).toBeNull();
    });
});

describe('byCategory', () => {
    it('sums per category, drops zeros, sorts descending with percentages', () => {
        const rows = byCategory([
            entry({ category: 'Travel', total_amount: 300 }),
            entry({ category: 'Gift', total_amount: 100 }),
            entry({ category: 'Travel', total_amount: '100' }),
            entry({ category: 'Home', total_amount: 0 }),
        ]);
        expect(rows.map(r => r.category)).toEqual(['Travel', 'Gift']);
        expect(rows[0].amount).toBe(400);
        expect(rows[0].pct).toBeCloseTo(80);
        expect(rows[1].pct).toBeCloseTo(20);
    });
    it('is empty with nothing to show', () => {
        expect(byCategory([])).toEqual([]);
    });
});

describe('itemsByDay', () => {
    it('groups newest day first, keeps item order, totals each day', () => {
        const days = itemsByDay([
            item('2025-11-14', 100, 'a'), item('2025-11-16', 50, 'b'), item('2025-11-14', '25', 'c'),
        ], 2025);
        expect(days.map(d => d.date)).toEqual(['2025-11-16', '2025-11-14']);
        expect(days[1].items.map(i => i.description)).toEqual(['a', 'c']);
        expect(days[1].total).toBe(125);
        expect(days[1].label).toBe('Fri 14 Nov');
    });
    it('appends the year when it is not the current one', () => {
        expect(itemsByDay([item('2025-11-14', 1)], 2026)[0].label).toBe('Fri 14 Nov 2025');
    });
    it('puts undated items in a last group', () => {
        const days = itemsByDay([item(undefined, 5, 'u'), item('2026-01-02', 1, 'd')], 2026);
        expect(days.map(d => d.label)).toEqual(['Fri 2 Jan', 'No date']);
        expect(days[1].items).toHaveLength(1);
    });
});

describe('dateRangeLabel', () => {
    it('handles empty, single day and no end', () => {
        expect(dateRangeLabel(undefined, undefined, 2026)).toBe('');
        expect(dateRangeLabel('2026-11-14', undefined, 2026)).toBe('14 Nov');
        expect(dateRangeLabel('2026-11-14', '2026-11-14', 2026)).toBe('14 Nov');
    });
    it('handles same-month and cross-month ranges', () => {
        expect(dateRangeLabel('2026-11-12', '2026-11-16', 2026)).toBe('12 to 16 Nov');
        expect(dateRangeLabel('2026-10-28', '2026-11-02', 2026)).toBe('28 Oct to 2 Nov');
    });
    it('appends the year when not the current year', () => {
        expect(dateRangeLabel('2025-06-03', '2025-06-11', 2026)).toBe('3 to 11 Jun 2025');
        expect(dateRangeLabel('2025-06-03', null, 2026)).toBe('3 Jun 2025');
    });
});
