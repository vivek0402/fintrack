import { describe, it, expect } from 'vitest';
import { cardUsedPct, totalUsedPct, statementAmountOwed, nextCardBill, sortCardsByDue, daysUntilDue, type AccountCard } from './accounts';

const today = new Date(2026, 10, 16, 15, 30); // 16 Nov 2026, afternoon

const card = (over: Partial<AccountCard> = {}): AccountCard => ({
    bank_name: 'HDFC', card_name: 'Millennia', credit_limit: 100000, current_outstanding_balance: 25000, ...over,
});

describe('cardUsedPct', () => {
    it('rounds outstanding over limit', () => {
        expect(cardUsedPct(card({ current_outstanding_balance: 33333 }))).toBe(33);
    });
    it('is 0 with no limit', () => {
        expect(cardUsedPct(card({ credit_limit: 0 }))).toBe(0);
        expect(cardUsedPct(card({ credit_limit: null }))).toBe(0);
    });
    it('caps at 100 and floors at 0', () => {
        expect(cardUsedPct(card({ current_outstanding_balance: 250000 }))).toBe(100);
        expect(cardUsedPct(card({ current_outstanding_balance: -500 }))).toBe(0);
    });
    it('counts non-numeric amounts as 0', () => {
        expect(cardUsedPct(card({ current_outstanding_balance: 'abc' }))).toBe(0);
        expect(cardUsedPct(card({ credit_limit: '50000', current_outstanding_balance: '25000' }))).toBe(50);
    });
});

describe('totalUsedPct', () => {
    it('is null when no card has a limit', () => {
        expect(totalUsedPct([])).toBeNull();
        expect(totalUsedPct([card({ credit_limit: 0 })])).toBeNull();
    });
    it('sums outstanding over sums of limits', () => {
        expect(totalUsedPct([card({ current_outstanding_balance: 10000 }), card({ credit_limit: 300000, current_outstanding_balance: 110000 })])).toBe(30);
    });
});

describe('statementAmountOwed', () => {
    it('prefers remaining, then amount due, then balance', () => {
        expect(statementAmountOwed({ statement_remaining: 1, statement_amount_due: 2, statement_balance: 3 })).toBe(1);
        expect(statementAmountOwed({ statement_remaining: null, statement_amount_due: 2, statement_balance: 3 })).toBe(2);
        expect(statementAmountOwed({ statement_balance: 3 })).toBe(3);
    });
    it('keeps a remaining of 0 (paid)', () => {
        expect(statementAmountOwed({ statement_remaining: 0, statement_amount_due: 2 })).toBe(0);
    });
    it('is null when nothing is a number', () => {
        expect(statementAmountOwed({})).toBeNull();
        expect(statementAmountOwed({ statement_balance: 'x' })).toBeNull();
    });
});

describe('nextCardBill', () => {
    it('is null with no cards or no dated statements', () => {
        expect(nextCardBill([], today)).toBeNull();
        expect(nextCardBill([card({ statement_balance: 500 })], today)).toBeNull();
    });
    it('picks the earliest due date and counts days', () => {
        const bill = nextCardBill([
            card({ card_name: 'Later', statement_due_date: '2026-11-28', statement_balance: 900 }),
            card({ card_name: 'Sooner', statement_due_date: '2026-11-20T00:00:00.000Z', statement_remaining: 400 }),
        ], today);
        expect(bill).toEqual({ cardName: 'HDFC Sooner', amount: 400, dueDate: '2026-11-20', days: 4 });
    });
    it('skips a paid statement', () => {
        const bill = nextCardBill([
            card({ card_name: 'Paid', statement_due_date: '2026-11-18', statement_balance: 900, statement_remaining: 0 }),
            card({ card_name: 'Owes', statement_due_date: '2026-11-25', statement_balance: 700 }),
        ], today);
        expect(bill?.cardName).toBe('HDFC Owes');
        expect(bill?.days).toBe(9);
    });
    it('includes overdue with negative days, and due today as 0', () => {
        expect(nextCardBill([card({ statement_due_date: '2026-11-13', statement_balance: 100 })], today)?.days).toBe(-3);
        expect(nextCardBill([card({ statement_due_date: '2026-11-16', statement_balance: 100 })], today)?.days).toBe(0);
    });
});

describe('sortCardsByDue', () => {
    it('puts dated cards first, soonest first, then the rest in original order', () => {
        const a = card({ card_name: 'A' });
        const b = card({ card_name: 'B', statement_due_date: '2026-12-01' });
        const c = card({ card_name: 'C' });
        const d = card({ card_name: 'D', statement_due_date: '2026-11-18' });
        expect(sortCardsByDue([a, b, c, d], today).map(x => x.card_name)).toEqual(['D', 'B', 'A', 'C']);
    });
    it('keeps ties stable and does not mutate the input', () => {
        const x = card({ card_name: 'X', statement_due_date: '2026-11-20' });
        const y = card({ card_name: 'Y', statement_due_date: '2026-11-20' });
        const input = [x, y];
        expect(sortCardsByDue(input, today).map(c => c.card_name)).toEqual(['X', 'Y']);
        expect(input).toEqual([x, y]);
    });
});

describe('daysUntilDue', () => {
    it('counts calendar days, negative when overdue', () => {
        expect(daysUntilDue('2026-11-17', today)).toBe(1);
        expect(daysUntilDue('2026-11-15', today)).toBe(-1);
    });
});
