import { describe, it, expect } from 'vitest';
import { calculateHealthScore, type HealthInput } from './healthScore';

// The score is user-facing and drives both the Health Score page and the
// dashboard widget. It is pure, branch-heavy and had no coverage; these cases
// pin the invariants (the eight factors must total 100, nothing may exceed its
// max, no branch may produce NaN) plus the band boundaries.

const base: HealthInput = {
    income: 0, expenses: 0,
    budgets: [], goals: [],
    monthlyIncome: [], monthlyExpenses: [],
    investedThisMonth: 0, dtiRatio: 0, ccUtilizationPct: 0,
};

const input = (over: Partial<HealthInput> = {}): HealthInput => ({ ...base, ...over });

describe('calculateHealthScore invariants', () => {
    it('has eight factors whose maxima total exactly 100', () => {
        const { breakdown } = calculateHealthScore(input());
        expect(breakdown).toHaveLength(8);
        expect(breakdown.reduce((s, f) => s + f.max, 0)).toBe(100);
    });

    it('never lets a factor exceed its own max, or the total leave 0–100', () => {
        const cases: HealthInput[] = [
            input(),
            input({ income: 100000, expenses: 20000, investedThisMonth: 30000 }),
            input({ income: 10000, expenses: 90000, dtiRatio: 95, ccUtilizationPct: 99 }),
            input({ income: 100000, expenses: 0, monthlyIncome: [1e6, 1e6], monthlyExpenses: [0, 0] }),
        ];
        for (const c of cases) {
            const r = calculateHealthScore(c);
            expect(r.score).toBeGreaterThanOrEqual(0);
            expect(r.score).toBeLessThanOrEqual(100);
            for (const f of r.breakdown) {
                expect(f.score).toBeLessThanOrEqual(f.max);
                expect(f.score).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('produces no NaN from empty history, which would render as "NaN" on the gauge', () => {
        // mean([]) is 0/0; the guards on short arrays are what prevent this,
        // so an empty input is the case most likely to leak NaN to the UI.
        const r = calculateHealthScore(input());
        expect(Number.isNaN(r.score)).toBe(false);
        for (const f of r.breakdown) {
            expect(Number.isNaN(f.score)).toBe(false);
            expect(Number.isNaN(f.pct)).toBe(false);
        }
    });

    it('keeps pct consistent with score over max', () => {
        const r = calculateHealthScore(input({ income: 80000, expenses: 40000 }));
        for (const f of r.breakdown) {
            expect(f.pct).toBeCloseTo((f.score / f.max) * 100, 5);
        }
    });

    it('gives every factor a non-empty tip', () => {
        const r = calculateHealthScore(input({ income: 50000, expenses: 30000 }));
        for (const f of r.breakdown) expect(f.tip.length).toBeGreaterThan(0);
    });
});

describe('savings rate factor', () => {
    const savings = (i: HealthInput) =>
        calculateHealthScore(i).breakdown.find(f => f.id === 'savings')!.score;

    it('awards full marks at or above a 25% rate', () => {
        expect(savings(input({ income: 100, expenses: 75 }))).toBe(20);
        expect(savings(input({ income: 100, expenses: 50 }))).toBe(20);
    });

    it('steps down as the rate falls', () => {
        expect(savings(input({ income: 100, expenses: 80 }))).toBe(17);  // 20%
        expect(savings(input({ income: 100, expenses: 90 }))).toBe(9);   // 10%
        expect(savings(input({ income: 100, expenses: 99 }))).toBe(2);   // 1%
    });

    it('scores zero when spending meets or exceeds income', () => {
        expect(savings(input({ income: 100, expenses: 100 }))).toBe(0);
        expect(savings(input({ income: 100, expenses: 500 }))).toBe(0);
    });

    it('scores zero with no income at all rather than dividing by zero', () => {
        expect(savings(input({ income: 0, expenses: 5000 }))).toBe(0);
    });
});

describe('momentum and stability fall back on thin history', () => {
    it('awards the neutral half-score with fewer than two months', () => {
        const r = calculateHealthScore(input({ monthlyIncome: [50000], monthlyExpenses: [30000] }));
        expect(r.breakdown.find(f => f.id === 'momentum')!.score).toBe(5);
        expect(r.breakdown.find(f => f.id === 'stability')!.score).toBe(5);
    });

    it('rewards a steadily improving savings rate', () => {
        const r = calculateHealthScore(input({
            monthlyIncome:  [100, 100, 100],
            monthlyExpenses: [90, 80, 60],
        }));
        expect(r.breakdown.find(f => f.id === 'momentum')!.score).toBe(10);
    });

    it('rates perfectly flat income as maximally stable', () => {
        const r = calculateHealthScore(input({
            monthlyIncome:  [50000, 50000, 50000],
            monthlyExpenses: [1, 1, 1],
        }));
        expect(r.breakdown.find(f => f.id === 'stability')!.score).toBe(10);
    });
});

describe('label banding', () => {
    it('maps the score onto the right band and colour', () => {
        const strong = calculateHealthScore(input({
            income: 100000, expenses: 30000, investedThisMonth: 25000,
            monthlyIncome: [100000, 100000, 100000],
            monthlyExpenses: [40000, 35000, 30000],
            budgets: [{ amount: 10000, spent: 5000 }],
            goals: [{ current_amount: 90, target_amount: 100 }],
        }));
        const weak = calculateHealthScore(input({
            income: 10000, expenses: 30000, dtiRatio: 90, ccUtilizationPct: 95,
        }));

        expect(strong.score).toBeGreaterThan(weak.score);
        expect(['Excellent', 'Good']).toContain(strong.label);
        expect(['Critical', 'Needs Attention']).toContain(weak.label);
        expect(weak.color).toBe('var(--color-exp)');
    });
});
