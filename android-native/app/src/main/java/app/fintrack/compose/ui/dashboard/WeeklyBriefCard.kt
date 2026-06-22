package app.fintrack.compose.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.WeeklyBriefingDto
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@Composable
fun WeeklyBriefCard(brief: WeeklyBriefingDto?, isLoading: Boolean, error: String?) {
    if (!isLoading && error == null && brief == null) return

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space5)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = FinTrackColors.Dark.accent)
                Spacer(Modifier.width(FinTrackSpacing.space2))
                Text("Your Weekly Brief", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            when {
                isLoading -> CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                error != null -> Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                brief != null -> {
                    Text(brief.narrative, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                        brief.points.forEach { point ->
                            Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                                Text(
                                    "${point.label}: ${point.value}",
                                    style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.padding(horizontal = FinTrackSpacing.space3, vertical = FinTrackSpacing.space2),
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    Surface(shape = RoundedCornerShape(12.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.10f)) {
                        Text(
                            brief.action_of_the_week,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(FinTrackSpacing.space3),
                        )
                    }
                }
            }
        }
    }
}
