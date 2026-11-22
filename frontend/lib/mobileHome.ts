import { toAmount, type Budget, type Transaction } from '@/types/finance';

/** "Today", "Yesterday" or "12 Nov" for a transaction date ('YYYY-MM-DD' or an ISO timestamp). */
export function dayLabel(dateStr: string, now: Date = new Date()): string {
    const today     = now.toISOString().split('T')[0];
    const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
    const d = (dateStr || '').split('T')[0];
    if (d === today)     return 'Today';
    if (d === yesterday) return 'Yesterday';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Percent of the limit used; 0 when there is no limit. */
export function budgetPct(b: Pick<Budget, 'amount' | 'spent'>): number {
    const limit = toAmount(b.amount);
    return limit > 0 ? (toAmount(b.spent) / limit) * 100 : 0;
}

/**
 * Budgets, most used first: over the limit (biggest overrun first), then
 * exactly used up, then by percent used. Shared by the desktop Spending card
 * and the phone's budget rings so the two can't order them differently.
 */
export function sortBudgetsByUse<T extends Pick<Budget, 'amount' | 'spent'>>(budgets: readonly T[]): T[] {
    const group = (b: T) => {
        const spent = toAmount(b.spent), limit = toAmount(b.amount);
        return limit > 0 && spent > limit ? 0 : limit > 0 && spent >= limit ? 1 : 2;
    };
    return [...budgets].sort((a, b) => {
        const ga = group(a), gb = group(b);
        if (ga !== gb) return ga - gb;
        if (ga === 0) return (toAmount(b.spent) - toAmount(b.amount)) - (toAmount(a.spent) - toAmount(a.amount));
        return budgetPct(b) - budgetPct(a);
    });
}

export interface DayGroup {
    date: string;
    label: string;
    /** Money out that day (expenses only; income and transfers don't count). */
    spent: number;
    items: Transaction[];
}

/**
 * The newest `limit` transactions, grouped by day in the order given (the
 * dashboard bundle arrives newest first).
 */
export function groupByDay(transactions: readonly Transaction[], limit: number, now: Date = new Date()): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const tx of transactions.slice(0, limit)) {
        const date = (tx.date || '').split('T')[0];
        let g = groups[groups.length - 1];
        if (!g || g.date !== date) {
            g = { date, label: dayLabel(date, now), spent: 0, items: [] };
            groups.push(g);
        }
        g.items.push(tx);
        if (tx.type === 'expense') g.spent += toAmount(tx.amount);
    }
    return groups;
}

/** What can be spent each remaining day; null when the month is over. */
export function perDayAllowance(remaining: number, daysLeft: number): number | null {
    if (daysLeft <= 0) return null;
    return Math.max(0, remaining) / daysLeft;
}
