import { fmt } from '@/lib/utils';

/** Pure helpers for the Net worth page and the dashboard cards that summarise it. */

export interface SnapshotLike {
    snapshot_date: string;
    net_worth: number;
}

export interface AllocationLike {
    deviation: number;
}

/** Change between the last two snapshots. Null under two snapshots. pct is relative to abs(previous) and 0 when previous is 0. */
export function netWorthChange(history: SnapshotLike[]): { change: number; pct: number; prevLabelDate: string } | null {
    if (history.length < 2) return null;
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    const change = last.net_worth - prev.net_worth;
    const pct = prev.net_worth !== 0 ? (change / Math.abs(prev.net_worth)) * 100 : 0;
    return { change, pct, prevLabelDate: prev.snapshot_date };
}

/** Biggest amount first. Does not mutate, and keeps input order for ties. */
export function sortByAmountDesc<T extends { amount: number }>(items: T[]): T[] {
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => b.item.amount - a.item.amount || a.index - b.index)
        .map(x => x.item);
}

/** The allocation with the largest absolute deviation. First on ties, null when empty or every deviation is 0. */
export function furthestFromTarget<T extends AllocationLike>(allocations: T[]): T | null {
    let best: T | null = null;
    for (const a of allocations) {
        if (Math.abs(a.deviation) === 0) continue;
        if (!best || Math.abs(a.deviation) > Math.abs(best.deviation)) best = a;
    }
    return best;
}

/** Plain-words deviation. Flagged only when strictly beyond the threshold. */
export function deviationLabel(deviation: number, threshold = 5): { text: string; flagged: boolean } {
    const abs = Math.abs(deviation);
    if (abs < 0.5) return { text: 'On target', flagged: false };
    const n = Math.round(abs);
    return {
        text: `${n} ${n === 1 ? 'point' : 'points'} ${deviation > 0 ? 'over' : 'under'} target`,
        flagged: abs > threshold,
    };
}

export type TrendKey = 'accelerating' | 'decelerating' | 'steady' | 'insufficient_data';

export function trendPhrase(trend: TrendKey): string {
    if (trend === 'accelerating') return 'accelerating';
    if (trend === 'decelerating') return 'slowing down';
    return 'steady';
}

/** "+₹58,400" or "−₹1,200" with a real minus sign. */
export function fmtSigned(n: number): string {
    return (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
}

/** "+2.4%" or "−0.8%" with one decimal and a real minus sign. */
export function fmtPctSigned(n: number): string {
    return (n >= 0 ? '+' : '−') + Math.abs(Number(n)).toFixed(1) + '%';
}

/** The dashboard card's one line under the net worth figure. Null under two snapshots. */
export function monthChangeSentence(history: SnapshotLike[]): string | null {
    const c = netWorthChange(history);
    if (!c) return null;
    if (Math.round(c.change) === 0) return 'No change this month';
    return `${c.change > 0 ? 'Up' : 'Down'} ${fmt(Math.abs(c.change))} this month`;
}

/** The dashboard velocity card's sentence under the figure. */
export function velocitySentence(pctPerMonth: number, trend: TrendKey): string {
    return `${fmtPctSigned(pctPerMonth)} a month, and growth is ${trendPhrase(trend)}`;
}
