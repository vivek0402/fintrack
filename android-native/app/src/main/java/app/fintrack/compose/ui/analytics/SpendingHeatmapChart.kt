package app.fintrack.compose.ui.analytics

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import java.time.LocalDate
import kotlin.math.sqrt

private val HEATMAP_MONTH_LABELS = listOf("", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
private const val HEATMAP_CELL_DP = 11
private const val HEATMAP_GAP_DP = 2
private const val HEATMAP_COL_WIDTH_DP = HEATMAP_CELL_DP + HEATMAP_GAP_DP

private data class HeatmapCell(val date: LocalDate, val total: Double, val count: Int)
private data class HeatmapMonthMark(val weekIndex: Int, val label: String)

private data class HeatmapData(
    val weeks: List<List<HeatmapCell?>>,
    val monthMarks: List<HeatmapMonthMark>,
    val maxValue: Double,
)

private fun buildHeatmapData(transactions: List<TransactionDto>): HeatmapData {
    val today = LocalDate.now()
    val start = today.minusDays(363).let { it.minusDays(it.dayOfWeek.value.toLong() % 7) }

    val dailyTotals = HashMap<LocalDate, Pair<Double, Int>>()
    transactions.forEach { tx ->
        if (tx.type != "expense") return@forEach
        val date = runCatching { LocalDate.parse(tx.date.take(10)) }.getOrNull() ?: return@forEach
        val amount = tx.amount.toDoubleOrNull() ?: return@forEach
        val (sum, count) = dailyTotals[date] ?: (0.0 to 0)
        dailyTotals[date] = (sum + amount) to (count + 1)
    }

    val weeks = mutableListOf<MutableList<HeatmapCell?>>()
    var week = mutableListOf<HeatmapCell?>()
    var cursor = start
    while (!cursor.isAfter(today)) {
        val isSunday = cursor.dayOfWeek.value % 7 == 0
        if (isSunday && week.isNotEmpty()) {
            weeks.add(week)
            week = mutableListOf()
        }
        val daily = dailyTotals[cursor]
        week.add(HeatmapCell(cursor, daily?.first ?: 0.0, daily?.second ?: 0))
        cursor = cursor.plusDays(1)
    }
    if (week.isNotEmpty()) weeks.add(week)

    val monthMarks = mutableListOf<HeatmapMonthMark>()
    var lastMonth = -1
    weeks.forEachIndexed { index, w ->
        val month = w.firstOrNull()?.date?.monthValue ?: return@forEachIndexed
        if (month != lastMonth) {
            monthMarks.add(HeatmapMonthMark(index, HEATMAP_MONTH_LABELS[month]))
            lastMonth = month
        }
    }

    val maxValue = dailyTotals.values.maxOfOrNull { it.first } ?: 1.0
    return HeatmapData(weeks, monthMarks, maxOf(maxValue, 1.0))
}

internal fun heatmapCellColor(total: Double, maxValue: Double, surfaceColor: Color, expColor: Color): Color {
    if (total <= 0) return surfaceColor
    val t = sqrt((total / maxValue).coerceIn(0.0, 1.0))
    val fraction = (0.15 + t * 0.70).toFloat()
    return lerp(surfaceColor, expColor, fraction)
}

@Composable
fun SpendingHeatmapChart(transactions: List<TransactionDto>) {
    val data = remember(transactions) { buildHeatmapData(transactions) }
    val surfaceColor = MaterialTheme.colorScheme.surfaceVariant
    val expColor = FinTrackColors.Dark.colorExp
    val scrollState = rememberScrollState()

    LaunchedEffect(data) {
        scrollState.scrollTo(scrollState.maxValue)
    }

    Column {
        Row(modifier = Modifier.horizontalScroll(scrollState)) {
            Column {
                Box(modifier = Modifier.height(16.dp).width((data.weeks.size * HEATMAP_COL_WIDTH_DP + 22).dp)) {
                    data.monthMarks.forEach { mark ->
                        Text(
                            mark.label,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.offset(x = (22 + mark.weekIndex * HEATMAP_COL_WIDTH_DP).dp),
                        )
                    }
                }
                Row {
                    Column(verticalArrangement = Arrangement.spacedBy(HEATMAP_GAP_DP.dp), modifier = Modifier.width(20.dp)) {
                        listOf("", "M", "", "W", "", "F", "").forEach { label ->
                            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.height(HEATMAP_CELL_DP.dp))
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(HEATMAP_GAP_DP.dp)) {
                        data.weeks.forEach { week ->
                            Column(verticalArrangement = Arrangement.spacedBy(HEATMAP_GAP_DP.dp)) {
                                for (dow in 0..6) {
                                    val cell = week.getOrNull(dow)
                                    val color = when {
                                        cell == null -> Color.Transparent
                                        cell.date.isAfter(LocalDate.now()) -> Color.Transparent
                                        else -> heatmapCellColor(cell.total, data.maxValue, surfaceColor, expColor)
                                    }
                                    Box(
                                        modifier = Modifier
                                            .size(HEATMAP_CELL_DP.dp)
                                            .background(color, RoundedCornerShape(2.dp)),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(FinTrackSpacing.space2))
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.wrapContentSize()) {
            Text("Less", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            listOf(0.0, 0.2, 0.45, 0.7, 1.0).forEach { p ->
                val color = if (p == 0.0) surfaceColor else lerp(surfaceColor, expColor, (0.15 + p * 0.70).toFloat())
                Box(modifier = Modifier.size(10.dp).background(color, RoundedCornerShape(2.dp)))
            }
            Text("More", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
