/**
 * Pure maths for the bulk-operations split dialog: how much of the original
 * amount the lines cover, whether the split can be saved, and the one
 * sentence that tells the user where they stand.
 */

export type SplitSentenceKey = 'match' | 'short' | 'over' | 'incomplete';

export interface SplitSummary {
    /** Sum of the line amounts (blank or invalid lines count as 0). */
    sum: number;
    /** How much of the total is still unassigned, never negative. */
    remaining: number;
    /** How far past the total the lines run, never negative. */
    over: number;
    /** True when there are at least two lines, each positive, adding up to the total within 0.01. */
    valid: boolean;
    sentenceKey: SplitSentenceKey;
}

const TOLERANCE = 0.01;

export function splitSummary(lines: { amount: string }[], total: number): SplitSummary {
    const amounts = lines.map(l => parseFloat(l.amount));
    const sum = amounts.reduce((s, a) => s + (a || 0), 0);
    const diff = sum - total;
    const matches = Math.abs(diff) < TOLERANCE;
    const valid = lines.length >= 2 && matches && amounts.every(a => a > 0);
    let sentenceKey: SplitSentenceKey;
    if (valid) sentenceKey = 'match';
    else if (matches) sentenceKey = 'incomplete';
    else sentenceKey = diff > 0 ? 'over' : 'short';
    return {
        sum,
        remaining: Math.max(0, total - sum),
        over: Math.max(0, sum - total),
        valid,
        sentenceKey,
    };
}

/** The status sentence under the split lines. `format` renders an amount, for example as currency. */
export function formatSplitSentence(summary: SplitSummary, total: number, format: (n: number) => string): string {
    switch (summary.sentenceKey) {
        case 'match': return `Lines add up to ${format(summary.sum)} of ${format(total)}. They match.`;
        case 'short': return `${format(summary.remaining)} left to assign.`;
        case 'over': return `${format(summary.over)} over the total.`;
        case 'incomplete': return 'Every line needs an amount.';
    }
}
