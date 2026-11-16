import { describe, it, expect } from 'vitest';
import { roundUp10, projectedDate, goalTrack, sortGoalsNeedingMore, savingStreak, roundUpTotal } from './savingsPlan';

const NOW = new Date(2026, 0, 15, 12, 0, 0);

describe('roundUp10', () => {
    it('rounds up to the next ten and leaves tens alone', () => {
        expect(roundUp10(10)).toBe(10);
        expect(roundUp10(11)).toBe(20);
        expect(roundUp10(0)).toBe(0);
        expect(roundUp10(99.5)).toBe(100);
    });
});

describe('projectedDate', () => {
    it('is empty with no monthly amount or nothing left', () => {
        expect(projectedDate(1000, 0, NOW)).toBe('');
        expect(projectedDate(0, 500, NOW)).toBe('');
        expect(projectedDate(-5, 500, NOW)).toBe('');
    });
    it('adds the months needed to now', () => {
        const s = projectedDate(1000, 500, NOW);
        expect(s).toContain('March');
        expect(s).toContain('2026');
        expect(projectedDate(1001, 500, NOW)).toContain('April');
    });
});

describe('goalTrack', () => {
    const goal = { saved_amount: '0', target_amount: '1000', deadline: '2026-06-15' };
    it('is true when the plan finishes before the deadline', () => {
        expect(goalTrack(goal, 500, NOW)).toBe(true);
    });
    it('is false when the plan is too slow', () => {
        expect(goalTrack(goal, 10, NOW)).toBe(false);
    });
    it('is null without a deadline or a monthly amount', () => {
        expect(goalTrack({ ...goal, deadline: null }, 500, NOW)).toBeNull();
        expect(goalTrack(goal, 0, NOW)).toBeNull();
    });
    it('is false once the deadline has passed', () => {
        expect(goalTrack({ ...goal, deadline: '2025-12-01' }, 500, NOW)).toBe(false);
    });
});

describe('sortGoalsNeedingMore', () => {
    const goals = [
        { id: 'a', t: true }, { id: 'b', t: false }, { id: 'c', t: null }, { id: 'd', t: false }, { id: 'e', t: true },
    ];
    it('puts off-track goals first and keeps order otherwise', () => {
        const out = sortGoalsNeedingMore(goals, g => g.t);
        expect(out.map(g => g.id)).toEqual(['b', 'd', 'a', 'c', 'e']);
    });
    it('does not mutate the input', () => {
        const copy = [...goals];
        sortGoalsNeedingMore(goals, g => g.t);
        expect(goals).toEqual(copy);
    });
});

describe('savingStreak', () => {
    const row = (year: number, month: number, type: string, total: number) => ({ year, month, type, total: String(total) });
    it('is 0 with no trends', () => {
        expect(savingStreak([])).toBe(0);
    });
    it('counts consecutive months from the newest and stops at the first deficit', () => {
        const trends = [
            row(2026, 1, 'income', 100), row(2026, 1, 'expense', 50),
            row(2026, 2, 'income', 100), row(2026, 2, 'expense', 150),
            row(2026, 3, 'income', 100), row(2026, 3, 'expense', 90),
            row(2026, 4, 'income', 100), row(2026, 4, 'expense', 10),
        ];
        expect(savingStreak(trends)).toBe(2);
    });
    it('is 0 when the newest month is a deficit', () => {
        expect(savingStreak([row(2026, 1, 'income', 100), row(2026, 1, 'expense', 120)])).toBe(0);
    });
});

describe('roundUpTotal', () => {
    const day = (offset: number) => {
        const d = new Date(NOW.getTime() - offset * 86400000);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    it('counts only expenses from the last 30 days', () => {
        const txs = [
            { type: 'expense', date: day(1), amount: '41' },
            { type: 'expense', date: day(10), amount: '100' },
            { type: 'expense', date: day(60), amount: '41' },
            { type: 'income', date: day(1), amount: '41' },
        ];
        expect(roundUpTotal(txs, NOW)).toBe(9);
    });
    it('is 0 for no transactions', () => {
        expect(roundUpTotal([], NOW)).toBe(0);
    });
});
