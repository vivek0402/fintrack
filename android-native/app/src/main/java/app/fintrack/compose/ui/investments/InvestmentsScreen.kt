package app.fintrack.compose.ui.investments

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.INVESTMENT_TYPES
import app.fintrack.compose.data.api.InvestmentDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvestmentsScreen(viewModel: InvestmentsViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    var pendingDeleteId by remember { mutableStateOf<String?>(null) }

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error.orEmpty(),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            else -> LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
                item {
                    InvestmentsSummaryCard(state.summary)
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                }
                if (state.investments.isEmpty()) {
                    item {
                        Text(
                            "No investments yet — add one to track your portfolio",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    item {
                        Text("Holdings", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(FinTrackSpacing.space2))
                    }
                    items(state.investments, key = { it.id }) { investment ->
                        InvestmentRow(investment = investment, onDelete = { pendingDeleteId = investment.id })
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = viewModel::openCreateForm,
            modifier = Modifier.align(Alignment.BottomEnd).padding(FinTrackSpacing.space5),
        ) {
            Icon(Icons.Filled.Add, contentDescription = "Add investment")
        }
    }

    if (state.showForm) {
        InvestmentFormSheet(state = state, onDismiss = viewModel::closeForm, onUpdate = viewModel::updateForm, onSave = viewModel::save)
    }

    pendingDeleteId?.let { id ->
        AlertDialog(
            onDismissRequest = { pendingDeleteId = null },
            title = { Text("Delete investment?") },
            text = { Text("This can't be undone.") },
            confirmButton = {
                TextButton(onClick = { viewModel.delete(id); pendingDeleteId = null }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { pendingDeleteId = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun InvestmentsSummaryCard(summary: app.fintrack.compose.data.api.InvestmentSummaryResponse?) {
    val isGain = (summary?.total_unrealized_gain ?: 0.0) >= 0
    val gainColor = if (isGain) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space6)) {
            Text("Current Value", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                formatInr(summary?.total_current_value ?: 0.0),
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Surface(shape = RoundedCornerShape(20.dp), color = gainColor.copy(alpha = 0.12f)) {
                Text(
                    "${if (isGain) "+" else ""}${formatInr(summary?.total_unrealized_gain ?: 0.0)} (${summary?.total_unrealized_gain_pct ?: 0.0}%)",
                    style = MaterialTheme.typography.labelMedium,
                    color = gainColor,
                    modifier = Modifier.padding(horizontal = FinTrackSpacing.space3, vertical = FinTrackSpacing.space1),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                "Invested: ${formatInr(summary?.total_invested ?: 0.0)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun InvestmentRow(investment: InvestmentDto, onDelete: () -> Unit) {
    val isGain = investment.unrealized_gain >= 0
    val gainColor = if (isGain) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface) {
        Row(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space4), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(investment.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    investment.type.replace('_', ' ').replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Text(formatInr(investment.current_value), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    "${if (isGain) "+" else ""}${formatInr(investment.unrealized_gain)} (${investment.unrealized_gain_pct}%)",
                    style = MaterialTheme.typography.bodySmall,
                    color = gainColor,
                )
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InvestmentFormSheet(
    state: InvestmentsUiState,
    onDismiss: () -> Unit,
    onUpdate: ((InvestmentFormState) -> InvestmentFormState) -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    val form = state.form
    var typeMenuExpanded by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text("Add Investment", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            ExposedDropdownMenuBox(expanded = typeMenuExpanded, onExpandedChange = { typeMenuExpanded = it }) {
                OutlinedTextField(
                    value = form.type.replace('_', ' ').replaceFirstChar { it.uppercase() },
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Type") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = typeMenuExpanded, onDismissRequest = { typeMenuExpanded = false }) {
                    INVESTMENT_TYPES.forEach { type ->
                        DropdownMenuItem(
                            text = { Text(type.replace('_', ' ').replaceFirstChar { it.uppercase() }) },
                            onClick = { onUpdate { it.copy(type = type) }; typeMenuExpanded = false },
                        )
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.name,
                onValueChange = { v -> onUpdate { it.copy(name = v) } },
                label = { Text("Name (e.g. fund or stock)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.units,
                onValueChange = { v -> onUpdate { it.copy(units = v) } },
                label = { Text("Units") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.purchasePricePerUnit,
                onValueChange = { v -> onUpdate { it.copy(purchasePricePerUnit = v) } },
                label = { Text("Purchase price / unit") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.currentNavOrPrice,
                onValueChange = { v -> onUpdate { it.copy(currentNavOrPrice = v) } },
                label = { Text("Current NAV / price") },
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
