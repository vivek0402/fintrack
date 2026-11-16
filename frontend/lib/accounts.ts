// Pure helpers for the Accounts page: card utilisation, what a card statement
// still owes, the next bill due across all cards, and card ordering.
// Plain data in, plain data out; date-dependent ones take `today`.

export interface AccountCard {
    bank_name: string;
    card_name: string;
    credit_limit: number | string | null;
    current_outstanding_balance: number | string | null;
    /** YYYY-MM-DD or an ISO timestamp. */
    statement_due_date?: string | null;
    statement_balance?: number | string | null;
    statement_amount_due?: number | string | null;
    statement_remaining?: number | string | null;
    billing_date?: number | null;
}

export interface NextCardBill { cardName: string; amount: number; dueDate: string; days: number }

// Non-numeric amounts count as 0.
const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? n : 0;
};
const isNum = (v: unknown): boolean => v != null && v !== '' && Number.isFinite(Number(v));

/** Share of a card's limit that is used, 0 to 100, rounded. 0 when the card has no limit. */
export function cardUsedPct(card: Pick<AccountCard, 'credit_limit' | 'current_outstanding_balance'>): number {
    const limit = num(card.credit_limit);
    if (limit <= 0) return 0;
    const pct = Math.round((num(card.current_outstanding_balance) / limit) * 100);
    return Math.min(100, Math.max(0, pct));
}

/** Share of all limits that is used, rounded. null when no card has a limit. */
export function totalUsedPct(cards: Pick<AccountCard, 'credit_limit' | 'current_outstanding_balance'>[]): number | null {
    const limits = cards.reduce((s, c) => s + Math.max(0, num(c.credit_limit)), 0);
    if (limits <= 0) return null;
    const owed = cards.reduce((s, c) => s + num(c.current_outstanding_balance), 0);
    return Math.round((owed / limits) * 100);
}

/** What is still owed on the last statement: remaining, else amount due, else the balance. null when none is a number. */
export function statementAmountOwed(card: Pick<AccountCard, 'statement_remaining' | 'statement_amount_due' | 'statement_balance'>): number | null {
    for (const v of [card.statement_remaining, card.statement_amount_due, card.statement_balance]) {
        if (isNum(v)) return Number(v);
    }
    return null;
}

// Whole days from `today` to a YYYY-MM-DD (or ISO) date, by calendar day.
function daysBetween(dateStr: string, today: Date): number {
    const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
    const due = Date.UTC(y, (m || 1) - 1, d || 1);
    const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((due - now) / 86400000);
}

const dueKey = (c: Pick<AccountCard, 'statement_due_date'>) => (c.statement_due_date ? c.statement_due_date.split('T')[0] : null);

/** The card bill due soonest among cards that still owe something. Overdue counts. */
export function nextCardBill(cards: AccountCard[], today: Date): NextCardBill | null {
    let best: { card: AccountCard; key: string; amount: number } | null = null;
    for (const card of cards) {
        const key = dueKey(card);
        const amount = statementAmountOwed(card);
        if (!key || amount == null || !(amount > 0)) continue;
        if (!best || key < best.key) best = { card, key, amount };
    }
    if (!best) return null;
    return {
        cardName: `${best.card.bank_name} ${best.card.card_name}`,
        amount: best.amount,
        dueDate: best.key,
        days: daysBetween(best.key, today),
    };
}

/** Cards with a statement due date first, soonest first; then the rest in their original order. */
export function sortCardsByDue<T extends Pick<AccountCard, 'statement_due_date'>>(cards: T[], today: Date): T[] {
    void today;
    const withDue = cards.map((card, i) => ({ card, i, key: dueKey(card) }));
    const dated = withDue.filter(x => x.key).sort((a, b) => (a.key! < b.key! ? -1 : a.key! > b.key! ? 1 : a.i - b.i));
    const rest = withDue.filter(x => !x.key);
    return [...dated, ...rest].map(x => x.card);
}

/** Days from today to a statement due date (negative when overdue). */
export function daysUntilDue(dateStr: string, today: Date): number {
    return daysBetween(dateStr, today);
}
