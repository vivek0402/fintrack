export const STATUS_LABELS: Record<string, string> = {
    surplus: 'Surplus',
    healthy: 'Healthy',
    tight: 'Tight',
    at_risk: 'At risk',
};

/** Plain-word label for a projection status; unknown statuses pass through. */
export function statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
}

function joinList(items: string[]): string {
    if (items.length <= 2) return items.join(' and ');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** One sentence naming the at-risk and tight months of the projection. */
export function riskSentence(months: { month: string; status: string }[]): string {
    const atRisk = months.filter(m => m.status === 'at_risk').map(m => m.month);
    const tight = months.filter(m => m.status === 'tight').map(m => m.month);
    if (atRisk.length === 0 && tight.length === 0) return 'Over the next 12 months. No month is tight or at risk.';
    const parts: string[] = [];
    if (atRisk.length > 0 && tight.length > 0) {
        return `Over the next 12 months. You are at risk in ${joinList(atRisk)} and tight in ${joinList(tight)}.`;
    }
    if (atRisk.length > 0) parts.push(`You are at risk in ${joinList(atRisk)}.`);
    else parts.push(`You are tight in ${joinList(tight)}.`);
    return `Over the next 12 months. ${parts[0]}`;
}
