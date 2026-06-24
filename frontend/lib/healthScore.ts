export interface ScoreFactor {
  id: 'savings' | 'momentum' | 'stability' | 'efficiency' | 'investment' | 'debt' | 'goals' | 'budgets';
  name: string;
  score: number;
  max: number;
  pct: number;
  tip: string;
}

export interface HealthScoreResult {
  score: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention' | 'Critical';
  color: string;
  breakdown: ScoreFactor[];
}

export interface HealthInput {
  income: number;
  expenses: number;
  budgets: { amount: string | number; spent: string | number }[];
  goals: { current_amount: string | number; target_amount: string | number; deadline?: string | null }[];
  monthlyIncome: number[];      // last N months, chronological (index 0 = oldest)
  monthlyExpenses: number[];    // same length, same order
  investedThisMonth: number;
  dtiRatio: number;             // 0–100 (percentage)
  ccUtilizationPct: number;     // 0–100 (percentage)
}

function mean(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  return Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length);
}

export function calculateHealthScore(input: HealthInput): HealthScoreResult {
  const {
    income, expenses, budgets, goals,
    monthlyIncome, monthlyExpenses,
    investedThisMonth, dtiRatio, ccUtilizationPct,
  } = input;

  // ── 1. Savings Rate (20pts) ──────────────────────────────────────────────
  const rate = income > 0 ? Math.max(-1, (income - expenses) / income) : 0;
  let savingsScore: number;
  if (income === 0)      savingsScore = 0;
  else if (rate >= 0.25) savingsScore = 20;
  else if (rate >= 0.20) savingsScore = 17;
  else if (rate >= 0.15) savingsScore = 13;
  else if (rate >= 0.10) savingsScore = 9;
  else if (rate >= 0.05) savingsScore = 5;
  else if (rate > 0)     savingsScore = 2;
  else                   savingsScore = 0;
  const rateStr = `${Math.round(Math.max(0, rate) * 100)}%`;
  const savingsTip =
    income === 0 ? 'Add your income transactions to start tracking how much you save.' :
    rate <= 0    ? 'You spent more than you earned this month. Look for categories you can cut back on.' :
    rate >= 0.20 ? `You saved ${rateStr} of your income this month — excellent!` :
                   `You saved ${rateStr}. Pushing toward 20% makes a big difference over time.`;

  // ── 2. Savings Momentum (10pts) ─────────────────────────────────────────
  // Measures whether savings rate is trending up or down over recent months
  let momentumScore: number;
  let momentumTip: string;
  const pairLen = Math.min(monthlyIncome.length, monthlyExpenses.length);
  if (pairLen < 2) {
    momentumScore = 5;
    momentumTip = 'Need at least 2 months of data to measure your savings trend.';
  } else {
    const rates = Array.from({ length: pairLen }, (_, i) => {
      const inc = monthlyIncome[i];
      return inc > 0 ? (inc - monthlyExpenses[i]) / inc : 0;
    });
    let totalDelta = 0;
    for (let i = 1; i < rates.length; i++) totalDelta += rates[i] - rates[i - 1];
    const avgDelta = totalDelta / (rates.length - 1);
    if (avgDelta >= 0.03)       { momentumScore = 10; momentumTip = 'Your savings rate has been consistently improving — great momentum!'; }
    else if (avgDelta >= 0.01)  { momentumScore = 8;  momentumTip = 'Savings rate is trending upward. Keep it going!'; }
    else if (avgDelta >= -0.01) { momentumScore = 6;  momentumTip = 'Savings rate is holding steady. Try to nudge it upward each month.'; }
    else if (avgDelta >= -0.03) { momentumScore = 3;  momentumTip = 'Savings rate is declining slightly. Check if any new expenses have crept in.'; }
    else                        { momentumScore = 1;  momentumTip = 'Savings rate has been falling consistently. This needs attention before it becomes a habit.'; }
  }

  // ── 3. Income Stability (10pts) ─────────────────────────────────────────
  // Coefficient of variation of monthly income — lower = more stable
  let stabilityScore: number;
  let stabilityTip: string;
  const incMonths = monthlyIncome.filter(v => v > 0);
  if (incMonths.length < 2) {
    stabilityScore = 5;
    stabilityTip = 'Not enough income history to assess stability yet.';
  } else {
    const cv = mean(incMonths) > 0 ? stddev(incMonths) / mean(incMonths) : 0;
    if (cv < 0.10)      { stabilityScore = 10; stabilityTip = 'Your income is very consistent month to month — strong financial foundation.'; }
    else if (cv < 0.20) { stabilityScore = 8;  stabilityTip = 'Income is mostly stable with minor variation.'; }
    else if (cv < 0.35) { stabilityScore = 5;  stabilityTip = 'Moderate income variation. Consider building a 2-3 month buffer for lean months.'; }
    else if (cv < 0.50) { stabilityScore = 3;  stabilityTip = 'Income varies quite a bit. A larger emergency buffer would reduce financial stress.'; }
    else                { stabilityScore = 1;  stabilityTip = 'Very unpredictable income. Prioritise building a 3-6 month cash buffer.'; }
  }

  // ── 4. Spending Efficiency (15pts) ──────────────────────────────────────
  // What percentage of income is consumed by expenses
  let efficiencyScore: number;
  let efficiencyTip: string;
  if (income === 0 && expenses === 0) {
    efficiencyScore = 7;
    efficiencyTip = 'Add transactions to see how efficiently you manage your income.';
  } else {
    const expRatio = income > 0 ? expenses / income : 2;
    if (expRatio <= 0.55)      { efficiencyScore = 15; efficiencyTip = `You spend ${Math.round(expRatio * 100)}% of income — very efficient, plenty left for saving and investing.`; }
    else if (expRatio <= 0.65) { efficiencyScore = 12; efficiencyTip = `${Math.round(expRatio * 100)}% of income goes to expenses — good, with room to improve.`; }
    else if (expRatio <= 0.75) { efficiencyScore = 9;  efficiencyTip = `${Math.round(expRatio * 100)}% of income is spent. Identify one category to trim this month.`; }
    else if (expRatio <= 0.85) { efficiencyScore = 6;  efficiencyTip = `${Math.round(expRatio * 100)}% of income spent — tight. Review subscriptions and irregular spends.`; }
    else if (expRatio <= 0.95) { efficiencyScore = 3;  efficiencyTip = `${Math.round(expRatio * 100)}% of income spent — barely any buffer. Try cutting one significant expense.`; }
    else if (expRatio <= 1.00) { efficiencyScore = 1;  efficiencyTip = 'Almost all your income is going to expenses with no margin for savings or emergencies.'; }
    else                       { efficiencyScore = 0;  efficiencyTip = 'You spent more than you earned. This is unsustainable — review your expenses urgently.'; }
  }

  // ── 5. Investment Discipline (15pts) ────────────────────────────────────
  // How much of monthly income goes toward wealth-building investments
  let investScore: number;
  let investTip: string;
  if (income === 0) {
    investScore = 5;
    investTip = 'Add your income to calculate your investment rate.';
  } else {
    const investRatio = investedThisMonth / income;
    if (investRatio >= 0.20)      { investScore = 15; investTip = `You invested ${Math.round(investRatio * 100)}% of income this month — excellent wealth-building pace.`; }
    else if (investRatio >= 0.15) { investScore = 12; investTip = `${Math.round(investRatio * 100)}% invested — strong. Aim for 20% as a long-term target.`; }
    else if (investRatio >= 0.10) { investScore = 9;  investTip = `${Math.round(investRatio * 100)}% invested — decent start. Try automating investments so they happen first.`; }
    else if (investRatio >= 0.05) { investScore = 5;  investTip = `${Math.round(investRatio * 100)}% invested. Small increases compounded over time make a huge difference.`; }
    else if (investRatio > 0)     { investScore = 2;  investTip = 'Investing a little — try to increase it to at least 5-10% of monthly income.'; }
    else                          { investScore = 0;  investTip = 'No investments recorded this month. Start with even a small SIP to build the habit.'; }
  }

  // ── 6. Debt Health (15pts) ──────────────────────────────────────────────
  // DTI sub-score (8pts) — monthly debt repayments as % of income
  let dtiScore: number;
  if (dtiRatio === 0)      dtiScore = 8;
  else if (dtiRatio < 15)  dtiScore = 7;
  else if (dtiRatio < 25)  dtiScore = 5;
  else if (dtiRatio < 35)  dtiScore = 3;
  else if (dtiRatio < 50)  dtiScore = 1;
  else                     dtiScore = 0;

  // CC utilization sub-score (7pts) — balance used vs total credit limit
  let ccScore: number;
  if (ccUtilizationPct === 0)      ccScore = 7;
  else if (ccUtilizationPct < 10)  ccScore = 6;
  else if (ccUtilizationPct < 30)  ccScore = 4;
  else if (ccUtilizationPct < 50)  ccScore = 2;
  else                             ccScore = 0;

  const debtScore = dtiScore + ccScore;
  const debtTip =
    debtScore >= 14 ? 'No significant debt obligations — great financial freedom.' :
    dtiRatio >= 50  ? `Debt repayments take ${Math.round(dtiRatio)}% of income — high burden. Prioritise paying down loans first.` :
    ccUtilizationPct >= 50 ? `Credit card utilization at ${Math.round(ccUtilizationPct)}% — aim to keep it below 30% to protect your credit health.` :
    dtiRatio >= 25  ? `DTI at ${Math.round(dtiRatio)}% — manageable but avoid taking on new debt right now.` :
                      'Debt looks manageable. Keep utilization and repayments in check.';

  // ── 7. Goal Progress (10pts) ────────────────────────────────────────────
  const active = goals.filter(g => Number(g.target_amount) > 0 && Number(g.current_amount) < Number(g.target_amount));
  let goalScore: number;
  let goalTip: string;
  if (active.length === 0) {
    goalScore = 3;
    goalTip = 'Set a savings goal — even a small one builds momentum and good habits.';
  } else {
    const now = Date.now();
    let totalGap = 0;
    let goalsWithDeadline = 0;
    for (const g of active) {
      if (g.deadline) {
        goalsWithDeadline++;
        const actual   = Number(g.current_amount) / Number(g.target_amount);
        const deadline = new Date(g.deadline).getTime();
        const start    = deadline - 365 * 24 * 60 * 60 * 1000;
        const expected = Math.min(1, Math.max(0, (now - start) / (deadline - start)));
        totalGap += Math.max(0, expected - actual);
      }
    }
    if (goalsWithDeadline === 0) {
      goalScore = 6;
      goalTip = `${active.length} active goal${active.length > 1 ? 's' : ''}. Add deadlines to track whether you're on pace.`;
    } else {
      const avgGap = totalGap / goalsWithDeadline;
      if (avgGap <= 0)         { goalScore = 10; goalTip = 'All goals are on track or ahead of schedule — keep it up!'; }
      else if (avgGap <= 0.10) { goalScore = 7;  goalTip = 'Slightly behind on goals. A small monthly increase will close the gap.'; }
      else if (avgGap <= 0.25) { goalScore = 4;  goalTip = `About ${Math.round(avgGap * 100)}% behind on average. Consider increasing contributions or adjusting deadlines.`; }
      else                     { goalScore = 1;  goalTip = 'Significantly behind on goals. Review whether targets and timelines are realistic.'; }
    }
  }

  // ── 8. Budget Adherence (5pts) ──────────────────────────────────────────
  let budgetScore: number;
  let budgetTip: string;
  if (budgets.length === 0) {
    budgetScore = 2;
    budgetTip = 'Set monthly budgets to track your spending against a plan.';
  } else {
    const within = budgets.filter(b => Number(b.spent) <= Number(b.amount)).length;
    const ratio  = within / budgets.length;
    const over   = budgets.length - within;
    budgetScore  = ratio >= 1 ? 5 : ratio >= 0.85 ? 4 : ratio >= 0.70 ? 3 : ratio >= 0.50 ? 2 : 1;
    budgetTip    = over === 0
      ? 'Every category is within budget — excellent discipline!'
      : `${over} budget${over > 1 ? 's' : ''} exceeded. Check your top spending categories to stay on plan.`;
  }

  // ── Total ────────────────────────────────────────────────────────────────
  const score = savingsScore + momentumScore + stabilityScore + efficiencyScore + investScore + debtScore + goalScore + budgetScore;

  const breakdown: ScoreFactor[] = [
    { id: 'savings',    name: 'Savings Rate',          score: savingsScore,    max: 20, pct: (savingsScore    / 20) * 100, tip: savingsTip    },
    { id: 'momentum',   name: 'Savings Momentum',      score: momentumScore,   max: 10, pct: (momentumScore   / 10) * 100, tip: momentumTip   },
    { id: 'stability',  name: 'Income Stability',      score: stabilityScore,  max: 10, pct: (stabilityScore  / 10) * 100, tip: stabilityTip  },
    { id: 'efficiency', name: 'Spending Efficiency',   score: efficiencyScore, max: 15, pct: (efficiencyScore / 15) * 100, tip: efficiencyTip },
    { id: 'investment', name: 'Investment Discipline', score: investScore,     max: 15, pct: (investScore     / 15) * 100, tip: investTip     },
    { id: 'debt',       name: 'Debt Health',           score: debtScore,       max: 15, pct: (debtScore       / 15) * 100, tip: debtTip       },
    { id: 'goals',      name: 'Goal Progress',         score: goalScore,       max: 10, pct: (goalScore       / 10) * 100, tip: goalTip       },
    { id: 'budgets',    name: 'Budget Adherence',      score: budgetScore,     max: 5,  pct: (budgetScore     /  5) * 100, tip: budgetTip     },
  ];

  const label: HealthScoreResult['label'] =
    score >= 80 ? 'Excellent' :
    score >= 65 ? 'Good' :
    score >= 50 ? 'Fair' :
    score >= 35 ? 'Needs Attention' : 'Critical';

  const color =
    score >= 80 ? 'var(--color-inc)'  :
    score >= 65 ? 'var(--accent)'     :
    score >= 50 ? 'var(--color-warn)' :
                  'var(--color-exp)';

  return { score, label, color, breakdown };
}
