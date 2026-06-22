package app.fintrack.compose.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.OpportunityDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@Composable
fun OpportunitiesSection(
    opportunities: List<OpportunityDto>,
    onDismiss: (String) -> Unit,
    onActOn: (String) -> Unit,
) {
    if (opportunities.isEmpty()) return
    var expanded by remember { mutableStateOf(false) }

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Lightbulb, contentDescription = null, tint = FinTrackColors.Dark.colorWarn)
                    Spacer(Modifier.width(FinTrackSpacing.space2))
                    Text("Opportunities", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(FinTrackSpacing.space2))
                    Surface(shape = RoundedCornerShape(20.dp), color = FinTrackColors.Dark.colorWarn.copy(alpha = 0.15f)) {
                        Text(
                            "${opportunities.size}",
                            style = MaterialTheme.typography.labelSmall,
                            color = FinTrackColors.Dark.colorWarn,
                            modifier = Modifier.padding(horizontal = FinTrackSpacing.space2, vertical = 2.dp),
                        )
                    }
                }
                IconButton(onClick = { expanded = !expanded }) {
                    Icon(if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = "Toggle")
                }
            }

            if (expanded) {
                Spacer(Modifier.height(FinTrackSpacing.space2))
                HorizontalDivider()
                Spacer(Modifier.height(FinTrackSpacing.space3))
                opportunities.take(3).forEachIndexed { index, opp ->
                    OpportunityCard(opp, onDismiss = { onDismiss(opp.id) }, onActOn = { onActOn(opp.id) })
                    if (index != minOf(opportunities.size, 3) - 1) Spacer(Modifier.height(FinTrackSpacing.space2))
                }
            }
        }
    }
}

@Composable
private fun OpportunityCard(opportunity: OpportunityDto, onDismiss: () -> Unit, onActOn: () -> Unit) {
    val color = when (opportunity.priority) {
        1 -> FinTrackColors.Dark.colorExp
        2 -> FinTrackColors.Dark.colorWarn
        else -> FinTrackColors.Dark.accent
    }

    Surface(shape = RoundedCornerShape(12.dp), color = color.copy(alpha = 0.06f), modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space3)) {
            Text(opportunity.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(opportunity.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            opportunity.amount_saved?.toDoubleOrNull()?.takeIf { it > 0 }?.let { amount ->
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Text("Save ${formatInr(amount)}/year", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = color)
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                OutlinedButton(onClick = onActOn) { Text(opportunity.action_label) }
                TextButton(onClick = onDismiss) { Text("Dismiss") }
            }
        }
    }
}
