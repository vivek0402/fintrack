package app.fintrack.compose.ui.analytics

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import kotlin.math.roundToInt

private data class RegretBracket(val label: String, val min: Double, val max: Double, val rate: Int, val count: Int)
private data class RegretCategoryRate(val name: String, val rate: Int, val regretted: Int, val total: Int)

private data class RegretStats(
    val total: Int,
    val regrettedCount: Int,
    val overallRate: Int,
    val mindfulScore: Int,
    val byCategory: List<RegretCategoryRate>,
    val byBracket: List<RegretBracket>,
    val topMerchant: Triple<String, Int, Int>?,
)

private val REGRET_BRACKETS = listOf(
    "Under ₹500" to (0.0 to 500.0),
    "₹500–₹2K" to (500.0 to 2000.0),
    "₹2K–₹5K" to (2000.0 to 5000.0),
    "Over ₹5K" to (5000.0 to Double.MAX_VALUE),
)

private fun mindfulScore(regrettedCount: Int, totalReviewed: Int): Int {
    if (totalReviewed == 0) return 100
    val ratePct = (regrettedCount.toDouble() / totalReviewed) * 100
    return (100 - ratePct * 1.5).roundToInt().coerceIn(0, 100)
}

private fun buildRegretStats(transactions: List<TransactionDto>): RegretStats? {
    val expenses = transactions.filter { it.type == "expense" }
    if (expenses.isEmpty()) return null

    val regretted = expenses.filter { it.is_regretted }
    val overallRate = ((regretted.size.toDouble() / expenses.size) * 100).roundToInt()
    val score = mindfulScore(regretted.size, expenses.size)

    val catMap = LinkedHashMap<String, Pair<Int, Int>>()
    expenses.forEach { tx ->
        val cat = tx.category_name ?: "Uncategorized"
        val (total, reg) = catMap[cat] ?: (0 to 0)
        catMap[cat] = (total + 1) to (reg + if (tx.is_regretted) 1 else 0)
    }
    val byCategory = catMap.entries
        .map { (name, pair) -> RegretCategoryRate(name, ((pair.second.toDouble() / pair.first) * 100).roundToInt(), pair.second, pair.first) }
        .filter { it.total >= 2 }
        .sortedByDescending { it.rate }
        .take(8)

    val byBracket = REGRET_BRACKETS.map { (label, range) ->
        val (min, max) = range
        val inBracket = expenses.filter { val amt = it.amount.toDoubleOrNull() ?: 0.0; amt >= min && amt < max }
        val regInBracket = inBracket.count { it.is_regretted }
        RegretBracket(label, min, max, if (inBracket.isNotEmpty()) ((regInBracket.toDouble() / inBracket.size) * 100).roundToInt() else 0, inBracket.size)
    }

    val merchantMap = LinkedHashMap<String, Pair<Int, Int>>()
    expenses.forEach { tx ->
        val name = tx.description.ifBlank { "Unknown" }.trim()
        val (total, reg) = merchantMap[name] ?: (0 to 0)
        merchantMap[name] = (total + 1) to (reg + if (tx.is_regretted) 1 else 0)
    }
    val topMerchant = merchantMap.entries
        .filter { it.value.first >= 2 && it.value.second > 0 }
        .maxByOrNull { it.value.second.toDouble() / it.value.first }
        ?.let { Triple(it.key, it.value.second, it.value.first) }

    return RegretStats(expenses.size, regretted.size, overallRate, score, byCategory, byBracket, topMerchant)
}

private fun rateColor(rate: Int): Color = when {
    rate > 40 -> FinTrackColors.Dark.colorExp
    rate > 20 -> FinTrackColors.Dark.colorWarn
    else -> FinTrackColors.Dark.colorInc
}

@Composable
fun RegretAnalysisSection(transactions: List<TransactionDto>) {
    val stats = remember(transactions) { buildRegretStats(transactions) }
    if (stats == null) {
        Text(
            "No expense data yet. Add transactions to see regret analysis.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    val scoreColor = when {
        stats.mindfulScore >= 80 -> FinTrackColors.Dark.colorInc
        stats.mindfulScore >= 60 -> FinTrackColors.Dark.accent
        stats.mindfulScore >= 40 -> FinTrackColors.Dark.colorWarn
        else -> FinTrackColors.Dark.colorExp
    }

    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
            RegretStatTile("Total Reviewed", stats.total.toString(), MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
            RegretStatTile("Regret Rate", "${stats.overallRate}%", rateColor(stats.overallRate), Modifier.weight(1f))
            RegretStatTile("Mindful Score", stats.mindfulScore.toString(), scoreColor, Modifier.weight(1f))
        }
        Spacer(Modifier.height(FinTrackSpacing.space3))

        stats.topMerchant?.let { (name, regretted, total) ->
            Surface(shape = RoundedCornerShape(12.dp), color = FinTrackColors.Dark.colorExp.copy(alpha = 0.08f), modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(FinTrackSpacing.space3)) {
                    Text("😬", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.width(FinTrackSpacing.space3))
                    Column {
                        Text("Most Regretted: $name", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                        Text(
                            "$regretted of $total purchases regretted (${((regretted.toDouble() / total) * 100).roundToInt()}%)",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))
        }

        if (stats.byCategory.isNotEmpty()) {
            Text("Regret Rate by Category", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            stats.byCategory.forEach { cat ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
                    Text(cat.name, style = MaterialTheme.typography.bodySmall, modifier = Modifier.width(90.dp))
                    LinearProgressIndicator(
                        progress = { cat.rate / 100f },
                        color = rateColor(cat.rate),
                        modifier = Modifier.weight(1f).height(8.dp),
                    )
                    Spacer(Modifier.width(FinTrackSpacing.space2))
                    Text("${cat.rate}%", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))
        }

        Text("Regret Rate by Amount", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(FinTrackSpacing.space2))
        Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
            stats.byBracket.take(2).forEach { BracketCard(it, Modifier.weight(1f)) }
        }
        Spacer(Modifier.height(FinTrackSpacing.space2))
        Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
            stats.byBracket.drop(2).forEach { BracketCard(it, Modifier.weight(1f)) }
        }
    }
}

@Composable
private fun RegretStatTile(label: String, value: String, color: Color, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = modifier) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space3)) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

@Composable
private fun BracketCard(bracket: RegretBracket, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = modifier) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space3)) {
            Text(bracket.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Row(verticalAlignment = Alignment.Bottom) {
                Text("${bracket.rate}%", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = rateColor(bracket.rate))
                Spacer(Modifier.width(FinTrackSpacing.space1))
                Text("${bracket.count} txns", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(FinTrackSpacing.space1))
            LinearProgressIndicator(progress = { bracket.rate / 100f }, color = rateColor(bracket.rate), modifier = Modifier.fillMaxWidth().height(4.dp))
        }
    }
}
