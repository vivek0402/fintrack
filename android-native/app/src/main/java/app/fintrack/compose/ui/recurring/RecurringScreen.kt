package app.fintrack.compose.ui.recurring

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
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
import app.fintrack.compose.data.api.RECURRING_FREQUENCIES
import app.fintrack.compose.data.api.RecurringDto
import app.fintrack.compose.data.api.RecurringPatternDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecurringScreen(viewModel: RecurringViewModel = hiltViewModel()) {
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
                    Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(onClick = viewModel::processRecurring, enabled = !state.isProcessing) {
                            Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(FinTrackSpacing.space1))
                            Text(if (state.isProcessing) "Processing…" else "Process Due")
                        }
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                }
                if (state.visiblePatterns.isNotEmpty()) {
                    item {
                        Text("AI found ${state.visiblePatterns.size} potential recurring transaction${if (state.visiblePatterns.size != 1) "s" else ""}", style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(FinTrackSpacing.space2))
                    }
                    items(state.visiblePatterns, key = { it.first }) { (index, pattern) ->
                        PatternSuggestionCard(
                            pattern = pattern,
                            isAdding = state.addingPatternIndex == index,
                            onAdd = { viewModel.addPattern(index, pattern) },
                            onDismiss = { viewModel.dismissPattern(index) },
                        )
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                    }
                    item { Spacer(Modifier.height(FinTrackSpacing.space2)) }
                }
                if (state.recurring.isEmpty()) {
                    item {
                        Text(
                            "No recurring transactions yet — add a bill or subscription",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    items(state.recurring, key = { it.id }) { item ->
                        RecurringRow(
                            item = item,
                            onToggle = { viewModel.toggle(item.id) },
                            onEdit = { viewModel.openEditForm(item) },
                            onDelete = { pendingDeleteId = item.id },
                        )
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = viewModel::openCreateForm,
            modifier = Modifier.align(Alignment.BottomEnd).padding(FinTrackSpacing.space5),
        ) {
            Icon(Icons.Filled.Add, contentDescription = "Add recurring transaction")
        }
    }

    if (state.showForm) {
        RecurringFormSheet(
            title = "Add Recurring Transaction",
            saveLabel = "Add",
            form = state.form,
            categories = state.categories,
            onDismiss = viewModel::closeForm,
            onUpdate = viewModel::updateForm,
            onSave = viewModel::save,
        )
    }

    if (state.editingId != null) {
        RecurringFormSheet(
            title = "Edit Recurring Transaction",
            saveLabel = "Save",
            form = state.editForm,
            categories = state.categories,
            onDismiss = viewModel::closeEditForm,
            onUpdate = viewModel::updateEditForm,
            onSave = viewModel::saveEdit,
        )
    }

    pendingDeleteId?.let { id ->
        AlertDialog(
            onDismissRequest = { pendingDeleteId = null },
            title = { Text("Delete recurring transaction?") },
            text = { Text("This can't be undone.") },
            confirmButton = {
                TextButton(onClick = { viewModel.delete(id); pendingDeleteId = null }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { pendingDeleteId = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun RecurringRow(item: RecurringDto, onToggle: () -> Unit, onEdit: () -> Unit, onDelete: () -> Unit) {
    val amountColor = if (item.type == "income") FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface) {
        Row(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space4), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(item.description, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Text(
                    "${item.frequency.replaceFirstChar { it.uppercase() }} · next ${item.next_due_date}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Text(
                    "${if (item.type == "income") "+" else "−"}${formatInr(item.amount)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = amountColor,
                )
            }
            Switch(checked = item.is_active, onCheckedChange = { onToggle() })
            IconButton(onClick = onEdit) {
                Icon(Icons.Filled.Edit, contentDescription = "Edit", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun PatternSuggestionCard(pattern: RecurringPatternDto, isAdding: Boolean, onAdd: () -> Unit, onDismiss: () -> Unit) {
    Surface(shape = RoundedCornerShape(16.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.08f)) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space4)) {
            Text(pattern.description ?: pattern.merchant ?: "Recurring transaction", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(
                "${formatInr(pattern.amount)} · ${pattern.frequency.replaceFirstChar { it.uppercase() }}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                Button(onClick = onAdd, enabled = !isAdding) { Text(if (isAdding) "Adding…" else "Add as Recurring") }
                TextButton(onClick = onDismiss, enabled = !isAdding) { Text("Dismiss") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RecurringFormSheet(
    title: String,
    saveLabel: String,
    form: RecurringFormState,
    categories: List<app.fintrack.compose.data.api.CategoryDto>,
    onDismiss: () -> Unit,
    onUpdate: ((RecurringFormState) -> RecurringFormState) -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    var categoryMenuExpanded by remember { mutableStateOf(false) }
    var frequencyMenuExpanded by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, contentWindowInsets = { WindowInsets.systemBars }) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                listOf("expense", "income").forEach { type ->
                    val selected = form.type == type
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = if (selected) FinTrackColors.Dark.accent.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.fillMaxWidth().weight(1f).padding(end = if (type == "expense") FinTrackSpacing.space2 else 0.dp),
                    ) {
                        Text(
                            type.replaceFirstChar { it.uppercase() },
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            color = if (selected) FinTrackColors.Dark.accent else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2),
                        )
                    }
                }
            }
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
                value = form.amount,
                onValueChange = { v -> onUpdate { it.copy(amount = v) } },
                label = { Text("Amount") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            ExposedDropdownMenuBox(expanded = categoryMenuExpanded, onExpandedChange = { categoryMenuExpanded = it }) {
                OutlinedTextField(
                    value = categories.find { it.id == form.categoryId }?.name ?: "Choose category (optional)",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Category") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = categoryMenuExpanded, onDismissRequest = { categoryMenuExpanded = false }) {
                    categories.forEach { category ->
                        DropdownMenuItem(
                            text = { Text(category.name) },
                            onClick = { onUpdate { it.copy(categoryId = category.id) }; categoryMenuExpanded = false },
                        )
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            ExposedDropdownMenuBox(expanded = frequencyMenuExpanded, onExpandedChange = { frequencyMenuExpanded = it }) {
                OutlinedTextField(
                    value = form.frequency.replaceFirstChar { it.uppercase() },
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Frequency") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = frequencyMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = frequencyMenuExpanded, onDismissRequest = { frequencyMenuExpanded = false }) {
                    RECURRING_FREQUENCIES.forEach { freq ->
                        DropdownMenuItem(
                            text = { Text(freq.replaceFirstChar { it.uppercase() }) },
                            onClick = { onUpdate { it.copy(frequency = freq) }; frequencyMenuExpanded = false },
                        )
                    }
                }
            }

            if (form.frequency == "monthly") {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                OutlinedTextField(
                    value = form.dayOfMonth,
                    onValueChange = { v -> onUpdate { it.copy(dayOfMonth = v) } },
                    label = { Text("Day of month") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
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
                    Text(saveLabel)
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}
