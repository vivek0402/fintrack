/** Pure helpers behind the Goals page. */

export interface GoalItem {
    id: string;
    name: string;
    target_amount: string | number;
    saved_amount: string | number;
    deadline?: string | null;
    color?: string;
    icon?: string;
    emoji?: string;
}

export type GoalStatus = 'reached' | 'attention' | 'progress';

export interface GoalsSummary {
    totalSaved: number;
    totalTarget: number;
    toGo: number;
    pct: number;
    neededMonthly: number;
    next: { name: string; daysLeft: number; label: string } | null;
    reachedCount: number;
    count: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

const num = (v: string | number | null | undefined): number => {
    const n = typeof v === 'number' ? v : parseFloat(v ?? '');
    return Number.isFinite(n) ? n : 0;
};

/** Local date from the first 10 characters (YYYY-MM-DD); null when it does not parse. */
export function parseDeadline(deadline?: string | null): Date | null {
    if (!deadline) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline.slice(0, 10));
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days from today to the deadline (negative once passed); null with no deadline. */
export function daysLeft(deadline: string | null | undefined, today: Date): number | null {
    const d = parseDeadline(deadline);
    if (!d) return null;
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((d.getTime() - t0.getTime()) / DAY_MS);
}

/** Label like "20 Dec", with the year appended when it is not the current year. */
export function deadlineLabel(deadline: string | null | undefined, today: Date): string {
    const d = parseDeadline(deadline);
    if (!d) return '';
    const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    return d.getFullYear() === today.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

type Amounts = Pick<GoalItem, 'target_amount' | 'saved_amount' | 'deadline'>;

export function isReached(g: Pick<GoalItem, 'target_amount' | 'saved_amount'>): boolean {
    return num(g.saved_amount) >= num(g.target_amount);
}

export function goalStatus(g: Amounts, today: Date): GoalStatus {
    if (isReached(g)) return 'reached';
    const days = daysLeft(g.deadline, today);
    if (days === null) return 'progress';
    if (days < 0) return 'attention';
    const target = num(g.target_amount);
    const ratio = target > 0 ? num(g.saved_amount) / target : 0;
    return days <= 60 && ratio < 0.5 ? 'attention' : 'progress';
}

/** What to put away each month to make the deadline; null when there is nothing to plan. */
export function monthlyNeeded(g: Amounts, today: Date): number | null {
    if (isReached(g)) return null;
    const days = daysLeft(g.deadline, today);
    if (days === null || days <= 0) return null;
    const remaining = Math.max(num(g.target_amount) - num(g.saved_amount), 0);
    return remaining / Math.max(days / 30, 1);
}

export function groupGoals<T extends GoalItem>(list: T[], today: Date): { attention: T[]; progress: T[]; reached: T[] } {
    const attention: T[] = [];
    const progress: T[] = [];
    const reached: T[] = [];
    for (const g of list) {
        const s = goalStatus(g, today);
        (s === 'reached' ? reached : s === 'attention' ? attention : progress).push(g);
    }
    const days = (g: T) => daysLeft(g.deadline, today);
    attention.sort((a, b) => (days(a) ?? 0) - (days(b) ?? 0));
    progress.sort((a, b) => {
        const da = days(a), db = days(b);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
    });
    reached.sort((a, b) => num(b.target_amount) - num(a.target_amount));
    return { attention, progress, reached };
}

export function goalsSummary(list: GoalItem[], today: Date): GoalsSummary {
    let totalSaved = 0, totalTarget = 0, neededMonthly = 0, reachedCount = 0;
    let next: GoalsSummary['next'] = null;
    for (const g of list) {
        totalSaved += num(g.saved_amount);
        totalTarget += num(g.target_amount);
        neededMonthly += monthlyNeeded(g, today) ?? 0;
        if (isReached(g)) { reachedCount += 1; continue; }
        const d = daysLeft(g.deadline, today);
        if (d !== null && d >= 0 && (next === null || d < next.daysLeft)) {
            next = { name: g.name, daysLeft: d, label: deadlineLabel(g.deadline, today) };
        }
    }
    const pct = totalTarget > 0 ? Math.min(Math.round((totalSaved / totalTarget) * 100), 100) : 0;
    return {
        totalSaved,
        totalTarget,
        toGo: Math.max(totalTarget - totalSaved, 0),
        pct,
        neededMonthly,
        next,
        reachedCount,
        count: list.length,
    };
}
