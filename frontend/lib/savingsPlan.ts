// Pure maths behind the Savings planner page, kept apart so it can be tested.

export const roundUp10 = (n: number) => Math.ceil(n / 10) * 10;

/** The month a goal is reached at a steady monthly amount, or '' when it cannot be worked out. */
export function projectedDate(remaining: number, monthly: number, now: Date = new Date()): string {
    if (monthly <= 0 || remaining <= 0) return '';
    const months = Math.ceil(remaining / monthly);
    const d = new Date(now.getTime());
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/**
 * Whether the monthly amount reaches the goal by its deadline.
 * null when there is no deadline or no monthly amount.
 */
export function goalTrack(
    goal: { saved_amount: any; target_amount: any; deadline?: string | null },
    monthly: number,
    now: Date = new Date(),
): boolean | null {
    if (!goal.deadline || !(monthly > 0)) return null;
    const remaining = Math.max(parseFloat(goal.target_amount) - parseFloat(goal.saved_amount), 0);
    const days = Math.ceil((new Date(goal.deadline + 'T00:00:00').getTime() - now.getTime()) / 86400000);
    return days > 0 && Math.ceil(remaining / monthly) <= Math.ceil(days / 30);
}

/** Goals that are off track first; order is otherwise unchanged. Does not mutate the input. */
export function sortGoalsNeedingMore<T>(goals: T[], trackFn: (goal: T) => boolean | null): T[] {
    const off: T[] = [];
    const rest: T[] = [];
    goals.forEach(g => (trackFn(g) === false ? off : rest).push(g));
    return [...off, ...rest];
}

/** Consecutive months, newest first, where income beat spending. */
export function savingStreak(trends: { year: number | string; month: number | string; type: string; total: any }[]): number {
    const monthMap: Record<string, { inc: number; exp: number }> = {};
    trends.forEach(row => {
        const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
        if (!monthMap[key]) monthMap[key] = { inc: 0, exp: 0 };
        if (row.type === 'income') monthMap[key].inc += parseFloat(row.total);
        else monthMap[key].exp += parseFloat(row.total);
    });
    const sorted = Object.keys(monthMap).sort();
    let count = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
        const { inc, exp } = monthMap[sorted[i]];
        if (inc > exp) count++; else break;
    }
    return count;
}

/** What rounding every expense of the last 30 days up to the next 10 would have set aside. */
export function roundUpTotal(transactions: { type: string; date?: string; amount: any }[], now: number | Date = Date.now()): number {
    const nowMs = typeof now === 'number' ? now : now.getTime();
    const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
    return transactions
        .filter(tx => tx.type === 'expense' && new Date((tx.date || '').split('T')[0] + 'T00:00:00').getTime() >= cutoff)
        .reduce((sum, tx) => { const a = parseFloat(tx.amount); return sum + (roundUp10(a) - a); }, 0);
}
