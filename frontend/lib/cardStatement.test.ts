import { describe, it, expect } from 'vitest';
import { cycleSuggestedAmount, cycleStatusLabel, defaultPayCycleIdx, isCycleSelectable, type PayCycle } from './cardStatement';

const fmtDate = (d: string) => `<${d}>`;

// Aug bill 10,000 paid on 20 Sep; 12,000 spent Sep 5 - Oct 4. The Sep 5 - Oct 4
// cycle's net total is 12,000 - 10,000 = 2,000, but 12,000 is owed.
const cycles: PayCycle[] = [
    { start: '2026-10-05', end: null, label: 'Oct 5 – present', total: '500.00', is_current: true },
    { start: '2026-09-05', end: '2026-10-04', label: 'Sep 5 – Oct 4', total: '2000.00', is_current: false },
    { start: '2026-08-05', end: '2026-09-04', label: 'Aug 5 – Sep 4', total: '10000.00', is_current: false },
];
const owed = { statement_due_date: '2026-10-24', statement_amount_due: 12000, statement_remaining: 12000 };

describe('cycleSuggestedAmount', () => {
    it('uses statement_remaining for the latest closed cycle, not its net total', () => {
        expect(cycleSuggestedAmount(cycles[1], 1, owed)).toBe('12000');
    });

    it('suggests nothing for the latest statement once it is fully paid, even if the cycle total is positive', () => {
        expect(cycleSuggestedAmount(cycles[1], 1, { ...owed, statement_remaining: 0 })).toBeNull();
    });

    it('prefills the remainder after a partial payment even when the cycle total is negative', () => {
        const negative = { ...cycles[1], total: '-3000.00' };
        expect(cycleSuggestedAmount(negative, 1, { ...owed, statement_remaining: 4000 })).toBe('4000');
    });

    it('keeps the cycle-total behaviour for other cycles and when statement_remaining is missing', () => {
        expect(cycleSuggestedAmount(cycles[0], 0, owed)).toBe('500.00');
        expect(cycleSuggestedAmount(cycles[2], 2, owed)).toBe('10000.00');
        expect(cycleSuggestedAmount(cycles[1], 1, { statement_due_date: '2026-10-24' })).toBe('2000.00');
        expect(cycleSuggestedAmount(cycles[1], 1, null)).toBe('2000.00');
    });
});

describe('defaultPayCycleIdx / isCycleSelectable', () => {
    it('defaults to the latest closed cycle while something is owed on it', () => {
        expect(defaultPayCycleIdx(cycles, owed)).toBe(1);
    });

    it('falls back to the current cycle once the statement is paid', () => {
        expect(defaultPayCycleIdx(cycles, { ...owed, statement_remaining: 0 })).toBe(0);
        expect(isCycleSelectable(cycles[1], 1, { ...owed, statement_remaining: 0 })).toBe(false);
    });

    it('keeps an owed latest statement selectable even if its net cycle total is <= 0', () => {
        const negative = [cycles[0], { ...cycles[1], total: '-3000.00' }];
        expect(isCycleSelectable(negative[1], 1, owed)).toBe(true);
        expect(defaultPayCycleIdx(negative, owed)).toBe(1);
    });

    it('returns -1 with no cycles', () => {
        expect(defaultPayCycleIdx([], owed)).toBe(-1);
    });
});

describe('cycleStatusLabel', () => {
    it('shows the due date while the latest statement is unpaid', () => {
        expect(cycleStatusLabel(cycles[1], 1, owed, fmtDate)).toBe('Due <2026-10-24>');
        expect(cycleStatusLabel(cycles[1], 1, { ...owed, statement_remaining: 5000 }, fmtDate)).toBe('Due <2026-10-24>');
    });

    it('shows Paid in full only when the statement had a bill and nothing remains', () => {
        expect(cycleStatusLabel(cycles[1], 1, { ...owed, statement_remaining: 0 }, fmtDate)).toBe('Paid in full');
        expect(cycleStatusLabel(cycles[1], 1, { ...owed, statement_amount_due: 0, statement_remaining: 0 }, fmtDate)).toBe('Closed');
        expect(cycleStatusLabel(cycles[1], 1, { ...owed, statement_amount_due: -200, statement_remaining: 0 }, fmtDate)).toBe('Overpaid · credit');
    });

    it('does not call a zero-total latest cycle Paid in full while money is still owed', () => {
        expect(cycleStatusLabel({ ...cycles[1], total: '0.00' }, 1, owed, fmtDate)).toBe('Due <2026-10-24>');
    });

    it('keeps the existing labels for the current and older cycles', () => {
        expect(cycleStatusLabel(cycles[0], 0, owed, fmtDate)).toBe('Not yet billed');
        expect(cycleStatusLabel({ ...cycles[2], total: '0.00' }, 2, owed, fmtDate)).toBe('Paid in full');
        expect(cycleStatusLabel({ ...cycles[2], total: '-5.00' }, 2, owed, fmtDate)).toBe('Overpaid · credit');
        expect(cycleStatusLabel(cycles[2], 2, owed, fmtDate)).toBe('Closed');
    });
});
