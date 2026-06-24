package app.fintrack.compose.ui.fire

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.YearsMonthsDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import app.fintrack.compose.ui.savingsplan.SipMode
import app.fintrack.compose.ui.savingsplan.SavingsPlanViewModel

private val FIRE_TABS = listOf("FIRE Calculator", "SIP Optimizer")

/** Web's `/fire` page toggles between a FIRE calculator and a SIP Optimizer (`tab === 'fire' | 'sip'`) — this was previously split across two unrelated native screens (the SIP half was mis-located under the "Savings Plan" nav entry, which has no SIP content on web at all). Reunited here to match web's actual structure. */
@Composable
fun FireCalculatorScreen() {
    var selectedTab by remember { mutableIntStateOf(0) }

    Column(modifier = Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = selectedTab) {
            FIRE_TABS.forEachIndexed { index, label ->
                Tab(selected = selectedTab == index, onClick = { selectedTab = index }, text = { Text(label) })
            }
        }
        Box(modifier = Modifier.fillMaxSize()) {
            if (selectedTab == 0) FireCalculatorTab() else SipOptimizerTab()
        }
    }
}

@Composable
private fun FireCalculatorTab(viewModel: FireCalculatorViewModel = hiltViewModel()) {
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
                Spacer(Modifier.height(FinTrackSpacing.space4))
            }
            item {
                FireProjectionCard(result.portfolio_projection, result.corpus_needed_real)
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

@Composable
private fun SipOptimizerTab(viewModel: SavingsPlanViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Text("SIP Optimizer", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
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
