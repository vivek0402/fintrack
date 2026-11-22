import { describe, it, expect } from 'vitest';
import { dayLabel, sortBudgetsByUse, groupByDay, perDayAllowance, budgetPct } from './mobileHome';
import type { Transaction } from '@/types/finance';

const NOW = new Date('2026-11-22T10:00:00Z');

const tx = (id: string, date: string, amount: number, type: Transaction['type'] = 'expense'): Transaction =>
    ({ id, date, amount, type, description: id, category_id: null }) as Transaction;

describe('dayLabel', () => {
    it('names today and yesterday', () => {
        expect(dayLabel('2026-11-22', NOW)).toBe('Today');
        expect(dayLabel('2026-11-21T08:00:00Z', NOW)).toBe('Yesterday');
    });
    it('falls back to a short date', () => {
        expect(dayLabel('2026-11-12', NOW)).toMatch(/12 Nov/);
    });
});

describe('sortBudgetsByUse', () => {
    it('puts overruns first (biggest first), then used up, then by percent', () => {
        const b = (id: string, amount: number, spent: number) => ({ id, amount, spent });
        const sorted = sortBudgetsByUse([b('half', 100, 50), b('over10', 100, 110), b('full', 100, 100), b('over50', 100, 150), b('most', 100, 90)]);
        expect(sorted.map(x => x.id)).toEqual(['over50', 'over10', 'full', 'most', 'half']);
    });
    it('treats a zero limit as unused, not infinite', () => {
        expect(budgetPct({ amount: 0, spent: 40 })).toBe(0);
    });
});

describe('groupByDay', () => {
    it('groups consecutive days in order and totals only expenses', () => {
        const groups = groupByDay([
            tx('a', '2026-11-22', 400),
            tx('salary', '2026-11-22', 96500, 'income'),
            tx('b', '2026-11-21', 340),
            tx('c', '2026-11-18', 1870),
        ], 10, NOW);
        expect(groups.map(g => g.label)).toEqual(['Today', 'Yesterday', expect.stringMatching(/18 Nov/)]);
        expect(groups[0].spent).toBe(400);
        expect(groups[0].items).toHaveLength(2);
    });
    it('respects the limit', () => {
        const groups = groupByDay([tx('a', '2026-11-22', 1), tx('b', '2026-11-22', 1), tx('c', '2026-11-21', 1)], 2, NOW);
        expect(groups).toHaveLength(1);
    });
});

describe('perDayAllowance', () => {
    it('splits what is left across the days left', () => {
        expect(perDayAllowance(18400, 8)).toBe(2300);
    });
    it('is null once the month is over, and never negative', () => {
        expect(perDayAllowance(500, 0)).toBeNull();
        expect(perDayAllowance(-200, 4)).toBe(0);
    });
});
