// Pure helpers for the Accounts page's Pay Bill modal: which cycle to
// preselect, what amount to pre-fill, and the cycle status label.
//
// Cycle totals from GET /:id/cycles are "charges minus payments dated inside
// that cycle". Most people pay last month's bill during the next cycle, so
// the most recent closed cycle's total is roughly "this month's charges minus
// last month's payment" -- not what's owed. For that cycle (index 1; index 0
// is always the still-open current one) the card's own statement_remaining
// from GET /api/credit-cards is used instead: the amount due on the last
// statement (EMI principal stripped) minus bill payments recorded since it
// closed, i.e. the same number the card-due push alert uses.
//
// statement_remaining is null for cards with no billing date, and undefined
// against an older API; both fall back to the cycle-total behaviour.

export interface PayCycle { start: string; end: string | null; label: string; total: string; is_current: boolean; }

export interface StatementFields {
    statement_due_date: string | null;
    statement_amount_due?: number | null;
    statement_remaining?: number | null;
}

export const LATEST_CLOSED_IDX = 1;

function hasStatementRemaining(card: StatementFields | null | undefined): card is StatementFields & { statement_remaining: number } {
    return card?.statement_remaining != null;
}

// Amount to pre-fill when this cycle is picked, or null to leave the field
// as it is.
export function cycleSuggestedAmount(cycle: PayCycle, idx: number, card: StatementFields | null | undefined): string | null {
    if (idx === LATEST_CLOSED_IDX && !cycle.is_current && hasStatementRemaining(card)) {
        return card.statement_remaining > 0 ? String(card.statement_remaining) : null;
    }
    return Number(cycle.total) > 0 ? String(cycle.total) : null;
}

// Whether a cycle can be picked in the cycle sheet. Closed cycles with
// nothing to pay are disabled; for the latest statement that's decided by
// what's still owed, not the cycle's net total.
export function isCycleSelectable(cycle: PayCycle, idx: number, card: StatementFields | null | undefined): boolean {
    if (cycle.is_current) return true;
    return cycleSuggestedAmount(cycle, idx, card) != null;
}

// Cycle to preselect when the modal opens: the most recent closed cycle when
// something is owed on it, otherwise the current one.
export function defaultPayCycleIdx(cycles: PayCycle[], card: StatementFields | null | undefined): number {
    const latest = cycles[LATEST_CLOSED_IDX];
    if (latest && cycleSuggestedAmount(latest, LATEST_CLOSED_IDX, card) != null) return LATEST_CLOSED_IDX;
    return cycles.length ? 0 : -1;
}

export function cycleStatusLabel(
    cycle: PayCycle, idx: number, card: StatementFields | null | undefined,
    formatDate: (d: string) => string,
): string {
    if (cycle.is_current) return 'Not yet billed';
    if (idx === LATEST_CLOSED_IDX && hasStatementRemaining(card)) {
        const due = Number(card.statement_amount_due) || 0;
        if (due > 0) {
            if (card.statement_remaining <= 0) return 'Paid in full';
            return card.statement_due_date ? `Due ${formatDate(card.statement_due_date)}` : 'Closed';
        }
        return due < 0 ? 'Overpaid · credit' : 'Closed';
    }
    if (idx === LATEST_CLOSED_IDX && card?.statement_due_date) return `Due ${formatDate(card.statement_due_date)}`;
    const t = Number(cycle.total);
    if (t === 0) return 'Paid in full';
    if (t < 0) return 'Overpaid · credit';
    return 'Closed';
}
