package app.fintrack.compose.ui.healthscore

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
import androidx.compose.material3.LinearProgressIndicator
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
import app.fintrack.compose.domain.HealthGrade
import app.fintrack.compose.domain.HealthScoreFactor
import app.fintrack.compose.domain.HealthScoreResult
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@Composable
fun HealthScoreScreen(viewModel: HealthScoreViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> Column(modifier = Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator()
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Text("Calculating your health score…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            state.error != null -> Text(
                state.error.orEmpty(),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            state.result != null -> HealthScoreContent(state.result!!)
        }
    }
}

private fun gradeColor(grade: HealthGrade): Color = when (grade) {
    HealthGrade.EXCELLENT -> FinTrackColors.Dark.colorInc
    HealthGrade.GOOD -> FinTrackColors.Dark.accent
    HealthGrade.FAIR -> FinTrackColors.Dark.colorWarn
    HealthGrade.NEEDS_ATTENTION, HealthGrade.CRITICAL -> FinTrackColors.Dark.colorExp
}

private fun gradeLabel(grade: HealthGrade): String = when (grade) {
    HealthGrade.EXCELLENT -> "Excellent"
    HealthGrade.GOOD -> "Good"
    HealthGrade.FAIR -> "Fair"
    HealthGrade.NEEDS_ATTENTION -> "Needs Attention"
    HealthGrade.CRITICAL -> "Critical"
}

@Composable
private fun HealthScoreContent(result: HealthScoreResult) {
    val color = gradeColor(result.grade)

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(FinTrackSpacing.space6), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Financial Health Score", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            "${result.score}",
                            style = MaterialTheme.typography.displayMedium,
                            fontWeight = FontWeight.Bold,
                            color = color,
                        )
                        Text("/100", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Surface(shape = RoundedCornerShape(20.dp), color = color.copy(alpha = 0.12f)) {
                        Text(
                            gradeLabel(result.grade),
                            style = MaterialTheme.typography.labelMedium,
                            color = color,
                            modifier = Modifier.padding(horizontal = FinTrackSpacing.space3, vertical = FinTrackSpacing.space1),
                        )
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }

        item {
            Text("Factor Breakdown", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(FinTrackSpacing.space2))
        }

        items(result.breakdown) { factor -> FactorRow(factor) }
    }
}

@Composable
private fun FactorRow(factor: HealthScoreFactor) {
    val barColor = when {
        factor.pct >= 70 -> FinTrackColors.Dark.colorInc
        factor.pct >= 40 -> FinTrackColors.Dark.colorWarn
        else -> FinTrackColors.Dark.colorExp
    }
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space4)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(factor.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Text(
                    "${factor.score.toInt()}/${factor.max.toInt()}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = barColor,
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            LinearProgressIndicator(
                progress = { (factor.pct / 100.0).toFloat().coerceIn(0f, 1f) },
                color = barColor,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(factor.tip, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
