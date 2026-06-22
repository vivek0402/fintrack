package app.fintrack.compose.ui.regret

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.SentimentVeryDissatisfied
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.RegretPatternDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@Composable
fun RegretScreen(viewModel: RegretViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.SentimentVeryDissatisfied, contentDescription = null, tint = FinTrackColors.Dark.colorExp)
                Spacer(Modifier.width(FinTrackSpacing.space2))
                Text("Regret Check", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                "Mark expenses you regret from the Transactions list — Fin will spot the patterns behind them.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space4))
            Button(onClick = viewModel::analyse, enabled = !state.isLoading) {
                if (state.isLoading) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Analyse Regrets")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }

        state.error?.let { error ->
            item { Text(error, color = MaterialTheme.colorScheme.error) }
        }

        state.result?.let { result ->
            if (result.count == 0) {
                item {
                    Text(
                        "No regretted purchases marked yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3), modifier = Modifier.fillMaxWidth()) {
                        RegretStat("Regretted", result.count.toString(), Modifier.weight(1f))
                        RegretStat("Total Value", formatInr(result.total), Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                }
                result.insight?.let { insight ->
                    item {
                        Surface(shape = RoundedCornerShape(12.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.10f), modifier = Modifier.fillMaxWidth()) {
                            Text(insight, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(FinTrackSpacing.space4))
                        }
                        Spacer(Modifier.height(FinTrackSpacing.space4))
                    }
                }
                items(result.patterns.orEmpty()) { pattern ->
                    PatternCard(pattern)
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                }
            }
        }
    }
}

@Composable
private fun RegretStat(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = modifier) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun PatternCard(pattern: RegretPatternDto) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Warning, contentDescription = null, tint = FinTrackColors.Dark.colorExp)
                Spacer(Modifier.width(FinTrackSpacing.space2))
                Text(pattern.pattern, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Text(
                    "${pattern.count}× · ${formatInr(pattern.total_amount)}",
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(horizontal = FinTrackSpacing.space3, vertical = FinTrackSpacing.space1),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Row(verticalAlignment = Alignment.Top) {
                Icon(Icons.Filled.Lightbulb, contentDescription = null, tint = FinTrackColors.Dark.accent, modifier = Modifier.padding(top = 2.dp))
                Spacer(Modifier.width(FinTrackSpacing.space2))
                Text(pattern.tip, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
