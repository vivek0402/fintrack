package app.fintrack.compose.ui.loans

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.material.icons.filled.Add
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.LOAN_TYPES
import app.fintrack.compose.data.api.LoanDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoansScreen(viewModel: LoansViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    var pendingRepaidId by remember { mutableStateOf<String?>(null) }

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error.orEmpty(),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            state.loans.isEmpty() -> Text(
                "No active loans yet. Add one to start tracking payoff progress.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            else -> LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
                items(state.loans, key = { it.id }) { loan ->
                    LoanCard(
                        loan = loan,
                        isExpanded = state.expandedLoanId == loan.id,
                        isLoadingAmortization = state.isLoadingAmortization && state.expandedLoanId == loan.id,
                        amortization = if (state.expandedLoanId == loan.id) state.amortization else null,
                        onToggleExpand = { viewModel.toggleExpand(loan.id) },
                        onEdit = { viewModel.openEditForm(loan) },
                        onMarkRepaid = { pendingRepaidId = loan.id },
                        onLogPrepayment = { viewModel.openPrepaymentForm(loan.id) },
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                }
            }
        }

        FloatingActionButton(
            onClick = viewModel::openCreateForm,
            modifier = Modifier.align(Alignment.BottomEnd).padding(FinTrackSpacing.space5),
        ) {
            Icon(Icons.Filled.Add, contentDescription = "Add loan")
        }
    }

    if (state.showForm) {
        LoanFormSheet(state = state, onDismiss = viewModel::closeForm, onUpdate = viewModel::updateForm, onSave = viewModel::save)
    }

    if (state.showPrepaymentForm) {
        PrepaymentFormSheet(
            state = state,
            onDismiss = viewModel::closePrepaymentForm,
            onAmountChange = viewModel::updatePrepaymentAmount,
            onDateChange = viewModel::updatePrepaymentDate,
            onNotesChange = viewModel::updatePrepaymentNotes,
            onSave = viewModel::savePrepayment,
        )
    }

    pendingRepaidId?.let { id ->
        AlertDialog(
            onDismissRequest = { pendingRepaidId = null },
            title = { Text("Mark loan as repaid?") },
            text = { Text("This loan will be removed from your active loans and debt calculations.") },
            confirmButton = {
                TextButton(onClick = { viewModel.markRepaid(id); pendingRepaidId = null }) { Text("Mark Repaid") }
            },
            dismissButton = { TextButton(onClick = { pendingRepaidId = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun LoanCard(
    loan: LoanDto,
    isExpanded: Boolean,
    isLoadingAmortization: Boolean,
    amortization: app.fintrack.compose.data.api.AmortizationResponse?,
    onToggleExpand: () -> Unit,
    onEdit: () -> Unit,
    onMarkRepaid: () -> Unit,
    onLogPrepayment: () -> Unit,
) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.clickable(onClick = onToggleExpand).padding(FinTrackSpacing.space4)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(loan.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                    Text(
                        LOAN_TYPES.find { it.first == loan.type }?.second ?: loan.type,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Row {
                    IconButton(onClick = onEdit) {
                        Icon(Icons.Filled.Edit, contentDescription = "Edit", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = onMarkRepaid) {
                        Icon(Icons.Filled.CheckCircle, contentDescription = "Mark repaid", tint = FinTrackColors.Dark.colorInc)
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space4)) {
                Text("Outstanding: ${formatInr(loan.outstanding_balance.toDoubleOrNull() ?: 0.0)}", style = MaterialTheme.typography.bodySmall)
                Text("${loan.interest_rate_pct}% p.a.", style = MaterialTheme.typography.bodySmall)
            }
            loan.months_remaining?.let {
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Text("$it months remaining", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            if (isExpanded) {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                HorizontalDivider()
                Spacer(Modifier.height(FinTrackSpacing.space3))
                when {
                    isLoadingAmortization -> CircularProgressIndicator(modifier = Modifier.padding(FinTrackSpacing.space2))
                    amortization != null -> {
                        Text(
                            "Total interest remaining: ${formatInr(amortization.summary.total_interest)} · Payoff: ${amortization.summary.payoff_date ?: "—"}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Spacer(Modifier.height(FinTrackSpacing.space2))
                        OutlinedButton(onClick = onLogPrepayment) { Text("Log Prepayment") }
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        Text("Next 6 months", style = MaterialTheme.typography.labelMedium)
                        Spacer(Modifier.height(FinTrackSpacing.space1))
                        amortization.schedule.take(6).forEach { entry ->
                            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
                                Text(entry.date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("Balance ${formatInr(entry.closing_balance)}", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LoanFormSheet(
    state: LoansUiState,
    onDismiss: () -> Unit,
    onUpdate: ((LoanFormState) -> LoanFormState) -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    val form = state.form
    val isEditing = form.editingId != null
    var typeMenuExpanded by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, contentWindowInsets = { WindowInsets.systemBars }) {
        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 560.dp).padding(FinTrackSpacing.space5)) {
            Text(if (isEditing) "Edit Loan" else "Add Loan", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = form.name,
                onValueChange = { v -> onUpdate { it.copy(name = v) } },
                label = { Text("Loan name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            if (!isEditing) {
                ExposedDropdownMenuBox(expanded = typeMenuExpanded, onExpandedChange = { typeMenuExpanded = it }) {
                    OutlinedTextField(
                        value = LOAN_TYPES.find { it.first == form.type }?.second ?: form.type,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Loan type") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeMenuExpanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor(),
                    )
                    ExposedDropdownMenu(expanded = typeMenuExpanded, onDismissRequest = { typeMenuExpanded = false }) {
                        LOAN_TYPES.forEach { (value, label) ->
                            DropdownMenuItem(text = { Text(label) }, onClick = { onUpdate { it.copy(type = value) }; typeMenuExpanded = false })
                        }
                    }
                }
                Spacer(Modifier.height(FinTrackSpacing.space3))

                OutlinedTextField(
                    value = form.principalAmount,
                    onValueChange = { v -> onUpdate { it.copy(principalAmount = v) } },
                    label = { Text("Principal amount") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(FinTrackSpacing.space3))

                OutlinedTextField(
                    value = form.disbursementDate,
                    onValueChange = { v -> onUpdate { it.copy(disbursementDate = v) } },
                    label = { Text("Disbursement date (YYYY-MM-DD)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(FinTrackSpacing.space3))

                OutlinedTextField(
                    value = form.tenureMonths,
                    onValueChange = { v -> onUpdate { it.copy(tenureMonths = v) } },
                    label = { Text("Tenure (months)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(FinTrackSpacing.space3))
            }

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                OutlinedTextField(
                    value = form.outstandingBalance,
                    onValueChange = { v -> onUpdate { it.copy(outstandingBalance = v) } },
                    label = { Text("Outstanding balance") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.interestRatePct,
                    onValueChange = { v -> onUpdate { it.copy(interestRatePct = v) } },
                    label = { Text("Interest %") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.emiAmount,
                onValueChange = { v -> onUpdate { it.copy(emiAmount = v) } },
                label = { Text("EMI amount (optional, auto-calculated if blank)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.bankOrLender,
                onValueChange = { v -> onUpdate { it.copy(bankOrLender = v) } },
                label = { Text("Bank / lender (optional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.notes,
                onValueChange = { v -> onUpdate { it.copy(notes = v) } },
                label = { Text("Notes (optional)") },
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
                    Text(if (isEditing) "Save Changes" else "Add Loan")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PrepaymentFormSheet(
    state: LoansUiState,
    onDismiss: () -> Unit,
    onAmountChange: (String) -> Unit,
    onDateChange: (String) -> Unit,
    onNotesChange: (String) -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, contentWindowInsets = { WindowInsets.systemBars }) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text("Log Prepayment", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = state.prepaymentAmount,
                onValueChange = onAmountChange,
                label = { Text("Amount") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = state.prepaymentDate,
                onValueChange = onDateChange,
                label = { Text("Date (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = state.prepaymentNotes,
                onValueChange = onNotesChange,
                label = { Text("Notes (optional)") },
                modifier = Modifier.fillMaxWidth(),
            )

            state.prepaymentError?.let {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(FinTrackSpacing.space5))
            Button(onClick = onSave, enabled = !state.isSavingPrepayment, modifier = Modifier.fillMaxWidth()) {
                if (state.isSavingPrepayment) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Log Prepayment")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}
