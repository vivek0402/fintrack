package app.fintrack.compose.ui.transactions

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SentimentVeryDissatisfied
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
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
import androidx.compose.material3.SmallFloatingActionButton
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
    var pendingBulkDelete by remember { mutableStateOf(false) }
    var searchExpanded by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space2),
                horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2),
            ) {
                FilterChip(
                    selected = state.viewMode == TransactionsViewMode.LIST,
                    onClick = { viewModel.setViewMode(TransactionsViewMode.LIST) },
                    label = { Text("List") },
                )
                FilterChip(
                    selected = state.viewMode == TransactionsViewMode.CALENDAR,
                    onClick = { viewModel.setViewMode(TransactionsViewMode.CALENDAR) },
                    label = { Text("Calendar") },
                )
            }

            if (state.viewMode == TransactionsViewMode.CALENDAR) {
                TransactionsCalendarView(
                    year = state.selectedYear,
                    month = state.selectedMonth,
                    transactions = state.transactions,
                    recurring = state.recurring,
                    onPreviousMonth = viewModel::previousMonth,
                    onNextMonth = viewModel::nextMonth,
                )
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        modifier = Modifier.weight(1f).horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2),
                    ) {
                        FilterChip(selected = state.filterType == null, onClick = { viewModel.setFilterType(null) }, label = { Text("All") })
                        FilterChip(selected = state.filterType == "income", onClick = { viewModel.setFilterType("income") }, label = { Text("Income") })
                        FilterChip(selected = state.filterType == "expense", onClick = { viewModel.setFilterType("expense") }, label = { Text("Expense") })
                        FilterChip(selected = state.isAllTime, onClick = viewModel::toggleAllTime, label = { Text("All time") })
                    }
                    IconButton(onClick = { searchExpanded = !searchExpanded }) {
                        Icon(Icons.Filled.Search, contentDescription = "Search transactions")
                    }
                    IconButton(onClick = viewModel::toggleSelectMode) {
                        Icon(
                            if (state.selectMode) Icons.Filled.Close else Icons.Filled.Checklist,
                            contentDescription = if (state.selectMode) "Cancel selection" else "Select transactions",
                        )
                    }
                }

                if (searchExpanded) {
                    SearchBar(
                        state = state,
                        onQueryChange = viewModel::setSearchQuery,
                        onCategoryChange = viewModel::setSearchCategoryId,
                    )
                }

                when {
                    state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    state.error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error)
                    }
                    state.visibleTransactions.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            if (state.transactions.isEmpty()) "No transactions yet" else "No transactions match your search",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    else -> LazyColumn(
                        contentPadding = PaddingValues(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space2),
                    ) {
                        items(state.visibleTransactions, key = { it.id }) { tx ->
                            TransactionRow(
                                tx = tx,
                                selectMode = state.selectMode,
                                isSelected = tx.id in state.selectedIds,
                                onClick = { if (state.selectMode) viewModel.toggleSelected(tx.id) else viewModel.openEditForm(tx) },
                                onDelete = { pendingDeleteId = tx.id },
                                onToggleRegret = { viewModel.toggleRegret(tx.id) },
                                onToggleSelect = { viewModel.toggleSelected(tx.id) },
                            )
                            HorizontalDivider()
                        }
                    }
                }
            }
        }

        if (state.viewMode == TransactionsViewMode.LIST && state.selectMode) {
            Surface(
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
                color = MaterialTheme.colorScheme.surfaceContainerHigh,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space3),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = viewModel::selectAll) { Text("Select all") }
                    Text("${state.selectedIds.size} selected", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    IconButton(onClick = { pendingBulkDelete = true }, enabled = state.selectedIds.isNotEmpty()) {
                        Icon(Icons.Filled.DeleteSweep, contentDescription = "Delete selected")
                    }
                }
            }
        } else if (state.viewMode == TransactionsViewMode.LIST) {
            Column(
                modifier = Modifier.align(Alignment.BottomEnd).padding(FinTrackSpacing.space5),
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3),
            ) {
                SmallFloatingActionButton(onClick = viewModel::openQuickAdd) {
                    Icon(Icons.Filled.AutoAwesome, contentDescription = "Quick add with AI")
                }
                FloatingActionButton(onClick = viewModel::openCreateForm) {
                    Icon(Icons.Filled.Add, contentDescription = "Add transaction")
                }
            }
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

    if (state.quickAdd.isOpen) {
        QuickAddSheet(
            state = state.quickAdd,
            onTextChange = viewModel::updateQuickAddText,
            onDismiss = viewModel::closeQuickAdd,
            onSubmit = viewModel::submitQuickAdd,
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

    if (pendingBulkDelete) {
        AlertDialog(
            onDismissRequest = { pendingBulkDelete = false },
            title = { Text("Delete ${state.selectedIds.size} transactions?") },
            text = { Text("This can't be undone.") },
            confirmButton = {
                TextButton(onClick = { viewModel.bulkDelete(); pendingBulkDelete = false }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { pendingBulkDelete = false }) { Text("Cancel") } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SearchBar(
    state: TransactionsUiState,
    onQueryChange: (String) -> Unit,
    onCategoryChange: (String?) -> Unit,
) {
    var categoryMenuExpanded by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space2)) {
        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = onQueryChange,
            label = { Text("Search description") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(FinTrackSpacing.space2))
        ExposedDropdownMenuBox(expanded = categoryMenuExpanded, onExpandedChange = { categoryMenuExpanded = it }) {
            OutlinedTextField(
                value = state.categories.find { it.id == state.searchCategoryId }?.name ?: "Any category",
                onValueChange = {},
                readOnly = true,
                label = { Text("Category") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryMenuExpanded) },
                modifier = Modifier.fillMaxWidth().menuAnchor(),
            )
            ExposedDropdownMenu(expanded = categoryMenuExpanded, onDismissRequest = { categoryMenuExpanded = false }) {
                DropdownMenuItem(
                    text = { Text("Any category") },
                    onClick = { onCategoryChange(null); categoryMenuExpanded = false },
                )
                state.categories.forEach { category ->
                    DropdownMenuItem(
                        text = { Text(category.name) },
                        onClick = { onCategoryChange(category.id); categoryMenuExpanded = false },
                    )
                }
            }
        }
    }
}

@Composable
private fun TransactionRow(
    tx: TransactionDto,
    selectMode: Boolean,
    isSelected: Boolean,
    onClick: () -> Unit,
    onDelete: () -> Unit,
    onToggleRegret: () -> Unit,
    onToggleSelect: () -> Unit,
) {
    val color = if (tx.type == "income") FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = FinTrackSpacing.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (selectMode) {
            Checkbox(checked = isSelected, onCheckedChange = { onToggleSelect() })
        }
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
        if (!selectMode) {
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
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuickAddSheet(
    state: QuickAddState,
    onTextChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onSubmit: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, contentWindowInsets = { WindowInsets.systemBars }) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text("Quick Add", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                "Describe a transaction in plain English, e.g. \"500 for groceries yesterday\"",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = state.text,
                onValueChange = onTextChange,
                label = { Text("What did you spend on?") },
                modifier = Modifier.fillMaxWidth(),
            )

            state.error?.let {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(FinTrackSpacing.space5))
            Button(onClick = onSubmit, enabled = !state.isLoading && state.text.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                if (state.isLoading) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Parse")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
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

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, contentWindowInsets = { WindowInsets.systemBars }) {
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
