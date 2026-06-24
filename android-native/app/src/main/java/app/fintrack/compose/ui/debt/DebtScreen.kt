package app.fintrack.compose.ui.debt

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.CreditCardUtilizationDto
import app.fintrack.compose.data.api.CreditUtilizationResponse
import app.fintrack.compose.data.api.DtiResponse
import app.fintrack.compose.data.api.PayoffOptimizerResponse
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.loans.LoansScreen
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

private fun statusColor(status: String): Color = when (status) {
    "excellent", "optimal" -> FinTrackColors.Dark.colorInc
    "good", "moderate" -> FinTrackColors.Dark.accent
    "high" -> Color(0xFFF59E0B)
    "risky", "critical" -> FinTrackColors.Dark.colorExp
    else -> FinTrackColors.Dark.accent
}

@Composable
fun DebtScreen(viewModel: DebtViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    var selectedTab by remember { mutableIntStateOf(0) }

    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            "Debt Intelligence",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space3),
        )
        TabRow(selectedTabIndex = selectedTab) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Overview") })
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Loans") })
        }

        Box(modifier = Modifier.fillMaxSize()) {
            if (selectedTab == 1) {
                LoansScreen()
            } else {
                when {
                    state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                    state.error != null -> Text(
                        state.error.orEmpty(),
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
                    )
                    else -> LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
                        state.dti?.let { dti ->
                            item {
                                DtiCard(dti)
                                Spacer(Modifier.height(FinTrackSpacing.space4))
                            }
                        }
                        state.creditUtilization?.let { credit ->
                            item {
                                CreditUtilizationCard(credit)
                                Spacer(Modifier.height(FinTrackSpacing.space4))
                            }
                        }
                        item {
                            PayoffOptimizerCard(
                                result = state.payoffOptimizer,
                                extraPayment = state.extraMonthlyPayment,
                                isRecalculating = state.isRecalculating,
                                onExtraPaymentChange = viewModel::updateExtraPayment,
                                onRecalculate = viewModel::recalculatePayoff,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DtiCard(dti: DtiResponse) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space5)) {
            Text("Debt-to-Income Ratio", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space3))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3), modifier = Modifier.fillMaxWidth()) {
                MiniStat("Monthly Income", formatInr(dti.monthly_income), Modifier.weight(1f))
                MiniStat("DTI Ratio", "${dti.dti_ratio}%", Modifier.weight(1f), statusColor(dti.status))
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))
            Text(
                "Loan EMIs ${formatInr(dti.monthly_loan_emi)} · Card minimums ${formatInr(dti.monthly_credit_obligation)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (dti.breakdown_loans.isNotEmpty() || dti.breakdown_cards.isNotEmpty()) {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                dti.breakdown_loans.forEach { loan ->
                    Text("${loan.name}: ${formatInr(loan.emi)}/mo", style = MaterialTheme.typography.bodySmall)
                }
                dti.breakdown_cards.forEach { card ->
                    Text("${card.name}: ${formatInr(card.minimum_payment)}/mo min.", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun CreditUtilizationCard(credit: CreditUtilizationResponse) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space5)) {
            Text("Credit Utilization", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space3))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3), modifier = Modifier.fillMaxWidth()) {
                MiniStat("Outstanding", formatInr(credit.aggregate.total_outstanding), Modifier.weight(1f))
                MiniStat(
                    "Utilization",
                    "${credit.aggregate.overall_utilization_pct}%",
                    Modifier.weight(1f),
                    statusColor(credit.aggregate.status),
                )
            }
            if (credit.per_card.isNotEmpty()) {
                Spacer(Modifier.height(FinTrackSpacing.space4))
                credit.per_card.forEach { card -> CreditCardRow(card) }
            }
            credit.recommendation?.let { rec ->
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Surface(shape = RoundedCornerShape(12.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.10f)) {
                    Text(rec, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(FinTrackSpacing.space3))
                }
            }
        }
    }
}

@Composable
private fun CreditCardRow(card: CreditCardUtilizationDto) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2)) {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(card.name, style = MaterialTheme.typography.bodyMedium)
            Text("${card.utilization_pct}%", style = MaterialTheme.typography.bodyMedium, color = statusColor(card.status))
        }
        Spacer(Modifier.height(FinTrackSpacing.space1))
        LinearProgressIndicator(
            progress = { (card.utilization_pct / 100.0).toFloat().coerceIn(0f, 1f) },
            color = statusColor(card.status),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(FinTrackSpacing.space1))
        Text(
            "${formatInr(card.outstanding_balance)} of ${formatInr(card.credit_limit)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun PayoffOptimizerCard(
    result: PayoffOptimizerResponse?,
    extraPayment: String,
    isRecalculating: Boolean,
    onExtraPaymentChange: (String) -> Unit,
    onRecalculate: () -> Unit,
) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space5)) {
            Text("Payoff Optimizer", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space3))

            if (result?.message != null) {
                Text(result.message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                return@Column
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = extraPayment,
                    onValueChange = onExtraPaymentChange,
                    label = { Text("Extra monthly payment") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(FinTrackSpacing.space2))
                Button(onClick = onRecalculate, enabled = !isRecalculating) {
                    if (isRecalculating) {
                        CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Text("Recalculate")
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))

            val avalancheMonths = result?.avalanche?.months
            val snowballMonths = result?.snowball?.months
            val recommendedStrategy = when {
                avalancheMonths == null || snowballMonths == null -> null
                avalancheMonths < snowballMonths -> "avalanche"
                snowballMonths < avalancheMonths -> "snowball"
                else -> null
            }

            result?.baseline?.let { baseline ->
                StrategyRow("Baseline (minimum EMIs)", baseline.months, baseline.total_interest, null, null)
            }
            result?.avalanche?.let { avalanche ->
                StrategyRow(
                    "Avalanche (highest rate first)",
                    avalanche.months,
                    avalanche.total_interest,
                    avalanche.interest_saved,
                    avalanche.payoff_sequence,
                    isRecommended = recommendedStrategy == "avalanche",
                )
            }
            result?.snowball?.let { snowball ->
                StrategyRow(
                    "Snowball (smallest balance first)",
                    snowball.months,
                    snowball.total_interest,
                    snowball.interest_saved,
                    snowball.payoff_sequence,
                    isRecommended = recommendedStrategy == "snowball",
                )
            }

            result?.recommendation?.let { rec ->
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Surface(shape = RoundedCornerShape(12.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.10f)) {
                    Text(rec, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(FinTrackSpacing.space3))
                }
            }
        }
    }
}

@Composable
private fun StrategyRow(
    label: String,
    months: Int,
    totalInterest: Double,
    interestSaved: Double?,
    payoffSequence: List<app.fintrack.compose.data.api.PayoffSequenceEntryDto>?,
    isRecommended: Boolean = false,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            if (isRecommended) {
                Spacer(Modifier.width(FinTrackSpacing.space2))
                Surface(shape = RoundedCornerShape(20.dp), color = FinTrackColors.Dark.colorInc.copy(alpha = 0.14f)) {
                    Text(
                        "Recommended",
                        style = MaterialTheme.typography.labelSmall,
                        color = FinTrackColors.Dark.colorInc,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = FinTrackSpacing.space2, vertical = 2.dp),
                    )
                }
            }
        }
        Text(
            "$months months · ${formatInr(totalInterest)} interest" +
                (interestSaved?.let { " · ${formatInr(it)} saved" } ?: ""),
            style = MaterialTheme.typography.bodySmall,
            color = if (interestSaved != null && interestSaved > 0) FinTrackColors.Dark.colorInc else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!payoffSequence.isNullOrEmpty()) {
            Spacer(Modifier.height(FinTrackSpacing.space1))
            payoffSequence.forEach { entry ->
                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Text(entry.name, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Month ${entry.payoff_month}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun MiniStat(label: String, value: String, modifier: Modifier = Modifier, color: Color? = null) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = modifier) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space3)) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color ?: MaterialTheme.colorScheme.onSurface)
        }
    }
}
