package app.fintrack.compose.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.BudgetDto
import app.fintrack.compose.data.api.GoalDto
import app.fintrack.compose.data.api.SummaryDto
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.domain.HealthGrade
import app.fintrack.compose.domain.HealthScoreResult
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import java.time.LocalDate
import kotlin.math.ceil
import kotlin.math.roundToInt

// ─── Health Score ───────────────────────────────────────────────────────

@Composable
fun HealthScoreTile(result: HealthScoreResult?, isLoading: Boolean) {
    val color = when (result?.grade) {
        HealthGrade.EXCELLENT -> FinTrackColors.Dark.colorInc
        HealthGrade.GOOD -> FinTrackColors.Dark.accent
        HealthGrade.FAIR -> FinTrackColors.Dark.colorWarn
        HealthGrade.NEEDS_ATTENTION, HealthGrade.CRITICAL -> FinTrackColors.Dark.colorExp
        null -> FinTrackColors.Dark.accent
    }
    val label = when (result?.grade) {
        HealthGrade.EXCELLENT -> "Excellent"
        HealthGrade.GOOD -> "Good"
        HealthGrade.FAIR -> "Fair"
        HealthGrade.NEEDS_ATTENTION -> "Needs Attention"
        HealthGrade.CRITICAL -> "Critical"
        null -> "—"
    }

    Surface(shape = RoundedCornerShape(16.dp), color = color.copy(alpha = 0.10f), modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text("HEALTH SCORE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            if (isLoading && result == null) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                Text("${result?.score ?: 0}/100", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ─── Debt alert banners ─────────────────────────────────────────────────

@Composable
fun DebtAlertBanner(message: String, onDismiss: () -> Unit) {
    Surface(shape = RoundedCornerShape(12.dp), color = FinTrackColors.Dark.colorWarn.copy(alpha = 0.10f), modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(FinTrackSpacing.space3)) {
            Icon(Icons.Filled.Warning, contentDescription = null, tint = FinTrackColors.Dark.colorWarn)
            Spacer(Modifier.width(FinTrackSpacing.space2))
            Text(message, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            IconButton(onClick = onDismiss) {
                Icon(Icons.Filled.Close, contentDescription = "Dismiss", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ─── Guilt-free budget pool ─────────────────────────────────────────────

private data class GuiltFreePool(val income: Double, val totalBudgeted: Double, val goalMonthly: Double, val pool: Double, val unbudgetedSpent: Double, val remaining: Double, val usedPct: Float)

private fun computeGuiltFreePool(summary: SummaryDto?, budgets: List<BudgetDto>, goals: List<GoalDto>): GuiltFreePool? {
    val income = summary?.total_income ?: 0.0
    if (income <= 0) return null
    val totalBudgeted = budgets.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
    if (totalBudgeted == 0.0) return null

    val goalMonthly = goals.filter { it.deadline != null }.sumOf { goal ->
        val target = goal.target_amount.toDoubleOrNull() ?: 0.0
        val saved = goal.saved_amount.toDoubleOrNull() ?: 0.0
        val remaining = target - saved
        if (remaining <= 0) return@sumOf 0.0
        val deadline = runCatching { LocalDate.parse(goal.deadline!!.take(10)) }.getOrNull() ?: return@sumOf 0.0
        val months = maxOf(1, ceil(java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), deadline) / 30.44).toInt())
        remaining / months
    }

    val pool = (income - totalBudgeted - goalMonthly).coerceAtLeast(0.0)
    val budgetedSpent = budgets.sumOf { it.spent.toDoubleOrNull() ?: 0.0 }
    val unbudgetedSpent = ((summary?.total_expenses ?: 0.0) - budgetedSpent).coerceAtLeast(0.0)
    val remaining = (pool - unbudgetedSpent).coerceAtLeast(0.0)
    val usedPct = if (pool > 0) (unbudgetedSpent / pool * 100).toFloat().coerceIn(0f, 100f) else 0f

    return GuiltFreePool(income, totalBudgeted, goalMonthly, pool, unbudgetedSpent, remaining, usedPct)
}

@Composable
fun GuiltFreeBudgetCard(summary: SummaryDto?, budgets: List<BudgetDto>, goals: List<GoalDto>) {
    val data = computeGuiltFreePool(summary, budgets, goals) ?: return
    val color = if (data.remaining > 0) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorWarn

    Surface(shape = RoundedCornerShape(16.dp), color = color.copy(alpha = 0.08f), modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Column {
                    Text("Guilt-free budget", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(formatInr(data.remaining), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("of pool", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(formatInr(data.pool), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            LinearProgressIndicator(
                progress = { data.usedPct / 100f },
                color = if (data.usedPct > 80) FinTrackColors.Dark.colorWarn else FinTrackColors.Dark.colorInc,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space2))
            val goalsSuffix = if (data.goalMonthly > 0) " − ${formatInr(data.goalMonthly)} goals" else ""
            Text(
                "${formatInr(data.income)} income − ${formatInr(data.totalBudgeted)} budgets$goalsSuffix = ${formatInr(data.pool)} pool",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ─── Budgets overview ───────────────────────────────────────────────────

@Composable
fun BudgetsOverviewCard(budgets: List<BudgetDto>) {
    if (budgets.isEmpty()) return
    val totalBudgeted = budgets.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
    val totalSpent = budgets.sumOf { it.spent.toDoubleOrNull() ?: 0.0 }
    val overCount = budgets.count { (it.spent.toDoubleOrNull() ?: 0.0) > (it.amount.toDoubleOrNull() ?: 0.0) }
    val usagePct = if (totalBudgeted > 0) (totalSpent / totalBudgeted).toFloat().coerceIn(0f, 1f) else 0f
    val color = when {
        usagePct >= 1f -> FinTrackColors.Dark.colorExp
        usagePct >= 0.8f -> FinTrackColors.Dark.colorWarn
        else -> FinTrackColors.Dark.colorInc
    }

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Budgets", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                if (overCount > 0) {
                    Text("$overCount over", style = MaterialTheme.typography.labelSmall, color = FinTrackColors.Dark.colorExp)
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text("${formatInr(totalSpent)} of ${formatInr(totalBudgeted)}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            LinearProgressIndicator(progress = { usagePct }, color = color, modifier = Modifier.fillMaxWidth())
        }
    }
}

// ─── Top categories ─────────────────────────────────────────────────────

@Composable
fun TopCategoriesCard(budgets: List<BudgetDto>) {
    val top = budgets.sortedByDescending { it.spent.toDoubleOrNull() ?: 0.0 }.take(5)
    if (top.isEmpty()) return

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text("Top Categories", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space3))
            top.forEach { budget ->
                val spent = budget.spent.toDoubleOrNull() ?: 0.0
                val amount = budget.amount.toDoubleOrNull()?.takeIf { it > 0 } ?: 1.0
                val progress = (spent / amount).toFloat().coerceIn(0f, 1f)
                val color = runCatching { Color(android.graphics.Color.parseColor(budget.category_color)) }.getOrDefault(FinTrackColors.Dark.accent)

                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
                    Text(budget.category_name ?: "Uncategorized", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(FinTrackSpacing.space2))
                    LinearProgressIndicator(progress = { progress }, color = color, modifier = Modifier.width(60.dp).height(6.dp))
                    Spacer(Modifier.width(FinTrackSpacing.space2))
                    Text(formatInr(spent), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

// ─── Recent transactions ────────────────────────────────────────────────

@Composable
fun RecentTransactionsCard(transactions: List<TransactionDto>) {
    val recent = transactions.sortedByDescending { it.date }.take(5)
    if (recent.isEmpty()) return

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text("Recent Transactions", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space3))
            recent.forEach { tx ->
                val isIncome = tx.type == "income"
                val color = if (isIncome) FinTrackColors.Dark.colorInc else MaterialTheme.colorScheme.onSurface
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(tx.description, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, maxLines = 1)
                        Text(
                            tx.category_name ?: tx.date.take(10),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        "${if (isIncome) "+" else "−"}${formatInr(tx.amount)}",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Bold,
                        color = color,
                    )
                }
            }
        }
    }
}
