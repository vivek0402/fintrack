package app.fintrack.compose.ui.analytics

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import java.time.LocalDate
import java.time.YearMonth

private data class TrajectoryCategory(val name: String, val monthly: List<Double>, val current: Double, val trendPct: Int)

private fun buildTrajectoryCategories(transactions: List<TransactionDto>): List<TrajectoryCategory> {
    val now = YearMonth.now()
    val months = (5 downTo 0).map { now.minusMonths(it.toLong()) }
    val catMap = LinkedHashMap<String, MutableMap<YearMonth, Double>>()

    transactions.filter { it.type == "expense" }.forEach { tx ->
        val date = runCatching { LocalDate.parse(tx.date.take(10)) }.getOrNull() ?: return@forEach
        val ym = YearMonth.from(date)
        val amount = tx.amount.toDoubleOrNull() ?: return@forEach
        val category = tx.category_name ?: "Other"
        val monthMap = catMap.getOrPut(category) { mutableMapOf() }
        monthMap[ym] = (monthMap[ym] ?: 0.0) + amount
    }

    return catMap.entries
        .map { (name, monthMap) ->
            val monthly = months.map { monthMap[it] ?: 0.0 }
            val current = monthly[5]
            val prev = monthly[4]
            val trendPct = if (prev > 0) (((current - prev) / prev) * 100).toInt() else 0
            TrajectoryCategory(name, monthly, current, trendPct)
        }
        .filter { it.current > 0 || it.monthly.any { v -> v > 0 } }
        .sortedByDescending { it.current }
        .take(12)
}

@Composable
fun CategoryTrajectoryGrid(transactions: List<TransactionDto>) {
    val categories = remember(transactions) { buildTrajectoryCategories(transactions) }
    if (categories.isEmpty()) {
        Text(
            "Add expense transactions to see category trends.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2),
        verticalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2),
        contentPadding = PaddingValues(vertical = FinTrackSpacing.space1),
        modifier = Modifier.height(((categories.size + 1) / 2 * 120).dp),
    ) {
        items(categories) { category -> TrajectoryCard(category) }
    }
}

@Composable
private fun TrajectoryCard(category: TrajectoryCategory) {
    val isUp = category.trendPct > 0
    val lineColor = if (isUp) FinTrackColors.Dark.colorExp else FinTrackColors.Dark.colorInc

    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space3)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(category.name, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Medium, maxLines = 1, modifier = Modifier.weight(1f))
                if (category.trendPct != 0) {
                    Text(
                        "${if (isUp) "▲" else "▼"} ${kotlin.math.abs(category.trendPct)}%",
                        style = MaterialTheme.typography.labelSmall,
                        color = lineColor,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            Text(formatInr(category.current), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Sparkline(values = category.monthly, lineColor = lineColor, modifier = Modifier.fillMaxWidth().height(48.dp))
        }
    }
}

@Composable
private fun Sparkline(values: List<Double>, lineColor: Color, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        if (values.isEmpty() || size.width <= 0f) return@Canvas
        val maxVal = (values.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
        val stepX = if (values.size > 1) size.width / (values.size - 1) else size.width
        val points = values.mapIndexed { index, value ->
            val x = index * stepX
            val y = size.height - (value / maxVal * size.height).toFloat()
            androidx.compose.ui.geometry.Offset(x, y)
        }

        val linePath = Path().apply {
            moveTo(points.first().x, points.first().y)
            points.drop(1).forEach { lineTo(it.x, it.y) }
        }
        val fillPath = Path().apply {
            addPath(linePath)
            lineTo(points.last().x, size.height)
            lineTo(points.first().x, size.height)
            close()
        }
        drawPath(fillPath, brush = Brush.verticalGradient(listOf(lineColor.copy(alpha = 0.3f), lineColor.copy(alpha = 0f))))
        drawPath(linePath, color = lineColor, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.5.dp.toPx()))
    }
}
