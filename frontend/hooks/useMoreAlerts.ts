'use client';

import { personalLoansAPI } from '@/lib/api';
import { useDashboardData, useCreditCards, useUserQuery } from '@/hooks/queries';

// Things in the More pages that need attention, shown as badges on their
// icon/row, a line at the top of the panel, and (for urgent ones) a dot on
// the More tab. Built from data the app already has: the dashboard's month
// bundle (budgets, goals) and the cards list. Only personal loans cost a
// request, and only while the panel is open.

export type AlertTone = 'bad' | 'warn' | 'good';

export interface MoreAlert {
    href: string;
    /** Short text on the icon or row, e.g. "2 over". */
    badge: string;
    /** One sentence for the top line. */
    line: string;
    tone: AlertTone;
    /** Urgent alerts also put a dot on the More tab. */
    urgent: boolean;
    /** Lower shows first in the top line. */
    rank: number;
}

const CARD_DUE_WINDOW_DAYS = 5;
const GOAL_NEAR_PCT = 0.9;

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const num = (v: unknown) => (typeof v === 'string' ? parseFloat(v) : Number(v)) || 0;

/** Whole days from today to an ISO/date string (negative = past). */
export function daysUntil(date: string, today = new Date()): number {
    const [y, m, d] = date.split('T')[0].split('-').map(Number);
    const due = new Date(y, m - 1, d);
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((due.getTime() - base.getTime()) / 86400000);
}

interface Sources {
    budgets?: any[];
    goals?: any[];
    cards?: any[];
    loans?: any[];
    today?: Date;
}

/** Pure: turn the raw lists into alerts. Exported for tests. */
export function buildMoreAlerts({ budgets = [], goals = [], cards = [], loans = [], today = new Date() }: Sources): MoreAlert[] {
    const alerts: MoreAlert[] = [];

    // Credit card bills: money still owed on the last statement, due soon or overdue.
    const dueCards = cards
        .map(c => ({ c, left: num(c.statement_remaining ?? c.statement_amount_due), days: c.statement_due_date ? daysUntil(c.statement_due_date, today) : null }))
        .filter(x => x.left > 0 && x.days !== null && x.days <= CARD_DUE_WINDOW_DAYS)
        .sort((a, b) => (a.days as number) - (b.days as number));
    if (dueCards.length) {
        const { c, left, days } = dueCards[0];
        const d = days as number;
        const name = c.card_name || c.bank_name || 'Card';
        const when = d < 0 ? 'overdue' : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due in ${d} days`;
        alerts.push({
            href: '/accounts',
            badge: d < 0 ? 'Overdue' : d === 0 ? 'Due today' : `Due ${d}d`,
            line: `${name} bill: ${inr(left)} ${when}${dueCards.length > 1 ? ` · ${dueCards.length - 1} more card${dueCards.length > 2 ? 's' : ''} due` : ''}`,
            tone: d <= 2 ? 'bad' : 'warn',
            urgent: true,
            rank: d < 0 ? 0 : 1,
        });
    }

    // Budgets over their limit this month.
    const over = budgets
        .map(b => ({ b, by: num(b.spent) - num(b.amount) }))
        .filter(x => num(x.b.amount) > 0 && x.by > 0)
        .sort((a, b) => b.by - a.by);
    if (over.length) {
        const worst = over[0];
        alerts.push({
            href: '/budgets',
            badge: `${over.length} over`,
            line: `${worst.b.category_name || 'A budget'} is ${inr(worst.by)} over budget${over.length > 1 ? ` · ${over.length - 1} more over` : ''}`,
            tone: 'bad',
            urgent: true,
            rank: 2,
        });
    }

    // Personal loans past their due date (lent or borrowed).
    const overdueLoans = loans.filter(l =>
        l.due_date && l.status !== 'repaid' && l.status !== 'written_off' && daysUntil(l.due_date, today) < 0);
    if (overdueLoans.length) {
        const l = overdueLoans[0];
        const who = l.counterparty_name || 'Someone';
        const what = l.direction === 'lent' ? `${who} owes you ${inr(num(l.outstanding_amount))}` : `You owe ${who} ${inr(num(l.outstanding_amount))}`;
        alerts.push({
            href: '/personal-loans',
            badge: `${overdueLoans.length} overdue`,
            line: `${what}, past due${overdueLoans.length > 1 ? ` · ${overdueLoans.length - 1} more overdue` : ''}`,
            tone: 'warn',
            urgent: false,
            rank: 3,
        });
    }

    // Goals nearly reached: a nudge, not a warning.
    const near = goals
        .filter(g => num(g.target_amount) > 0 && num(g.saved_amount) < num(g.target_amount) && num(g.saved_amount) >= GOAL_NEAR_PCT * num(g.target_amount))
        .sort((a, b) => num(b.saved_amount) / num(b.target_amount) - num(a.saved_amount) / num(a.target_amount));
    if (near.length) {
        const g = near[0];
        alerts.push({
            href: '/goals',
            badge: `${near.length} near`,
            line: `"${g.name}" is ${Math.floor((num(g.saved_amount) / num(g.target_amount)) * 100)}% there, ${inr(num(g.target_amount) - num(g.saved_amount))} to go`,
            tone: 'good',
            urgent: false,
            rank: 4,
        });
    }

    return alerts.sort((a, b) => a.rank - b.rank);
}

export function useMoreAlerts({ panelOpen }: { panelOpen: boolean }) {
    const now = new Date();
    // Read-only: filled by the dashboard and the startup prefetch, never fetched from here.
    const dash = useDashboardData(now.getMonth() + 1, now.getFullYear(), { enabled: false }).data;
    const cards = useCreditCards().data;
    const loans = useUserQuery('personal-loans', [],
        async () => ((await personalLoansAPI.getAll()).data.loans ?? []) as any[],
        { enabled: panelOpen }).data;

    const alerts = buildMoreAlerts({ budgets: dash?.budgets, goals: dash?.goals, cards, loans });
    const byHref: Record<string, MoreAlert> = {};
    for (const a of alerts) byHref[a.href] = a;
    return { alerts, byHref, top: alerts[0] ?? null, urgent: alerts.some(a => a.urgent) };
}
