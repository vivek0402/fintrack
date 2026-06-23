package app.fintrack.compose.ui.networth

import androidx.compose.foundation.Canvas
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.MomChangeDto
import app.fintrack.compose.data.api.WealthVelocityResponse
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import kotlin.math.abs

@Composable
fun NetWorthVelocityContent(velocity: WealthVelocityResponse?) {
    if (velocity == null || velocity.mom_changes.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                velocity?.message ?: "Not enough history yet to compute wealth velocity.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(FinTrackSpacing.space6),
            )
        }
        return
    }

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3), modifier = Modifier.fillMaxWidth()) {
                VelocityStat(
                    label = "Avg Monthly Growth",
                    value = formatInr(velocity.avg_monthly_growth),
                    color = if (velocity.avg_monthly_growth >= 0) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp,
                    modifier = Modifier.weight(1f),
                )
                VelocityStat(
                    label = "Trend",
                    value = velocity.trend.replace('_', ' ').replaceFirstChar { it.uppercase() },
                    color = FinTrackColors.Dark.accent,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
                    Text("Month-over-Month Change", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    MomChangeChart(velocity.mom_changes, modifier = Modifier.fillMaxWidth().height(120.dp))
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        item {
            Text("Details", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(FinTrackSpacing.space2))
        }
        items(velocity.mom_changes.reversed()) { change -> MomChangeRow(change) }
    }
}

@Composable
private fun VelocityStat(label: String, value: String, color: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(16.dp), color = color.copy(alpha = 0.10f), modifier = modifier) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

@Composable
private fun MomChangeChart(changes: List<MomChangeDto>, modifier: Modifier = Modifier) {
    val gridColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.2f)
    val positiveColor = FinTrackColors.Dark.colorInc
    val negativeColor = FinTrackColors.Dark.colorExp

    Canvas(modifier = modifier) {
        if (changes.isEmpty() || size.width <= 0f) return@Canvas
        val maxAbs = changes.maxOf { abs(it.absolute_change) }.coerceAtLeast(1.0)
        val barSlot = size.width / changes.size
        val zeroY = size.height / 2f

        drawLine(color = gridColor, start = Offset(0f, zeroY), end = Offset(size.width, zeroY), strokeWidth = 1.dp.toPx())

        changes.forEachIndexed { index, change ->
            val barHeight = (abs(change.absolute_change) / maxAbs * zeroY).toFloat()
            val left = index * barSlot + barSlot * 0.18f
            val width = barSlot * 0.64f
            val top = if (change.absolute_change >= 0) zeroY - barHeight else zeroY
            drawRect(
                color = if (change.absolute_change >= 0) positiveColor else negativeColor,
                topLeft = Offset(left, top),
                size = Size(width, barHeight),
            )
        }
    }
}

@Composable
private fun MomChangeRow(change: MomChangeDto) {
    val color = if (change.absolute_change >= 0) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3),
        ) {
            Text("${change.from_date} → ${change.to_date}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "${if (change.absolute_change >= 0) "+" else ""}${formatInr(change.absolute_change)}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = color,
                )
                Text(
                    "${if (change.pct_change >= 0) "+" else ""}${"%.1f".format(change.pct_change)}%",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
