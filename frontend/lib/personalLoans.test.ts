import { describe, it, expect } from 'vitest';
import { num, isOverdue, splitLoans, overdueFirst, netPosition, positionSentence, type LoanStatus } from './personalLoans';

const loan = (o: Partial<{ id: string; direction: 'lent' | 'borrowed'; due_date: string | null; status: LoanStatus; outstanding_amount: number | string }> = {}) => ({
    id: 'x', direction: 'lent' as const, due_date: null as string | null, status: 'outstanding' as LoanStatus, outstanding_amount: '100.00' as number | string, ...o,
});

describe('num', () => {
    it('parses NUMERIC strings and passes numbers through', () => {
        expect(num('4000.00')).toBe(4000);
        expect(num(12.5)).toBe(12.5);
    });
    it('treats null, undefined and garbage as 0', () => {
        expect(num(null)).toBe(0);
        expect(num(undefined)).toBe(0);
        expect(num('abc')).toBe(0);
    });
});

describe('isOverdue', () => {
    const now = new Date(2026, 9, 15, 14, 30); // 15 Oct 2026, afternoon
    it('is overdue the day after the due date', () => {
        expect(isOverdue(loan({ due_date: '2026-10-14' }), now)).toBe(true);
    });
    it('is not overdue on the due date itself', () => {
        expect(isOverdue(loan({ due_date: '2026-10-15' }), now)).toBe(false);
    });
    it('is not overdue before the due date', () => {
        expect(isOverdue(loan({ due_date: '2026-10-16' }), now)).toBe(false);
    });
    it('reads the date part of a timestamp', () => {
        expect(isOverdue(loan({ due_date: '2026-10-14T00:00:00.000Z' }), now)).toBe(true);
        expect(isOverdue(loan({ due_date: '2026-10-15T00:00:00.000Z' }), now)).toBe(false);
    });
    it('is never overdue without a due date or once settled', () => {
        expect(isOverdue(loan({ due_date: null }), now)).toBe(false);
        expect(isOverdue(loan({ due_date: '2020-01-01', status: 'repaid' }), now)).toBe(false);
        expect(isOverdue(loan({ due_date: '2020-01-01', status: 'written_off' }), now)).toBe(false);
    });
    it('counts a partially repaid loan', () => {
        expect(isOverdue(loan({ due_date: '2020-01-01', status: 'partially_repaid' }), now)).toBe(true);
    });
});

describe('splitLoans', () => {
    it('splits active loans by direction and settled loans apart', () => {
        const a = loan({ id: 'a', direction: 'lent' });
        const b = loan({ id: 'b', direction: 'borrowed', status: 'partially_repaid' });
        const c = loan({ id: 'c', direction: 'lent', status: 'repaid' });
        const d = loan({ id: 'd', direction: 'borrowed', status: 'written_off' });
        const r = splitLoans([a, b, c, d]);
        expect(r.owedToYou.map(l => l.id)).toEqual(['a']);
        expect(r.youOwe.map(l => l.id)).toEqual(['b']);
        expect(r.settled.map(l => l.id)).toEqual(['c', 'd']);
    });
    it('returns empty groups for no loans', () => {
        expect(splitLoans([])).toEqual({ owedToYou: [], youOwe: [], settled: [] });
    });
});

describe('overdueFirst', () => {
    const now = new Date(2026, 9, 15);
    it('moves overdue loans to the front and keeps the rest in order', () => {
        const list = [
            loan({ id: 'a' }),
            loan({ id: 'b', due_date: '2026-10-01' }),
            loan({ id: 'c', due_date: '2026-12-01' }),
            loan({ id: 'd', due_date: '2026-09-01' }),
        ];
        expect(overdueFirst(list, now).map(l => l.id)).toEqual(['b', 'd', 'a', 'c']);
    });
    it('does not mutate its input', () => {
        const list = [loan({ id: 'a' }), loan({ id: 'b', due_date: '2026-10-01' })];
        const copy = [...list];
        overdueFirst(list, now);
        expect(list).toEqual(copy);
    });
});

describe('netPosition', () => {
    it('is owed minus owing, using numeric strings', () => {
        const owed = [loan({ outstanding_amount: '20000.50' }), loan({ outstanding_amount: '2500' })];
        const owe = [loan({ direction: 'borrowed', outstanding_amount: '3000.00' })];
        expect(netPosition(owed, owe)).toBe(19500.5);
    });
    it('is negative when you owe more', () => {
        expect(netPosition([], [loan({ outstanding_amount: '3000' })])).toBe(-3000);
    });
    it('is zero with nothing', () => {
        expect(netPosition([], [])).toBe(0);
    });
});

describe('positionSentence', () => {
    it('covers the four base cases', () => {
        expect(positionSentence(500, true, 0)).toBe('You are owed more than you owe.');
        expect(positionSentence(-500, true, 0)).toBe('You owe more than you are owed.');
        expect(positionSentence(0, true, 0)).toBe('You are even.');
        expect(positionSentence(0, false, 0)).toBe('Nothing is open right now.');
    });
    it('appends a singular overdue note', () => {
        expect(positionSentence(500, true, 1)).toBe('You are owed more than you owe. One loan is overdue.');
    });
    it('appends a plural overdue note', () => {
        expect(positionSentence(-500, true, 2)).toBe('You owe more than you are owed. 2 loans are overdue.');
    });
});
