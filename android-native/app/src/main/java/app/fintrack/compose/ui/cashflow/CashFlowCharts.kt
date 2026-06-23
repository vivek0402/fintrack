package app.fintrack.compose.ui.cashflow

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.CashflowMonthDto
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import kotlin.math.abs

@Composable
fun CashFlowWaterfallCard(months: List<CashflowMonthDto>) {
    if (months.isEmpty()) return
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text("Net Cash Flow by Month", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space3))
            WaterfallChart(months, modifier = Modifier.fillMaxWidth().height(120.dp))
        }
    }
}

@Composable
private fun WaterfallChart(months: List<CashflowMonthDto>, modifier: Modifier = Modifier) {
    val gridColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.2f)
    Canvas(modifier = modifier) {
        if (size.width <= 0f) return@Canvas
        val maxAbs = months.maxOfOrNull { abs(it.net_cashflow) }?.coerceAtLeast(1.0) ?: 1.0
        val barSlot = size.width / months.size
        val zeroY = size.height / 2f

        drawLine(color = gridColor, start = Offset(0f, zeroY), end = Offset(size.width, zeroY), strokeWidth = 1.dp.toPx())

        months.forEachIndexed { index, month ->
            val barHeight = (abs(month.net_cashflow) / maxAbs * zeroY).toFloat()
            val left = index * barSlot + barSlot * 0.18f
            val width = barSlot * 0.64f
            val top = if (month.net_cashflow >= 0) zeroY - barHeight else zeroY
            drawRect(color = statusColor(month.status), topLeft = Offset(left, top), size = Size(width, barHeight))
        }
    }
}

@Composable
fun CashFlowRunningBalanceCard(months: List<CashflowMonthDto>) {
    if (months.isEmpty()) return
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text("Running Balance", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space3))
            RunningBalanceChart(months, modifier = Modifier.fillMaxWidth().height(120.dp))
        }
    }
}

@Composable
private fun RunningBalanceChart(months: List<CashflowMonthDto>, modifier: Modifier = Modifier) {
    val isTrendingUp = months.size > 1 && months.last().running_balance >= months.first().running_balance
    val lineColor = if (isTrendingUp) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp

    Canvas(modifier = modifier) {
        if (months.isEmpty() || size.width <= 0f) return@Canvas
        val values = months.map { it.running_balance }
        val minVal = values.min().coerceAtMost(0.0)
        val maxVal = values.max().coerceAtLeast(minVal + 1.0)
        val range = (maxVal - minVal).coerceAtLeast(1.0)
        val stepX = if (months.size > 1) size.width / (months.size - 1) else size.width

        val points = months.mapIndexed { index, month ->
            Offset(index * stepX, size.height - ((month.running_balance - minVal) / range * size.height).toFloat())
        }
        val path = Path().apply {
            moveTo(points.first().x, points.first().y)
            points.drop(1).forEach { lineTo(it.x, it.y) }
        }
        drawPath(path, color = lineColor, style = Stroke(width = 2.dp.toPx()))
    }
}
