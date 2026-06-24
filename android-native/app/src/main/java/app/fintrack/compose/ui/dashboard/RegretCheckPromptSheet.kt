package app.fintrack.compose.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegretCheckPromptSheet(viewModel: RegretCheckPromptViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    if (!state.show) return

    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = viewModel::dismiss, sheetState = sheetState, contentWindowInsets = { WindowInsets.systemBars }) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space5)) {
            Text("Weekly Regret Check 😬", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(
                "How do you feel about these purchases from the last 7 days?",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space4))

            LazyColumn(contentPadding = PaddingValues(bottom = FinTrackSpacing.space2)) {
                items(state.transactions, key = { it.id }) { tx ->
                    RegretTxRow(tx, mark = state.marks[tx.id], onToggle = { v -> viewModel.toggle(tx.id, v) })
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                }
            }

            Spacer(Modifier.height(FinTrackSpacing.space2))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = viewModel::dismiss, modifier = Modifier.weight(1f)) { Text("Skip for now") }
                Button(onClick = viewModel::submit, enabled = !state.isSubmitting, modifier = Modifier.weight(2f)) {
                    if (state.isSubmitting) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Text("Submit")
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}

@Composable
private fun RegretTxRow(tx: TransactionDto, mark: String?, onToggle: (String) -> Unit) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3)) {
            Column(modifier = Modifier.weight(1f)) {
                Text(tx.description, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1)
                Text(
                    "${tx.category_name ?: "Uncategorized"} · ${tx.date.take(10)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                formatInr(tx.amount.toDoubleOrNull() ?: 0.0),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = FinTrackColors.Dark.colorExp,
            )
            Spacer(Modifier.width(FinTrackSpacing.space2))
            RegretToggleButton(emoji = "👍", selected = mark == "keep", color = FinTrackColors.Dark.colorInc, onClick = { onToggle("keep") })
            Spacer(Modifier.width(FinTrackSpacing.space1))
            RegretToggleButton(emoji = "😬", selected = mark == "regret", color = FinTrackColors.Dark.colorExp, onClick = { onToggle("regret") })
        }
    }
}

@Composable
private fun RegretToggleButton(emoji: String, selected: Boolean, color: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = if (selected) color.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surface,
        onClick = onClick,
        modifier = Modifier.size(34.dp),
    ) {
        androidx.compose.foundation.layout.Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxWidth().height(34.dp)) {
            Text(emoji)
        }
    }
}
