'use client';

import { useEffect, useMemo, useState } from 'react';
import { recurringAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { toAmount, type Goal } from '@/types/finance';

const SS_KEY = 'fintrack-coach-dismissed';
const fmt = (n: number) => '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');

export interface CoachAlert {
  id: string;
  severity: 'danger' | 'warning' | 'info';
  message: string;
  sub?: string;
}

export interface CoachAlertsProps {
  summary: { total_income: number | string; total_expenses: number | string } | null;
  budgets: any[];
  goals: Goal[];
  loading: boolean;
}

function buildAlerts(
  summary: CoachAlertsProps['summary'],
  budgets: any[],
  goals: Goal[],
  recurring: any[],
): CoachAlert[] {
  if (!summary) return [];

  const income   = Number(summary.total_income);
  const expenses = Number(summary.total_expenses);
  const today      = new Date();
  const daysElapsed = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft    = daysInMonth - daysElapsed;
  const all: CoachAlert[] = [];

  // a) Budget breach — any category > 85% spent
  for (const b of budgets) {
    const budgetAmt = parseFloat(b.amount);
    if (budgetAmt <= 0) continue;
    const pct = (parseFloat(b.spent) / budgetAmt) * 100;
    if (pct >= 85) {
      all.push({
        id: `budget-${b.category_id ?? b.id}`,
        severity: pct >= 100 ? 'danger' : 'warning',
        message: `${b.name ?? b.category_name} budget is ${Math.round(pct)}% used`,
        sub: `${daysLeft} days left this month`,
      });
    }
  }

  // c) Goal behind — deadline < 60 days and progress < 50%
  for (const g of goals) {
    const current = toAmount(g.saved_amount);
    const target  = toAmount(g.target_amount);
    if (target <= 0 || !g.deadline) continue;
    const pct           = (current / target) * 100;
    const daysToDeadline = Math.ceil(
      (new Date(g.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (daysToDeadline > 0 && daysToDeadline < 60 && pct < 50) {
      const monthsLeft    = Math.max(0.5, daysToDeadline / 30);
      const monthlyNeeded = (target - current) / monthsLeft;
      all.push({
        id: `goal-${g.id}`,
        severity: 'warning',
        message: `${g.name} goal is ${Math.round(pct)}% funded`,
        sub: `Needs ${fmt(monthlyNeeded)}/mo to hit deadline`,
      });
    }
  }

  // d) Recurring due within 3 days
  for (const r of recurring) {
    if (!r.is_active || !r.next_due) continue;
    const daysUntil = Math.ceil(
      (new Date(r.next_due).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (daysUntil >= 0 && daysUntil <= 3) {
      all.push({
        id: `rec-${r.id}`,
        severity: 'info',
        message: `${r.description} ${fmt(parseFloat(r.amount))} due ${daysUntil === 0 ? 'today' : `in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`}`,
      });
    }
  }

  // e) Big week — estimated weekly spend > 40% of monthly budget
  if (daysElapsed >= 7 && income > 0) {
    const totalBudget = budgets.reduce((s, b) => s + parseFloat(b.amount), 0) || income;
    const weeklyRate  = (expenses / daysElapsed) * 7;
    const weekPct     = (weeklyRate / totalBudget) * 100;
    if (weekPct > 40) {
      all.push({
        id: 'big-week',
        severity: 'warning',
        message: `Spending ~${Math.round(weekPct)}% of monthly budget per week`,
        sub: `${fmt(expenses)} spent in ${daysElapsed} days`,
      });
    }
  }

  const order: Record<CoachAlert['severity'], number> = { danger: 0, warning: 1, info: 2 };
  all.sort((a, b) => order[a.severity] - order[b.severity]);
  return all;
}

/**
 * The coach's alerts for the dashboard, at most three, most severe first.
 * Returns data rather than markup: the dashboard renders them as rows in its
 * Brief card, next to the other notices, instead of as separate banners.
 * Dismissals last for the browser session.
 */
export function useCoachAlerts({ summary, budgets, goals, loading }: CoachAlertsProps, enabled = true) {
  const { user } = useAuthStore();
  const [recurring, setRecurring] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [ready, setReady]         = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(SS_KEY) ?? '[]');
      setDismissed(new Set(stored as string[]));
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!user || !enabled) return;
    recurringAPI.getAll()
      .then(res => setRecurring(res.data?.recurring ?? []))
      .catch(() => {});
  }, [user, enabled]);

  const alerts = useMemo(() => {
    if (!enabled || !ready || loading) return [];
    return buildAlerts(summary, budgets, goals, recurring).filter(a => !dismissed.has(a.id)).slice(0, 3);
  }, [enabled, ready, loading, summary, budgets, goals, recurring, dismissed]);

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try { sessionStorage.setItem(SS_KEY, JSON.stringify([...next])); } catch {}
  };

  return { alerts, dismiss };
}
