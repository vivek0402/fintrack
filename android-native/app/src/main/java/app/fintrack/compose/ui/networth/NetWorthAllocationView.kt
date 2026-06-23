package app.fintrack.compose.ui.networth

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.AssetAllocationItemDto
import app.fintrack.compose.data.api.AssetAllocationResponse
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

private val ALLOCATION_PALETTE = listOf(
    FinTrackColors.Dark.accent,
    FinTrackColors.Dark.colorInc,
    FinTrackColors.Dark.colorExp,
    Color(0xFFE8B339),
    Color(0xFF9B7EDE),
    Color(0xFF4FB6C9),
    Color(0xFFD97757),
    Color(0xFF6FCF97),
    Color(0xFF8895A7),
)

@Composable
fun NetWorthAllocationContent(allocation: AssetAllocationResponse?) {
    if (allocation == null || allocation.allocations.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                "No assets to allocate yet — add accounts or investments to see your breakdown.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(FinTrackSpacing.space6),
            )
        }
        return
    }

    val colors = allocation.allocations.mapIndexed { index, _ -> ALLOCATION_PALETTE[index % ALLOCATION_PALETTE.size] }

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3), modifier = Modifier.fillMaxWidth()) {
                AllocationStat(
                    label = "Total Assets",
                    value = formatInr(allocation.total_assets),
                    color = FinTrackColors.Dark.accent,
                    modifier = Modifier.weight(1f),
                )
                AllocationStat(
                    label = "Deviation Score",
                    value = "%.1f".format(allocation.deviation_score),
                    color = FinTrackColors.Dark.colorExp,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
                    Text("Allocation", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        AllocationDonutChart(
                            allocations = allocation.allocations,
                            colors = colors,
                            modifier = Modifier.size(120.dp),
                        )
                        Spacer(Modifier.width(FinTrackSpacing.space4))
                        Column {
                            allocation.allocations.forEachIndexed { index, item ->
                                AllocationLegendRow(item, colors[index])
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        item {
            Text("vs. Recommended", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(FinTrackSpacing.space2))
        }
        item { Text(allocation.recommendation_note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        item { Spacer(Modifier.height(FinTrackSpacing.space3)) }
        items(allocation.allocations) { item -> AllocationDeviationRow(item) }
    }
}

@Composable
private fun AllocationStat(label: String, value: String, color: Color, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(16.dp), color = color.copy(alpha = 0.10f), modifier = modifier) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

@Composable
private fun AllocationDonutChart(allocations: List<AssetAllocationItemDto>, colors: List<Color>, modifier: Modifier = Modifier) {
    val total = allocations.sumOf { it.amount }.coerceAtLeast(0.01)
    Canvas(modifier = modifier) {
        if (size.minDimension <= 0f) return@Canvas
        val strokeWidth = size.minDimension * 0.22f
        val arcSize = Size(size.width - strokeWidth, size.height - strokeWidth)
        val topLeft = Offset(strokeWidth / 2f, strokeWidth / 2f)
        var startAngle = -90f
        allocations.forEachIndexed { index, item ->
            val sweep = (item.amount / total * 360.0).toFloat()
            drawArc(
                color = colors[index],
                startAngle = startAngle,
                sweepAngle = sweep,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokeWidth),
            )
            startAngle += sweep
        }
    }
}

@Composable
private fun AllocationLegendRow(item: AssetAllocationItemDto, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
        Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(FinTrackSpacing.space2))
        Text(
            "${item.label} (${"%.0f".format(item.actual_pct)}%)",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun AllocationDeviationRow(item: AssetAllocationItemDto) {
    val isOver = item.deviation > 0
    val deviationColor = if (isOver) FinTrackColors.Dark.colorExp else FinTrackColors.Dark.colorInc

    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3),
        ) {
            Column {
                Text(item.label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Text(formatInr(item.amount), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "${"%.1f".format(item.actual_pct)}% / ${"%.1f".format(item.recommended_pct)}%",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    "${if (isOver) "+" else ""}${"%.1f".format(item.deviation)}%",
                    style = MaterialTheme.typography.labelSmall,
                    color = deviationColor,
                )
            }
        }
    }
}
