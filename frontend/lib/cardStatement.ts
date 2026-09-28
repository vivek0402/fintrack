// Pure helpers for the Accounts page's Pay Bill cycle picker ("Which
// cycle?"): what each row shows, which rows can be picked, which one is
// preselected and what amount it pre-fills.
//
// A card balance rolls forward: whatever is left unpaid on a statement moves
// into the next one. So only two things are ever payable on their own:
//
//   index 0  the current, still-open cycle -- "new charges" since the last
//            statement closed (not billed yet). Pre-fills that amount if > 0.
//   index 1  the latest closed statement -- the DEFAULT. Pre-fills what is
//            still owed on it: the card's statement_remaining (amount due,
//            EMI principal stripped, minus bill payments since the close),
//            the same number the card-due push alert uses.
//   index 2+ older statements -- shown for reference with what they billed
//            (cycle.statement_balance from GET /:id/cycles), greyed out and
//            not selectable: anything unpaid there is already in index 1.
//
// Every figure uses one close-day definition: a statement includes the
// transactions dated ON its close day (see backend creditCardCycles.js).
//
// statement_remaining is null for cards with no billing date, and undefined
// against an older API; the latest row then falls back to the cycle's net
// total, as before.

export interface PayCycle {
    start: string; end: string | null; label: string; total: string; is_current: boolean;
    // Additive (GET /:id/cycles): running balance as of this closed cycle's
    // statement close, and that close date. null on the current cycle.
    statement_close_date?: string | null;
    statement_balance?: number | null;
    // Additive: this window's charges (net of refunds) and bill payments.
    charges?: number;
    payments?: number;
}

// Billing Cycles page headline for one cycle, the same figure the picker
// shows: what a closed statement billed (anything unpaid from the one before
// included), or the open cycle's new charges so far. Against an older API
// without those fields it falls back to the cycle's net total, uncaptioned.
export function cycleHeadline(cycle: PayCycle): { amount: number; caption: string | null } {
    if (cycle.is_current && cycle.charges != null) return { amount: Number(cycle.charges), caption: 'not billed yet' };
    if (!cycle.is_current && cycle.statement_balance != null) {
        const billed = Number(cycle.statement_balance);
        return { amount: billed, caption: billed < 0 ? 'in credit' : 'billed' };
    }
    return { amount: Number(cycle.total), caption: null };
}

export interface StatementFields {
    statement_due_date: string | null;
    statement_amount_due?: number | null;
    statement_paid?: number | null;
    statement_remaining?: number | null;
    new_charges_since_statement?: number | null;
}

export const LATEST_CLOSED_IDX = 1;

export const OLDER_STATEMENTS_NOTE =
    "Older statements can't be paid separately: anything unpaid moved into the latest one.";

const round2 = (x: number) => Math.round(x * 100) / 100;

function hasStatementRemaining(card: StatementFields | null | undefined): card is StatementFields & { statement_remaining: number } {
    return card?.statement_remaining != null;
}

type RowKind = 'current' | 'latest' | 'older';

function rowKind(cycle: PayCycle, idx: number): RowKind {
    if (cycle.is_current) return 'current';
    return idx === LATEST_CLOSED_IDX ? 'latest' : 'older';
}

// Charges on the card since the last statement closed, net of refunds but NOT
// of bill payments: new_charges_since_statement is (outstanding - statement
// balance), i.e. all activity after the close with blocked EMI principal
// already cancelled out, and statement_paid is the bill payments inside that
// same window (both strictly after the close). Adding them back leaves only
// what the next statement will bill as new. Falls back to the cycle's net
// total against an API without those fields.
export function currentCycleNewCharges(cycle: PayCycle, card: StatementFields | null | undefined): number {
    if (card?.new_charges_since_statement != null) {
        return round2(Number(card.new_charges_since_statement) + (Number(card.statement_paid) || 0));
    }
    return Number(cycle.total) || 0;
}

// Amount to pre-fill when this cycle is picked, or null to leave the field
// as it is.
export function cycleSuggestedAmount(cycle: PayCycle, idx: number, card: StatementFields | null | undefined): string | null {
    const kind = rowKind(cycle, idx);
    if (kind === 'older') return null;
    if (kind === 'current') {
        const charges = currentCycleNewCharges(cycle, card);
        return charges > 0 ? String(charges) : null;
    }
    if (hasStatementRemaining(card)) {
        // Exact to the paisa (the API sends 2dp), never rounded to rupees:
        // paying 8,000 on an 8,000.40 statement leaves it not paid in full.
        const remaining = round2(card.statement_remaining);
        return remaining > 0 ? String(remaining) : null;
    }
    return Number(cycle.total) > 0 ? String(cycle.total) : null;
}

// Whether a row can be picked. The current cycle always can; the latest
// statement only while something is owed on it; older statements never.
export function isCycleSelectable(cycle: PayCycle, idx: number, card: StatementFields | null | undefined): boolean {
    const kind = rowKind(cycle, idx);
    if (kind === 'current') return true;
    if (kind === 'older') return false;
    return cycleSuggestedAmount(cycle, idx, card) != null;
}

// Row to preselect when the modal opens: the latest statement when something
// is owed on it, otherwise the current cycle.
export function defaultPayCycleIdx(cycles: PayCycle[], card: StatementFields | null | undefined): number {
    const latest = cycles[LATEST_CLOSED_IDX];
    if (latest && !latest.is_current && cycleSuggestedAmount(latest, LATEST_CLOSED_IDX, card) != null) return LATEST_CLOSED_IDX;
    return cycles.length ? 0 : -1;
}

export function cycleStatusLabel(
    cycle: PayCycle, idx: number, card: StatementFields | null | undefined,
    formatDate: (d: string) => string,
): string {
    const kind = rowKind(cycle, idx);
    if (kind === 'current') return 'Not billed yet';
    if (kind === 'older') return 'Carried into the next statement';
    if (hasStatementRemaining(card)) {
        const due = Number(card.statement_amount_due) || 0;
        if (due > 0) {
            if (card.statement_remaining <= 0) return 'Paid in full';
            return card.statement_due_date ? `Due ${formatDate(card.statement_due_date)}` : 'Closed';
        }
        return due < 0 ? 'Overpaid · credit' : 'Closed';
    }
    if (card?.statement_due_date) return `Due ${formatDate(card.statement_due_date)}`;
    const t = Number(cycle.total);
    if (t === 0) return 'Paid in full';
    if (t < 0) return 'Overpaid · credit';
    return 'Closed';
}

export type StatusTone = 'warn' | 'inc' | 'muted';

export interface PayCycleRow {
    amount: number | null;   // the figure on the right, in mono (null: unknown)
    caption: string;         // what that figure is
    status: string;
    statusTone: StatusTone;
    selectable: boolean;
}

// Everything one picker row -- and the modal's Cycle trigger for the selected
// row -- displays, so the two can never disagree. `fmtInr` formats a positive
// rupee amount (the page's ₹ + en-IN fmt).
export function payCycleRow(
    cycle: PayCycle, idx: number, card: StatementFields | null | undefined,
    formatDate: (d: string) => string, fmtInr: (n: number) => string,
): PayCycleRow {
    const kind = rowKind(cycle, idx);
    const status = cycleStatusLabel(cycle, idx, card, formatDate);
    const selectable = isCycleSelectable(cycle, idx, card);
    if (kind === 'current') {
        return { amount: currentCycleNewCharges(cycle, card), caption: 'new charges', status, statusTone: 'muted', selectable };
    }
    if (kind === 'older') {
        return { amount: cycle.statement_balance ?? null, caption: 'billed', status, statusTone: 'muted', selectable };
    }
    const statusTone: StatusTone = status.startsWith('Due ') ? 'warn' : status === 'Paid in full' ? 'inc' : 'muted';
    if (hasStatementRemaining(card)) {
        const due = Number(card.statement_amount_due) || 0;
        return { amount: round2(card.statement_remaining), caption: `of ${fmtInr(Math.max(0, due))} left`, status, statusTone, selectable };
    }
    return { amount: Number(cycle.total), caption: 'this cycle', status, statusTone, selectable };
}
