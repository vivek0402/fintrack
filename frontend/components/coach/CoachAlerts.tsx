'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { recurringAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const SS_KEY = 'fintrack-coach-dismissed';
const fmt = (n: number) => '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');

interface Alert {
  id: string;
  severity: 'danger' | 'warning' | 'info';
  message: string;
  sub?: string;
}

export interface CoachAlertsProps {
  summary: { total_income: number | string; total_expenses: number | string } | null;
  budgets: any[];
  goals: any[];
  loading: boolean;
}

function buildAlerts(
  summary: CoachAlertsProps['summary'],
  budgets: any[],
  goals: any[],
  recurring: any[],
): Alert[] {
  if (!summary) return [];

  const income   = Number(summary.total_income);
  const expenses = Number(summary.total_expenses);
  const today      = new Date();
  const daysElapsed = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft    = daysInMonth - daysElapsed;
  const all: Alert[] = [];

  // a) Budget breach — any category > 85% spent
  for (const b of budgets) {
    const budgetAmt = parseFloat(b.amount);
    if (budgetAmt <= 0) continue;
    const pct = (parseFloat(b.spent) / budgetAmt) * 100;
    if (pct >= 85) {
      all.push({
        id: `budget-${b.category_id ?? b.id}`,
        severity: pct >= 100 ? 'danger' : 'warning',
        message: `⚠️ ${b.name ?? b.category_name} budget is ${Math.round(pct)}% used`,
        sub: `${daysLeft} days left this month`,
      });
    }
  }

  // b) Daily pace — projected monthly > budget by 5%
  if (daysElapsed > 3 && income > 0) {
    const totalBudget = budgets.reduce((s, b) => s + parseFloat(b.amount), 0) || income;
    const projected   = (expenses / daysElapsed) * daysInMonth;
    if (projected > totalBudget * 1.05) {
      all.push({
        id: 'daily-pace',
        severity: projected > totalBudget * 1.20 ? 'danger' : 'warning',
        message: `📊 On pace to spend ${fmt(projected)} this month`,
        sub: `Budget: ${fmt(totalBudget)}`,
      });
    }
  }

  // c) Goal behind — deadline < 60 days and progress < 50%
  for (const g of goals) {
    const current = parseFloat(g.current_amount ?? 0);
    const target  = parseFloat(g.target_amount  ?? 0);
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
        message: `🎯 ${g.name} goal is ${Math.round(pct)}% funded`,
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
        message: `📅 ${r.description} ${fmt(parseFloat(r.amount))} due ${daysUntil === 0 ? 'today' : `in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`}`,
      });
    }
  }

  // e) Big week — estimated weekly spend > 40% of monthly budget
  if (daysElapsed >= 7 && income > 0) {
    const totalBudget = budgets.reduce((s, b) => s + parseFloat(b.amount), 0) || income;
    const weeklyRate  = (expenses / daysElapsed) * 7;
    const weekPct     = (weeklyRate / totalBudget) * 100;
    if (weekPct > 40 && !all.find(a => a.id === 'daily-pace')) {
      all.push({
        id: 'big-week',
        severity: 'warning',
        message: `📊 Spending ~${Math.round(weekPct)}% of monthly budget per week`,
        sub: `${fmt(expenses)} spent in ${daysElapsed} days`,
      });
    }
  }

  const order: Record<Alert['severity'], number> = { danger: 0, warning: 1, info: 2 };
  all.sort((a, b) => order[a.severity] - order[b.severity]);
  return all;
}

const borderCol = (s: Alert['severity']) =>
  s === 'danger' ? 'var(--color-exp)' : s === 'warning' ? 'var(--color-warn)' : 'var(--accent)';

const bgCol = (s: Alert['severity']) =>
  s === 'danger'
    ? 'color-mix(in srgb, var(--color-exp) 6%, var(--bg-surface-1))'
    : s === 'warning'
    ? 'color-mix(in srgb, var(--color-warn) 6%, var(--bg-surface-1))'
    : 'color-mix(in srgb, var(--accent) 6%, var(--bg-surface-1))';

export function CoachAlerts({ summary, budgets, goals, loading }: CoachAlertsProps) {
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
    if (!user) return;
    recurringAPI.getAll()
      .then(res => setRecurring(res.data?.recurring ?? []))
      .catch(() => {});
  }, [user]);

  if (!ready || loading) return null;

  const allAlerts = buildAlerts(summary, budgets, goals, recurring);
  const visible   = allAlerts.filter(a => !dismissed.has(a.id)).slice(0, 3);

  if (!visible.length) return null;

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try { sessionStorage.setItem(SS_KEY, JSON.stringify([...next])); } catch {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', animation: 'fadeUp 200ms ease forwards' }}>
      {visible.map(alert => (
        <div
          key={alert.id}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '11px 14px',
            background: bgCol(alert.severity),
            borderRadius: 'var(--radius-md)',
            borderLeft: `4px solid ${borderCol(alert.severity)}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>
              {alert.message}
            </p>
            {alert.sub && (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '3px 0 0', fontFamily: 'var(--font-body)' }}>
                {alert.sub}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismiss(alert.id)}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex', flexShrink: 0, borderRadius: '4px', transition: 'color var(--transition-fast)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
