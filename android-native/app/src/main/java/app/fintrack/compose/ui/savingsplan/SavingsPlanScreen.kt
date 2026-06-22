package app.fintrack.compose.ui.savingsplan

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@Composable
fun SavingsPlanScreen(viewModel: SavingsPlanViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Text("Savings Plan (SIP)", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                listOf(SipMode.GOAL_BASED to "I have a goal", SipMode.GROWTH_BASED to "I have a SIP amount").forEach { (mode, label) ->
                    val selected = state.mode == mode
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = if (selected) FinTrackColors.Dark.accent.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceVariant,
                        onClick = { viewModel.setMode(mode) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            label,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            color = if (selected) FinTrackColors.Dark.accent else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space3),
                        )
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
                    if (state.mode == SipMode.GOAL_BASED) {
                        OutlinedTextField(
                            value = state.goalAmount,
                            onValueChange = { v -> viewModel.update { it.copy(goalAmount = v) } },
                            label = { Text("Goal amount") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else {
                        OutlinedTextField(
                            value = state.monthlySip,
                            onValueChange = { v -> viewModel.update { it.copy(monthlySip = v) } },
                            label = { Text("Monthly SIP amount") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                        OutlinedTextField(
                            value = state.targetYears,
                            onValueChange = { v -> viewModel.update { it.copy(targetYears = v) } },
                            label = { Text("Years") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = state.expectedAnnualReturnPct,
                            onValueChange = { v -> viewModel.update { it.copy(expectedAnnualReturnPct = v) } },
                            label = { Text("Expected return %") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                    Button(onClick = viewModel::calculate, enabled = !state.isLoading, modifier = Modifier.fillMaxWidth()) {
                        if (state.isLoading) {
                            CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                        } else {
                            Text("Calculate")
                        }
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }

        state.error?.let { error ->
            item { Text(error, color = MaterialTheme.colorScheme.error) }
        }

        state.result?.let { result ->
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(FinTrackSpacing.space6)) {
                        if (result.mode == "goal_based") {
                            Text("Required Monthly SIP", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(FinTrackSpacing.space2))
                            Text(
                                "${formatInr(result.sip_amount ?: 0.0)}/mo",
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.Bold,
                                color = FinTrackColors.Dark.accent,
                            )
                            Spacer(Modifier.height(FinTrackSpacing.space3))
                            result.step_up_sip?.let {
                                Text("With 10% annual step-up: ${formatInr(it)}/mo starting", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            result.lumpsum_alternative?.let {
                                Text("Or a lumpsum today of ${formatInr(it)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        } else {
                            Text("Projected Corpus", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(FinTrackSpacing.space2))
                            Text(
                                formatInr(result.corpus ?: 0.0),
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.Bold,
                                color = FinTrackColors.Dark.accent,
                            )
                        }
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        Text(
                            "Invested: ${formatInr(result.total_invested)} · Returns: ${formatInr(result.total_returns)} · Wealth ratio: ${result.wealth_ratio}x",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}
