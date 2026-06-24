package app.fintrack.compose.ui.fire

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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.PortfolioProjectionPointDto
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@Composable
fun FireProjectionCard(projection: List<PortfolioProjectionPointDto>, corpusNeeded: Double) {
    val points = projection.filter { it.portfolio_value != null }
    if (points.size < 2) return

    val crossingYear = points.firstOrNull { (it.portfolio_value ?: 0.0) >= corpusNeeded }?.year

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text("Portfolio Growth Projection", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(
                if (crossingYear != null) "Crosses your FIRE number around year $crossingYear." else "Projected portfolio value vs. the corpus you need to retire.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))
            FireProjectionLineChart(
                points = points,
                corpusNeeded = corpusNeeded,
                crossingYear = crossingYear,
                modifier = Modifier.fillMaxWidth().height(180.dp),
            )
        }
    }
}

@Composable
private fun FireProjectionLineChart(
    points: List<PortfolioProjectionPointDto>,
    corpusNeeded: Double,
    crossingYear: Int?,
    modifier: Modifier = Modifier,
) {
    val lineColor = FinTrackColors.Dark.colorInc
    val refColor = FinTrackColors.Dark.colorWarn

    Canvas(modifier = modifier) {
        if (size.width <= 0f) return@Canvas
        val maxVal = (points.maxOf { it.portfolio_value ?: 0.0 }).coerceAtLeast(corpusNeeded).coerceAtLeast(1.0)
        val minVal = 0.0
        val range = (maxVal - minVal).coerceAtLeast(1.0)
        val stepX = if (points.size > 1) size.width / (points.size - 1) else size.width

        fun yFor(value: Double) = size.height - ((value - minVal) / range * size.height).toFloat()

        val linePath = Path()
        val fillPath = Path()
        points.forEachIndexed { index, point ->
            val x = index * stepX
            val y = yFor(point.portfolio_value ?: 0.0)
            if (index == 0) {
                linePath.moveTo(x, y)
                fillPath.moveTo(x, size.height)
                fillPath.lineTo(x, y)
            } else {
                linePath.lineTo(x, y)
                fillPath.lineTo(x, y)
            }
        }
        fillPath.lineTo((points.size - 1) * stepX, size.height)
        fillPath.close()

        drawPath(fillPath, brush = Brush.verticalGradient(listOf(lineColor.copy(alpha = 0.18f), lineColor.copy(alpha = 0f))))
        drawPath(linePath, color = lineColor, style = Stroke(width = 2.dp.toPx()))

        val refY = yFor(corpusNeeded)
        drawLine(
            color = refColor,
            start = Offset(0f, refY),
            end = Offset(size.width, refY),
            strokeWidth = 1.5.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f)),
        )

        crossingYear?.let { year ->
            val index = points.indexOfFirst { it.year == year }
            if (index >= 0) {
                val x = index * stepX
                val y = yFor(points[index].portfolio_value ?: 0.0)
                drawCircle(color = refColor, radius = 5.dp.toPx(), center = Offset(x, y))
            }
        }
    }
}
