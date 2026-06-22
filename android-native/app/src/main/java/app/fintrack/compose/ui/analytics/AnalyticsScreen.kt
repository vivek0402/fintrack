package app.fintrack.compose.ui.analytics

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.SentimentVeryDissatisfied
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@Composable
fun AnalyticsScreen(viewModel: AnalyticsViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error.orEmpty(),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            else -> LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
                item {
                    Text("Insights", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                }
                item {
                    RegretScoreCard(
                        isLoading = state.isRegretLoading,
                        insight = state.regretPatterns?.insight,
                        count = state.regretPatterns?.count ?: 0,
                        total = state.regretPatterns?.total ?: 0.0,
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                }
                item {
                    CollapsibleSection(title = "Where Your Money Flows") {
                        SankeyMoneyFlowChart(state.transactions)
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                }
                item {
                    CollapsibleSection(title = "Spending Heatmap — Last 12 Months") {
                        SpendingHeatmapChart(state.transactions)
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                }
                item {
                    CollapsibleSection(title = "Category Trajectory") {
                        CategoryTrajectoryGrid(state.transactions)
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                }
                item {
                    CollapsibleSection(title = "Purchase Regret Analysis", initiallyExpanded = true) {
                        RegretAnalysisSection(state.transactions)
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                }
            }
        }
    }
}

@Composable
private fun RegretScoreCard(isLoading: Boolean, insight: String?, count: Int, total: Double) {
    Surface(shape = RoundedCornerShape(16.dp), color = FinTrackColors.Dark.colorExp.copy(alpha = 0.06f), modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Icon(Icons.Filled.SentimentVeryDissatisfied, contentDescription = null, tint = FinTrackColors.Dark.colorExp)
            Spacer(Modifier.width(FinTrackSpacing.space3))
            Column(modifier = Modifier.weight(1f)) {
                Text("Regret Score", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(FinTrackSpacing.space1))
                when {
                    isLoading -> Text("Analysing your regretted purchases…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    count == 0 -> Text("No regretted purchases logged yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    else -> {
                        Text(
                            "$count purchase(s) totaling ${formatInr(total)} marked as regretted.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        insight?.let {
                            Spacer(Modifier.height(FinTrackSpacing.space1))
                            Text(it, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CollapsibleSection(title: String, initiallyExpanded: Boolean = false, content: @Composable () -> Unit) {
    var expanded by remember { mutableStateOf(initiallyExpanded) }
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                IconButton(onClick = { expanded = !expanded }) {
                    Icon(if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = "Toggle")
                }
            }
            if (expanded) {
                Spacer(Modifier.height(FinTrackSpacing.space2))
                HorizontalDivider()
                Spacer(Modifier.height(FinTrackSpacing.space3))
                content()
            }
        }
    }
}
