/** Pure helpers behind the One-Time tab. */

export interface OneTimeItem {
    id: string;
    description: string;
    amount: number | string;
    category?: string;
    date?: string | null;
    payment_method?: string;
    notes?: string;
}

export interface OneTimeEntry {
    id: string;
    title: string;
    category: string;
    start_date?: string | null;
    end_date?: string | null;
    bank_account_name?: string | null;
    total_amount: number | string;
    item_count: number;
    items: OneTimeItem[];
    created_at?: string;
}

const num = (v: string | number | null | undefined): number => {
    const n = typeof v === 'number' ? v : parseFloat(v ?? '');
    return Number.isFinite(n) ? n : 0;
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The YYYY-MM-DD part of a date or ISO string, or null when there is none. */
const datePart = (s?: string | null): string | null => {
    const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

const parts = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return { y, m, d };
};

/** When the entry happened: its start date, else its earliest item, else when it was created. */
export function entryDate(e: Pick<OneTimeEntry, 'start_date' | 'items' | 'created_at'>): string | null {
    const start = datePart(e.start_date);
    if (start) return start;
    const itemDates = (e.items ?? []).map(i => datePart(i.date)).filter((d): d is string => !!d).sort();
    if (itemDates.length) return itemDates[0];
    return datePart(e.created_at);
}

export function entryYear(e: Pick<OneTimeEntry, 'start_date' | 'items' | 'created_at'>, fallbackYear: number): number {
    const d = entryDate(e);
    return d ? parts(d).y : fallbackYear;
}

/** Newest first; entries without a date go last. */
const byNewest = (a: string | null, b: string | null): number => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? 1 : -1;
};

export function groupByYear<E extends OneTimeEntry>(entries: E[], fallbackYear: number): { year: number; entries: E[]; total: number }[] {
    const map = new Map<number, E[]>();
    for (const e of entries) {
        const y = entryYear(e, fallbackYear);
        if (!map.has(y)) map.set(y, []);
        map.get(y)!.push(e);
    }
    return [...map.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([year, list]) => ({
            year,
            entries: [...list].sort((a, b) => byNewest(entryDate(a), entryDate(b))),
            total: list.reduce((s, e) => s + num(e.total_amount), 0),
        }));
}

export interface OneTimeSummary {
    yearTotal: number;
    yearCount: number;
    biggest: { title: string; amount: number } | null;
    latest: { title: string; amount: number } | null;
    allTimeTotal: number;
    allTimeCount: number;
}

export function oneTimeSummary(entries: OneTimeEntry[], year: number): OneTimeSummary {
    const inYear = entries.filter(e => entryYear(e, year) === year);
    let biggest: OneTimeSummary['biggest'] = null;
    for (const e of inYear) {
        const amount = num(e.total_amount);
        if (!biggest || amount > biggest.amount) biggest = { title: e.title, amount };
    }
    const newest = [...inYear].sort((a, b) => byNewest(entryDate(a), entryDate(b)))[0];
    return {
        yearTotal: inYear.reduce((s, e) => s + num(e.total_amount), 0),
        yearCount: inYear.length,
        biggest,
        latest: newest ? { title: newest.title, amount: num(newest.total_amount) } : null,
        allTimeTotal: entries.reduce((s, e) => s + num(e.total_amount), 0),
        allTimeCount: entries.length,
    };
}

/** Spend by entry category, biggest first, as a share of the sum. */
export function byCategory(entries: OneTimeEntry[]): { category: string; amount: number; pct: number }[] {
    const totals = new Map<string, number>();
    for (const e of entries) totals.set(e.category, (totals.get(e.category) ?? 0) + num(e.total_amount));
    const rows = [...totals.entries()].filter(([, amount]) => amount > 0);
    const sum = rows.reduce((s, [, amount]) => s + amount, 0);
    return rows
        .sort((a, b) => b[1] - a[1])
        .map(([category, amount]) => ({ category, amount, pct: sum > 0 ? (amount / sum) * 100 : 0 }));
}

/** Items grouped by day, newest day first; items keep their order within a day. */
export function itemsByDay<I extends OneTimeItem>(items: I[], todayYear: number): { date: string; label: string; total: number; items: I[] }[] {
    const days = new Map<string, I[]>();
    const undated: I[] = [];
    for (const item of items) {
        const d = datePart(item.date);
        if (!d) { undated.push(item); continue; }
        if (!days.has(d)) days.set(d, []);
        days.get(d)!.push(item);
    }
    const total = (list: I[]) => list.reduce((s, i) => s + num(i.amount), 0);
    const out = [...days.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
        .map(([date, list]) => {
            const { y, m, d } = parts(date);
            const dow = SHORT_DAYS[new Date(y, m - 1, d).getDay()];
            const label = `${dow} ${d} ${SHORT_MONTHS[m - 1]}${y !== todayYear ? ` ${y}` : ''}`;
            return { date, label, total: total(list), items: list };
        });
    if (undated.length) out.push({ date: '', label: 'No date', total: total(undated), items: undated });
    return out;
}

/** "14 Nov", "12 to 16 Nov", "28 Oct to 2 Nov"; the year is added when it is not this year. */
export function dateRangeLabel(start: string | null | undefined, end: string | null | undefined, todayYear: number): string {
    const s = datePart(start);
    if (!s) return '';
    const a = parts(s);
    const e = datePart(end);
    const b = e && e !== s ? parts(e) : null;
    const yearOf = b ? b.y : a.y;
    const suffix = yearOf !== todayYear ? ` ${yearOf}` : '';
    if (!b) return `${a.d} ${SHORT_MONTHS[a.m - 1]}${suffix}`;
    if (a.y === b.y && a.m === b.m) return `${a.d} to ${b.d} ${SHORT_MONTHS[b.m - 1]}${suffix}`;
    if (a.y === b.y) return `${a.d} ${SHORT_MONTHS[a.m - 1]} to ${b.d} ${SHORT_MONTHS[b.m - 1]}${suffix}`;
    return `${a.d} ${SHORT_MONTHS[a.m - 1]} ${a.y} to ${b.d} ${SHORT_MONTHS[b.m - 1]} ${b.y}`;
}
