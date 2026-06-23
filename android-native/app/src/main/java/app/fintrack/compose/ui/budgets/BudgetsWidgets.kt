package app.fintrack.compose.ui.budgets

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.BudgetDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@Composable
fun BudgetHealthFilterChips(state: BudgetsUiState, onFilterChange: (BudgetHealthFilter) -> Unit) {
    if (state.budgets.isEmpty()) return
    Row(
        horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2),
        modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space2),
    ) {
        FilterChip(
            selected = state.healthFilter == BudgetHealthFilter.ALL,
            onClick = { onFilterChange(BudgetHealthFilter.ALL) },
            label = { Text("All · ${state.budgets.size}") },
        )
        FilterChip(
            selected = state.healthFilter == BudgetHealthFilter.ON_TRACK,
            onClick = { onFilterChange(BudgetHealthFilter.ON_TRACK) },
            label = { Text("✅ On track · ${state.onTrackCount}") },
        )
        FilterChip(
            selected = state.healthFilter == BudgetHealthFilter.OVER,
            onClick = { onFilterChange(BudgetHealthFilter.OVER) },
            label = { Text("🔴 Over · ${state.overBudgetList.size}") },
        )
        FilterChip(
            selected = state.healthFilter == BudgetHealthFilter.SUGGESTION,
            onClick = { onFilterChange(BudgetHealthFilter.SUGGESTION) },
            label = { Text("💡 Suggestions · ${state.suggestions.size}") },
        )
    }
}

@Composable
fun BudgetSummaryCards(state: BudgetsUiState) {
    Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3), modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4)) {
        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.weight(1f)) {
            Column(modifier = Modifier.padding(FinTrackSpacing.space3)) {
                Text("TOTAL BUDGET", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Text(formatInr(state.totalBudgeted), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = FinTrackColors.Dark.accent)
            }
        }
        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.weight(1f)) {
            Column(modifier = Modifier.padding(FinTrackSpacing.space3)) {
                Text("SPENT SO FAR", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Text(
                    formatInr(state.totalSpent),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (state.isOverTotal) FinTrackColors.Dark.colorExp else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

@Composable
fun BudgetOverallProgressCard(state: BudgetsUiState) {
    if (state.budgets.isEmpty()) return
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4)) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Overall Usage", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(
                    "${state.overallRawPct.coerceAtMost(100.0).toInt()}%",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (state.isOverTotal) FinTrackColors.Dark.colorExp else FinTrackColors.Dark.accent,
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            LinearProgressIndicator(
                progress = { (state.overallRawPct / 100.0).toFloat().coerceIn(0f, 1f) },
                color = if (state.isOverTotal) FinTrackColors.Dark.colorExp else FinTrackColors.Dark.accent,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(
                if (state.isOverTotal) "${formatInr(state.totalSpent - state.totalBudgeted)} over total budget" else "${formatInr(state.totalRemaining)} remaining across all categories",
                style = MaterialTheme.typography.labelSmall,
                color = if (state.isOverTotal) FinTrackColors.Dark.colorExp else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
fun ZeroBasedModeBanner(state: BudgetsUiState, onAllocate: () -> Unit) {
    if (!state.zeroBasedMode || state.monthlyIncome <= 0) return
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4)) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text("ZERO-BASED BUDGET", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                "${formatInr(state.monthlyIncome)} income allocated: ${formatInr(state.totalBudgeted)} budgeted, " +
                    if (state.unallocated >= 0) "${formatInr(state.unallocated)} unallocated" else "${formatInr(-state.unallocated)} over-allocated",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (state.unallocated > 0) {
                Spacer(Modifier.height(FinTrackSpacing.space2))
                Button(onClick = onAllocate) { Text("+ Allocate ${formatInr(state.unallocated)}") }
            }
        }
    }
}

@Composable
fun OverBudgetAlertBanner(overBudgetList: List<BudgetDto>) {
    if (overBudgetList.isEmpty()) return
    Surface(shape = RoundedCornerShape(16.dp), color = FinTrackColors.Dark.colorWarn.copy(alpha = 0.10f), modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4)) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text(
                "${overBudgetList.size} ${if (overBudgetList.size == 1) "category is" else "categories are"} over budget",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = FinTrackColors.Dark.colorWarn,
            )
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(
                overBudgetList.joinToString(", ") { it.category_name ?: "Uncategorized" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
fun BudgetSuggestionsBanner(
    suggestions: List<BudgetSuggestion>,
    adjustingId: String?,
    onAdjust: (BudgetSuggestion) -> Unit,
    onDismiss: (String) -> Unit,
) {
    if (suggestions.isEmpty()) return
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4)) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text("💡 Smart Suggestions", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space3))
            suggestions.forEach { suggestion ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(suggestion.categoryName ?: "Uncategorized", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                        Text(
                            if (suggestion.type == "over") {
                                "Averaging ${formatInr(suggestion.avgSpend)} — consider raising to ${formatInr(suggestion.suggestedAmount)}"
                            } else {
                                "Averaging ${formatInr(suggestion.avgSpend)} — consider lowering to ${formatInr(suggestion.suggestedAmount)}"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (adjustingId == suggestion.id) {
                        CircularProgressIndicator(modifier = Modifier.padding(FinTrackSpacing.space2), strokeWidth = 2.dp)
                    } else {
                        TextButton(onClick = { onDismiss(suggestion.id) }) { Text("Dismiss") }
                        OutlinedButton(onClick = { onAdjust(suggestion) }) { Text("Adjust") }
                    }
                }
            }
        }
    }
}

@Composable
fun CopyFromLastMonthButton(copyableCount: Int, isCopying: Boolean, onClick: () -> Unit) {
    if (copyableCount <= 0) return
    OutlinedButton(onClick = onClick, enabled = !isCopying, modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4)) {
        if (isCopying) {
            CircularProgressIndicator(modifier = Modifier.padding(2.dp), strokeWidth = 2.dp)
        } else {
            Text("Copy $copyableCount budget${if (copyableCount > 1) "s" else ""} from last month")
        }
    }
}
