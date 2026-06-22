package app.fintrack.compose.ui.onetime

import androidx.compose.animation.animateContentSize
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
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
import app.fintrack.compose.data.api.OT_CATEGORIES
import app.fintrack.compose.data.api.OT_PAYMENT_METHODS
import app.fintrack.compose.data.api.OneTimeExpenseDto
import app.fintrack.compose.data.api.OneTimeExpenseItemDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@Composable
fun OneTimeExpensesScreen(viewModel: OneTimeExpensesViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    var pendingDeleteExpenseId by remember { mutableStateOf<String?>(null) }
    var pendingDeleteItem by remember { mutableStateOf<Pair<String, String>?>(null) }

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error.orEmpty(),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            state.expenses.isEmpty() -> Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6)) {
                Text("No one-time expenses yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(FinTrackSpacing.space2))
                Text(
                    "Group ad-hoc spending — a trip, a big purchase — into one tracked total.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            else -> {
                val totalSpent = state.expenses.sumOf { it.total_amount }
                val thisYear = java.time.LocalDate.now().year.toString()
                val thisYearSpent = state.expenses.filter { (it.start_date ?: it.items.firstOrNull()?.date)?.take(4) == thisYear }
                    .sumOf { it.total_amount }
                val entryCount = state.expenses.sumOf { it.item_count }

                LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                            StatTile("Total Spent", formatInr(totalSpent), Modifier.weight(1f))
                            StatTile("This Year", formatInr(thisYearSpent), Modifier.weight(1f))
                            StatTile("Entries", entryCount.toString(), Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(FinTrackSpacing.space4))
                    }
                    items(state.expenses, key = { it.id }) { expense ->
                        ExpenseCard(
                            expense = expense,
                            expanded = state.expandedId == expense.id,
                            onToggleExpand = { viewModel.toggleExpand(expense.id) },
                            onEdit = { viewModel.openEditExpenseForm(expense) },
                            onDelete = { pendingDeleteExpenseId = expense.id },
                            onAddItem = { viewModel.openAddItemForm(expense.id) },
                            onEditItem = { item -> viewModel.openEditItemForm(expense.id, item) },
                            onDeleteItem = { item -> pendingDeleteItem = expense.id to item.id },
                        )
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                    }
                }
            }
        }

        Button(
            onClick = viewModel::openCreateExpenseForm,
            modifier = Modifier.align(Alignment.BottomEnd).padding(FinTrackSpacing.space5),
        ) {
            Icon(Icons.Filled.Add, contentDescription = null)
            Spacer(Modifier.width(FinTrackSpacing.space2))
            Text("New Expense")
        }
    }

    if (state.showExpenseForm) {
        ExpenseFormSheet(state, viewModel)
    }
    if (state.showItemForm) {
        ItemFormSheet(state, viewModel)
    }

    pendingDeleteExpenseId?.let { id ->
        val expense = state.expenses.find { it.id == id }
        AlertDialog(
            onDismissRequest = { pendingDeleteExpenseId = null },
            title = { Text("Delete this expense?") },
            text = {
                Text(
                    if ((expense?.total_amount ?: 0.0) > 0 && expense?.bank_account_name != null) {
                        "This deletes all ${expense.item_count} item(s) and restores ${formatInr(expense.total_amount)} to ${expense.bank_account_name}."
                    } else {
                        "This deletes all items in this expense. This can't be undone."
                    },
                )
            },
            confirmButton = { TextButton(onClick = { viewModel.deleteExpense(id); pendingDeleteExpenseId = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { pendingDeleteExpenseId = null }) { Text("Cancel") } },
        )
    }

    pendingDeleteItem?.let { (expenseId, itemId) ->
        AlertDialog(
            onDismissRequest = { pendingDeleteItem = null },
            title = { Text("Delete this item?") },
            text = { Text("This also removes its linked transaction.") },
            confirmButton = { TextButton(onClick = { viewModel.deleteItem(expenseId, itemId); pendingDeleteItem = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { pendingDeleteItem = null }) { Text("Cancel") } },
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

@Composable
private fun ExpenseCard(
    expense: OneTimeExpenseDto,
    expanded: Boolean,
    onToggleExpand: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onAddItem: () -> Unit,
    onEditItem: (OneTimeExpenseItemDto) -> Unit,
    onDeleteItem: (OneTimeExpenseItemDto) -> Unit,
) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().animateContentSize()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable(onClick = onToggleExpand)) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(expense.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                    val dateRange = listOfNotNull(expense.start_date?.take(10), expense.end_date?.take(10)).joinToString(" – ")
                    val subtitleParts = listOfNotNull(
                        expense.category,
                        dateRange.ifBlank { null },
                        expense.bank_account_name,
                    )
                    if (subtitleParts.isNotEmpty()) {
                        Text(subtitleParts.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(formatInr(expense.total_amount), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    Text("${expense.item_count} item(s)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = onEdit) { Icon(Icons.Filled.Edit, contentDescription = "Edit", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                IconButton(onClick = onToggleExpand) {
                    Icon(if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = "Toggle items")
                }
            }
            if (expanded) {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                HorizontalDivider()
                Spacer(Modifier.height(FinTrackSpacing.space2))
                if (expense.items.isEmpty()) {
                    Text("No items logged yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    expense.items.forEach { item ->
                        ItemRow(item, onEdit = { onEditItem(item) }, onDelete = { onDeleteItem(item) })
                    }
                }
                Spacer(Modifier.height(FinTrackSpacing.space2))
                TextButton(onClick = onAddItem) { Text("+ Add item") }
            }
        }
    }
}

@Composable
private fun ItemRow(item: OneTimeExpenseItemDto, onEdit: () -> Unit, onDelete: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2)) {
        Column(modifier = Modifier.weight(1f)) {
            Text(item.description, style = MaterialTheme.typography.bodyMedium)
            Text(
                listOfNotNull(item.date.take(10), item.payment_method).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(formatInr(item.amount.toDoubleOrNull() ?: 0.0), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
        IconButton(onClick = onEdit) { Icon(Icons.Filled.Edit, contentDescription = "Edit item", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
        IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, contentDescription = "Delete item", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExpenseFormSheet(state: OneTimeExpensesUiState, viewModel: OneTimeExpensesViewModel) {
    val form = state.expenseForm
    val sheetState = rememberModalBottomSheetState()
    var categoryMenuExpanded by remember { mutableStateOf(false) }
    var accountMenuExpanded by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = viewModel::closeExpenseForm, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 640.dp).padding(FinTrackSpacing.space5)) {
            Text(if (form.editingId != null) "Edit Expense" else "New Expense", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = form.title,
                onValueChange = { v -> viewModel.updateExpenseForm { it.copy(title = v) } },
                label = { Text("Expense name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            ExposedDropdownMenuBox(expanded = categoryMenuExpanded, onExpandedChange = { categoryMenuExpanded = it }) {
                OutlinedTextField(
                    value = form.category,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Category") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = categoryMenuExpanded, onDismissRequest = { categoryMenuExpanded = false }) {
                    OT_CATEGORIES.forEach { cat ->
                        DropdownMenuItem(text = { Text(cat) }, onClick = { viewModel.updateExpenseForm { it.copy(category = cat) }; categoryMenuExpanded = false })
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                OutlinedTextField(
                    value = form.startDate,
                    onValueChange = { v -> viewModel.updateExpenseForm { it.copy(startDate = v) } },
                    label = { Text("Start date") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.endDate,
                    onValueChange = { v -> viewModel.updateExpenseForm { it.copy(endDate = v) } },
                    label = { Text("End date") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            ExposedDropdownMenuBox(expanded = accountMenuExpanded, onExpandedChange = { accountMenuExpanded = it }) {
                OutlinedTextField(
                    value = state.accounts.find { it.id == form.bankAccountId }?.name ?: "No account (cash)",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Bank account") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = accountMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = accountMenuExpanded, onDismissRequest = { accountMenuExpanded = false }) {
                    DropdownMenuItem(text = { Text("No account (cash)") }, onClick = { viewModel.updateExpenseForm { it.copy(bankAccountId = null) }; accountMenuExpanded = false })
                    state.accounts.forEach { account ->
                        DropdownMenuItem(text = { Text(account.name) }, onClick = { viewModel.updateExpenseForm { it.copy(bankAccountId = account.id) }; accountMenuExpanded = false })
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.notes,
                onValueChange = { v -> viewModel.updateExpenseForm { it.copy(notes = v) } },
                label = { Text("Notes (optional)") },
                modifier = Modifier.fillMaxWidth(),
            )

            form.error?.let {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(FinTrackSpacing.space5))
            Button(onClick = viewModel::saveExpense, enabled = !form.isSaving, modifier = Modifier.fillMaxWidth()) {
                if (form.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text(if (form.editingId != null) "Save Changes" else "Create Expense")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ItemFormSheet(state: OneTimeExpensesUiState, viewModel: OneTimeExpensesViewModel) {
    val form = state.itemForm
    val sheetState = rememberModalBottomSheetState()
    var categoryMenuExpanded by remember { mutableStateOf(false) }
    var methodMenuExpanded by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = viewModel::closeItemForm, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 640.dp).padding(FinTrackSpacing.space5)) {
            Text(if (form.editingId != null) "Edit Item" else "Add Item", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = form.description,
                onValueChange = { v -> viewModel.updateItemForm { it.copy(description = v) } },
                label = { Text("Description") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                OutlinedTextField(
                    value = form.amount,
                    onValueChange = { v -> viewModel.updateItemForm { it.copy(amount = v) } },
                    label = { Text("Amount") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.date,
                    onValueChange = { v -> viewModel.updateItemForm { it.copy(date = v) } },
                    label = { Text("Date") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                ExposedDropdownMenuBox(expanded = categoryMenuExpanded, onExpandedChange = { categoryMenuExpanded = it }, modifier = Modifier.weight(1f)) {
                    OutlinedTextField(
                        value = form.category.ifBlank { "Category" },
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Category") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryMenuExpanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor(),
                    )
                    ExposedDropdownMenu(expanded = categoryMenuExpanded, onDismissRequest = { categoryMenuExpanded = false }) {
                        state.categories.forEach { cat ->
                            DropdownMenuItem(text = { Text(cat.name) }, onClick = { viewModel.updateItemForm { it.copy(category = cat.name) }; categoryMenuExpanded = false })
                        }
                    }
                }
                ExposedDropdownMenuBox(expanded = methodMenuExpanded, onExpandedChange = { methodMenuExpanded = it }, modifier = Modifier.weight(1f)) {
                    OutlinedTextField(
                        value = form.paymentMethod,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Paid via") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = methodMenuExpanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor(),
                    )
                    ExposedDropdownMenu(expanded = methodMenuExpanded, onDismissRequest = { methodMenuExpanded = false }) {
                        OT_PAYMENT_METHODS.forEach { method ->
                            DropdownMenuItem(text = { Text(method) }, onClick = { viewModel.updateItemForm { it.copy(paymentMethod = method) }; methodMenuExpanded = false })
                        }
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.notes,
                onValueChange = { v -> viewModel.updateItemForm { it.copy(notes = v) } },
                label = { Text("Notes (optional)") },
                modifier = Modifier.fillMaxWidth(),
            )

            form.error?.let {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(FinTrackSpacing.space5))
            Button(onClick = viewModel::saveItem, enabled = !form.isSaving, modifier = Modifier.fillMaxWidth()) {
                if (form.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text(if (form.editingId != null) "Save Changes" else "Add Item")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}
