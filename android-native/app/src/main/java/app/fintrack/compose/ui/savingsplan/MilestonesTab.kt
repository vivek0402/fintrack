package app.fintrack.compose.ui.savingsplan

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import app.fintrack.compose.data.api.MilestoneDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

private data class MilestoneTreeRow(val milestone: MilestoneDto, val depth: Int)

private fun flattenTree(milestones: List<MilestoneDto>, parentId: String? = null, depth: Int = 0): List<MilestoneTreeRow> {
    val children = milestones.filter { it.parent_id == parentId }.sortedWith(compareBy({ -it.priority }, { it.target_date }))
    return children.flatMap { m -> listOf(MilestoneTreeRow(m, depth)) + flattenTree(milestones, m.id, depth + 1) }
}

private fun statusMeta(status: String): Pair<String, androidx.compose.ui.graphics.Color> = when (status) {
    "in_progress" -> "In Progress" to FinTrackColors.Dark.colorInfo
    "achieved" -> "Achieved" to FinTrackColors.Dark.colorInc
    "missed" -> "Missed" to FinTrackColors.Dark.colorExp
    else -> "Not Started" to FinTrackColors.Dark.colorWarn
}

@Composable
fun MilestonesTab(viewModel: MilestonesViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error.orEmpty(),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            else -> {
                val rows = remember(state.milestones) { flattenTree(state.milestones) }
                LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
                    item {
                        Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space4)) {
                                MilestoneStat("Total", state.totalCount.toString())
                                MilestoneStat("On Track", state.onTrackCount.toString(), FinTrackColors.Dark.colorInc)
                                MilestoneStat("Achieved", state.achievedCount.toString(), FinTrackColors.Dark.accent)
                            }
                        }
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        Button(onClick = viewModel::openAddForm, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Filled.Add, contentDescription = null)
                            Spacer(Modifier.width(FinTrackSpacing.space2))
                            Text("Add Milestone")
                        }
                        Spacer(Modifier.height(FinTrackSpacing.space4))
                    }
                    if (rows.isEmpty()) {
                        item {
                            Text(
                                "No milestones yet. Break a big goal into smaller dependent steps.",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(FinTrackSpacing.space4),
                            )
                        }
                    }
                    items(rows, key = { it.milestone.id }) { row ->
                        MilestoneRow(
                            row = row,
                            expanded = row.milestone.id in state.expandedIds,
                            onToggleExpand = { viewModel.toggleExpanded(row.milestone.id) },
                            onEdit = { viewModel.openEditForm(row.milestone) },
                            onDelete = { viewModel.requestDelete(row.milestone.id) },
                            onLogProgress = { viewModel.openProgressPanel(row.milestone) },
                        )
                        Spacer(Modifier.height(FinTrackSpacing.space2))
                    }
                }
            }
        }
    }

    if (state.showForm) {
        MilestoneFormSheet(
            form = state.form,
            isEditing = state.editingId != null,
            candidateParents = state.milestones.filter { it.id != state.editingId },
            onDismiss = viewModel::closeForm,
            onUpdate = viewModel::updateForm,
            onSave = viewModel::submitForm,
        )
    }

    state.progressEditId?.let { id ->
        val milestone = state.milestones.find { it.id == id }
        if (milestone != null) {
            ProgressDialog(
                milestone = milestone,
                amount = state.progressAmount,
                status = state.progressStatus,
                onAmountChange = viewModel::updateProgressAmount,
                onStatusChange = viewModel::updateProgressStatus,
                onDismiss = viewModel::closeProgressPanel,
                onSave = viewModel::saveProgress,
            )
        }
    }

    state.deleteTargetId?.let { id ->
        val childCount = state.milestones.count { it.parent_id == id }
        AlertDialog(
            onDismissRequest = viewModel::cancelDelete,
            title = { Text("Delete milestone?") },
            text = {
                Text(
                    if (childCount > 0) "This milestone has $childCount dependent milestone(s) — they'll be unlinked, not deleted." else "This action can't be undone.",
                )
            },
            confirmButton = { TextButton(onClick = viewModel::confirmDelete) { Text("Delete", color = FinTrackColors.Dark.colorExp) } },
            dismissButton = { TextButton(onClick = viewModel::cancelDelete) { Text("Cancel") } },
        )
    }
}

@Composable
private fun MilestoneStat(label: String, value: String, color: androidx.compose.ui.graphics.Color? = null) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color ?: MaterialTheme.colorScheme.onSurface)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun MilestoneRow(
    row: MilestoneTreeRow,
    expanded: Boolean,
    onToggleExpand: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onLogProgress: () -> Unit,
) {
    val m = row.milestone
    val (statusLabel, statusColor) = statusMeta(m.status)
    val targetAmount = m.target_amount?.toDoubleOrNull()
    val currentAmount = m.current_amount.toDoubleOrNull() ?: 0.0
    val progress = if (targetAmount != null && targetAmount > 0) (currentAmount / targetAmount).toFloat().coerceIn(0f, 1f) else 0f

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth().padding(start = (row.depth * 16).dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(m.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(2.dp))
                    Text("Due ${m.target_date.take(10)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Surface(shape = RoundedCornerShape(20.dp), color = statusColor.copy(alpha = 0.14f)) {
                    Text(statusLabel, style = MaterialTheme.typography.labelSmall, color = statusColor, modifier = Modifier.padding(horizontal = FinTrackSpacing.space2, vertical = 2.dp))
                }
                IconButton(onClick = onEdit) { Icon(Icons.Filled.Edit, contentDescription = "Edit", modifier = Modifier.height(18.dp)) }
                IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, contentDescription = "Delete", modifier = Modifier.height(18.dp)) }
            }

            if (m.overdue && m.status != "achieved") {
                FeasibilityBadge("Overdue", FinTrackColors.Dark.colorExp)
            } else if (m.status == "in_progress" && m.feasibility.is_on_track == true) {
                FeasibilityBadge("On track", FinTrackColors.Dark.colorInc)
            } else if (m.status != "achieved" && m.feasibility.is_on_track == false) {
                val needed = m.feasibility.monthly_needed
                FeasibilityBadge(
                    if (needed != null) "Behind — needs ${formatInr(needed)}/mo more" else "Behind schedule",
                    FinTrackColors.Dark.colorWarn,
                )
            }

            if (targetAmount != null) {
                Spacer(Modifier.height(FinTrackSpacing.space2))
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(2.dp))
                Text("${formatInr(currentAmount)} of ${formatInr(targetAmount)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            if (!m.description.isNullOrBlank()) {
                Spacer(Modifier.height(FinTrackSpacing.space1))
                TextButton(onClick = onToggleExpand, contentPadding = PaddingValues(0.dp)) {
                    Text(if (expanded) "Hide description" else "Show description", style = MaterialTheme.typography.labelSmall)
                }
                if (expanded) {
                    Text(m.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            Spacer(Modifier.height(FinTrackSpacing.space2))
            TextButton(onClick = onLogProgress, contentPadding = PaddingValues(0.dp)) {
                Text("Log progress", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun FeasibilityBadge(text: String, color: androidx.compose.ui.graphics.Color) {
    Spacer(Modifier.height(FinTrackSpacing.space1))
    Surface(shape = RoundedCornerShape(8.dp), color = color.copy(alpha = 0.10f)) {
        Text(text, style = MaterialTheme.typography.labelSmall, color = color, modifier = Modifier.padding(horizontal = FinTrackSpacing.space2, vertical = 2.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MilestoneFormSheet(
    form: MilestoneFormState,
    isEditing: Boolean,
    candidateParents: List<MilestoneDto>,
    onDismiss: () -> Unit,
    onUpdate: ((MilestoneFormState) -> MilestoneFormState) -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    var parentMenuExpanded by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text(if (isEditing) "Edit Milestone" else "Add Milestone", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = form.name,
                onValueChange = { v -> onUpdate { it.copy(name = v) } },
                label = { Text("Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.targetDate,
                onValueChange = { v -> onUpdate { it.copy(targetDate = v) } },
                label = { Text("Target date (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.description,
                onValueChange = { v -> onUpdate { it.copy(description = v) } },
                label = { Text("Description (optional)") },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                OutlinedTextField(
                    value = form.targetAmount,
                    onValueChange = { v -> onUpdate { it.copy(targetAmount = v) } },
                    label = { Text("Target amount (optional)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.currentAmount,
                    onValueChange = { v -> onUpdate { it.copy(currentAmount = v) } },
                    label = { Text("Current amount") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            ExposedDropdownMenuBox(expanded = parentMenuExpanded, onExpandedChange = { parentMenuExpanded = it }) {
                OutlinedTextField(
                    value = candidateParents.find { it.id == form.parentId }?.name ?: "None",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Depends on") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = parentMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = parentMenuExpanded, onDismissRequest = { parentMenuExpanded = false }) {
                    DropdownMenuItem(text = { Text("None") }, onClick = { onUpdate { it.copy(parentId = null) }; parentMenuExpanded = false })
                    candidateParents.forEach { candidate ->
                        DropdownMenuItem(text = { Text(candidate.name) }, onClick = { onUpdate { it.copy(parentId = candidate.id) }; parentMenuExpanded = false })
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.priority,
                onValueChange = { v -> onUpdate { it.copy(priority = v) } },
                label = { Text("Priority") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
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
                    Text(if (isEditing) "Save Changes" else "Add Milestone")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}

@Composable
private fun ProgressDialog(
    milestone: MilestoneDto,
    amount: String,
    status: String,
    onAmountChange: (String) -> Unit,
    onStatusChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
) {
    var statusMenuExpanded by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Update Progress — ${milestone.name}") },
        text = {
            Column {
                OutlinedTextField(
                    value = amount,
                    onValueChange = onAmountChange,
                    label = { Text("Current amount") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(FinTrackSpacing.space3))
                OutlinedButton(onClick = { statusMenuExpanded = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(MILESTONE_STATUS_OPTIONS.find { it.first == status }?.second ?: status)
                }
                androidx.compose.material3.DropdownMenu(expanded = statusMenuExpanded, onDismissRequest = { statusMenuExpanded = false }) {
                    MILESTONE_STATUS_OPTIONS.forEach { (value, label) ->
                        DropdownMenuItem(text = { Text(label) }, onClick = { onStatusChange(value); statusMenuExpanded = false })
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onSave) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
