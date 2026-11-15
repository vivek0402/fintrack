import { describe, it, expect } from 'vitest';
import { monthlyAmount, daysUntil, dueLabel, dueTone, groupRecurring, recurringSummary, type RecurringItem } from './recurring';

const today = new Date(2026, 10, 15, 14, 30); // 15 Nov 2026, afternoon

const item = (o: Partial<RecurringItem>): RecurringItem => ({
    id: 'x', type: 'expense', amount: 100, description: 'Thing', frequency: 'monthly',
    is_active: true, next_due_date: '2026-11-20', ...o,
});

describe('monthlyAmount', () => {
    it('converts daily, weekly and monthly', () => {
        expect(monthlyAmount({ amount: 10, frequency: 'daily' })).toBeCloseTo(304.1667, 3);
        expect(monthlyAmount({ amount: 120, frequency: 'weekly' })).toBeCloseTo(520, 5);
        expect(monthlyAmount({ amount: 500, frequency: 'monthly' })).toBe(500);
    });
    it('treats unknown frequency as monthly and parses string amounts', () => {
        expect(monthlyAmount({ amount: '250.50', frequency: 'yearly' })).toBe(250.5);
    });
});

describe('daysUntil', () => {
    it('counts whole days regardless of time of day', () => {
        expect(daysUntil('2026-11-15', today)).toBe(0);
        expect(daysUntil('2026-11-16T18:30:00.000Z', today)).toBe(1);
        expect(daysUntil('2026-11-25', today)).toBe(10);
    });
    it('is negative when overdue', () => {
        expect(daysUntil('2026-11-12', today)).toBe(-3);
    });
    it('crosses a year boundary', () => {
        expect(daysUntil('2027-01-01', today)).toBe(47);
    });
    it('returns null for missing or unparseable input', () => {
        expect(daysUntil(undefined, today)).toBeNull();
        expect(daysUntil(null, today)).toBeNull();
        expect(daysUntil('', today)).toBeNull();
        expect(daysUntil('soon', today)).toBeNull();
        expect(daysUntil('2026-02-31', today)).toBeNull();
    });
});

describe('dueLabel', () => {
    it('words the near cases', () => {
        expect(dueLabel(null, undefined, today)).toBe('No date set');
        expect(dueLabel(-1, '2026-11-14', today)).toBe('Overdue by 1 day');
        expect(dueLabel(-4, '2026-11-11', today)).toBe('Overdue by 4 days');
        expect(dueLabel(0, '2026-11-15', today)).toBe('Due today');
        expect(dueLabel(1, '2026-11-16', today)).toBe('Due tomorrow');
        expect(dueLabel(2, '2026-11-17', today)).toBe('Due in 2 days');
    });
    it('uses a short date later, with the year only when it differs', () => {
        expect(dueLabel(3, '2026-11-18', today)).toBe('Due 18 Nov');
        expect(dueLabel(47, '2027-01-01', today)).toBe('Due 1 Jan 2027');
    });
});

describe('dueTone', () => {
    it('maps days to a tone', () => {
        expect(dueTone(-1)).toBe('bad');
        expect(dueTone(0)).toBe('caution');
        expect(dueTone(1)).toBe('caution');
        expect(dueTone(2)).toBe('caution');
        expect(dueTone(3)).toBe('neutral');
        expect(dueTone(null)).toBe('neutral');
    });
});

describe('groupRecurring', () => {
    it('splits paused, due soon (overdue included) and later, sorted', () => {
        const list = [
            item({ id: 'later2', next_due_date: '2026-12-30' }),
            item({ id: 'nodate', next_due_date: undefined }),
            item({ id: 'soon2', next_due_date: '2026-11-22' }),
            item({ id: 'later1', next_due_date: '2026-11-23' }),
            item({ id: 'overdue', next_due_date: '2026-11-10' }),
            item({ id: 'paused', is_active: false, next_due_date: '2026-11-16' }),
            item({ id: 'soon1', next_due_date: '2026-11-16' }),
        ];
        const g = groupRecurring(list, today);
        expect(g.dueSoon.map(r => r.id)).toEqual(['overdue', 'soon1', 'soon2']);
        expect(g.later.map(r => r.id)).toEqual(['later1', 'later2', 'nodate']);
        expect(g.paused.map(r => r.id)).toEqual(['paused']);
    });
});

describe('recurringSummary', () => {
    it('sums active schedules per month and finds what is due soon', () => {
        const list = [
            item({ id: 'rent', amount: 1000, next_due_date: '2026-11-18', description: 'Rent' }),
            item({ id: 'gym', amount: 10, frequency: 'weekly', next_due_date: '2026-12-20' }),
            item({ id: 'salary', type: 'income', amount: 5000, next_due_date: '2026-11-17', description: 'Salary' }),
            item({ id: 'old', amount: 999, is_active: false, next_due_date: '2026-11-16' }),
        ];
        const s = recurringSummary(list, today);
        expect(s.outMonthly).toBeCloseTo(1000 + 10 * 52 / 12, 5);
        expect(s.inMonthly).toBe(5000);
        expect(s.inCount).toBe(1);
        expect(s.left).toBeCloseTo(5000 - s.outMonthly, 5);
        expect(s.dueSoonTotal).toBe(1000);
        expect(s.dueSoonCount).toBe(1);
        expect(s.next).toEqual({ label: '17 Nov', description: 'Salary' });
    });
    it('returns zeros and a null next for an empty list', () => {
        const s = recurringSummary([], today);
        expect(s).toEqual({ outMonthly: 0, inMonthly: 0, inCount: 0, left: 0, dueSoonTotal: 0, dueSoonCount: 0, next: null });
    });
    it('goes negative when expenses exceed income', () => {
        const s = recurringSummary([item({ amount: 300 }), item({ type: 'income', amount: 100 })], today);
        expect(s.left).toBe(-200);
    });
});
