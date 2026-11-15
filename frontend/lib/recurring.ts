import type { Tone } from '@/components/ui/CardParts';

/** Pure helpers behind the Recurring tab. Every date-dependent one takes `today` so it is testable. */

export interface RecurringItem {
    id: string;
    type: 'income' | 'expense' | string;
    amount: string | number;
    description: string;
    frequency: 'daily' | 'weekly' | 'monthly' | string;
    day_of_month?: number | null;
    category_name?: string | null;
    category_id?: string | null;
    is_active: boolean;
    next_due_date?: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

const amountOf = (r: Pick<RecurringItem, 'amount'>): number => {
    const n = typeof r.amount === 'number' ? r.amount : parseFloat(r.amount);
    return Number.isFinite(n) ? n : 0;
};

/** The amount as a per-month figure. */
export function monthlyAmount(r: Pick<RecurringItem, 'amount' | 'frequency'>): number {
    const a = amountOf(r);
    if (r.frequency === 'daily') return a * 365 / 12;
    if (r.frequency === 'weekly') return a * 52 / 12;
    return a;
}

function parseLocalDate(dateStr?: string | null): Date | null {
    if (!dateStr) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const date = new Date(y, mo - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
    return date;
}

/** Whole days from `today` (local midnight) to the date part of `dateStr`; null when missing or unparseable. */
export function daysUntil(dateStr: string | null | undefined, today: Date): number | null {
    const target = parseLocalDate(dateStr);
    if (!target) return null;
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((target.getTime() - start.getTime()) / DAY_MS);
}

function shortDate(date: Date, today: Date): string {
    const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
    return date.getFullYear() !== today.getFullYear() ? `${base} ${date.getFullYear()}` : base;
}

export function dueLabel(days: number | null, dateStr: string | null | undefined, today: Date): string {
    if (days === null) return 'No date set';
    if (days < 0) return `Overdue by ${-days} ${days === -1 ? 'day' : 'days'}`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days === 2) return 'Due in 2 days';
    const date = parseLocalDate(dateStr);
    return date ? `Due ${shortDate(date, today)}` : 'No date set';
}

export function dueTone(days: number | null): Tone {
    if (days === null) return 'neutral';
    if (days < 0) return 'bad';
    if (days <= 2) return 'caution';
    return 'neutral';
}

export function groupRecurring<T extends RecurringItem>(list: T[], today: Date): { dueSoon: T[]; later: T[]; paused: T[] } {
    const dueSoon: { r: T; d: number }[] = [];
    const later: { r: T; d: number | null }[] = [];
    const paused: T[] = [];
    for (const r of list) {
        if (!r.is_active) { paused.push(r); continue; }
        const d = daysUntil(r.next_due_date, today);
        if (d !== null && d <= 7) dueSoon.push({ r, d });
        else later.push({ r, d });
    }
    dueSoon.sort((a, b) => a.d - b.d);
    later.sort((a, b) => (a.d === null ? 1 : 0) - (b.d === null ? 1 : 0) || (a.d ?? 0) - (b.d ?? 0));
    return { dueSoon: dueSoon.map(x => x.r), later: later.map(x => x.r), paused };
}

export function recurringSummary<T extends RecurringItem>(list: T[], today: Date) {
    const active = list.filter(r => r.is_active);
    let outMonthly = 0, inMonthly = 0, inCount = 0;
    for (const r of active) {
        if (r.type === 'income') { inMonthly += monthlyAmount(r); inCount += 1; }
        else if (r.type === 'expense') outMonthly += monthlyAmount(r);
    }
    const { dueSoon } = groupRecurring(active, today);
    const dueExpenses = dueSoon.filter(r => r.type === 'expense');
    const dueSoonTotal = dueExpenses.reduce((s, r) => s + amountOf(r), 0);

    let next: { label: string; description: string } | null = null;
    let best: number | null = null;
    for (const r of active) {
        const d = daysUntil(r.next_due_date, today);
        if (d !== null && (best === null || d < best)) {
            best = d;
            next = { label: shortDate(parseLocalDate(r.next_due_date)!, today), description: r.description };
        }
    }
    return { outMonthly, inMonthly, inCount, left: inMonthly - outMonthly, dueSoonTotal, dueSoonCount: dueExpenses.length, next };
}
