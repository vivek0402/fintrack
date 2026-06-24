package app.fintrack.compose.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.DailyBriefingDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

private data class StatTile(val label: String, val value: String, val sub: String, val color: Color)

@Composable
fun DashboardScreen(viewModel: DashboardViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error.orEmpty(),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            else -> DashboardContent(
                state = state,
                onRefreshDailyBrief = viewModel::refreshDailyBrief,
                onDismissCreditAlert = viewModel::dismissCreditAlert,
                onDismissDtiAlert = viewModel::dismissDtiAlert,
                onDismissOpportunity = viewModel::dismissOpportunity,
                onActOnOpportunity = viewModel::markOpportunityActedOn,
            )
        }
    }

    RegretCheckPromptSheet()
}

@Composable
private fun DashboardContent(
    state: DashboardUiState,
    onRefreshDailyBrief: () -> Unit,
    onDismissCreditAlert: () -> Unit,
    onDismissDtiAlert: () -> Unit,
    onDismissOpportunity: (String) -> Unit,
    onActOnOpportunity: (String) -> Unit,
) {
    val summary = state.summary?.summary
    val netBalance = (summary?.total_income ?: 0.0) - (summary?.total_expenses ?: 0.0)
    val netWorth = state.netWorth?.current?.net_worth ?: 0.0
    val trend = state.wealthVelocity?.trend
    val firstName = state.profile?.full_name?.trim()?.split(" ")?.firstOrNull()

    val today = LocalDate.now()
    val daysInMonth = today.lengthOfMonth()
    val daysElapsed = today.dayOfMonth
    val daysRemaining = daysInMonth - daysElapsed
    val dailyBurn = if (daysElapsed > 0) (summary?.total_expenses ?: 0.0) / daysElapsed else 0.0

    val tiles = listOf(
        StatTile("Total Income", formatInr(summary?.total_income ?: 0.0), "this month", FinTrackColors.Dark.colorInc),
        StatTile("Total Expenses", formatInr(summary?.total_expenses ?: 0.0), "this month", FinTrackColors.Dark.colorExp),
        StatTile("Net Balance", formatInr(netBalance), if (netBalance < 0) "Deficit" else "Surplus", FinTrackColors.Dark.accent),
        StatTile("Net Worth", formatInr(netWorth), trend?.replace('_', ' ') ?: "—", FinTrackColors.Dark.accent),
        StatTile(
            "Investing",
            "${state.investmentRatio?.ratio_pct?.roundToInt() ?: 0}%",
            "of income this month",
            FinTrackColors.Dark.colorInc,
        ),
        StatTile("Days Remaining", "$daysRemaining", "in this month", FinTrackColors.Dark.accent),
        StatTile("Daily Burn", formatInr(dailyBurn), "per day so far", FinTrackColors.Dark.colorWarn),
    )

    val dti = state.dti
    val creditUtil = state.creditUtilization
    val showDtiAlert = !state.dismissedDtiAlert && (dti?.dti_ratio ?: 0.0) > 35.0
    val showCreditAlert = !state.dismissedCreditAlert && (creditUtil?.aggregate?.overall_utilization_pct ?: 0.0) > 50.0

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(FinTrackSpacing.space4),
        horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            Column {
                GreetingHeader(firstName = firstName, savingsRate = summary?.savings_rate)
                Spacer(Modifier.height(FinTrackSpacing.space3))
            }
        }
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            NetBalanceHero(netBalance, summary?.total_income ?: 0.0, summary?.total_expenses ?: 0.0)
        }
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            DailyBriefCard(
                brief = state.dailyBrief,
                isLoading = state.isDailyBriefLoading,
                isRefreshing = state.isDailyBriefRefreshing,
                error = state.dailyBriefError,
                onRefresh = onRefreshDailyBrief,
            )
        }
        items(tiles) { tile -> StatTileCard(tile) }
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            HealthScoreTile(state.healthScoreResult, state.isLoading)
        }
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            GuiltFreeBudgetCard(summary, state.budgets, state.goals)
        }
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            DashboardTrendCard(state.trends?.trends ?: emptyList())
        }
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            WeeklyBriefCard(state.weeklyBrief, state.isWeeklyBriefLoading, state.weeklyBriefError)
        }
        if (showDtiAlert) {
            item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                DebtAlertBanner(
                    "Your debt-to-income ratio is ${dti?.dti_ratio?.roundToInt()}% — above the recommended 35%.",
                    onDismiss = onDismissDtiAlert,
                )
            }
        }
        if (showCreditAlert) {
            item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                DebtAlertBanner(
                    "Credit utilization is ${creditUtil?.aggregate?.overall_utilization_pct?.roundToInt()}% — paying it down can improve your score.",
                    onDismiss = onDismissCreditAlert,
                )
            }
        }
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            OpportunitiesSection(state.opportunities, onDismiss = onDismissOpportunity, onActOn = onActOnOpportunity)
        }
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            BudgetsOverviewCard(state.budgets)
        }
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            TopCategoriesCard(state.budgets)
        }
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            RecentTransactionsCard(state.recentTransactions)
        }
    }
}

@Composable
private fun GreetingHeader(firstName: String?, savingsRate: Double?) {
    val hour = java.time.LocalTime.now().hour
    val timeOfDay = when {
        hour < 12 -> "morning"
        hour < 17 -> "afternoon"
        else -> "evening"
    }
    val greeting = "Good $timeOfDay" + (firstName?.let { ", $it" } ?: "")

    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
        Text(greeting, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        if (savingsRate != null) {
            val (label, color) = when {
                savingsRate >= 20 -> "Good" to FinTrackColors.Dark.colorInc
                savingsRate >= 10 -> "Fair" to FinTrackColors.Dark.colorWarn
                else -> "Needs work" to FinTrackColors.Dark.colorExp
            }
            Surface(shape = RoundedCornerShape(20.dp), color = color.copy(alpha = 0.12f)) {
                Text(
                    "Savings: $label",
                    style = MaterialTheme.typography.labelSmall,
                    color = color,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = FinTrackSpacing.space3, vertical = FinTrackSpacing.space1),
                )
            }
        }
    }
}

@Composable
private fun DailyBriefCard(
    brief: DailyBriefingDto?,
    isLoading: Boolean,
    isRefreshing: Boolean,
    error: String?,
    onRefresh: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space5)) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = FinTrackColors.Dark.accent)
                    Spacer(Modifier.width(FinTrackSpacing.space2))
                    Column {
                        Text("Your Daily Brief", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(
                            LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, MMM d")),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                IconButton(onClick = onRefresh, enabled = !isRefreshing && !isLoading) {
                    if (isRefreshing) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            when {
                isLoading -> CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                error != null -> Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                brief != null -> {
                    Text(brief.narrative, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                        brief.points.forEach { point ->
                            Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                                Text(
                                    "${point.label}: ${point.value}",
                                    style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.padding(horizontal = FinTrackSpacing.space3, vertical = FinTrackSpacing.space2),
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    Surface(shape = RoundedCornerShape(12.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.10f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(FinTrackSpacing.space3)) {
                            Icon(Icons.Filled.Lightbulb, contentDescription = null, tint = FinTrackColors.Dark.accent)
                            Spacer(Modifier.width(FinTrackSpacing.space2))
                            Text(brief.action_of_the_day, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NetBalanceHero(netBalance: Double, income: Double, expenses: Double) {
    val isPositive = netBalance >= 0
    val color = if (isPositive) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space6)) {
            Text(
                "Net Balance",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                (if (isPositive) "" else "−") + formatInr(kotlin.math.abs(netBalance)),
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Surface(shape = RoundedCornerShape(20.dp), color = color.copy(alpha = 0.12f)) {
                Text(
                    "${if (isPositive) "+" else ""}${formatInr(netBalance)} this month",
                    style = MaterialTheme.typography.labelMedium,
                    color = color,
                    modifier = Modifier.padding(horizontal = FinTrackSpacing.space3, vertical = FinTrackSpacing.space1),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                "${formatInr(income)} in · ${formatInr(expenses)} out",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun StatTileCard(tile: StatTile) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = tile.color.copy(alpha = 0.10f),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text(
                tile.label.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(tile.value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = tile.color)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(tile.sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
