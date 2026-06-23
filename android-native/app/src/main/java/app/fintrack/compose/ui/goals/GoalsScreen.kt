package app.fintrack.compose.ui.goals

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.GoalDto
import app.fintrack.compose.ui.common.MilestoneBurst
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import java.time.LocalDate
import java.time.format.DateTimeParseException

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalsScreen(viewModel: GoalsViewModel = hiltViewModel()) {
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
            state.goals.isEmpty() -> Text(
                "No goals yet — set one to start saving toward something",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            else -> LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
                item {
                    LifeEventPlannerBanner(onClick = viewModel::openLifeEventForm)
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                }
                items(state.goals, key = { it.id }) { goal ->
                    GoalRow(
                        goal = goal,
                        onAddFunds = { viewModel.openAddFunds(goal.id) },
                        onEdit = { viewModel.openEditForm(goal) },
                        onDelete = { pendingDeleteId = goal.id },
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                }
            }
        }

        FloatingActionButton(
            onClick = viewModel::openCreateForm,
            modifier = Modifier.align(Alignment.BottomEnd).padding(FinTrackSpacing.space5),
        ) {
            Icon(Icons.Filled.Add, contentDescription = "Add goal")
        }

        if (state.showBurst) {
            Box(modifier = Modifier.fillMaxSize()) {
                MilestoneBurst(onDone = viewModel::dismissBurst)
            }
        }
    }

    if (state.showForm) {
        GoalFormSheet(
            title = "Add Goal",
            saveLabel = "Add Goal",
            form = state.form,
            onDismiss = viewModel::closeForm,
            onUpdate = viewModel::updateForm,
            onSave = viewModel::save,
        )
    }

    if (state.editingId != null) {
        GoalFormSheet(
            title = "Edit Goal",
            saveLabel = "Save",
            form = state.editForm,
            onDismiss = viewModel::closeEditForm,
            onUpdate = viewModel::updateEditForm,
            onSave = viewModel::saveEdit,
        )
    }

    if (state.showLifeEvent) {
        GoalsLifeEventSheet(
            form = state.lifeEventForm,
            plan = state.lifeEventPlan,
            onDismiss = viewModel::closeLifeEventForm,
            onUpdate = viewModel::updateLifeEventForm,
            onSubmit = viewModel::submitLifeEvent,
            onPlanAnother = viewModel::planAnother,
        )
    }

    state.fundsForm?.let { form ->
        AddFundsSheet(
            form = form,
            onDismiss = viewModel::closeAddFunds,
            onUpdate = viewModel::updateFundsForm,
            onSubmit = viewModel::submitFunds,
        )
    }

    pendingDeleteId?.let { id ->
        AlertDialog(
            onDismissRequest = { pendingDeleteId = null },
            title = { Text("Delete goal?") },
            text = { Text("This can't be undone.") },
            confirmButton = {
                TextButton(onClick = { viewModel.delete(id); pendingDeleteId = null }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { pendingDeleteId = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun LifeEventPlannerBanner(onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = FinTrackColors.Dark.accent.copy(alpha = 0.08f),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space4)) {
            Icon(Icons.Outlined.Bolt, contentDescription = null, tint = FinTrackColors.Dark.accent)
            Spacer(Modifier.width(FinTrackSpacing.space3))
            Column(modifier = Modifier.weight(1f)) {
                Text("AI Life Event Planner", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Get a savings plan for a wedding, home, or other big milestone",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun daysRemaining(deadline: String?): Long? {
    if (deadline.isNullOrBlank()) return null
    return try {
        java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), LocalDate.parse(deadline.take(10)))
    } catch (_: DateTimeParseException) {
        null
    }
}

@Composable
private fun GoalRow(goal: GoalDto, onAddFunds: () -> Unit, onEdit: () -> Unit, onDelete: () -> Unit) {
    val target = goal.target_amount.toDoubleOrNull()?.takeIf { it > 0 } ?: 1.0
    val saved = goal.saved_amount.toDoubleOrNull() ?: 0.0
    val progress = (saved / target).toFloat().coerceIn(0f, 1f)
    val ringColor = goal.color?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() } ?: FinTrackColors.Dark.accent
    val days = daysRemaining(goal.deadline)

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space4)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(goal.name, style = MaterialTheme.typography.titleMedium)
                Row {
                    IconButton(onClick = onAddFunds) {
                        Icon(Icons.Filled.Add, contentDescription = "Add funds", tint = ringColor)
                    }
                    IconButton(onClick = onEdit) {
                        Icon(Icons.Filled.Edit, contentDescription = "Edit", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = onDelete) {
                        Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (days != null) {
                Text(
                    when {
                        days > 0 -> "📅 $days days left"
                        days == 0L -> "📅 Due today"
                        else -> "📅 Deadline passed"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = if (days in 0..30) FinTrackColors.Dark.colorExp else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            LinearProgressIndicator(progress = { progress }, color = ringColor, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                "${formatInr(saved)} of ${formatInr(target)} · ${(progress * 100).toInt()}%",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoalFormSheet(
    title: String,
    saveLabel: String,
    form: GoalFormState,
    onDismiss: () -> Unit,
    onUpdate: ((GoalFormState) -> GoalFormState) -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = form.name,
                onValueChange = { v -> onUpdate { it.copy(name = v) } },
                label = { Text("Goal name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.targetAmount,
                onValueChange = { v -> onUpdate { it.copy(targetAmount = v) } },
                label = { Text("Target amount") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.deadline,
                onValueChange = { v -> onUpdate { it.copy(deadline = v) } },
                label = { Text("Target date (optional)") },
                placeholder = { Text("YYYY-MM-DD") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            Text("Color", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                GOAL_COLORS.forEach { hex ->
                    val swatchColor = Color(android.graphics.Color.parseColor(hex))
                    val selected = form.color == hex
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(swatchColor)
                            .border(width = 3.dp, color = if (selected) MaterialTheme.colorScheme.onSurface else Color.Transparent, shape = CircleShape)
                            .clickable { onUpdate { it.copy(color = hex) } },
                    )
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
                    Text(saveLabel)
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddFundsSheet(
    form: AddFundsFormState,
    onDismiss: () -> Unit,
    onUpdate: ((AddFundsFormState) -> AddFundsFormState) -> Unit,
    onSubmit: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text("Add or Withdraw Funds", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                "Use a negative number to withdraw.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space4))

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
            Button(onClick = onSubmit, enabled = !form.isSaving, modifier = Modifier.fillMaxWidth()) {
                if (form.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Update")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}
