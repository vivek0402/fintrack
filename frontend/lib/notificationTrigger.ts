import { analyticsAPI, budgetsAPI, goalsAPI, recurringAPI } from './api';
import { addInAppNotification, getNotifications } from './notifications';

interface Budget { category_id: string; name: string; amount: number; spent: number; }
interface RecurringItem { id: string; description: string; amount: number; next_due: string; is_active: boolean; }
interface Goal { id: string; name: string; target_amount: number; current_amount: number; }

const PREFS_KEY = 'fintrack-notif-prefs';
const LAST_CHECK_KEY = 'fintrack-notif-last-check';

function getPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; }
}

function pref(key: string): boolean {
  const prefs = getPrefs();
  return prefs[key] !== false;
}

export async function runNotificationCheck(): Promise<void> {
  const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
  if (lastCheck && Date.now() - Number(lastCheck) < 6 * 60 * 60 * 1000) return;
  localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

  const existing = getNotifications().map(n => n.id);

  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const [summaryRes, budgetsRes, goalsRes, recurringRes] = await Promise.all([
      analyticsAPI.summary({ month, year }),
      budgetsAPI.getAll({ month, year }),
      goalsAPI.getAll(),
      recurringAPI.getAll(),
    ]);

    const summary = summaryRes.data;
    const budgets: Budget[] = budgetsRes.data || [];
    const goals: Goal[] = goalsRes.data || [];
    const recurring: RecurringItem[] = recurringRes.data || [];

    if (pref('budgetAlerts')) {
      budgets.forEach((b) => {
        const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
        const id = `budget-${b.category_id}-${month}-${year}`;
        if (pct >= 80 && !existing.includes(id)) {
          addInAppNotification({
            id,
            title: pct >= 100 ? `${b.name} budget exceeded` : `${b.name} budget at ${Math.round(pct)}%`,
            body: pct >= 100
              ? `You've spent ₹${b.spent.toLocaleString()} against a ₹${b.amount.toLocaleString()} budget`
              : `₹${(b.amount - b.spent).toLocaleString()} remaining for the month`,
            type: 'budget',
            deepLink: '/budgets',
            readAt: null,
            createdAt: now.toISOString(),
          });
        }
      });
    }

    if (pref('billReminders')) {
      recurring.filter((r) => r.is_active).forEach((r) => {
        if (!r.next_due) return;
        const daysUntil = Math.ceil(
          (new Date(r.next_due).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        const id = `bill-${r.id}-${r.next_due}`;
        if (daysUntil >= 0 && daysUntil <= 3 && !existing.includes(id)) {
          addInAppNotification({
            id,
            title: daysUntil === 0 ? `${r.description} due today` : `${r.description} due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
            body: `₹${Number(r.amount).toLocaleString()} scheduled payment`,
            type: 'bill',
            deepLink: '/recurring',
            readAt: null,
            createdAt: now.toISOString(),
          });
        }
      });
    }

    if (pref('goalAlerts')) {
      goals.forEach((g) => {
        const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
        [25, 50, 75, 100].forEach(milestone => {
          const id = `goal-${g.id}-${milestone}pct`;
          if (pct >= milestone && !existing.includes(id)) {
            addInAppNotification({
              id,
              title: milestone === 100 ? `Goal achieved: ${g.name}!` : `${g.name} is ${milestone}% funded`,
              body: milestone === 100
                ? `You saved ₹${Number(g.target_amount).toLocaleString()} — goal complete!`
                : `₹${Number(g.current_amount).toLocaleString()} of ₹${Number(g.target_amount).toLocaleString()} saved`,
              type: 'goal',
              deepLink: '/goals',
              readAt: null,
              createdAt: now.toISOString(),
            });
          }
        });
      });
    }

    if (pref('weeklySummary')) {
      const dayOfWeek = now.getDay();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - dayOfWeek);
      const weekKey = `weekly-summary-${weekStart.toISOString().split('T')[0]}`;
      if (dayOfWeek === 0 && !existing.includes(weekKey) && summary) {
        addInAppNotification({
          id: weekKey,
          title: 'Weekly spending summary',
          body: `You spent ₹${Number(summary.total_expense || 0).toLocaleString()} this week`,
          type: 'summary',
          deepLink: '/analytics',
          readAt: null,
          createdAt: now.toISOString(),
        });
      }
    }
  } catch {
    // Silent fail — notification checks should never break the app
  }
}
