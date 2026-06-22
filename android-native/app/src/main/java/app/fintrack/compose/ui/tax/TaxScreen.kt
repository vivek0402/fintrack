package app.fintrack.compose.ui.tax

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.AdvanceTaxResponse
import app.fintrack.compose.data.api.CAPITAL_ASSET_TYPES
import app.fintrack.compose.data.api.CITY_TYPES
import app.fintrack.compose.data.api.CapitalGainsResponse
import app.fintrack.compose.data.api.EightyCSummaryResponse
import app.fintrack.compose.data.api.HraExemptionResponse
import app.fintrack.compose.data.api.ItrReadinessResponse
import app.fintrack.compose.data.api.LtaResponse
import app.fintrack.compose.data.api.SalaryIntelligenceResponse
import app.fintrack.compose.data.api.SalaryPlanItemDto
import app.fintrack.compose.data.api.TAX_INVESTMENT_TYPES
import app.fintrack.compose.data.api.TAX_REGIMES
import app.fintrack.compose.data.api.TaxEstimateDataDto
import app.fintrack.compose.data.api.TaxInvestmentDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import androidx.compose.ui.graphics.Color

private val TAX_TABS = listOf("80C", "Capital Gains", "HRA & LTA", "Advance Tax", "ITR Readiness", "Estimate", "Salary")

@Composable
fun TaxScreen(viewModel: TaxViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    var selectedTab by remember { mutableIntStateOf(0) }

    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            "Tax",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space3),
        )
        TabRow(selectedTabIndex = selectedTab) {
            TAX_TABS.forEachIndexed { index, label ->
                Tab(selected = selectedTab == index, onClick = { selectedTab = index }, text = { Text(label) })
            }
        }

        state.actionError?.let { error ->
            Surface(
                color = MaterialTheme.colorScheme.errorContainer,
                onClick = viewModel::clearActionError,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    error,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(FinTrackSpacing.space3),
                )
            }
        }

        Box(modifier = Modifier.fillMaxSize()) {
            when {
                state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                else -> when (selectedTab) {
                    0 -> EightyCTab(state.eightyC, onAdd = viewModel::openEightyCForm, onDelete = viewModel::deleteEightyC)
                    1 -> CapitalGainsTab(state.capitalGains, onAdd = viewModel::openCapitalTxnForm)
                    2 -> HraLtaTab(state.profile, state.hra, state.lta, onEditProfile = viewModel::openProfileForm)
                    3 -> AdvanceTaxTab(state.advanceTax, onLogPayment = viewModel::openPaymentForm)
                    4 -> ItrReadinessTab(state.itrReadiness, onToggle = viewModel::toggleItrChecklistItem)
                    5 -> EstimateTab(
                        data = state.estimateData,
                        isLoading = state.isEstimateLoading,
                        isGenerated = state.estimateGenerated,
                        error = state.estimateError,
                        onGenerate = viewModel::generateTaxEstimate,
                    )
                    6 -> SalaryTab(
                        data = state.salaryData,
                        isLoading = state.isSalaryLoading,
                        isGenerated = state.salaryGenerated,
                        error = state.salaryError,
                        onAnalyse = viewModel::analyseSalary,
                    )
                }
            }
        }
    }

    if (state.showProfileForm) {
        ProfileFormSheet(state.profileForm, onDismiss = viewModel::closeProfileForm, onUpdate = viewModel::updateProfileForm, onSave = viewModel::saveProfile)
    }
    if (state.show80cForm) {
        EightyCFormSheet(state.eightyCForm, onDismiss = viewModel::closeEightyCForm, onUpdate = viewModel::updateEightyCForm, onSave = viewModel::saveEightyC)
    }
    if (state.showCapitalTxnForm) {
        CapitalTxnFormSheet(state.capitalTxnForm, onDismiss = viewModel::closeCapitalTxnForm, onUpdate = viewModel::updateCapitalTxnForm, onSave = viewModel::saveCapitalTxn)
    }
    state.payingInstallment?.let { installment ->
        PaymentFormSheet(
            installment = installment,
            amount = state.paymentAmount,
            date = state.paymentDate,
            isSaving = state.isSavingPayment,
            onAmountChange = viewModel::updatePaymentAmount,
            onDateChange = viewModel::updatePaymentDate,
            onDismiss = viewModel::closePaymentForm,
            onSave = viewModel::savePayment,
        )
    }
}

@Composable
private fun StatTile(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = modifier) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space3)) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
    }
}

// ─── 80C ────────────────────────────────────────────────────────────────────

@Composable
private fun EightyCTab(summary: EightyCSummaryResponse?, onAdd: () -> Unit, onDelete: (String) -> Unit) {
    if (summary == null) {
        Text("Couldn't load your 80C summary.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(FinTrackSpacing.space5))
        return
    }
    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            LinearProgressIndicator(
                progress = { (summary.utilization_pct / 100.0).toFloat().coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                StatTile("Claimed", formatInr(summary.total_claimed), Modifier.weight(1f))
                StatTile("Remaining", formatInr(summary.remaining), Modifier.weight(1f))
                StatTile("Limit", formatInr(summary.limit.toDouble()), Modifier.weight(1f))
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
            Button(onClick = onAdd) { Text("Add Investment") }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        if (summary.auto_add_candidates.isNotEmpty()) {
            item {
                Text("Detected from your investments", style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(FinTrackSpacing.space2))
            }
            items(summary.auto_add_candidates) { candidate ->
                Surface(shape = RoundedCornerShape(12.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.08f), modifier = Modifier.fillMaxWidth()) {
                    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3)) {
                        Text(candidate.name, style = MaterialTheme.typography.bodyMedium)
                        Text(formatInr(candidate.amount), style = MaterialTheme.typography.bodyMedium)
                    }
                }
                Spacer(Modifier.height(FinTrackSpacing.space2))
            }
            item { Spacer(Modifier.height(FinTrackSpacing.space3)) }
        }
        if (summary.entries.isEmpty()) {
            item { Text("No 80C investments logged yet.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            items(summary.entries, key = { it.id }) { entry ->
                EightyCEntryRow(entry, onDelete = { onDelete(entry.id) })
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun EightyCEntryRow(entry: TaxInvestmentDto, onDelete: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2)) {
        Column(modifier = Modifier.weight(1f)) {
            Text(entry.name, style = MaterialTheme.typography.bodyMedium)
            Text(
                TAX_INVESTMENT_TYPES.find { it.first == entry.type }?.second ?: entry.type,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(formatInr(entry.amount.toDoubleOrNull() ?: 0.0), style = MaterialTheme.typography.bodyMedium)
        IconButton(onClick = onDelete) {
            Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ─── Capital Gains ──────────────────────────────────────────────────────────

@Composable
private fun CapitalGainsTab(result: CapitalGainsResponse?, onAdd: () -> Unit) {
    if (result == null) {
        Text("Couldn't load your capital gains.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(FinTrackSpacing.space5))
        return
    }
    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                StatTile("STCG Equity", formatInr(result.stcg_equity), Modifier.weight(1f))
                StatTile("LTCG Equity", formatInr(result.ltcg_equity), Modifier.weight(1f))
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                StatTile("STCG Other", formatInr(result.stcg_other), Modifier.weight(1f))
                StatTile("LTCG Other", formatInr(result.ltcg_other), Modifier.weight(1f))
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
            Button(onClick = onAdd) { Text("Log Buy/Sell Transaction") }
            Spacer(Modifier.height(FinTrackSpacing.space3))
            Text(
                "Estimates only — consult a CA before filing. Holding period thresholds: 365 days for equity, 1095 days for other assets.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        if (result.transactions.isEmpty()) {
            item { Text("No sell transactions matched this financial year.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            items(result.transactions) { txn ->
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(FinTrackSpacing.space3)) {
                        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                            Text(txn.asset_name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                            Text(
                                formatInr(txn.gain_loss_amount),
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (txn.gain_loss_amount >= 0) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp,
                            )
                        }
                        Text(
                            "${txn.gain_type.uppercase()} · ${txn.holding_period_days} days held · sold ${txn.sell_date.take(10)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Spacer(Modifier.height(FinTrackSpacing.space2))
            }
        }
    }
}

// ─── HRA & LTA ──────────────────────────────────────────────────────────────

@Composable
private fun HraLtaTab(profile: app.fintrack.compose.data.api.TaxProfileDto?, hra: HraExemptionResponse?, lta: LtaResponse?, onEditProfile: () -> Unit) {
    if (profile == null) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(FinTrackSpacing.space5)) {
                    Text("Set up your salary profile to see your HRA exemption and LTA tracker.", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    Button(onClick = onEditProfile) { Text("Set Up Salary Profile") }
                }
            }
        }
        return
    }

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            hra?.let {
                Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(FinTrackSpacing.space5)) {
                        Text("HRA Exemption", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                            StatTile("Exempt", formatInr(it.exempt_hra), Modifier.weight(1f))
                            StatTile("Taxable", formatInr(it.taxable_hra), Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        Text(it.explanation, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        it.optimization_potential?.let { potential ->
                            Spacer(Modifier.height(FinTrackSpacing.space2))
                            Surface(shape = RoundedCornerShape(12.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.10f)) {
                                Text(
                                    "Paying ${formatInr(potential)} more rent per month would maximize your exemption.",
                                    style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.padding(FinTrackSpacing.space3),
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(FinTrackSpacing.space4))
            }
            lta?.let {
                Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(FinTrackSpacing.space5)) {
                        Text("LTA Block Tracker", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        Text("Claims used: ${it.claims_used} of 2 · ${it.claims_remaining} remaining", style = MaterialTheme.typography.bodyMedium)
                        Spacer(Modifier.height(FinTrackSpacing.space1))
                        Text("Block ends in ${it.next_claim_expires_in_months} months", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        it.recommendation?.let { rec ->
                            Spacer(Modifier.height(FinTrackSpacing.space2))
                            Surface(shape = RoundedCornerShape(12.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.10f)) {
                                Text(rec, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(FinTrackSpacing.space3))
                            }
                        }
                    }
                }
                Spacer(Modifier.height(FinTrackSpacing.space4))
            }
            OutlinedButton(onClick = onEditProfile) { Text("Edit Salary Profile") }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
    }
}

// ─── Advance Tax ────────────────────────────────────────────────────────────

@Composable
private fun AdvanceTaxTab(result: AdvanceTaxResponse?, onLogPayment: (Int, Double) -> Unit) {
    if (result == null) {
        Text("Couldn't load your advance tax estimate.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(FinTrackSpacing.space5))
        return
    }
    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        if (!result.is_applicable) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        result.explanation ?: "Advance tax does not apply to you this year.",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(FinTrackSpacing.space5),
                    )
                }
            }
            return@LazyColumn
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                RegimeCard(
                    "Old Regime",
                    result.old_regime_tax,
                    isRecommended = result.recommended_regime == "old",
                    modifier = Modifier.weight(1f),
                )
                RegimeCard(
                    "New Regime",
                    result.new_regime_tax,
                    isRecommended = result.recommended_regime == "new",
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))
            Text(
                "Estimated income: ${formatInr(result.estimated_income)} · You'd save ${formatInr(result.tax_savings_from_better_regime)} with the ${result.recommended_regime} regime.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space4))
            Text("Installment Schedule", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(FinTrackSpacing.space2))
        }
        items(result.installment_schedule) { installment ->
            InstallmentRow(installment, onLogPayment = { onLogPayment(installment.installment_number, installment.installment_amount) })
            Spacer(Modifier.height(FinTrackSpacing.space2))
        }
    }
}

@Composable
private fun RegimeCard(label: String, amount: Double, isRecommended: Boolean, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = if (isRecommended) FinTrackColors.Dark.accent.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surface,
        modifier = modifier,
    ) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(formatInr(amount), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            if (isRecommended) {
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Text("Recommended", style = MaterialTheme.typography.labelSmall, color = FinTrackColors.Dark.accent)
            }
        }
    }
}

@Composable
private fun InstallmentRow(installment: app.fintrack.compose.data.api.InstallmentScheduleEntryDto, onLogPayment: () -> Unit) {
    val statusColor = when (installment.status) {
        "paid" -> FinTrackColors.Dark.colorInc
        "overdue" -> FinTrackColors.Dark.colorExp
        "due" -> FinTrackColors.Dark.accent
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3)) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Installment ${installment.installment_number} · ${installment.due_date}", style = MaterialTheme.typography.bodyMedium)
                Text(
                    "${formatInr(installment.installment_amount)} (${installment.status})",
                    style = MaterialTheme.typography.bodySmall,
                    color = statusColor,
                )
            }
            if (installment.status != "paid") {
                TextButton(onClick = onLogPayment) { Text("Log Payment") }
            }
        }
    }
}

// ─── ITR Readiness ──────────────────────────────────────────────────────────

@Composable
private fun ItrReadinessTab(result: ItrReadinessResponse?, onToggle: (String, Boolean) -> Unit) {
    if (result == null) {
        Text("Couldn't load your ITR readiness score.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(FinTrackSpacing.space5))
        return
    }
    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(FinTrackSpacing.space5)) {
                    Text("${result.score}/100", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = FinTrackColors.Dark.accent)
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    LinearProgressIndicator(progress = { result.score / 100f }, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Text(result.completion_summary, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    result.next_action?.let {
                        Spacer(Modifier.height(FinTrackSpacing.space2))
                        Text("Next: $it", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        items(result.items.filter { it.status != "not_applicable" }) { item ->
            ChecklistRow(item, onToggle = onToggle)
            Spacer(Modifier.height(FinTrackSpacing.space2))
        }
    }
}

@Composable
private fun ChecklistRow(item: app.fintrack.compose.data.api.ItrChecklistItemDto, onToggle: (String, Boolean) -> Unit) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space3)) {
            if (item.type == "manual") {
                Checkbox(checked = item.status == "done", onCheckedChange = { onToggle(item.key, it) })
            } else {
                Icon(
                    if (item.status == "done") Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
                    contentDescription = null,
                    tint = if (item.status == "done") FinTrackColors.Dark.colorInc else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(FinTrackSpacing.space3),
                )
            }
            Text(item.label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = FinTrackSpacing.space3))
        }
    }
}

// ─── Tax Estimate ───────────────────────────────────────────────────────────

@Composable
private fun EstimateTab(
    data: TaxEstimateDataDto?,
    isLoading: Boolean,
    isGenerated: Boolean,
    error: String?,
    onGenerate: (Boolean) -> Unit,
) {
    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Tax Estimate", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("FY income tax calculator", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (isGenerated && !isLoading) {
                    TextButton(onClick = { onGenerate(true) }) { Text("Recalculate") }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        when {
            isLoading -> item {
                Box(Modifier.fillMaxWidth().padding(FinTrackSpacing.space6), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator()
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        Text("Calculating your tax estimate…", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            error != null -> item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space6)) {
                    Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = FinTrackColors.Dark.colorExp)
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Text(error, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    OutlinedButton(onClick = { onGenerate(false) }) { Text("Try again") }
                }
            }
            !isGenerated -> item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space6)) {
                    Text("No estimate yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Text(
                        "Add income transactions first, then calculate your tax estimate",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    Button(onClick = { onGenerate(false) }) { Icon(Icons.Filled.Receipt, contentDescription = null); Spacer(Modifier.width(FinTrackSpacing.space2)); Text("Calculate My Tax") }
                }
            }
            data != null -> {
                if (data.grossIncome <= 0) {
                    item {
                        Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                            Text(
                                data.disclaimer ?: "No income recorded for this financial year. Add salary/income transactions to see an estimate.",
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(FinTrackSpacing.space5),
                            )
                        }
                    }
                } else {
                    val isNewBetter = data.recommendedRegime == "new"
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                            StatTile("Gross Income ${data.fyPeriod ?: ""}", formatInr(data.grossIncome), Modifier.weight(1f))
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier.weight(1f),
                            ) {
                                Column(modifier = Modifier.padding(FinTrackSpacing.space3)) {
                                    Text("RECOMMENDED REGIME", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Spacer(Modifier.height(FinTrackSpacing.space1))
                                    Text(
                                        if (isNewBetter) "New Regime" else "Old Regime",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isNewBetter) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.accent,
                                    )
                                    if ((data.savings ?: 0.0) > 0) {
                                        Text(
                                            "Save ${formatInr(data.savings ?: 0.0)} vs other regime",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = FinTrackColors.Dark.colorInc,
                                        )
                                    }
                                }
                            }
                        }
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                    }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                            data.newRegime?.let {
                                TaxRegimeDetailCard("New Regime", it, isRecommended = isNewBetter, grossIncome = data.grossIncome, modifier = Modifier.weight(1f))
                            }
                            data.oldRegime?.let {
                                TaxRegimeDetailCard("Old Regime", it, isRecommended = !isNewBetter, grossIncome = data.grossIncome, modifier = Modifier.weight(1f))
                            }
                        }
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                    }
                    if (data.breakdown.isNotEmpty()) {
                        item {
                            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
                                    Text("Tax slab breakdown (New Regime)", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                    Spacer(Modifier.height(FinTrackSpacing.space3))
                                    data.breakdown.forEach { row ->
                                        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
                                            Text(row.slab, style = MaterialTheme.typography.bodySmall)
                                            Text(row.rate, style = MaterialTheme.typography.bodySmall, color = FinTrackColors.Dark.accent)
                                            Text(if (row.tax > 0) formatInr(row.tax) else "Nil", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                                        }
                                    }
                                }
                            }
                            Spacer(Modifier.height(FinTrackSpacing.space3))
                        }
                    }
                    if (data.tips.isNotEmpty()) {
                        item {
                            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
                                    Text("Tax saving tips", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                    Spacer(Modifier.height(FinTrackSpacing.space3))
                                    data.tips.forEachIndexed { i, tip ->
                                        Row(modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
                                            Text("${i + 1}.", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = FinTrackColors.Dark.colorInc)
                                            Spacer(Modifier.width(FinTrackSpacing.space2))
                                            Text(tip, style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                            }
                            Spacer(Modifier.height(FinTrackSpacing.space3))
                        }
                    }
                }
                item {
                    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.padding(FinTrackSpacing.space4)) {
                            Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(FinTrackSpacing.space2))
                            Column {
                                Text(data.disclaimer ?: "This is an estimate only.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("Consult a Chartered Accountant for accurate tax filing.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                }
            }
        }
    }
}

@Composable
private fun TaxRegimeDetailCard(label: String, regime: app.fintrack.compose.data.api.TaxRegimeBreakdownDto, isRecommended: Boolean, grossIncome: Double, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = if (isRecommended) FinTrackColors.Dark.colorInc.copy(alpha = 0.08f) else MaterialTheme.colorScheme.surface,
        modifier = modifier,
    ) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                if (isRecommended) Text("✓ RECOMMENDED", style = MaterialTheme.typography.labelSmall, color = FinTrackColors.Dark.colorInc)
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(formatInr(regime.total), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Effective rate: ${if (grossIncome > 0) "%.1f".format(regime.total / grossIncome * 100) else "0"}%",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space2))
            HorizontalDivider()
            Spacer(Modifier.height(FinTrackSpacing.space2))
            RegimeLine("Standard Deduction", formatInr(regime.standardDeduction), FinTrackColors.Dark.colorInc)
            regime.deduction80C?.let { RegimeLine("80C Deductions", formatInr(it), FinTrackColors.Dark.colorInc) }
            RegimeLine("Taxable Income", formatInr(regime.taxableIncome), MaterialTheme.colorScheme.onSurface)
            RegimeLine("Income Tax", formatInr(regime.tax), FinTrackColors.Dark.colorExp)
            RegimeLine("Cess (4%)", formatInr(regime.cess), FinTrackColors.Dark.accent)
        }
    }
}

@Composable
private fun RegimeLine(label: String, value: String, color: Color) {
    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = color)
    }
}

// ─── Salary Intelligence ────────────────────────────────────────────────────

// Allocation plan category colours — stored data values, not CSS tokens.
private val SALARY_PLAN_META: Map<String, Triple<String, Color, androidx.compose.ui.graphics.vector.ImageVector>> = mapOf(
    "savings" to Triple("Savings", Color(0xFF00E5A0), Icons.Filled.Savings),
    "rent" to Triple("Rent / Housing", Color(0xFFF59E0B), Icons.Filled.Home),
    "food" to Triple("Food", Color(0xFF6366F1), Icons.Filled.ShoppingBag),
    "transport" to Triple("Transport", Color(0xFF8B5CF6), Icons.Filled.DirectionsCar),
    "investments" to Triple("Investments", Color(0xFF06B6D4), Icons.Filled.TrendingUp),
    "discretionary" to Triple("Discretionary", Color(0xFFF43F5E), Icons.Filled.AutoAwesome),
)

@Composable
private fun SalaryTab(
    data: SalaryIntelligenceResponse?,
    isLoading: Boolean,
    isGenerated: Boolean,
    error: String?,
    onAnalyse: () -> Unit,
) {
    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Salary Intelligence", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("Income benchmarking", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (isGenerated && !isLoading) {
                    TextButton(onClick = onAnalyse) { Text("Refresh") }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
        when {
            isLoading -> item {
                Box(Modifier.fillMaxWidth().padding(FinTrackSpacing.space6), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator()
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        Text("Detecting your salary pattern…", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            error != null -> item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space6)) {
                    Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = FinTrackColors.Dark.colorExp)
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Text(error, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    OutlinedButton(onClick = onAnalyse) { Text("Try again") }
                }
            }
            !isGenerated -> item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space6)) {
                    Text("No data yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Text(
                        "Add income transactions so we can detect your salary and generate a personalised allocation plan",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = FinTrackSpacing.space4),
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    Button(onClick = onAnalyse) { Text("Analyse Salary Pattern") }
                }
            }
            data != null && !data.detected -> item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space6)) {
                    Text("No salary pattern detected", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Text(
                        "We need at least one income transaction to detect your salary. Add your salary or income transactions to unlock this feature.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = FinTrackSpacing.space4),
                    )
                }
            }
            data != null && data.detected -> {
                item {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = FinTrackColors.Dark.colorInc.copy(alpha = 0.08f),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(FinTrackSpacing.space5)) {
                            Icon(Icons.Filled.Savings, contentDescription = null, tint = FinTrackColors.Dark.colorInc)
                            Spacer(Modifier.width(FinTrackSpacing.space3))
                            Column {
                                Text(formatInr(data.salary ?: 0.0), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = FinTrackColors.Dark.colorInc)
                                Text(data.description ?: "Monthly salary detected", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                data.insight?.let {
                                    Spacer(Modifier.height(FinTrackSpacing.space1))
                                    Text("\"$it\"", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                }
                val plan = data.plan
                if (!plan.isNullOrEmpty()) {
                    item {
                        Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
                                Text("AI Salary Allocation Plan", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.height(FinTrackSpacing.space3))
                                Row(modifier = Modifier.fillMaxWidth().height(10.dp)) {
                                    plan.forEach { (key, value) ->
                                        val meta = SALARY_PLAN_META[key]
                                        Box(
                                            modifier = Modifier
                                                .weight((value.percentage.takeIf { it > 0 } ?: 0.01).toFloat())
                                                .fillMaxSize()
                                                .padding(horizontal = 1.dp),
                                        ) {
                                            Surface(color = meta?.second ?: MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxSize()) {}
                                        }
                                    }
                                }
                                Spacer(Modifier.height(FinTrackSpacing.space3))
                                plan.forEach { (key, value) -> SalaryPlanRow(key, value) }
                                Spacer(Modifier.height(FinTrackSpacing.space2))
                                HorizontalDivider()
                                Spacer(Modifier.height(FinTrackSpacing.space2))
                                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                    Text("Total allocated", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                                    Text(
                                        "${formatInr(plan.values.sumOf { it.amount })} · ${plan.values.sumOf { it.percentage }.toInt()}%",
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                    }
                }
                item {
                    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
                            Text("How to use this plan", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(FinTrackSpacing.space3))
                            listOf(
                                "Transfer the Savings amount to a separate account on payday before spending anything else.",
                                "Set the Investments amount as a recurring transfer to your SIP or RD on the 1st of the month.",
                                "Use the Discretionary budget as your guilt-free spending limit — no tracking needed within it.",
                                "Review this plan every 3 months as your income or lifestyle changes.",
                            ).forEachIndexed { i, tip ->
                                Row(modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
                                    Text("${i + 1}.", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = FinTrackColors.Dark.accent)
                                    Spacer(Modifier.width(FinTrackSpacing.space2))
                                    Text(tip, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                }
            }
        }
    }
}

@Composable
private fun SalaryPlanRow(key: String, value: SalaryPlanItemDto) {
    val meta = SALARY_PLAN_META[key]
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2)) {
        Surface(shape = RoundedCornerShape(10.dp), color = (meta?.second ?: MaterialTheme.colorScheme.onSurfaceVariant).copy(alpha = 0.15f)) {
            Icon(
                meta?.third ?: Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = meta?.second ?: MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(FinTrackSpacing.space2),
            )
        }
        Spacer(Modifier.width(FinTrackSpacing.space3))
        Column(modifier = Modifier.weight(1f)) {
            Text(meta?.first ?: key, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            value.reason?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1) }
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(formatInr(value.amount), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = meta?.second ?: MaterialTheme.colorScheme.onSurface)
            Text("${value.percentage.toInt()}%", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ─── Forms ──────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileFormSheet(
    form: ProfileFormState,
    onDismiss: () -> Unit,
    onUpdate: ((ProfileFormState) -> ProfileFormState) -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    var cityMenuExpanded by remember { mutableStateOf(false) }
    var regimeMenuExpanded by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text("Salary Profile", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = form.basicSalaryMonthly,
                onValueChange = { v -> onUpdate { it.copy(basicSalaryMonthly = v) } },
                label = { Text("Basic salary (monthly)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                OutlinedTextField(
                    value = form.hraComponentMonthly,
                    onValueChange = { v -> onUpdate { it.copy(hraComponentMonthly = v) } },
                    label = { Text("HRA (monthly)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.rentPaidMonthly,
                    onValueChange = { v -> onUpdate { it.copy(rentPaidMonthly = v) } },
                    label = { Text("Rent paid (monthly)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                OutlinedTextField(
                    value = form.specialAllowanceMonthly,
                    onValueChange = { v -> onUpdate { it.copy(specialAllowanceMonthly = v) } },
                    label = { Text("Special allowance") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.ltaComponentAnnual,
                    onValueChange = { v -> onUpdate { it.copy(ltaComponentAnnual = v) } },
                    label = { Text("LTA (annual)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            ExposedDropdownMenuBox(expanded = cityMenuExpanded, onExpandedChange = { cityMenuExpanded = it }) {
                OutlinedTextField(
                    value = CITY_TYPES.find { it.first == form.cityType }?.second ?: form.cityType,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("City type") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = cityMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = cityMenuExpanded, onDismissRequest = { cityMenuExpanded = false }) {
                    CITY_TYPES.forEach { (value, label) ->
                        DropdownMenuItem(text = { Text(label) }, onClick = { onUpdate { it.copy(cityType = value) }; cityMenuExpanded = false })
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            ExposedDropdownMenuBox(expanded = regimeMenuExpanded, onExpandedChange = { regimeMenuExpanded = it }) {
                OutlinedTextField(
                    value = TAX_REGIMES.find { it.first == form.preferredRegime }?.second ?: form.preferredRegime,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Preferred regime") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = regimeMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = regimeMenuExpanded, onDismissRequest = { regimeMenuExpanded = false }) {
                    TAX_REGIMES.forEach { (value, label) ->
                        DropdownMenuItem(text = { Text(label) }, onClick = { onUpdate { it.copy(preferredRegime = value) }; regimeMenuExpanded = false })
                    }
                }
            }

            form.error?.let {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(FinTrackSpacing.space5))
            Button(onClick = onSave, enabled = !form.isSaving, modifier = Modifier.fillMaxWidth()) {
                if (form.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Save Profile")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EightyCFormSheet(
    form: EightyCFormState,
    onDismiss: () -> Unit,
    onUpdate: ((EightyCFormState) -> EightyCFormState) -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    var typeMenuExpanded by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text("Add 80C Investment", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            ExposedDropdownMenuBox(expanded = typeMenuExpanded, onExpandedChange = { typeMenuExpanded = it }) {
                OutlinedTextField(
                    value = TAX_INVESTMENT_TYPES.find { it.first == form.type }?.second ?: form.type,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Type") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = typeMenuExpanded, onDismissRequest = { typeMenuExpanded = false }) {
                    TAX_INVESTMENT_TYPES.forEach { (value, label) ->
                        DropdownMenuItem(text = { Text(label) }, onClick = { onUpdate { it.copy(type = value) }; typeMenuExpanded = false })
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.name,
                onValueChange = { v -> onUpdate { it.copy(name = v) } },
                label = { Text("Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.amount,
                onValueChange = { v -> onUpdate { it.copy(amount = v) } },
                label = { Text("Amount") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )

            form.error?.let {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(FinTrackSpacing.space5))
            Button(onClick = onSave, enabled = !form.isSaving, modifier = Modifier.fillMaxWidth()) {
                if (form.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Add Investment")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CapitalTxnFormSheet(
    form: CapitalTxnFormState,
    onDismiss: () -> Unit,
    onUpdate: ((CapitalTxnFormState) -> CapitalTxnFormState) -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    var assetTypeMenuExpanded by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text("Log Capital Transaction", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                FilterChip(selected = form.transactionType == "buy", onClick = { onUpdate { it.copy(transactionType = "buy") } }, label = { Text("Buy") })
                FilterChip(selected = form.transactionType == "sell", onClick = { onUpdate { it.copy(transactionType = "sell") } }, label = { Text("Sell") })
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.assetName,
                onValueChange = { v -> onUpdate { it.copy(assetName = v) } },
                label = { Text("Asset name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            ExposedDropdownMenuBox(expanded = assetTypeMenuExpanded, onExpandedChange = { assetTypeMenuExpanded = it }) {
                OutlinedTextField(
                    value = CAPITAL_ASSET_TYPES.find { it.first == form.assetType }?.second ?: form.assetType,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Asset type") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = assetTypeMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = assetTypeMenuExpanded, onDismissRequest = { assetTypeMenuExpanded = false }) {
                    CAPITAL_ASSET_TYPES.forEach { (value, label) ->
                        DropdownMenuItem(text = { Text(label) }, onClick = { onUpdate { it.copy(assetType = value) }; assetTypeMenuExpanded = false })
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                OutlinedTextField(
                    value = form.units,
                    onValueChange = { v -> onUpdate { it.copy(units = v) } },
                    label = { Text("Units") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.pricePerUnit,
                    onValueChange = { v -> onUpdate { it.copy(pricePerUnit = v) } },
                    label = { Text("Price per unit") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.transactionDate,
                onValueChange = { v -> onUpdate { it.copy(transactionDate = v) } },
                label = { Text("Date (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            form.error?.let {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(FinTrackSpacing.space5))
            Button(onClick = onSave, enabled = !form.isSaving, modifier = Modifier.fillMaxWidth()) {
                if (form.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Log Transaction")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PaymentFormSheet(
    installment: Int,
    amount: String,
    date: String,
    isSaving: Boolean,
    onAmountChange: (String) -> Unit,
    onDateChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text("Log Payment — Installment $installment", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = amount,
                onValueChange = onAmountChange,
                label = { Text("Amount paid") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = date,
                onValueChange = onDateChange,
                label = { Text("Paid on (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(FinTrackSpacing.space5))
            Button(onClick = onSave, enabled = !isSaving, modifier = Modifier.fillMaxWidth()) {
                if (isSaving) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Log Payment")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}
