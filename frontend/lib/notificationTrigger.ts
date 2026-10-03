import { analyticsAPI, budgetsAPI, goalsAPI, recurringAPI } from './api';
import { addInAppNotification } from './notifications';
import { loadNotificationPrefs, NotificationPrefs } from './notificationPrefs';
import { toAmount, type Budget, type Goal, type MonthSummary, type Money } from '@/types/finance';

// A row from GET /api/recurring (only the fields used here).
interface RecurringItem { id: string; description: string; amount: Money; next_due_date: string | null; is_active: boolean; }

const LAST_CHECK_KEY = 'fintrack-notif-last-check';

export async function runNotificationCheck(): Promise<void> {
  const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
  if (lastCheck && Date.now() - Number(lastCheck) < 6 * 60 * 60 * 1000) return;
  localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

  // No client-side dedup check here — addInAppNotification's POST is deduped
  // server-side by (user_id, id) via ON CONFLICT DO NOTHING, since every id
  // below is a deterministic key per alert (category+month, bill+due-date,
  // goal+milestone, week-of).
  try {
    // Refresh the toggles from the server first (also refreshes the
    // localStorage cache and runs the one-time local->server upload), so a
    // category muted on another device is honoured here. Falls back to the
    // cached copy offline; never throws.
    const prefs = await loadNotificationPrefs();
    const pref = (key: keyof NotificationPrefs): boolean => prefs[key] !== false;

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const [summaryRes, budgetsRes, goalsRes, recurringRes] = await Promise.all([
      analyticsAPI.summary({ month, year }),
      budgetsAPI.getAll({ month, year }),
      goalsAPI.getAll(),
      recurringAPI.getAll(),
    ]);

    // Each endpoint wraps its rows ({ budgets: [...] } etc.).
    const summary: MonthSummary | undefined = summaryRes.data?.summary;
    const budgets: Budget[] = budgetsRes.data?.budgets ?? [];
    const goals: Goal[] = goalsRes.data?.goals ?? [];
    const recurring: RecurringItem[] = recurringRes.data?.recurring ?? [];

    if (pref('budgetAlerts')) {
      budgets.forEach((b) => {
        const amount = toAmount(b.amount);
        const spent = toAmount(b.spent);
        const name = b.category_name ?? 'Budget';
        const pct = amount > 0 ? (spent / amount) * 100 : 0;
        const id = `budget-${b.category_id}-${month}-${year}`;
        if (pct >= 80) {
          addInAppNotification({
            id,
            title: pct >= 100 ? `${name} budget exceeded` : `${name} budget at ${Math.round(pct)}%`,
            body: pct >= 100
              ? `You've spent ₹${spent.toLocaleString()} against a ₹${amount.toLocaleString()} budget`
              : `₹${(amount - spent).toLocaleString()} remaining for the month`,
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
        if (!r.next_due_date) return;
        const due = r.next_due_date.split('T')[0];
        const daysUntil = Math.ceil(
          (new Date(due).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        const id = `bill-${r.id}-${due}`;
        if (daysUntil >= 0 && daysUntil <= 3) {
          addInAppNotification({
            id,
            title: daysUntil === 0 ? `${r.description} due today` : `${r.description} due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
            body: `₹${toAmount(r.amount).toLocaleString()} scheduled payment`,
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
        const saved = toAmount(g.saved_amount);
        const target = toAmount(g.target_amount);
        const pct = target > 0 ? (saved / target) * 100 : 0;
        // Only the highest milestone reached, so a goal that is already far
        // along gets one alert rather than every step it passed at once.
        const milestone = [100, 75, 50, 25].find(m => pct >= m);
        if (!milestone) return;
        addInAppNotification({
          id: `goal-${g.id}-${milestone}pct`,
          title: milestone === 100 ? `Goal achieved: ${g.name}!` : `${g.name} is ${milestone}% funded`,
          body: milestone === 100
            ? `You saved ₹${target.toLocaleString()} — goal complete!`
            : `₹${saved.toLocaleString()} of ₹${target.toLocaleString()} saved`,
          type: 'goal',
          deepLink: '/goals',
          readAt: null,
          createdAt: now.toISOString(),
        });
      });
    }

    if (pref('weeklySummary')) {
      const dayOfWeek = now.getDay();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - dayOfWeek);
      const weekKey = `weekly-summary-${weekStart.toISOString().split('T')[0]}`;
      if (dayOfWeek === 0 && summary) {
        addInAppNotification({
          id: weekKey,
          title: 'Weekly spending summary',
          body: `You've spent ₹${toAmount(summary.total_expenses).toLocaleString()} so far this month`,
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
