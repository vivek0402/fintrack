package app.fintrack.compose.ui.scenarios

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.ScenarioDto
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import kotlinx.serialization.json.jsonPrimitive

@Composable
fun ScenariosScreen(viewModel: ScenariosViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    val fields = SCENARIO_FIELDS[state.type].orEmpty()

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Text("Scenarios", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                "Model a what-if before you act.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                SCENARIO_TYPE_LABELS.forEach { (type, label) ->
                    val selected = state.type == type
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = if (selected) FinTrackColors.Dark.accent.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceVariant,
                        onClick = { viewModel.setType(type) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            label,
                            style = MaterialTheme.typography.labelSmall,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            color = if (selected) FinTrackColors.Dark.accent else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2, horizontal = FinTrackSpacing.space1),
                        )
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
                    fields.forEach { field ->
                        OutlinedTextField(
                            value = state.inputs[field.key].orEmpty(),
                            onValueChange = { v -> viewModel.updateInput(field.key, v) },
                            label = { Text(field.label) },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                    }
                    if (state.type == "expense_reduction") {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                            Text("Invest the savings", style = MaterialTheme.typography.bodyMedium)
                            Switch(checked = state.redirectToInvestment, onCheckedChange = { viewModel.toggleRedirect() })
                        }
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                    }
                    state.error?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                    }
                    Button(onClick = viewModel::simulate, enabled = !state.isSimulating, modifier = Modifier.fillMaxWidth()) {
                        if (state.isSimulating) {
                            CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                        } else {
                            Text("Run Scenario")
                        }
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }

        state.result?.let { result ->
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.10f), modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(FinTrackSpacing.space5)) {
                        Text(
                            result["summary_text"]?.jsonPrimitive?.content ?: "Done.",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        if (state.saved) {
                            Text("Saved.", color = FinTrackColors.Dark.colorInc, style = MaterialTheme.typography.bodySmall)
                        } else {
                            TextButton(onClick = viewModel::save, enabled = !state.isSaving) {
                                Text(if (state.isSaving) "Saving…" else "Save this scenario")
                            }
                        }
                    }
                }
                Spacer(Modifier.height(FinTrackSpacing.space4))
            }
        }

        if (state.savedScenarios.isNotEmpty()) {
            item {
                Text("Saved Scenarios", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(FinTrackSpacing.space2))
            }
            items(state.savedScenarios, key = { it.id }) { scenario ->
                SavedScenarioRow(scenario, onDelete = { viewModel.deleteSaved(scenario.id) })
                Spacer(Modifier.height(FinTrackSpacing.space2))
            }
        }
    }
}

@Composable
private fun SavedScenarioRow(scenario: ScenarioDto, onDelete: () -> Unit) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3)) {
            Column(modifier = Modifier.weight(1f)) {
                Text(scenario.title, style = MaterialTheme.typography.bodyMedium)
                Text(
                    SCENARIO_TYPE_LABELS[scenario.type] ?: scenario.type,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
