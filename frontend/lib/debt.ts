import { fmt } from '@/lib/utils';

/** Monthly instalment for a reducing-balance loan, or null when an input is not usable. */
export function estimateEMI(principal: number, ratePct: number, months: number): number | null {
    if (!(principal > 0) || !(ratePct > 0) || !(months > 0)) return null;
    const r = ratePct / 12 / 100;
    const factor = Math.pow(1 + r, months);
    const emi = (principal * r * factor) / (factor - 1);
    return Number.isFinite(emi) ? emi : null;
}

/** "1 month", "3 months". */
export function plural(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
}

/** Share of the principal already repaid, 0 to 100. Zero when there is no principal. */
export function pctRepaid(principal: number, outstanding: number): number {
    if (!(principal > 0)) return 0;
    const pct = ((principal - outstanding) / principal) * 100;
    if (!Number.isFinite(pct)) return 0;
    return Math.min(100, Math.max(0, pct));
}

interface StrategyTotals { months: number; total_interest: number }

/** One sentence naming the cheaper strategy and how much sooner or later it finishes. */
export function payoffVerdict(
    _baseline: StrategyTotals,
    avalanche: StrategyTotals,
    snowball: StrategyTotals,
): string {
    const diff = snowball.total_interest - avalanche.total_interest;
    const rounded = Math.round(diff);
    if (rounded === 0) return 'Both strategies cost the same in interest.';

    const avalancheWins = rounded > 0;
    const winner = avalancheWins ? 'Avalanche' : 'Snowball';
    const loser = avalancheWins ? 'snowball' : 'avalanche';
    const winnerMonths = avalancheWins ? avalanche.months : snowball.months;
    const loserMonths = avalancheWins ? snowball.months : avalanche.months;
    const monthGap = loserMonths - winnerMonths;

    let sentence = `${winner} saves you ${fmt(Math.abs(diff))} more in interest than ${loser}`;
    if (monthGap > 0) sentence += `, and finishes ${plural(monthGap, 'month', 'months')} sooner`;
    else if (monthGap < 0) sentence += `, but takes ${plural(-monthGap, 'month', 'months')} longer`;
    return `${sentence}.`;
}

export interface UtilizationAggregate {
    total_outstanding: number;
    total_limit: number;
    status: string;
}

/** The status word and the rest of the sentence, so a page can colour the status on its own. */
export function utilizationParts(aggregate: UtilizationAggregate): { status: string; rest: string } {
    const raw = aggregate.status || '';
    const status = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Unknown';
    return {
        status,
        rest: `You use ${fmt(aggregate.total_outstanding)} of ${fmt(aggregate.total_limit)} in limits.`,
    };
}

export function utilizationSentence(aggregate: UtilizationAggregate): string {
    const { status, rest } = utilizationParts(aggregate);
    return `${status}. ${rest}`;
}
