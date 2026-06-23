package app.fintrack.compose.ui.networth

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
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.NetWorthHistoryPointDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

private val NET_WORTH_TABS = listOf("Overview", "Velocity")

@Composable
fun NetWorthScreen(viewModel: NetWorthViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    var selectedTab by remember { mutableIntStateOf(0) }

    Column(modifier = Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = selectedTab) {
            NET_WORTH_TABS.forEachIndexed { index, label ->
                Tab(selected = selectedTab == index, onClick = { selectedTab = index }, text = { Text(label) })
            }
        }
        Box(modifier = Modifier.fillMaxSize()) {
            when {
                state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                state.error != null -> Text(
                    state.error.orEmpty(),
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
                )
                selectedTab == 1 -> NetWorthVelocityContent(state.wealthVelocity)
                else -> NetWorthContent(state)
            }
        }
    }
}

@Composable
private fun NetWorthContent(state: NetWorthUiState) {
    val current = state.netWorth?.current
    val history = state.netWorth?.history.orEmpty()
    val trend = state.wealthVelocity?.trend

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            NetWorthHero(netWorth = current?.net_worth ?: 0.0, trend = trend)
            Spacer(Modifier.height(FinTrackSpacing.space3))
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3), modifier = Modifier.fillMaxWidth()) {
                BreakdownCard(
                    label = "Assets",
                    amount = current?.total_assets ?: 0.0,
                    color = FinTrackColors.Dark.colorInc,
                    modifier = Modifier.weight(1f),
                )
                BreakdownCard(
                    label = "Liabilities",
                    amount = current?.total_liabilities ?: 0.0,
                    color = FinTrackColors.Dark.colorExp,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        item {
            Text("Breakdown", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(FinTrackSpacing.space2))
        }
        item {
            BreakdownLine("Bank Balance", current?.total_bank_balance ?: 0.0)
            BreakdownLine("Investments", current?.total_investments ?: 0.0)
            BreakdownLine("Credit Outstanding", -(current?.total_credit_outstanding ?: 0.0))
            BreakdownLine("Loans Outstanding", -(current?.total_loans_outstanding ?: 0.0))
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        if (history.isNotEmpty()) {
            item {
                Text("History", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(FinTrackSpacing.space2))
            }
            items(history.reversed()) { point -> HistoryRow(point) }
        }
    }
}

@Composable
private fun NetWorthHero(netWorth: Double, trend: String?) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space6)) {
            Text("Net Worth", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                formatInr(netWorth),
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (trend != null && trend != "insufficient_data") {
                Spacer(Modifier.height(FinTrackSpacing.space2))
                Surface(shape = RoundedCornerShape(20.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.12f)) {
                    Text(
                        trend.replace('_', ' ').replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelMedium,
                        color = FinTrackColors.Dark.accent,
                        modifier = Modifier.padding(horizontal = FinTrackSpacing.space3, vertical = FinTrackSpacing.space1),
                    )
                }
            }
        }
    }
}

@Composable
private fun BreakdownCard(label: String, amount: Double, color: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(16.dp), color = color.copy(alpha = 0.10f), modifier = modifier) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(formatInr(amount), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

@Composable
private fun BreakdownLine(label: String, amount: Double) {
    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2),
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            (if (amount < 0) "−" else "") + formatInr(kotlin.math.abs(amount)),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun HistoryRow(point: NetWorthHistoryPointDto) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3),
        ) {
            Text(point.snapshot_date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(formatInr(point.net_worth), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
        }
    }
}
