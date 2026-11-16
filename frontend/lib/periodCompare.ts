/**
 * Plain-language comparison against the previous month, for the Transactions
 * summary card. `delta` is the percent change from `periodDelta`
 * (lib/transactionFilters.ts), or null when there is nothing to compare to.
 */
export function compareToPrevious(delta: number | null, prevMonthName: string): string {
    if (delta === null || !Number.isFinite(delta)) return 'No earlier month to compare';
    if (Math.abs(delta) < 0.5) return `Same as ${prevMonthName}`;
    const pct = Math.round(Math.abs(delta));
    return `${pct}% ${delta > 0 ? 'more' : 'less'} than ${prevMonthName}`;
}
