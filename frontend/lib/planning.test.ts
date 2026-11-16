import { describe, it, expect } from 'vitest';
import { monthlyWaterfall, driftLabel, riskLabel, moratoriumNote } from './planning';

const basePlan = { goal_amount: null, goal_name: null, loan_principal: null, loan_moratorium_months: null };
const expenses = [{ name: 'Rent', amount: 30000 }, { name: 'Food', amount: 10000 }];
const month1 = { income: 100000, loanPayment: 0, goalPayment: 0, emergencyFundContribution: 20000, sipContribution: 40000, deficit: false };

describe('monthlyWaterfall', () => {
    it('balances when everything adds up to income', () => {
        const w = monthlyWaterfall(basePlan, expenses, month1);
        expect(w.balanced).toBe(true);
        expect(w.endingBalance).toBe(0);
        expect(w.fixedCosts).toBe(40000);
        expect(w.savedAndInvested).toBe(60000);
        expect(w.savedPct).toBe(60);
        expect(w.rows.map(r => r.label)).toEqual(['Rent', 'Food', 'Emergency fund', 'SIP and investments']);
        expect(w.rows[0]).toMatchObject({ amount: 30000, running: 70000 });
    });

    it('stays balanced within the rounding tolerance', () => {
        const w = monthlyWaterfall(basePlan, expenses, { ...month1, sipContribution: 39998 });
        expect(w.endingBalance).toBe(2);
        expect(w.balanced).toBe(true);
        const off = monthlyWaterfall(basePlan, expenses, { ...month1, sipContribution: 39997 });
        expect(off.balanced).toBe(false);
    });

    it('reports a deficit and is not balanced', () => {
        const w = monthlyWaterfall(basePlan, expenses, { ...month1, emergencyFundContribution: 0, sipContribution: 0, deficit: true });
        expect(w.deficit).toBe(true);
        expect(w.balanced).toBe(false);
    });

    it('flags a mismatch when allocations leave money unexplained', () => {
        const w = monthlyWaterfall(basePlan, expenses, { ...month1, sipContribution: 10000 });
        expect(w.balanced).toBe(false);
        expect(w.deficit).toBe(false);
        expect(w.endingBalance).toBe(30000);
    });

    it('has no loan row without a loan', () => {
        const w = monthlyWaterfall(basePlan, expenses, { ...month1, loanPayment: 5000 });
        expect(w.rows.some(r => r.label === 'Loan payment')).toBe(false);
    });

    it('orders expenses, loan, goal, emergency fund, SIP', () => {
        const plan = { goal_amount: 50000, goal_name: 'Trip', loan_principal: 200000, loan_moratorium_months: 3 };
        const m = { income: 100000, loanPayment: 10000, goalPayment: 10000, emergencyFundContribution: 10000, sipContribution: 30000, deficit: false };
        const w = monthlyWaterfall(plan, expenses, m);
        expect(w.rows.map(r => r.label)).toEqual(['Rent', 'Food', 'Loan payment', 'Goal: Trip', 'Emergency fund', 'SIP and investments']);
        expect(w.rows[2].note).toBe('Interest only, moratorium in effect');
        expect(w.rows[3].note).toBeUndefined();
        expect(w.savedAndInvested).toBe(50000);
        expect(w.balanced).toBe(true);
    });

    it('guards against zero income when computing the percentage', () => {
        const w = monthlyWaterfall(basePlan, [], { ...month1, income: 0, emergencyFundContribution: 0, sipContribution: 0 });
        expect(w.savedPct).toBe(0);
    });
});

describe('driftLabel', () => {
    it('shows an increase with a plus', () => {
        const s = driftLabel(40000, 46200, 15.5);
        expect(s).toContain('to');
        expect(s).toContain('(+16%)');
        expect(s).not.toContain('→');
    });
    it('shows a decrease with a real minus', () => {
        expect(driftLabel(40000, 30000, -25)).toContain('(−25%)');
    });
    it('shows no sign at zero', () => {
        expect(driftLabel(40000, 40000, 0.2)).toContain('(0%)');
    });
});

describe('riskLabel', () => {
    it('maps each profile', () => {
        expect(riskLabel('safety')).toBe('Safety first');
        expect(riskLabel('balanced')).toBe('Balanced');
        expect(riskLabel('growth')).toBe('Growth first');
    });
});

describe('moratoriumNote', () => {
    it('is null without a moratorium', () => {
        expect(moratoriumNote({ loan_moratorium_months: 0 })).toBeNull();
        expect(moratoriumNote({ loan_moratorium_months: null })).toBeNull();
    });
    it('pluralises and names the first full EMI month', () => {
        expect(moratoriumNote({ loan_moratorium_months: 1 })).toBe('Interest only for the first 1 month. The full EMI begins in month 2.');
        expect(moratoriumNote({ loan_moratorium_months: 6 })).toBe('Interest only for the first 6 months. The full EMI begins in month 7.');
    });
});
