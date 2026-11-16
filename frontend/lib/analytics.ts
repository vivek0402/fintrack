import { isNonSavingsExpense, isRealIncome } from '@/lib/utils';

/** Pure helpers behind the Analytics page. */

export interface ShareRow {
    name: string;
    total: number;
    pct: number;
    color?: string;
}

const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(n) ? n : 0;
};

/**
 * Biggest first, at most `maxRows` rows; anything beyond is summed into one
 * final "Everything else" row. `pct` are whole numbers that add up to exactly
 * 100 (largest-remainder rounding). Zero and negative totals are dropped.
 */
export function shareRows(
    items: { name: string; total: number; color?: string }[],
    maxRows = 6,
): ShareRow[] {
    const positive = items
        .map(i => ({ ...i, total: num(i.total) }))
        .filter(i => i.total > 0)
        .sort((a, b) => b.total - a.total);
    if (positive.length === 0) return [];

    const rows: { name: string; total: number; color?: string }[] = positive.slice(0, maxRows);
    if (positive.length > maxRows) {
        const rest = positive.slice(maxRows).reduce((s, i) => s + i.total, 0);
        rows.push({ name: 'Everything else', total: rest });
    }

    const whole = rows.reduce((s, r) => s + r.total, 0);
    const exact = rows.map(r => (r.total / whole) * 100);
    const floors = exact.map(Math.floor);
    let left = 100 - floors.reduce((s, f) => s + f, 0);
    const order = exact
        .map((e, i) => ({ i, rem: e - floors[i] }))
        .sort((a, b) => b.rem - a.rem || a.i - b.i);
    for (const { i } of order) {
        if (left <= 0) break;
        floors[i] += 1;
        left -= 1;
    }

    return rows.map((r, i) => (r.color ? { ...r, pct: floors[i] } : { name: r.name, total: r.total, pct: floors[i] }));
}

export interface PeriodComparison {
    value: string;
    detail: string;
    tone: 'good' | 'caution' | 'neutral';
}

const rupees = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;

/**
 * This period against the one before it, in words. For spending a rise is
 * `caution` and a fall `good`; pass `higherIsGood` for income to flip that.
 */
export function comparePeriod(
    current: number,
    previous: number | null | undefined,
    prevName: string,
    higherIsGood = false,
): PeriodComparison {
    if (previous === null || previous === undefined || !(previous > 0)) {
        return { value: '—', detail: 'No earlier period to compare', tone: 'neutral' };
    }
    const cur = num(current);
    const pct = Math.round(((cur - previous) / previous) * 100);
    if (pct === 0) return { value: '0%', detail: `Same as ${prevName}`, tone: 'neutral' };
    const diff = rupees(cur - previous);
    if (pct < 0) {
        return {
            value: `−${Math.abs(pct)}%`,
            detail: `${diff} less than ${prevName}`,
            tone: higherIsGood ? 'caution' : 'good',
        };
    }
    return {
        value: `+${pct}%`,
        detail: `${diff} more than ${prevName}`,
        tone: higherIsGood ? 'good' : 'caution',
    };
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Spending per weekday, Monday first, plus the busiest day and the weekend's share. */
export function dayOfWeekSummary(totalsSunFirst: number[]): {
    order: { day: string; amount: number }[];
    busiest: { day: string; amount: number; full: string } | null;
    weekendPct: number;
} {
    const totals = SHORT_DAYS.map((_, i) => num(totalsSunFirst[i]));
    const monFirst = [1, 2, 3, 4, 5, 6, 0];
    const order = monFirst.map(i => ({ day: SHORT_DAYS[i], amount: totals[i] }));

    let best = -1;
    monFirst.forEach(i => { if (totals[i] > 0 && (best === -1 || totals[i] > totals[best])) best = i; });
    const busiest = best === -1 ? null : { day: SHORT_DAYS[best], amount: totals[best], full: FULL_DAYS[best] };

    const total = totals.reduce((s, t) => s + t, 0);
    const weekendPct = total > 0 ? Math.round(((totals[6] + totals[0]) / total) * 100) : 0;
    return { order, busiest, weekendPct };
}

// Insights: behavioural patterns

const PATTERN_TITLES: Record<string, string> = {
    budget_anchoring: 'Budget anchoring',
    present_bias: 'Present bias (early-month spending)',
    subscription_bloat: 'Subscription bloat',
    idle_savings_despite_debt: 'Idle savings despite debt',
};

/** Sentence-case title for a pattern; unknown names fall back to the raw name. */
export function patternTitle(name: string): string {
    return PATTERN_TITLES[name] || name;
}

/** One line of evidence for a detected pattern, or '' when there is nothing to say. */
export function patternContext(p: any): string {
    const d = p?.supporting_data || {};
    switch (p?.pattern_name) {
        case 'budget_anchoring': {
            const cats = (d.categories || []).filter((c: any) => c.near_limit_months >= 2);
            if (cats.length === 0) return '';
            const total = d.categories?.[0]?.total_months ?? cats[0].near_limit_months;
            return `You spent 85 to 100% of budget in ${cats[0].near_limit_months} out of ${total} months in ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}.`;
        }
        case 'present_bias':
            return `You spend ₹${Math.round(d.first_half_avg_daily || 0)}/day in the first half of the month vs ₹${Math.round(d.second_half_avg_daily || 0)}/day in the second half.`;
        case 'subscription_bloat':
            return `${d.recurring_subscription_count} recurring subscriptions detected over the last 3 months.`;
        case 'idle_savings_despite_debt':
            return `₹${Math.round(d.bank_balance || 0).toLocaleString('en-IN')} in savings vs ₹${Math.round(d.credit_card_outstanding || 0).toLocaleString('en-IN')} in credit card debt.`;
        default:
            return '';
    }
}

/** Splits patterns into detected and clear, keeping the original order in each. */
export function splitPatterns<T extends { detected?: boolean }>(list: T[]): { detected: T[]; clear: T[] } {
    const detected: T[] = [];
    const clear: T[] = [];
    for (const p of list || []) (p.detected ? detected : clear).push(p);
    return { detected, clear };
}

/** How many of the listed patterns were found. */
export function patternCount(list: { detected?: boolean }[]): { found: number; total: number } {
    const l = list || [];
    return { found: l.filter(p => p.detected).length, total: l.length };
}

// Year review

export interface YearReviewStats {
    count: number;
    totalExp: number;
    totalInc: number;
    saved: number;
    rate: number;
    topCategory: { name: string; amount: number } | null;
    worstMonth: { m: number; exp: number } | null;
    bestSavings: { m: number; savings: number } | null;
}

const dateOf = (t: any) => new Date(String(t.date ?? '').split('T')[0] + 'T00:00:00');

/**
 * Numbers for the Year review tab. Takes ALL transactions and the year, and
 * filters to that year itself. Returns null when the year has no transactions.
 * Spending and income use the same definitions as the rest of the app
 * (investments, goal contributions and transfers are left out).
 */
export function yearReviewStats(txs: any[], year: number): YearReviewStats | null {
    const yearTxs = (txs || []).filter(t => dateOf(t).getFullYear() === year);
    if (!yearTxs.length) return null;

    const expenses = yearTxs.filter(isNonSavingsExpense);
    const income = yearTxs.filter(isRealIncome);

    const catMap: Record<string, number> = {};
    expenses.forEach(t => {
        const k = t.category_name ?? t.category ?? 'Other';
        catMap[k] = (catMap[k] ?? 0) + parseFloat(t.amount ?? 0);
    });
    const topCatEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

    const mMap: Record<number, { exp: number; inc: number }> = {};
    for (let m = 1; m <= 12; m++) mMap[m] = { exp: 0, inc: 0 };
    yearTxs.forEach(t => {
        const m = dateOf(t).getMonth() + 1;
        const a = parseFloat(t.amount ?? 0);
        if (isNonSavingsExpense(t)) mMap[m].exp += a;
        else if (isRealIncome(t)) mMap[m].inc += a;
    });

    const worstMonth = Object.entries(mMap)
        .filter(([, v]) => v.exp > 0)
        .sort((a, b) => b[1].exp - a[1].exp)[0];
    const bestSavingsMonth = Object.entries(mMap)
        .filter(([, v]) => v.inc > v.exp && v.inc > 0)
        .sort((a, b) => (b[1].inc - b[1].exp) - (a[1].inc - a[1].exp))[0];

    const totalExp = expenses.reduce((s, t) => s + parseFloat(t.amount ?? 0), 0);
    const totalInc = income.reduce((s, t) => s + parseFloat(t.amount ?? 0), 0);
    const saved = Math.max(totalInc - totalExp, 0);
    const rate = totalInc > 0 ? Math.round((saved / totalInc) * 100) : 0;

    return {
        count: yearTxs.length, totalExp, totalInc, saved, rate,
        topCategory: topCatEntry ? { name: topCatEntry[0], amount: topCatEntry[1] } : null,
        worstMonth: worstMonth ? { m: parseInt(worstMonth[0]), exp: worstMonth[1].exp } : null,
        bestSavings: bestSavingsMonth ? { m: parseInt(bestSavingsMonth[0]), savings: bestSavingsMonth[1].inc - bestSavingsMonth[1].exp } : null,
    };
}

// ── Calendar and health helpers (Analytics round 3) ──────────────────────────

export interface CalendarMonthStats {
    totalSpent: number;
    totalIncome: number;
    incomeDays: number;
    spendingDays: number;
    dailyAvg: number;
    /** The day with the most spending; the earliest date wins a tie. Null when nothing was spent. */
    busiest: { date: string; amount: number } | null;
}

/** Month figures for the calendar tab from its per-day income and spending. */
export function calendarMonthStats(dayMap: Record<string, { income: number; expenses: number }>): CalendarMonthStats {
    let totalSpent = 0, totalIncome = 0, incomeDays = 0, spendingDays = 0;
    let busiest: { date: string; amount: number } | null = null;
    for (const [date, d] of Object.entries(dayMap)) {
        totalSpent += d.expenses;
        totalIncome += d.income;
        if (d.income > 0) incomeDays++;
        if (d.expenses > 0) spendingDays++;
        if (d.expenses > (busiest?.amount ?? 0)) busiest = { date, amount: d.expenses };
    }
    return { totalSpent, totalIncome, incomeDays, spendingDays, dailyAvg: spendingDays > 0 ? totalSpent / spendingDays : 0, busiest };
}

/** The factor with the lowest pct (first one on a tie), or null for an empty list. */
export function weakestFactor<T extends { pct: number }>(factors: T[]): T | null {
    let weakest: T | null = null;
    for (const f of factors) if (!weakest || f.pct < weakest.pct) weakest = f;
    return weakest;
}

/** A copy sorted by pct ascending. Equal pct keeps the original order; the input is untouched. */
export function sortFactorsWeakestFirst<T extends { pct: number }>(factors: T[]): T[] {
    return factors.map((f, i) => ({ f, i })).sort((a, b) => a.f.pct - b.f.pct || a.i - b.i).map(x => x.f);
}
