export interface ScoreFactor {
  id: 'savings' | 'budgets' | 'goals' | 'consistency' | 'debt';
  name: string;
  score: number;
  max: number;
  pct: number;
  tip: string;
}

export interface HealthScoreResult {
  score: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Needs Work';
  color: string;
  breakdown: ScoreFactor[];
}

export interface HealthInput {
  income: number;
  expenses: number;
  budgets: { amount: string | number; spent: string | number }[];
  goals: { current_amount: string | number; target_amount: string | number; deadline?: string | null }[];
  monthlyExpenses: number[];
  totalCCDebt: number;
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
}

export function calculateHealthScore(input: HealthInput): HealthScoreResult {
  const { income, expenses, budgets, goals, monthlyExpenses, totalCCDebt } = input;

  // 1. Savings Rate (25pts)
  const rate = income > 0 ? Math.max(0, (income - expenses) / income) : 0;
  const savingsScore =
    rate >= 0.20 ? 25 : rate >= 0.15 ? 20 : rate >= 0.10 ? 15 : rate >= 0.05 ? 8 : 2;
  const rateStr = `${Math.round(rate * 100)}%`;
  const savingsTip = savingsScore >= 25
    ? `Great! Saving ${rateStr} of income.`
    : `Aim for 20%+ savings (currently ${rateStr}).`;

  // 2. Budget Adherence (25pts)
  let budgetScore: number;
  let budgetTip: string;
  if (budgets.length === 0) {
    budgetScore = 15;
    budgetTip = 'Set monthly budgets to track adherence.';
  } else {
    const within = budgets.filter(b => Number(b.spent) <= Number(b.amount)).length;
    const ratio = within / budgets.length;
    budgetScore = ratio >= 1 ? 25 : ratio >= 0.85 ? 20 : ratio >= 0.70 ? 14 : ratio >= 0.50 ? 7 : 2;
    const over = budgets.length - within;
    budgetTip = over === 0
      ? 'All categories within budget — excellent!'
      : `${over} budget${over > 1 ? 's' : ''} overspent. Review top expense categories.`;
  }

  // 3. Goal Progress (20pts)
  const active = goals.filter(g => Number(g.target_amount) > 0 && Number(g.current_amount) < Number(g.target_amount));
  let goalScore: number;
  let goalTip: string;
  if (active.length === 0) {
    goalScore = 10;
    goalTip = 'Add savings goals to improve this score.';
  } else {
    const now = Date.now();
    let totalGap = 0;
    for (const g of active) {
      const actual = Number(g.current_amount) / Number(g.target_amount);
      if (g.deadline) {
        const deadlineMs = new Date(g.deadline).getTime();
        const assumedStartMs = deadlineMs - 365 * 24 * 60 * 60 * 1000;
        const expected = Math.min(1, Math.max(0, (now - assumedStartMs) / (deadlineMs - assumedStartMs)));
        totalGap += Math.max(0, expected - actual);
      }
    }
    const avgGap = active.length > 0 ? totalGap / active.length : 0;
    if (avgGap <= 0) { goalScore = 20; goalTip = 'Goals are on track — keep it up!'; }
    else if (avgGap <= 0.10) { goalScore = 14; goalTip = 'Slightly behind on goals. Boost contributions.'; }
    else if (avgGap <= 0.25) { goalScore = 8; goalTip = `${Math.round(avgGap * 100)}% behind on average. Increase goal contributions.`; }
    else { goalScore = 3; goalTip = 'Significantly behind on goals. Review deadlines or savings rate.'; }
  }

  // 4. Expense Consistency (15pts)
  let consistencyScore: number;
  let consistencyTip: string;
  if (monthlyExpenses.length < 2) {
    consistencyScore = 10;
    consistencyTip = 'Need more months of data to assess consistency.';
  } else {
    const mean = monthlyExpenses.reduce((a, b) => a + b, 0) / monthlyExpenses.length;
    const cv = mean > 0 ? stddev(monthlyExpenses) / mean : 0;
    if (cv < 0.10) { consistencyScore = 15; consistencyTip = 'Very consistent spending — great stability.'; }
    else if (cv < 0.25) { consistencyScore = 10; consistencyTip = 'Moderate variation. Identify irregular expenses.'; }
    else if (cv < 0.50) { consistencyScore = 7; consistencyTip = 'High spending variability. Smooth out irregular purchases.'; }
    else { consistencyScore = 5; consistencyTip = 'Erratic spending. Build a consistent monthly budget.'; }
  }

  // 5. Debt/Income Ratio (15pts)
  let debtScore: number;
  let debtTip: string;
  const debtRatio = income > 0 ? totalCCDebt / income : (totalCCDebt > 0 ? 1 : 0);
  if (debtRatio === 0) { debtScore = 15; debtTip = 'No credit card debt — excellent!'; }
  else if (debtRatio < 0.20) { debtScore = 12; debtTip = `CC debt is ${Math.round(debtRatio * 100)}% of monthly income — manageable.`; }
  else if (debtRatio < 0.50) { debtScore = 7; debtTip = `CC debt at ${Math.round(debtRatio * 100)}% of income — work to reduce it.`; }
  else { debtScore = 2; debtTip = 'CC debt exceeds 50% of monthly income — prioritise paying it down.'; }

  const score = savingsScore + budgetScore + goalScore + consistencyScore + debtScore;

  const breakdown: ScoreFactor[] = [
    { id: 'savings',     name: 'Savings Rate',         score: savingsScore,     max: 25, pct: (savingsScore / 25) * 100,     tip: savingsTip     },
    { id: 'budgets',     name: 'Budget Adherence',     score: budgetScore,      max: 25, pct: (budgetScore / 25) * 100,      tip: budgetTip      },
    { id: 'goals',       name: 'Goal Progress',        score: goalScore,        max: 20, pct: (goalScore / 20) * 100,        tip: goalTip        },
    { id: 'consistency', name: 'Expense Consistency',  score: consistencyScore, max: 15, pct: (consistencyScore / 15) * 100, tip: consistencyTip },
    { id: 'debt',        name: 'Debt / Income',        score: debtScore,        max: 15, pct: (debtScore / 15) * 100,        tip: debtTip        },
  ];

  const label: HealthScoreResult['label'] =
    score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 50 ? 'Fair' : 'Needs Work';
  const color =
    score >= 80 ? 'var(--color-inc)' : score >= 65 ? 'var(--accent)' : score >= 50 ? 'var(--color-warn)' : 'var(--color-exp)';

  return { score, label, color, breakdown };
}
