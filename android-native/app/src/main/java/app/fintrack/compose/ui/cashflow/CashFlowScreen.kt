package app.fintrack.compose.ui.cashflow

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
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
import app.fintrack.compose.data.api.CashflowMonthDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@Composable
fun CashFlowScreen(viewModel: CashFlowViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error.orEmpty(),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            else -> CashFlowContent(state.cashflow)
        }
    }
}

internal fun statusColor(status: String): Color = when (status) {
    "surplus" -> FinTrackColors.Dark.colorInc
    "healthy" -> FinTrackColors.Dark.accent
    "tight" -> FinTrackColors.Dark.colorWarn
    else -> FinTrackColors.Dark.colorExp
}

@Composable
private fun CashFlowContent(cashflow: app.fintrack.compose.data.api.CashflowResponse?) {
    if (cashflow == null) return

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(FinTrackSpacing.space6)) {
                    Text("Avg. Monthly Surplus", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Text(
                        formatInr(cashflow.summary.average_monthly_surplus),
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                        color = if (cashflow.summary.average_monthly_surplus >= 0) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp,
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Text(
                        "${formatInr(cashflow.average_monthly_income)} in · ${formatInr(cashflow.average_monthly_expenses + cashflow.fixed_monthly_outflows + cashflow.recurring_outflows)} out",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3), modifier = Modifier.fillMaxWidth()) {
                MiniStat("Months Surplus", "${cashflow.summary.months_surplus}/12", FinTrackColors.Dark.colorInc, Modifier.weight(1f))
                MiniStat("Months At Risk", "${cashflow.summary.months_at_risk}/12", FinTrackColors.Dark.colorExp, Modifier.weight(1f))
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        item {
            CashFlowWaterfallCard(cashflow.months)
            Spacer(Modifier.height(FinTrackSpacing.space3))
            CashFlowRunningBalanceCard(cashflow.months)
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        item {
            Text("12-Month Projection", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(FinTrackSpacing.space2))
        }
        items(cashflow.months) { month -> MonthRow(month) }

        if (cashflow.loan_breakdown.isNotEmpty()) {
            item {
                Spacer(Modifier.height(FinTrackSpacing.space4))
                Text("Fixed Loan EMIs", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(FinTrackSpacing.space2))
            }
            items(cashflow.loan_breakdown) { loan ->
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1),
                ) {
                    Text(loan.name, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(formatInr(loan.emi), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
private fun MiniStat(label: String, value: String, color: Color, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(16.dp), color = color.copy(alpha = 0.10f), modifier = modifier) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

@Composable
private fun MonthRow(month: CashflowMonthDto) {
    val color = statusColor(month.status)
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3),
        ) {
            Column {
                Text(month.month, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Text(
                    "Balance: ${formatInr(month.running_balance)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Surface(shape = RoundedCornerShape(20.dp), color = color.copy(alpha = 0.12f)) {
                Text(
                    month.status.replace('_', ' '),
                    style = MaterialTheme.typography.labelMedium,
                    color = color,
                    modifier = Modifier.padding(horizontal = FinTrackSpacing.space3, vertical = FinTrackSpacing.space1),
                )
            }
        }
    }
}
