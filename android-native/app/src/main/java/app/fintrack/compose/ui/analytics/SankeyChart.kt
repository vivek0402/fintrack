package app.fintrack.compose.ui.analytics

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.ui.common.formatInr
import java.time.LocalDate

private val SANKEY_INCOME_COLORS = listOf(Color(0xFF059669), Color(0xFF10B981), Color(0xFF34D399), Color(0xFF6EE7B7))
private val SANKEY_EXPENSE_COLORS = listOf(Color(0xFFE11D48), Color(0xFFF97316), Color(0xFFD97706), Color(0xFF8B5CF6), Color(0xFF0EA5E9), Color(0xFFEC4899))

private data class SankeyNode(val label: String, val amount: Double, val color: Color, val y: Float, val height: Float)

private data class SankeyGeometry(
    val incomeNodes: List<SankeyNode>,
    val expenseNodes: List<SankeyNode>,
    val totalHeightDp: Float,
)

private const val SANKEY_WIDTH_DP = 340f
private const val SANKEY_NODE_WIDTH_DP = 14f
private const val SANKEY_BUDGET_HEIGHT_DP = 280f
private const val SANKEY_PAD_DP = 12f
private const val SANKEY_GAP_DP = 6f

private fun buildSankeyGeometry(transactions: List<TransactionDto>): SankeyGeometry? {
    val cutoff = LocalDate.now().minusMonths(3)
    val incMap = LinkedHashMap<String, Double>()
    val expMap = LinkedHashMap<String, Double>()
    transactions.forEach { tx ->
        val date = runCatching { LocalDate.parse(tx.date.take(10)) }.getOrNull() ?: return@forEach
        if (date.isBefore(cutoff)) return@forEach
        val amount = tx.amount.toDoubleOrNull() ?: return@forEach
        val category = tx.category_name ?: "Other"
        when (tx.type) {
            "income" -> incMap[category] = (incMap[category] ?: 0.0) + amount
            "expense" -> expMap[category] = (expMap[category] ?: 0.0) + amount
        }
    }
    val incEntries = incMap.entries.sortedByDescending { it.value }
    val expEntries = expMap.entries.sortedByDescending { it.value }.take(6)
    if (incEntries.isEmpty() || expEntries.isEmpty()) return null

    val totalInc = incEntries.sumOf { it.value }
    val totalExp = expEntries.sumOf { it.value }
    val budget = SANKEY_BUDGET_HEIGHT_DP - SANKEY_PAD_DP * 2

    var cursor = SANKEY_PAD_DP
    val incomeNodes = incEntries.mapIndexed { index, entry ->
        val h = maxOf(24f, ((entry.value / totalInc) * budget - SANKEY_GAP_DP).toFloat())
        val node = SankeyNode(entry.key, entry.value, SANKEY_INCOME_COLORS[index % SANKEY_INCOME_COLORS.size], cursor, h)
        cursor += h + SANKEY_GAP_DP
        node
    }
    val yIncFinal = cursor

    cursor = SANKEY_PAD_DP
    val expenseNodes = expEntries.mapIndexed { index, entry ->
        val h = maxOf(24f, ((entry.value / totalExp) * budget - SANKEY_GAP_DP).toFloat())
        val node = SankeyNode(entry.key, entry.value, SANKEY_EXPENSE_COLORS[index % SANKEY_EXPENSE_COLORS.size], cursor, h)
        cursor += h + SANKEY_GAP_DP
        node
    }
    val yExpFinal = cursor

    return SankeyGeometry(incomeNodes, expenseNodes, maxOf(yIncFinal, yExpFinal) + SANKEY_PAD_DP)
}

@Composable
fun SankeyMoneyFlowChart(transactions: List<TransactionDto>) {
    val geometry = remember(transactions) { buildSankeyGeometry(transactions) }
    if (geometry == null) {
        Text(
            "Add income and expense transactions to see your money flow.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    val textMeasurer = rememberTextMeasurer()
    val onSurface = MaterialTheme.colorScheme.onSurface
    val labelStyle = TextStyle(fontSize = 10.sp, color = onSurface)

    Canvas(modifier = Modifier.width(SANKEY_WIDTH_DP.dp).height(geometry.totalHeightDp.dp)) {
        val x1 = SANKEY_NODE_WIDTH_DP.dp.toPx()
        val x2 = SANKEY_WIDTH_DP.dp.toPx() - SANKEY_NODE_WIDTH_DP.dp.toPx()
        val cx = SANKEY_WIDTH_DP.dp.toPx() / 2f

        val totalInc = geometry.incomeNodes.sumOf { it.amount }
        val totalExp = geometry.expenseNodes.sumOf { it.amount }
        val incConsumed = FloatArray(geometry.incomeNodes.size)
        val expConsumed = FloatArray(geometry.expenseNodes.size)

        geometry.incomeNodes.forEachIndexed { i, inc ->
            geometry.expenseNodes.forEachIndexed { j, exp ->
                val flow = inc.amount * (exp.amount / totalExp)
                val bwI = ((flow / inc.amount) * inc.height).toFloat()
                val bwE = maxOf(((flow / exp.amount) * exp.height).toFloat(), 0.5f)

                val y1t = (inc.y + incConsumed[i]).dp.toPx()
                val y1b = (inc.y + incConsumed[i] + bwI).dp.toPx()
                val y2t = (exp.y + expConsumed[j]).dp.toPx()
                val y2b = (exp.y + expConsumed[j] + bwE).dp.toPx()
                incConsumed[i] += bwI
                expConsumed[j] += bwE

                val path = Path().apply {
                    moveTo(x1, y1t)
                    cubicTo(cx, y1t, cx, y2t, x2, y2t)
                    lineTo(x2, y2b)
                    cubicTo(cx, y2b, cx, y1b, x1, y1b)
                    close()
                }
                drawPath(path, color = exp.color.copy(alpha = 0.35f))
            }
        }

        drawSankeyNodes(geometry.incomeNodes, 0f, SANKEY_NODE_WIDTH_DP.dp.toPx(), textMeasurer, labelStyle, alignLeft = true)
        drawSankeyNodes(geometry.expenseNodes, x2, SANKEY_WIDTH_DP.dp.toPx(), textMeasurer, labelStyle, alignLeft = false)
    }
}

private fun DrawScope.drawSankeyNodes(
    nodes: List<SankeyNode>,
    barLeftPx: Float,
    barRightPx: Float,
    textMeasurer: TextMeasurer,
    style: TextStyle,
    alignLeft: Boolean,
) {
    nodes.forEach { node ->
        val top = node.y.dp.toPx()
        val height = node.height.dp.toPx()
        drawRoundRect(
            color = node.color,
            topLeft = Offset(barLeftPx, top),
            size = Size(barRightPx - barLeftPx, height),
            cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx()),
        )
        if (node.height >= 18f) {
            val label = node.label.take(14)
            val result = textMeasurer.measure(label, style)
            val labelX = if (alignLeft) barRightPx + 5.dp.toPx() else barLeftPx - 5.dp.toPx() - result.size.width
            drawText(result, topLeft = Offset(labelX, top + 2.dp.toPx()))
            if (node.height >= 28f) {
                val amountText = textMeasurer.measure(formatInr(node.amount), style)
                val amountX = if (alignLeft) barRightPx + 5.dp.toPx() else barLeftPx - 5.dp.toPx() - amountText.size.width
                drawText(amountText, topLeft = Offset(amountX, top + 16.dp.toPx()))
            }
        }
    }
}
