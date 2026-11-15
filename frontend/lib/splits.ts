/** Pure helpers behind the Splits tab. */

export interface SplitParticipant {
    name: string;
    share: string | number;
    settled: boolean;
}

export interface SplitItem {
    id: string;
    description: string;
    total_amount: string | number;
    your_share: string | number;
    date: string;
    participants: SplitParticipant[];
}

export interface Debtor {
    name: string;
    amount: number;
    count: number;
}

const num = (v: string | number | null | undefined): number => {
    const n = typeof v === 'number' ? v : parseFloat(v ?? '');
    return Number.isFinite(n) ? n : 0;
};

/** Every participant has paid. An empty list counts as settled. */
export function isSettled(split: Pick<SplitItem, 'participants'>): boolean {
    return (split.participants ?? []).every(p => p.settled);
}

/** What is still owed to you on this split. */
export function owedOn(split: Pick<SplitItem, 'participants'>): number {
    return (split.participants ?? []).reduce((sum, p) => (p.settled ? sum : sum + num(p.share)), 0);
}

/** Time value of a date for sorting; missing or unparseable dates are null. */
const timeOf = (date?: string | null): number | null => {
    if (!date) return null;
    const t = Date.parse(date);
    return Number.isNaN(t) ? null : t;
};

/** Newest first; splits with no usable date go last. */
const byDateDesc = <T extends Pick<SplitItem, 'date'>>(a: T, b: T): number => {
    const ta = timeOf(a.date), tb = timeOf(b.date);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
};

export function groupSplits<T extends SplitItem>(list: T[]): { open: T[]; settled: T[] } {
    const open: T[] = [];
    const settled: T[] = [];
    for (const s of list) (isSettled(s) ? settled : open).push(s);
    open.sort(byDateDesc);
    settled.sort(byDateDesc);
    return { open, settled };
}

/** One entry per person across the open splits' unsettled shares, biggest debt first. */
export function whoOwes(openSplits: SplitItem[]): Debtor[] {
    const byName = new Map<string, Debtor>();
    for (const s of openSplits) {
        const seenInThisSplit = new Set<string>();
        for (const p of s.participants ?? []) {
            if (p.settled) continue;
            const display = (p.name ?? '').trim();
            if (!display) continue;
            const key = display.toLowerCase();
            let entry = byName.get(key);
            if (!entry) { entry = { name: display, amount: 0, count: 0 }; byName.set(key, entry); }
            entry.amount += num(p.share);
            if (!seenInThisSplit.has(key)) { entry.count += 1; seenInThisSplit.add(key); }
        }
    }
    return [...byName.values()].sort((a, b) => b.amount - a.amount);
}

export function splitsSummary(list: SplitItem[]): {
    owed: number; people: number; openCount: number; settledCount: number;
    collected: number; yourShareOpen: number; oldestOpenDate: string | null;
} {
    const { open, settled } = groupSplits(list);
    let collected = 0;
    for (const s of list) for (const p of s.participants ?? []) if (p.settled) collected += num(p.share);
    let oldest: string | null = null;
    let oldestT = Infinity;
    for (const s of open) {
        const t = timeOf(s.date);
        if (t !== null && t < oldestT) { oldestT = t; oldest = s.date; }
    }
    return {
        owed: open.reduce((sum, s) => sum + owedOn(s), 0),
        people: whoOwes(open).length,
        openCount: open.length,
        settledCount: settled.length,
        collected,
        yourShareOpen: open.reduce((sum, s) => sum + num(s.your_share), 0),
        oldestOpenDate: oldest,
    };
}
