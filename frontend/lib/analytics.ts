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
