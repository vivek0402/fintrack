package app.fintrack.compose.ui.dashboard

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.TrendPointDto
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import java.time.YearMonth
import java.time.format.TextStyle
import java.util.Locale

private data class MonthlyTrend(val yearMonth: YearMonth, val income: Double, val expense: Double)

private fun buildMonthlyTrends(trends: List<TrendPointDto>): List<MonthlyTrend> {
    val totals = LinkedHashMap<YearMonth, Pair<Double, Double>>()
    trends.forEach { point ->
        val ym = YearMonth.of(point.year.toInt(), point.month.toInt())
        val amount = point.total.toDoubleOrNull() ?: 0.0
        val (income, expense) = totals[ym] ?: (0.0 to 0.0)
        totals[ym] = if (point.type == "income") (income + amount) to expense else income to (expense + amount)
    }
    val now = YearMonth.now()
    return (5 downTo 0).map { offset ->
        val ym = now.minusMonths(offset.toLong())
        val (income, expense) = totals[ym] ?: (0.0 to 0.0)
        MonthlyTrend(ym, income, expense)
    }
}

@Composable
fun DashboardTrendCard(trends: List<TrendPointDto>) {
    val monthly = remember(trends) { buildMonthlyTrends(trends) }

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("6-Month Trend", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3)) {
                    LegendDot("Income", FinTrackColors.Dark.colorInc)
                    LegendDot("Expense", FinTrackColors.Dark.colorExp)
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))
            TrendLines(monthly, modifier = Modifier.fillMaxWidth().height(110.dp))
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                monthly.forEach { m ->
                    Text(
                        m.yearMonth.month.getDisplayName(TextStyle.SHORT, Locale.getDefault()),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun LegendDot(label: String, color: androidx.compose.ui.graphics.Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = CircleShape, color = color, modifier = Modifier.size(8.dp)) {}
        Spacer(Modifier.width(FinTrackSpacing.space1))
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun TrendLines(monthly: List<MonthlyTrend>, modifier: Modifier = Modifier) {
    val incomeColor = FinTrackColors.Dark.colorInc
    val expenseColor = FinTrackColors.Dark.colorExp

    Canvas(modifier = modifier) {
        if (monthly.isEmpty() || size.width <= 0f) return@Canvas
        val maxVal = monthly.flatMap { listOf(it.income, it.expense) }.maxOrNull()?.coerceAtLeast(1.0) ?: 1.0
        val stepX = if (monthly.size > 1) size.width / (monthly.size - 1) else size.width

        fun pathFor(selector: (MonthlyTrend) -> Double): Path {
            val points = monthly.mapIndexed { index, m ->
                Offset(index * stepX, size.height - (selector(m) / maxVal * size.height).toFloat())
            }
            return Path().apply {
                moveTo(points.first().x, points.first().y)
                points.drop(1).forEach { lineTo(it.x, it.y) }
            }
        }

        drawPath(pathFor { it.expense }, color = expenseColor, style = Stroke(width = 2.dp.toPx()))
        drawPath(pathFor { it.income }, color = incomeColor, style = Stroke(width = 2.dp.toPx()))
    }
}
