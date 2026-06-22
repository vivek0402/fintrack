package app.fintrack.compose.ui.transactions

import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.SentimentVeryDissatisfied
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransactionsScreen(viewModel: TransactionsViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    var pendingDeleteId by remember { mutableStateOf<String?>(null) }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space4),
                horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2),
            ) {
                FilterChip(selected = state.filterType == null, onClick = { viewModel.setFilterType(null) }, label = { Text("All") })
                FilterChip(selected = state.filterType == "income", onClick = { viewModel.setFilterType("income") }, label = { Text("Income") })
                FilterChip(selected = state.filterType == "expense", onClick = { viewModel.setFilterType("expense") }, label = { Text("Expense") })
            }

            when {
                state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                state.error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error)
                }
                state.transactions.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No transactions yet", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                else -> LazyColumn(
                    contentPadding = PaddingValues(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space2),
                ) {
                    items(state.transactions, key = { it.id }) { tx ->
                        TransactionRow(
                            tx = tx,
                            onClick = { viewModel.openEditForm(tx) },
                            onDelete = { pendingDeleteId = tx.id },
                            onToggleRegret = { viewModel.toggleRegret(tx.id) },
                        )
                        HorizontalDivider()
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = viewModel::openCreateForm,
            modifier = Modifier.align(Alignment.BottomEnd).padding(FinTrackSpacing.space5),
        ) {
            Icon(Icons.Filled.Add, contentDescription = "Add transaction")
        }
    }

    if (state.showForm) {
        TransactionFormSheet(
            state = state,
            onDismiss = viewModel::closeForm,
            onUpdate = viewModel::updateForm,
            onSave = viewModel::save,
        )
    }

    pendingDeleteId?.let { id ->
        AlertDialog(
            onDismissRequest = { pendingDeleteId = null },
            title = { Text("Delete transaction?") },
            text = { Text("This can't be undone.") },
            confirmButton = {
                TextButton(onClick = { viewModel.delete(id); pendingDeleteId = null }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { pendingDeleteId = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun TransactionRow(tx: TransactionDto, onClick: () -> Unit, onDelete: () -> Unit, onToggleRegret: () -> Unit) {
    val color = if (tx.type == "income") FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = FinTrackSpacing.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(tx.description, style = MaterialTheme.typography.bodyLarge)
            Text(
                listOfNotNull(tx.category_name, tx.date.take(10)).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            (if (tx.type == "income") "+" else "−") + formatInr(tx.amount),
            style = MaterialTheme.typography.bodyLarge,
            color = color,
        )
        if (tx.type == "expense") {
            IconButton(onClick = onToggleRegret) {
                Icon(
                    Icons.Filled.SentimentVeryDissatisfied,
                    contentDescription = if (tx.is_regretted) "Unmark regret" else "Mark as regretted",
                    tint = if (tx.is_regretted) FinTrackColors.Dark.colorExp else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        IconButton(onClick = onDelete) {
            Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TransactionFormSheet(
    state: TransactionsUiState,
    onDismiss: () -> Unit,
    onUpdate: ((TransactionFormState) -> TransactionFormState) -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    val form = state.form
    var categoryMenuExpanded by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(FinTrackSpacing.space5),
        ) {
            Text(
                if (form.editingId != null) "Edit Transaction" else "Add Transaction",
                style = MaterialTheme.typography.titleLarge,
            )
            Spacer(Modifier.height(FinTrackSpacing.space4))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                FilterChip(
                    selected = form.type == "expense",
                    onClick = { onUpdate { it.copy(type = "expense") } },
                    label = { Text("Expense") },
                )
                FilterChip(
                    selected = form.type == "income",
                    onClick = { onUpdate { it.copy(type = "income") } },
                    label = { Text("Income") },
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.amount,
                onValueChange = { v -> onUpdate { it.copy(amount = v) } },
                label = { Text("Amount") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.description,
                onValueChange = { v -> onUpdate { it.copy(description = v) } },
                label = { Text("Description") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.date,
                onValueChange = { v -> onUpdate { it.copy(date = v) } },
                label = { Text("Date (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            ExposedDropdownMenuBox(expanded = categoryMenuExpanded, onExpandedChange = { categoryMenuExpanded = it }) {
                OutlinedTextField(
                    value = state.categories.find { it.id == form.categoryId }?.name ?: "No category",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Category") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(
                    expanded = categoryMenuExpanded,
                    onDismissRequest = { categoryMenuExpanded = false },
                ) {
                    state.categories.forEach { category ->
                        DropdownMenuItem(
                            text = { Text(category.name) },
                            onClick = {
                                onUpdate { it.copy(categoryId = category.id) }
                                categoryMenuExpanded = false
                            },
                        )
                    }
                }
            }
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
                    Text(if (form.editingId != null) "Save Changes" else "Add Transaction")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}
