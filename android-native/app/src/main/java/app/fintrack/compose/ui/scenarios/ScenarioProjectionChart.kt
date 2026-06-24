package app.fintrack.compose.ui.scenarios

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import app.fintrack.compose.ui.theme.FinTrackColors
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private fun JsonObject.projectionPoints(): List<Pair<Int, Double>> =
    this["projection"]?.jsonArray.orEmpty().mapNotNull { element ->
        val obj = element.jsonObject
        val year = obj["year"]?.jsonPrimitive?.intOrNull ?: return@mapNotNull null
        val value = obj["portfolio_value"]?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
        year to value
    }

@Composable
fun ScenarioProjectionChart(result: JsonObject) {
    val points = result.projectionPoints()
    if (points.size < 2) return

    Column {
        Spacer(Modifier.height(12.dp))
        ProjectionLineChart(points = points, modifier = Modifier.fillMaxWidth().height(180.dp))
    }
}

@Composable
private fun ProjectionLineChart(points: List<Pair<Int, Double>>, modifier: Modifier = Modifier) {
    val lineColor = FinTrackColors.Dark.accent

    Canvas(modifier = modifier) {
        if (size.width <= 0f) return@Canvas
        val maxVal = points.maxOf { it.second }.coerceAtLeast(1.0)
        val stepX = if (points.size > 1) size.width / (points.size - 1) else size.width

        fun yFor(value: Double) = size.height - (value / maxVal * size.height).toFloat()

        val linePath = Path()
        val fillPath = Path()
        points.forEachIndexed { index, (_, value) ->
            val x = index * stepX
            val y = yFor(value)
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

        drawPath(fillPath, brush = Brush.verticalGradient(listOf(lineColor.copy(alpha = 0.22f), lineColor.copy(alpha = 0f))))
        drawPath(linePath, color = lineColor, style = Stroke(width = 2.dp.toPx()))
    }
}
