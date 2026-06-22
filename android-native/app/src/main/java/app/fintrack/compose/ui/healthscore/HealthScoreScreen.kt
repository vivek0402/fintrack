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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.HealthReportResponse
import app.fintrack.compose.ui.common.formatInr
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
                Text("Generating your health report…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            state.error != null -> Text(
                state.error.orEmpty(),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            state.report != null -> HealthScoreContent(state.report!!)
        }
    }
}

private fun gradeColor(grade: String): androidx.compose.ui.graphics.Color = when {
    grade.startsWith("A") -> FinTrackColors.Dark.colorInc
    grade == "B" -> FinTrackColors.Dark.accent
    grade == "C" -> FinTrackColors.Dark.colorWarn
    else -> FinTrackColors.Dark.colorExp
}

@Composable
private fun HealthScoreContent(report: HealthReportResponse) {
    val color = gradeColor(report.grade)

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(FinTrackSpacing.space6), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Financial Health Score", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            "${report.health_score.toInt()}",
                            style = MaterialTheme.typography.displayMedium,
                            fontWeight = FontWeight.Bold,
                            color = color,
                        )
                        Text("/100", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Surface(shape = RoundedCornerShape(20.dp), color = color.copy(alpha = 0.12f)) {
                        Text(
                            "Grade ${report.grade}",
                            style = MaterialTheme.typography.labelMedium,
                            color = color,
                            modifier = Modifier.padding(horizontal = FinTrackSpacing.space3, vertical = FinTrackSpacing.space1),
                        )
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                    Text(report.narrative, style = MaterialTheme.typography.bodyMedium)
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }

        item {
            Text("Score Breakdown", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            ScoreBar("Income Stability", report.scores.income_stability)
            ScoreBar("Expense Control", report.scores.expense_control)
            ScoreBar("Budget Adherence", report.scores.budget_adherence)
            ScoreBar("Savings Rate", report.scores.savings_rate)
            ScoreBar("Goal Progress", report.scores.goal_progress)
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }

        if (report.strengths.isNotEmpty()) {
            item {
                Text("Strengths", style = MaterialTheme.typography.titleMedium, color = FinTrackColors.Dark.colorInc)
                Spacer(Modifier.height(FinTrackSpacing.space2))
                report.strengths.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 4.dp)) }
                Spacer(Modifier.height(FinTrackSpacing.space4))
            }
        }

        if (report.improvements.isNotEmpty()) {
            item {
                Text("Room to Improve", style = MaterialTheme.typography.titleMedium, color = FinTrackColors.Dark.colorWarn)
                Spacer(Modifier.height(FinTrackSpacing.space2))
                report.improvements.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 4.dp)) }
                Spacer(Modifier.height(FinTrackSpacing.space4))
            }
        }

        if (report.topCategories.isNotEmpty()) {
            item {
                Text("Top Spending Categories", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(FinTrackSpacing.space2))
                report.topCategories.forEach { cat ->
                    Row(
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1),
                    ) {
                        Text(cat.name, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(formatInr(cat.amount), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    }
                }
            }
        }
    }
}

@Composable
private fun ScoreBar(label: String, score: Double) {
    Column(modifier = Modifier.padding(bottom = FinTrackSpacing.space3)) {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${score.toInt()}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
        }
        Spacer(Modifier.height(FinTrackSpacing.space1))
        LinearProgressIndicator(
            progress = { (score / 100.0).toFloat().coerceIn(0f, 1f) },
            color = FinTrackColors.Dark.accent,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
