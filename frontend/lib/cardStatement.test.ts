import { describe, it, expect } from 'vitest';
import { currentCycleNewCharges, cycleHeadline, cycleSuggestedAmount, cycleStatusLabel, defaultPayCycleIdx, isCycleSelectable, payCycleRow, type PayCycle } from './cardStatement';

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

    it('prefills the exact paise remaining, not a rupee-rounded amount', () => {
        const paise = { statement_due_date: '2026-10-24', statement_amount_due: 8000.4, statement_remaining: 8000.4 };
        expect(cycleSuggestedAmount(cycles[1], 1, paise)).toBe('8000.4');
        expect(cycleSuggestedAmount(cycles[1], 1, { ...paise, statement_remaining: 0.4 })).toBe('0.4');
        expect(cycleSuggestedAmount(cycles[1], 1, { ...paise, statement_remaining: 0 })).toBeNull();
    });

    it('falls back to the cycle total for the latest statement when statement_remaining is missing', () => {
        expect(cycleSuggestedAmount(cycles[1], 1, { statement_due_date: '2026-10-24' })).toBe('2000.00');
        expect(cycleSuggestedAmount(cycles[1], 1, null)).toBe('2000.00');
    });

    it('current cycle: pre-fills the new charges since the close (payments added back), or the cycle total on an old API', () => {
        // 500 net since the close after a 10,000 bill payment -> 10,500 of new charges
        expect(cycleSuggestedAmount(cycles[0], 0, { ...owed, new_charges_since_statement: 500, statement_paid: 10000 })).toBe('10500');
        expect(cycleSuggestedAmount(cycles[0], 0, { ...owed, new_charges_since_statement: 0, statement_paid: 0 })).toBeNull();
        expect(cycleSuggestedAmount(cycles[0], 0, owed)).toBe('500');
    });

    it('older statements never pre-fill: their balance rolled into the latest one', () => {
        expect(cycleSuggestedAmount(cycles[2], 2, owed)).toBeNull();
        expect(isCycleSelectable(cycles[2], 2, owed)).toBe(false);
        expect(isCycleSelectable(cycles[0], 0, owed)).toBe(true);
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

    it('paid in full to the paisa -> Paid in full; 40 paise short is still due', () => {
        const paise = { statement_due_date: '2026-10-24', statement_amount_due: 8000.4 };
        expect(cycleStatusLabel(cycles[1], 1, { ...paise, statement_remaining: 0 }, fmtDate)).toBe('Paid in full');
        expect(cycleStatusLabel(cycles[1], 1, { ...paise, statement_remaining: 0.4 }, fmtDate)).toBe('Due <2026-10-24>');
        expect(defaultPayCycleIdx(cycles, { ...paise, statement_remaining: 0.4 })).toBe(1);
    });

    it('does not call a zero-total latest cycle Paid in full while money is still owed', () => {
        expect(cycleStatusLabel({ ...cycles[1], total: '0.00' }, 1, owed, fmtDate)).toBe('Due <2026-10-24>');
    });

    it('labels the current cycle as not billed and every older statement as carried forward', () => {
        expect(cycleStatusLabel(cycles[0], 0, owed, fmtDate)).toBe('Not billed yet');
        expect(cycleStatusLabel({ ...cycles[2], total: '0.00' }, 2, owed, fmtDate)).toBe('Carried into the next statement');
        expect(cycleStatusLabel(cycles[2], 2, owed, fmtDate)).toBe('Carried into the next statement');
    });
});

describe('payCycleRow', () => {
    const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
    const card = { ...owed, statement_amount_due: 12000, statement_paid: 4000, statement_remaining: 8000, new_charges_since_statement: -3500 };
    const withBilled: PayCycle[] = [
        cycles[0],
        { ...cycles[1], statement_close_date: '2026-10-05', statement_balance: 12000 },
        { ...cycles[2], statement_close_date: '2026-09-05', statement_balance: 10000 },
    ];

    it('current cycle: new charges since the close, not billed yet, selectable', () => {
        expect(payCycleRow(withBilled[0], 0, card, fmtDate, inr)).toEqual({
            amount: 500, caption: 'new charges', status: 'Not billed yet', statusTone: 'muted', selectable: true,
        });
        expect(currentCycleNewCharges(withBilled[0], card)).toBe(500); // -3500 net + 4000 paid
    });

    it('latest statement: what is left of the amount due, due date in warn', () => {
        expect(payCycleRow(withBilled[1], 1, card, fmtDate, inr)).toEqual({
            amount: 8000, caption: 'of ₹12,000 left', status: 'Due <2026-10-24>', statusTone: 'warn', selectable: true,
        });
    });

    it('latest statement paid in full: 0 left, green status, not selectable', () => {
        const paid = { ...card, statement_paid: 12000, statement_remaining: 0 };
        expect(payCycleRow(withBilled[1], 1, paid, fmtDate, inr)).toEqual({
            amount: 0, caption: 'of ₹12,000 left', status: 'Paid in full', statusTone: 'inc', selectable: false,
        });
    });

    it('older statement: what it billed, carried forward, disabled', () => {
        expect(payCycleRow(withBilled[2], 2, card, fmtDate, inr)).toEqual({
            amount: 10000, caption: 'billed', status: 'Carried into the next statement', statusTone: 'muted', selectable: false,
        });
        // an API without statement_balance shows no figure rather than the net total
        expect(payCycleRow(cycles[2], 2, card, fmtDate, inr).amount).toBeNull();
    });
});

describe('cycleHeadline (Billing Cycles page)', () => {
    const base = { start: '2026-08-06', end: '2026-09-05', label: 'Aug 6 – Sep 5', total: '-2850.00', is_current: false };

    it('a closed cycle shows what its statement billed, like the picker', () => {
        expect(cycleHeadline({ ...base, statement_balance: 450, charges: 450, payments: 3300 })).toEqual({ amount: 450, caption: 'billed' });
    });

    it('a statement in credit says so', () => {
        expect(cycleHeadline({ ...base, statement_balance: -200 })).toEqual({ amount: -200, caption: 'in credit' });
    });

    it('the open cycle shows new charges, not net of payments', () => {
        const cur = { ...base, end: null, is_current: true, total: '7160.00', statement_balance: null, charges: 12160, payments: 5000 };
        expect(cycleHeadline(cur)).toEqual({ amount: 12160, caption: 'not billed yet' });
    });

    it('falls back to the net total against an older API', () => {
        expect(cycleHeadline(base)).toEqual({ amount: -2850, caption: null });
    });
});
