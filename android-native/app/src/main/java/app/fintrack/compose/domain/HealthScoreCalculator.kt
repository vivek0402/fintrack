package app.fintrack.compose.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.sqrt

enum class HealthGrade { EXCELLENT, GOOD, FAIR, NEEDS_ATTENTION, CRITICAL }

data class HealthScoreFactor(
    val id: String,
    val name: String,
    val score: Double,
    val max: Double,
    val pct: Double,
    val tip: String,
)

data class HealthScoreResult(
    val score: Int,
    val grade: HealthGrade,
    val breakdown: List<HealthScoreFactor>,
)

data class HealthGoalInput(val savedAmount: Double, val targetAmount: Double, val deadline: String?)
data class HealthBudgetInput(val amount: Double, val spent: Double)

data class HealthScoreInput(
    val income: Double,
    val expenses: Double,
    val budgets: List<HealthBudgetInput>,
    val goals: List<HealthGoalInput>,
    /** Last N months, chronological (index 0 = oldest). */
    val monthlyIncome: List<Double>,
    val monthlyExpenses: List<Double>,
    val investedThisMonth: Double,
    val dtiRatio: Double,
    val ccUtilizationPct: Double,
)

private fun mean(vals: List<Double>): Double = if (vals.isEmpty()) 0.0 else vals.sum() / vals.size

private fun stddev(vals: List<Double>): Double {
    if (vals.size < 2) return 0.0
    val m = mean(vals)
    return sqrt(vals.sumOf { (it - m) * (it - m) } / vals.size)
}

/**
 * Deterministic port of frontend/lib/healthScore.ts's calculateHealthScore(). Mirrors web's
 * client-side 8-factor algorithm (used by web's dashboard widget and /health-score page),
 * not the LLM-narrated /api/ai/health-report endpoint (a separate, 5-factor feature).
 *
 * One intentional deviation from web: the Goal Progress factor uses each goal's actual
 * saved_amount (the real backend field) instead of web's healthScore.ts, which reads a
 * current_amount field that the goals API never actually returns — a latent bug upstream
 * that silently zeroes out that factor on web. Native computes it correctly instead.
 */
fun calculateHealthScore(input: HealthScoreInput): HealthScoreResult {
    // 1. Savings Rate (20pts)
    val rate = if (input.income > 0) ((input.income - input.expenses) / input.income).coerceAtLeast(-1.0) else 0.0
    val savingsScore = when {
        input.income == 0.0 -> 0.0
        rate >= 0.25 -> 20.0
        rate >= 0.20 -> 17.0
        rate >= 0.15 -> 13.0
        rate >= 0.10 -> 9.0
        rate >= 0.05 -> 5.0
        rate > 0 -> 2.0
        else -> 0.0
    }
    val rateStr = "${(rate.coerceAtLeast(0.0) * 100).toInt()}%"
    val savingsTip = when {
        input.income == 0.0 -> "Add your income transactions to start tracking how much you save."
        rate <= 0 -> "You spent more than you earned this month. Look for categories you can cut back on."
        rate >= 0.20 -> "You saved $rateStr of your income this month — excellent!"
        else -> "You saved $rateStr. Pushing toward 20% makes a big difference over time."
    }

    // 2. Savings Momentum (10pts)
    val pairLen = minOf(input.monthlyIncome.size, input.monthlyExpenses.size)
    val momentumScore: Double
    val momentumTip: String
    if (pairLen < 2) {
        momentumScore = 5.0
        momentumTip = "Need at least 2 months of data to measure your savings trend."
    } else {
        val rates = (0 until pairLen).map { i ->
            val inc = input.monthlyIncome[i]
            if (inc > 0) (inc - input.monthlyExpenses[i]) / inc else 0.0
        }
        var totalDelta = 0.0
        for (i in 1 until rates.size) totalDelta += rates[i] - rates[i - 1]
        val avgDelta = totalDelta / (rates.size - 1)
        when {
            avgDelta >= 0.03 -> { momentumScore = 10.0; momentumTip = "Your savings rate has been consistently improving — great momentum!" }
            avgDelta >= 0.01 -> { momentumScore = 8.0; momentumTip = "Savings rate is trending upward. Keep it going!" }
            avgDelta >= -0.01 -> { momentumScore = 6.0; momentumTip = "Savings rate is holding steady. Try to nudge it upward each month." }
            avgDelta >= -0.03 -> { momentumScore = 3.0; momentumTip = "Savings rate is declining slightly. Check if any new expenses have crept in." }
            else -> { momentumScore = 1.0; momentumTip = "Savings rate has been falling consistently. This needs attention before it becomes a habit." }
        }
    }

    // 3. Income Stability (10pts)
    val incMonths = input.monthlyIncome.filter { it > 0 }
    val stabilityScore: Double
    val stabilityTip: String
    if (incMonths.size < 2) {
        stabilityScore = 5.0
        stabilityTip = "Not enough income history to assess stability yet."
    } else {
        val m = mean(incMonths)
        val cv = if (m > 0) stddev(incMonths) / m else 0.0
        when {
            cv < 0.10 -> { stabilityScore = 10.0; stabilityTip = "Your income is very consistent month to month — strong financial foundation." }
            cv < 0.20 -> { stabilityScore = 8.0; stabilityTip = "Income is mostly stable with minor variation." }
            cv < 0.35 -> { stabilityScore = 5.0; stabilityTip = "Moderate income variation. Consider building a 2-3 month buffer for lean months." }
            cv < 0.50 -> { stabilityScore = 3.0; stabilityTip = "Income varies quite a bit. A larger emergency buffer would reduce financial stress." }
            else -> { stabilityScore = 1.0; stabilityTip = "Very unpredictable income. Prioritise building a 3-6 month cash buffer." }
        }
    }

    // 4. Spending Efficiency (15pts)
    val efficiencyScore: Double
    val efficiencyTip: String
    if (input.income == 0.0 && input.expenses == 0.0) {
        efficiencyScore = 7.0
        efficiencyTip = "Add transactions to see how efficiently you manage your income."
    } else {
        val expRatio = if (input.income > 0) input.expenses / input.income else 2.0
        val pct = (expRatio * 100).toInt()
        when {
            expRatio <= 0.55 -> { efficiencyScore = 15.0; efficiencyTip = "You spend $pct% of income — very efficient, plenty left for saving and investing." }
            expRatio <= 0.65 -> { efficiencyScore = 12.0; efficiencyTip = "$pct% of income goes to expenses — good, with room to improve." }
            expRatio <= 0.75 -> { efficiencyScore = 9.0; efficiencyTip = "$pct% of income is spent. Identify one category to trim this month." }
            expRatio <= 0.85 -> { efficiencyScore = 6.0; efficiencyTip = "$pct% of income spent — tight. Review subscriptions and irregular spends." }
            expRatio <= 0.95 -> { efficiencyScore = 3.0; efficiencyTip = "$pct% of income spent — barely any buffer. Try cutting one significant expense." }
            expRatio <= 1.00 -> { efficiencyScore = 1.0; efficiencyTip = "Almost all your income is going to expenses with no margin for savings or emergencies." }
            else -> { efficiencyScore = 0.0; efficiencyTip = "You spent more than you earned. This is unsustainable — review your expenses urgently." }
        }
    }

    // 5. Investment Discipline (15pts)
    val investScore: Double
    val investTip: String
    if (input.income == 0.0) {
        investScore = 5.0
        investTip = "Add your income to calculate your investment rate."
    } else {
        val investRatio = input.investedThisMonth / input.income
        val pct = (investRatio * 100).toInt()
        when {
            investRatio >= 0.20 -> { investScore = 15.0; investTip = "You invested $pct% of income this month — excellent wealth-building pace." }
            investRatio >= 0.15 -> { investScore = 12.0; investTip = "$pct% invested — strong. Aim for 20% as a long-term target." }
            investRatio >= 0.10 -> { investScore = 9.0; investTip = "$pct% invested — decent start. Try automating investments so they happen first." }
            investRatio >= 0.05 -> { investScore = 5.0; investTip = "$pct% invested. Small increases compounded over time make a huge difference." }
            investRatio > 0 -> { investScore = 2.0; investTip = "Investing a little — try to increase it to at least 5-10% of monthly income." }
            else -> { investScore = 0.0; investTip = "No investments recorded this month. Start with even a small SIP to build the habit." }
        }
    }

    // 6. Debt Health (15pts) — DTI sub-score (8) + CC utilization sub-score (7)
    val dtiScore = when {
        input.dtiRatio == 0.0 -> 8.0
        input.dtiRatio < 15 -> 7.0
        input.dtiRatio < 25 -> 5.0
        input.dtiRatio < 35 -> 3.0
        input.dtiRatio < 50 -> 1.0
        else -> 0.0
    }
    val ccScore = when {
        input.ccUtilizationPct == 0.0 -> 7.0
        input.ccUtilizationPct < 10 -> 6.0
        input.ccUtilizationPct < 30 -> 4.0
        input.ccUtilizationPct < 50 -> 2.0
        else -> 0.0
    }
    val debtScore = dtiScore + ccScore
    val debtTip = when {
        debtScore >= 14 -> "No significant debt obligations — great financial freedom."
        input.dtiRatio >= 50 -> "Debt repayments take ${input.dtiRatio.toInt()}% of income — high burden. Prioritise paying down loans first."
        input.ccUtilizationPct >= 50 -> "Credit card utilization at ${input.ccUtilizationPct.toInt()}% — aim to keep it below 30% to protect your credit health."
        input.dtiRatio >= 25 -> "DTI at ${input.dtiRatio.toInt()}% — manageable but avoid taking on new debt right now."
        else -> "Debt looks manageable. Keep utilization and repayments in check."
    }

    // 7. Goal Progress (10pts)
    val active = input.goals.filter { it.targetAmount > 0 && it.savedAmount < it.targetAmount }
    val goalScore: Double
    val goalTip: String
    if (active.isEmpty()) {
        goalScore = 3.0
        goalTip = "Set a savings goal — even a small one builds momentum and good habits."
    } else {
        val now = Instant.now().toEpochMilli()
        var totalGap = 0.0
        var goalsWithDeadline = 0
        for (g in active) {
            val deadlineStr = g.deadline ?: continue
            val deadlineMillis = runCatching {
                LocalDate.parse(deadlineStr.take(10)).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
            }.getOrNull() ?: continue
            goalsWithDeadline++
            val actual = g.savedAmount / g.targetAmount
            val start = deadlineMillis - 365L * 24 * 60 * 60 * 1000
            val expected = (((now - start).toDouble()) / (deadlineMillis - start).toDouble()).coerceIn(0.0, 1.0)
            totalGap += (expected - actual).coerceAtLeast(0.0)
        }
        if (goalsWithDeadline == 0) {
            goalScore = 6.0
            goalTip = "${active.size} active goal${if (active.size > 1) "s" else ""}. Add deadlines to track whether you're on pace."
        } else {
            val avgGap = totalGap / goalsWithDeadline
            when {
                avgGap <= 0 -> { goalScore = 10.0; goalTip = "All goals are on track or ahead of schedule — keep it up!" }
                avgGap <= 0.10 -> { goalScore = 7.0; goalTip = "Slightly behind on goals. A small monthly increase will close the gap." }
                avgGap <= 0.25 -> { goalScore = 4.0; goalTip = "About ${(avgGap * 100).toInt()}% behind on average. Consider increasing contributions or adjusting deadlines." }
                else -> { goalScore = 1.0; goalTip = "Significantly behind on goals. Review whether targets and timelines are realistic." }
            }
        }
    }

    // 8. Budget Adherence (5pts)
    val budgetScore: Double
    val budgetTip: String
    if (input.budgets.isEmpty()) {
        budgetScore = 2.0
        budgetTip = "Set monthly budgets to track your spending against a plan."
    } else {
        val within = input.budgets.count { it.spent <= it.amount }
        val ratio = within.toDouble() / input.budgets.size
        val over = input.budgets.size - within
        budgetScore = when {
            ratio >= 1.0 -> 5.0
            ratio >= 0.85 -> 4.0
            ratio >= 0.70 -> 3.0
            ratio >= 0.50 -> 2.0
            else -> 1.0
        }
        budgetTip = if (over == 0) "Every category is within budget — excellent discipline!"
        else "$over budget${if (over > 1) "s" else ""} exceeded. Check your top spending categories to stay on plan."
    }

    val score = (savingsScore + momentumScore + stabilityScore + efficiencyScore + investScore + debtScore + goalScore + budgetScore).toInt()

    val breakdown = listOf(
        HealthScoreFactor("savings", "Savings Rate", savingsScore, 20.0, savingsScore / 20.0 * 100, savingsTip),
        HealthScoreFactor("momentum", "Savings Momentum", momentumScore, 10.0, momentumScore / 10.0 * 100, momentumTip),
        HealthScoreFactor("stability", "Income Stability", stabilityScore, 10.0, stabilityScore / 10.0 * 100, stabilityTip),
        HealthScoreFactor("efficiency", "Spending Efficiency", efficiencyScore, 15.0, efficiencyScore / 15.0 * 100, efficiencyTip),
        HealthScoreFactor("investment", "Investment Discipline", investScore, 15.0, investScore / 15.0 * 100, investTip),
        HealthScoreFactor("debt", "Debt Health", debtScore, 15.0, debtScore / 15.0 * 100, debtTip),
        HealthScoreFactor("goals", "Goal Progress", goalScore, 10.0, goalScore / 10.0 * 100, goalTip),
        HealthScoreFactor("budgets", "Budget Adherence", budgetScore, 5.0, budgetScore / 5.0 * 100, budgetTip),
    )

    val grade = when {
        score >= 80 -> HealthGrade.EXCELLENT
        score >= 65 -> HealthGrade.GOOD
        score >= 50 -> HealthGrade.FAIR
        score >= 35 -> HealthGrade.NEEDS_ATTENTION
        else -> HealthGrade.CRITICAL
    }

    return HealthScoreResult(score = score, grade = grade, breakdown = breakdown)
}
