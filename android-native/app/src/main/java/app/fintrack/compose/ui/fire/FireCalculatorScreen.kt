package app.fintrack.compose.ui.fire

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
import app.fintrack.compose.data.api.YearsMonthsDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@Composable
fun FireCalculatorScreen(viewModel: FireCalculatorViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Text("FIRE Calculator", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                "Financial Independence, Retire Early — based on your last 3 months of income and expenses.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
                    OutlinedTextField(
                        value = state.monthlyExpenses,
                        onValueChange = { v -> viewModel.update { it.copy(monthlyExpenses = v) } },
                        label = { Text("Monthly expenses (optional override)") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                        OutlinedTextField(
                            value = state.expectedAnnualReturnPct,
                            onValueChange = { v -> viewModel.update { it.copy(expectedAnnualReturnPct = v) } },
                            label = { Text("Return %") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = state.inflationPct,
                            onValueChange = { v -> viewModel.update { it.copy(inflationPct = v) } },
                            label = { Text("Inflation %") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = state.swrPct,
                            onValueChange = { v -> viewModel.update { it.copy(swrPct = v) } },
                            label = { Text("SWR %") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    OutlinedTextField(
                        value = state.extraMonthlySavings,
                        onValueChange = { v -> viewModel.update { it.copy(extraMonthlySavings = v) } },
                        label = { Text("Extra monthly savings (optional)") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
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
                        Text("Corpus Needed", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(FinTrackSpacing.space2))
                        Text(
                            formatInr(result.corpus_needed_real),
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                            color = FinTrackColors.Dark.accent,
                        )
                        Spacer(Modifier.height(FinTrackSpacing.space2))
                        result.fire_date?.let {
                            Text("Projected FIRE date: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(
                            "Current net worth: ${formatInr(result.current_net_worth)} · Monthly savings: ${formatInr(result.monthly_savings)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Spacer(Modifier.height(FinTrackSpacing.space3))
            }
            item {
                Text("Years to FIRE", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(FinTrackSpacing.space2))
                YearsToFireRow("Current pace", result.years_to_fire.base)
                YearsToFireRow("+10%/yr step-up", result.years_to_fire.step_up_10pct)
                YearsToFireRow("+₹10,000/mo extra", result.years_to_fire.extra_10k)
                Spacer(Modifier.height(FinTrackSpacing.space4))
            }
            item {
                Text("Savings Targets to FIRE Sooner", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(FinTrackSpacing.space2))
                TargetRow("In 10 years", result.savings_targets.target_10yr)
                TargetRow("In 15 years", result.savings_targets.target_15yr)
                TargetRow("In 20 years", result.savings_targets.target_20yr)
            }
        }
    }
}

@Composable
private fun YearsToFireRow(label: String, value: YearsMonthsDto) {
    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1),
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            if (value.years != null) "${value.years}y ${value.months}m" else "Not reachable",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun TargetRow(label: String, amount: Double) {
    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1),
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("${formatInr(amount)}/mo", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}
