// Pure helpers behind the add/edit transaction dialog: what the button says,
// when it is enabled, which few choices get a chip, and which date chip is on.

type TxType = 'income' | 'expense' | 'transfer';

function positive(amount: string | number): number | null {
    const n = typeof amount === 'number' ? amount : parseFloat(amount);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** The submit button's text: it says what it will do. `format` renders an amount in the user's currency. */
export function ctaLabel({ editing, type, amount, format }: {
    editing: boolean;
    type: TxType;
    amount: string | number;
    format: (n: number) => string;
}): string {
    if (editing) return 'Save changes';
    const n = positive(amount);
    if (type === 'transfer') return n === null ? 'Move money' : `Move ${format(n)}`;
    const noun = type === 'income' ? 'income' : 'expense';
    return n === null ? `Add ${noun}` : `Add ${format(n)} ${noun}`;
}

/**
 * The button is enabled once there is a positive amount and a description. An
 * existing transaction that already has both stays enabled; clearing either
 * disables it, as for a new entry.
 */
export function canSubmit({ amount, description }: {
    amount: string | number;
    description: string;
    editing?: boolean;
}): boolean {
    return positive(amount) !== null && description.trim().length > 0;
}

/**
 * The few items that get a chip: the `n` most used (usage desc, ties keep their
 * original order), plus the chosen one as an extra when it is not among them.
 * Never repeats an item.
 */
export function topChoices<T extends { key: string }>(
    items: T[],
    usageByKey: Record<string, number>,
    n: number,
    chosenKey?: string | null,
): T[] {
    const seen = new Set<string>();
    const unique = items.filter(i => (seen.has(i.key) ? false : (seen.add(i.key), true)));
    const ranked = unique
        .map((item, index) => ({ item, index, used: Number(usageByKey[item.key]) || 0 }))
        .sort((a, b) => b.used - a.used || a.index - b.index)
        .map(r => r.item);
    const top = ranked.slice(0, Math.max(0, n));
    if (chosenKey && !top.some(i => i.key === chosenKey)) {
        const chosen = unique.find(i => i.key === chosenKey);
        if (chosen) top.push(chosen);
    }
    return top;
}

/** The day before `today` (both YYYY-MM-DD), with no time-zone drift. */
export function yesterdayOf(today: string): string {
    const [y, m, d] = today.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 1, d - 1));
    return prev.toISOString().slice(0, 10);
}

/** Which date chip is on: today, yesterday, or some other day (shown as its own chip). */
export function dateChoice(date: string, today: string): 'today' | 'yesterday' | 'other' {
    if (date === today) return 'today';
    if (date === yesterdayOf(today)) return 'yesterday';
    return 'other';
}

/** An amount from the server ("450.00") as you would type it: whole rupees lose the ".00", paise stay ("450.50"). */
export function trimAmount(value: number | string): string {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (!Number.isFinite(n)) return String(value ?? '');
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
