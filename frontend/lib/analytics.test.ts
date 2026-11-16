import { describe, it, expect } from 'vitest';
import { shareRows, comparePeriod, dayOfWeekSummary, patternTitle, patternContext, splitPatterns, patternCount, yearReviewStats, calendarMonthStats, weakestFactor, sortFactorsWeakestFirst } from './analytics';

describe('shareRows', () => {
    it('sorts biggest first and keeps colours', () => {
        const rows = shareRows([
            { name: 'A', total: 10, color: '#111' },
            { name: 'B', total: 30 },
        ]);
        expect(rows.map(r => r.name)).toEqual(['B', 'A']);
        expect(rows[1].color).toBe('#111');
        expect(rows[0].color).toBeUndefined();
    });

    it('percentages add up to exactly 100', () => {
        const rows = shareRows([
            { name: 'A', total: 1 }, { name: 'B', total: 1 }, { name: 'C', total: 1 },
        ]);
        expect(rows.reduce((s, r) => s + r.pct, 0)).toBe(100);
        const many = shareRows(Array.from({ length: 5 }, (_, i) => ({ name: `N${i}`, total: 7 + i })));
        expect(many.reduce((s, r) => s + r.pct, 0)).toBe(100);
    });

    it('folds everything past maxRows into Everything else', () => {
        const items = Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, total: 100 - i }));
        const rows = shareRows(items, 6);
        expect(rows).toHaveLength(7);
        expect(rows[6].name).toBe('Everything else');
        expect(rows[6].total).toBe(94 + 93 + 92);
        expect(rows.reduce((s, r) => s + r.pct, 0)).toBe(100);
    });

    it('has no Everything else bucket at or under maxRows', () => {
        const rows = shareRows(Array.from({ length: 6 }, (_, i) => ({ name: `C${i}`, total: i + 1 })), 6);
        expect(rows).toHaveLength(6);
        expect(rows.some(r => r.name === 'Everything else')).toBe(false);
    });

    it('drops zero and negative totals; empty input gives []', () => {
        expect(shareRows([])).toEqual([]);
        expect(shareRows([{ name: 'A', total: 0 }, { name: 'B', total: -5 }])).toEqual([]);
        const rows = shareRows([{ name: 'A', total: 0 }, { name: 'B', total: 5 }]);
        expect(rows).toEqual([{ name: 'B', total: 5, pct: 100 }]);
    });
});

describe('comparePeriod', () => {
    it('has nothing to compare against when previous is missing or zero', () => {
        const none = { value: '—', detail: 'No earlier period to compare', tone: 'neutral' };
        expect(comparePeriod(100, null, 'May')).toEqual(none);
        expect(comparePeriod(100, 0, 'May')).toEqual(none);
        expect(comparePeriod(100, -4, 'May')).toEqual(none);
    });

    it('spending down is good, with a Unicode minus', () => {
        expect(comparePeriod(81850, 93000, 'May')).toEqual({ value: '−12%', detail: '₹11,150 less than May', tone: 'good' });
    });

    it('spending up is caution', () => {
        expect(comparePeriod(56700, 52500, 'May')).toEqual({ value: '+8%', detail: '₹4,200 more than May', tone: 'caution' });
    });

    it('tiny changes read as the same', () => {
        expect(comparePeriod(10040, 10000, 'May')).toEqual({ value: '0%', detail: 'Same as May', tone: 'neutral' });
        expect(comparePeriod(9960, 10000, 'May').value).toBe('0%');
    });

    it('higherIsGood flips the tone for income', () => {
        expect(comparePeriod(110, 100, 'May', true).tone).toBe('good');
        expect(comparePeriod(90, 100, 'May', true).tone).toBe('caution');
    });
});

describe('dayOfWeekSummary', () => {
    it('orders Monday first', () => {
        const s = dayOfWeekSummary([1, 2, 3, 4, 5, 6, 7]); // Sun..Sat
        expect(s.order.map(d => d.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
        expect(s.order.map(d => d.amount)).toEqual([2, 3, 4, 5, 6, 7, 1]);
    });

    it('finds the busiest day and the weekend share', () => {
        const s = dayOfWeekSummary([100, 0, 0, 0, 0, 0, 300]);
        expect(s.busiest).toEqual({ day: 'Sat', amount: 300, full: 'Saturday' });
        expect(s.weekendPct).toBe(100);
        const t = dayOfWeekSummary([10, 20, 20, 20, 20, 5, 5]);
        expect(t.weekendPct).toBe(15);
        expect(t.busiest?.full).toBe('Monday');
    });

    it('a zero total has no busiest day and 0%', () => {
        const s = dayOfWeekSummary([0, 0, 0, 0, 0, 0, 0]);
        expect(s.busiest).toBeNull();
        expect(s.weekendPct).toBe(0);
    });
});

describe('patternTitle', () => {
    it('gives sentence-case titles for known patterns', () => {
        expect(patternTitle('budget_anchoring')).toBe('Budget anchoring');
        expect(patternTitle('present_bias')).toBe('Present bias (early-month spending)');
        expect(patternTitle('subscription_bloat')).toBe('Subscription bloat');
        expect(patternTitle('idle_savings_despite_debt')).toBe('Idle savings despite debt');
    });
    it('falls back to the raw name', () => {
        expect(patternTitle('something_new')).toBe('something_new');
    });
});

describe('patternContext', () => {
    it('budget anchoring', () => {
        const p = { pattern_name: 'budget_anchoring', supporting_data: { categories: [{ near_limit_months: 3, total_months: 3 }, { near_limit_months: 2, total_months: 3 }, { near_limit_months: 0, total_months: 3 }] } };
        expect(patternContext(p)).toBe('You spent 85 to 100% of budget in 3 out of 3 months in 2 categories.');
        const one = { pattern_name: 'budget_anchoring', supporting_data: { categories: [{ near_limit_months: 2, total_months: 3 }] } };
        expect(patternContext(one)).toContain('in 1 category.');
        expect(patternContext({ pattern_name: 'budget_anchoring', supporting_data: { categories: [{ near_limit_months: 1, total_months: 3 }] } })).toBe('');
    });
    it('present bias', () => {
        expect(patternContext({ pattern_name: 'present_bias', supporting_data: { first_half_avg_daily: 812.4, second_half_avg_daily: 300.6 } }))
            .toBe('You spend ₹812/day in the first half of the month vs ₹301/day in the second half.');
    });
    it('subscription bloat', () => {
        expect(patternContext({ pattern_name: 'subscription_bloat', supporting_data: { recurring_subscription_count: 7 } }))
            .toBe('7 recurring subscriptions detected over the last 3 months.');
    });
    it('idle savings despite debt', () => {
        expect(patternContext({ pattern_name: 'idle_savings_despite_debt', supporting_data: { bank_balance: 123456, credit_card_outstanding: 9000 } }))
            .toBe('₹1,23,456 in savings vs ₹9,000 in credit card debt.');
    });
    it('unknown returns empty', () => {
        expect(patternContext({ pattern_name: 'nope' })).toBe('');
    });
});

describe('splitPatterns and patternCount', () => {
    const list = [
        { pattern_name: 'a', detected: true },
        { pattern_name: 'b', detected: false },
        { pattern_name: 'c', detected: true },
        { pattern_name: 'd', detected: false },
    ];
    it('keeps order within each group', () => {
        const { detected, clear } = splitPatterns(list);
        expect(detected.map(p => p.pattern_name)).toEqual(['a', 'c']);
        expect(clear.map(p => p.pattern_name)).toEqual(['b', 'd']);
    });
    it('counts found against the listed total', () => {
        expect(patternCount(list)).toEqual({ found: 2, total: 4 });
        expect(patternCount([])).toEqual({ found: 0, total: 0 });
    });
});

describe('yearReviewStats', () => {
    const tx = (date: string, type: string, amount: number, extra: any = {}) => ({ date, type, amount: String(amount), category_name: 'Food', ...extra });

    it('returns null when the year has no transactions', () => {
        expect(yearReviewStats([], 2025)).toBeNull();
        expect(yearReviewStats([tx('2024-03-01', 'expense', 10)], 2025)).toBeNull();
    });

    it('excludes investments, goal contributions and transfers', () => {
        const s = yearReviewStats([
            tx('2025-01-05', 'income', 1000),
            tx('2025-01-06', 'income', 500, { tags: ['transfer'] }),
            tx('2025-01-07', 'expense', 100),
            tx('2025-01-08', 'expense', 200, { is_investment_category: true }),
            tx('2025-01-09', 'expense', 300, { goal_id: 'g1' }),
            tx('2025-01-10', 'expense', 400, { tags: ['credit_card_payment'] }),
        ], 2025)!;
        expect(s.count).toBe(6);
        expect(s.totalInc).toBe(1000);
        expect(s.totalExp).toBe(100);
        expect(s.saved).toBe(900);
        expect(s.rate).toBe(90);
    });

    it('finds the top category, worst month and best savings month', () => {
        const s = yearReviewStats([
            tx('2025-02-01', 'income', 1000),
            tx('2025-02-02', 'expense', 100, { category_name: 'Rent' }),
            tx('2025-03-01', 'income', 1000),
            tx('2025-03-02', 'expense', 700, { category_name: 'Travel' }),
            tx('2025-04-01', 'income', 3000),
            tx('2025-04-02', 'expense', 50, { category_name: 'Rent' }),
        ], 2025)!;
        expect(s.topCategory).toEqual({ name: 'Travel', amount: 700 });
        expect(s.worstMonth).toEqual({ m: 3, exp: 700 });
        expect(s.bestSavings).toEqual({ m: 4, savings: 2950 });
    });

    it('rounds the rate and never reports negative savings', () => {
        const r = yearReviewStats([tx('2025-01-01', 'income', 300), tx('2025-01-02', 'expense', 100)], 2025)!;
        expect(r.rate).toBe(67);
        const neg = yearReviewStats([tx('2025-01-01', 'income', 100), tx('2025-01-02', 'expense', 500)], 2025)!;
        expect(neg.saved).toBe(0);
        expect(neg.rate).toBe(0);
        expect(neg.bestSavings).toBeNull();
    });
});

describe('calendarMonthStats', () => {
    it('is all zero for an empty map', () => {
        expect(calendarMonthStats({})).toEqual({ totalSpent: 0, totalIncome: 0, incomeDays: 0, spendingDays: 0, dailyAvg: 0, busiest: null });
    });

    it('totals spending and income and averages over spending days', () => {
        const s = calendarMonthStats({
            '2026-11-01': { income: 0, expenses: 100 },
            '2026-11-02': { income: 5000, expenses: 0 },
            '2026-11-03': { income: 200, expenses: 300 },
        });
        expect(s.totalSpent).toBe(400);
        expect(s.totalIncome).toBe(5200);
        expect(s.incomeDays).toBe(2);
        expect(s.spendingDays).toBe(2);
        expect(s.dailyAvg).toBe(200);
        expect(s.busiest).toEqual({ date: '2026-11-03', amount: 300 });
    });

    it('keeps the first date when two days tie for busiest', () => {
        const s = calendarMonthStats({ '2026-11-04': { income: 0, expenses: 50 }, '2026-11-09': { income: 0, expenses: 50 } });
        expect(s.busiest).toEqual({ date: '2026-11-04', amount: 50 });
    });
});

describe('factor ordering', () => {
    const f = (id: string, pct: number) => ({ id, pct });
    it('sorts weakest first, stable on ties, without mutating the input', () => {
        const input = [f('a', 50), f('b', 10), f('c', 50), f('d', 10)];
        const sorted = sortFactorsWeakestFirst(input);
        expect(sorted.map(x => x.id)).toEqual(['b', 'd', 'a', 'c']);
        expect(input.map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('finds the weakest factor, or null when there are none', () => {
        expect(weakestFactor([f('a', 50), f('b', 10), f('c', 10)])?.id).toBe('b');
        expect(weakestFactor([])).toBeNull();
    });
});
