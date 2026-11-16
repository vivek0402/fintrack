/** Pure logic for the Personal loans page: grouping, ordering and the lead sentence. */

export type LoanStatus = 'outstanding' | 'partially_repaid' | 'repaid' | 'written_off';

export type LoanLike = {
    direction: 'lent' | 'borrowed';
    due_date: string | null;
    status: LoanStatus;
    outstanding_amount: number | string;
};

// principal_amount / repaid_amount / outstanding_amount all come back from the
// API as Postgres NUMERIC strings (e.g. "4000.00"), not JS numbers -- normalize
// before any arithmetic or comparison ("4000.00" + 0.01 silently concatenates).
export function num(v: number | string | null | undefined): number {
    if (v === null || v === undefined) return 0;
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return Number.isFinite(n) ? n : 0;
}

export function isSettled(loan: { status: LoanStatus }): boolean {
    return loan.status === 'repaid' || loan.status === 'written_off';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A loan is overdue once its due date is before today. Due today is not overdue. */
export function isOverdue(loan: { due_date: string | null; status: LoanStatus }, now: Date = new Date()): boolean {
    if (!loan.due_date || isSettled(loan)) return false;
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return loan.due_date.slice(0, 10) < today;
}

/** Active loans split by direction; repaid and written-off loans go to `settled`. */
export function splitLoans<T extends LoanLike>(loans: T[]): { owedToYou: T[]; youOwe: T[]; settled: T[] } {
    const owedToYou: T[] = [];
    const youOwe: T[] = [];
    const settled: T[] = [];
    for (const l of loans) {
        if (isSettled(l)) settled.push(l);
        else if (l.direction === 'lent') owedToYou.push(l);
        else youOwe.push(l);
    }
    return { owedToYou, youOwe, settled };
}

/** Overdue loans first; otherwise the original order. Returns a new array. */
export function overdueFirst<T extends { due_date: string | null; status: LoanStatus }>(loans: T[], now: Date = new Date()): T[] {
    const late: T[] = [];
    const rest: T[] = [];
    for (const l of loans) (isOverdue(l, now) ? late : rest).push(l);
    return [...late, ...rest];
}

export function sumOutstanding(loans: { outstanding_amount: number | string }[]): number {
    return loans.reduce((s, l) => s + num(l.outstanding_amount), 0);
}

/** What you are owed minus what you owe. */
export function netPosition(owedToYou: { outstanding_amount: number | string }[], youOwe: { outstanding_amount: number | string }[]): number {
    return sumOutstanding(owedToYou) - sumOutstanding(youOwe);
}

/** The sentence under the net figure. */
export function positionSentence(net: number, hasActive: boolean, overdueCount: number): string {
    let base: string;
    if (!hasActive) base = 'Nothing is open right now.';
    else if (net > 0) base = 'You are owed more than you owe.';
    else if (net < 0) base = 'You owe more than you are owed.';
    else base = 'You are even.';
    if (overdueCount <= 0) return base;
    return `${base} ${overdueCount === 1 ? 'One loan is overdue.' : `${overdueCount} loans are overdue.`}`;
}
