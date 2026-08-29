const { calculateEMI, generateAmortization, monthsRemainingForLoan } = require('../src/utils/amortization');

// Loan payoff maths, behind the Debt Intelligence page's amortization table and
// prepayment calculator. Pure and previously untested. A bug here does not
// throw -- it quotes the user a wrong payoff date or a wrong interest total,
// which is the kind of thing nobody notices until they act on it.

describe('calculateEMI', () => {
    it('matches the standard reducing-balance formula', () => {
        // ₹10,00,000 at 9% for 20 years -> ~₹8,997/month. Cross-checked against
        // the closed-form P·r·(1+r)^n / ((1+r)^n − 1).
        const emi = calculateEMI(1000000, 0.09 / 12, 240);
        expect(emi).toBeCloseTo(8997.26, 1);
    });

    it('falls back to simple division at zero interest', () => {
        // Guarding this matters: the formula divides by (factor − 1), which is
        // exactly zero when the rate is zero.
        expect(calculateEMI(120000, 0, 12)).toBe(10000);
        expect(Number.isFinite(calculateEMI(120000, 0, 12))).toBe(true);
    });

    it('rises with rate and falls with tenure', () => {
        const cheap = calculateEMI(500000, 0.07 / 12, 60);
        const dear  = calculateEMI(500000, 0.14 / 12, 60);
        const longer = calculateEMI(500000, 0.07 / 12, 120);
        expect(dear).toBeGreaterThan(cheap);
        expect(longer).toBeLessThan(cheap);
    });
});

describe('generateAmortization', () => {
    const loan = (over = {}) => ({
        outstanding_balance: 500000,
        interest_rate_pct: 9,
        tenure_months_remaining: 60,
        emi_amount: null,
        prepayments: [],
        ...over,
    });

    it('pays the loan down to exactly zero', () => {
        const { invalid, schedule, summary } = generateAmortization(loan());
        expect(invalid).toBe(false);
        expect(schedule.at(-1).closing_balance).toBe(0);
        expect(summary.total_months).toBe(schedule.length);
    });

    it('splits every instalment into interest plus principal', () => {
        const { schedule } = generateAmortization(loan());
        for (const row of schedule.slice(0, -1)) {
            expect(row.interest_component + row.principal_component).toBeCloseTo(row.emi, 1);
            expect(row.opening_balance - row.principal_component).toBeCloseTo(row.closing_balance, 1);
        }
    });

    it('shifts the split from interest toward principal over time', () => {
        const { schedule } = generateAmortization(loan());
        const first = schedule[0];
        const last = schedule.at(-2);
        expect(first.interest_component).toBeGreaterThan(last.interest_component);
        expect(first.principal_component).toBeLessThan(last.principal_component);
    });

    it('reports totals that agree with the schedule it produced', () => {
        const { schedule, summary } = generateAmortization(loan());
        const interestSum = schedule.reduce((s, r) => s + r.interest_component, 0);
        expect(summary.total_interest).toBeCloseTo(interestSum, 0);
        expect(summary.total_amount_payable).toBeCloseTo(500000 + summary.total_interest, 0);
        expect(summary.payoff_date).toBe(schedule.at(-1).date);
    });

    it('refuses a loan whose EMI cannot cover the interest', () => {
        // Otherwise the balance grows every month and the loop would only stop
        // at the 1200-month safety cap, quoting a 100-year payoff as if real.
        const r = generateAmortization(loan({ emi_amount: 100 }));
        expect(r.invalid).toBe(true);
        expect(r.error).toMatch(/interest/i);
        expect(r.schedule).toBeUndefined();
    });

    it('treats an EMI exactly equal to the interest as invalid too', () => {
        const monthlyInterest = 500000 * (0.09 / 12);
        expect(generateAmortization(loan({ emi_amount: monthlyInterest })).invalid).toBe(true);
    });

    it('shortens the loan when a prepayment lands', () => {
        const withoutPre = generateAmortization(loan());
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        const withPre = generateAmortization(loan({
            prepayments: [{ date: nextMonth.toISOString().split('T')[0], amount: 100000 }],
        }));

        expect(withPre.summary.total_months).toBeLessThan(withoutPre.summary.total_months);
        expect(withPre.summary.total_interest).toBeLessThan(withoutPre.summary.total_interest);
    });

    it('never drives the balance below zero on an oversized prepayment', () => {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const { schedule } = generateAmortization(loan({
            prepayments: [{ date: nextMonth.toISOString().split('T')[0], amount: 9999999 }],
        }));
        expect(schedule.every(r => r.closing_balance >= 0)).toBe(true);
        expect(schedule.at(-1).closing_balance).toBe(0);
    });

    it('applies prepayments in date order regardless of input order', () => {
        const m1 = new Date(); m1.setMonth(m1.getMonth() + 1);
        const m2 = new Date(); m2.setMonth(m2.getMonth() + 2);
        const asGiven = [
            { date: m2.toISOString().split('T')[0], amount: 50000 },
            { date: m1.toISOString().split('T')[0], amount: 50000 },
        ];
        const sorted = [...asGiven].reverse();
        expect(generateAmortization(loan({ prepayments: asGiven })).summary.total_months)
            .toBe(generateAmortization(loan({ prepayments: sorted })).summary.total_months);
    });

    it('honours an explicit EMI instead of deriving one', () => {
        const derived = generateAmortization(loan());
        const larger = generateAmortization(loan({ emi_amount: derived.summary.emi + 2000 }));
        expect(larger.summary.total_months).toBeLessThan(derived.summary.total_months);
    });
});

describe('monthsRemainingForLoan', () => {
    it('subtracts elapsed months from the original tenure', () => {
        const oneYearAgo = new Date();
        oneYearAgo.setMonth(oneYearAgo.getMonth() - 12);
        const remaining = monthsRemainingForLoan({
            disbursement_date: oneYearAgo.toISOString(), tenure_months: 60,
        });
        expect(remaining).toBeGreaterThanOrEqual(47);
        expect(remaining).toBeLessThanOrEqual(49);
    });

    it('never returns less than one month, even long past maturity', () => {
        const old = new Date();
        old.setFullYear(old.getFullYear() - 30);
        expect(monthsRemainingForLoan({ disbursement_date: old.toISOString(), tenure_months: 12 })).toBe(1);
    });

    it('returns the full tenure for a loan disbursed today', () => {
        expect(monthsRemainingForLoan({
            disbursement_date: new Date().toISOString(), tenure_months: 36,
        })).toBe(36);
    });
});
