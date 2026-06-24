package app.fintrack.compose.ui.splits

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import app.fintrack.compose.data.api.ExpenseSplitDto
import app.fintrack.compose.data.api.ExpenseSplitParticipantDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@Composable
fun SplitsScreen(viewModel: SplitsViewModel = hiltViewModel()) {
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
            state.splits.isEmpty() -> Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6)) {
                Text("No splits yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(FinTrackSpacing.space2))
                Text(
                    "Log a shared expense to split it with friends or family.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            else -> LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
                items(state.splits, key = { it.id }) { split ->
                    SplitCard(
                        split = split,
                        onEdit = { viewModel.openEditForm(split) },
                        onDelete = { pendingDeleteId = split.id },
                        onToggleSettle = { index -> viewModel.settle(split.id, index) },
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                }
            }
        }

        FloatingActionButton(
            onClick = viewModel::openCreateForm,
            modifier = Modifier.align(Alignment.BottomEnd).padding(FinTrackSpacing.space5),
        ) {
            Icon(Icons.Filled.Add, contentDescription = "Add split")
        }
    }

    if (state.showForm) {
        SplitFormSheet(state.form, viewModel)
    }

    pendingDeleteId?.let { id ->
        AlertDialog(
            onDismissRequest = { pendingDeleteId = null },
            title = { Text("Delete split?") },
            text = { Text("This also removes the linked transaction for your share. This can't be undone.") },
            confirmButton = { TextButton(onClick = { viewModel.delete(id); pendingDeleteId = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { pendingDeleteId = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SplitCard(split: ExpenseSplitDto, onEdit: () -> Unit, onDelete: () -> Unit, onToggleSettle: (Int) -> Unit) {
    val allSettled = split.participants.all { it.settled }
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(split.description, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.height(FinTrackSpacing.space1))
                    Text(
                        if (allSettled) "Settled" else "Pending",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (allSettled) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorWarn,
                    )
                }
                IconButton(onClick = onEdit) { Icon(Icons.Filled.Edit, contentDescription = "Edit", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space4)) {
                Column {
                    Text("TOTAL", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(formatInr(split.total_amount.toDoubleOrNull() ?: 0.0), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                }
                Column {
                    Text("YOUR SHARE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(formatInr(split.your_share.toDoubleOrNull() ?: 0.0), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                }
                Column {
                    Text("DATE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(split.date.take(10), style = MaterialTheme.typography.bodyMedium)
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))
            split.participants.forEachIndexed { index, participant ->
                ParticipantRow(participant, onToggle = { onToggleSettle(index) })
            }
        }
    }
}

@Composable
private fun ParticipantRow(participant: ExpenseSplitParticipantDto, onToggle: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
        Surface(shape = CircleShape, color = FinTrackColors.Dark.accent.copy(alpha = 0.15f), modifier = Modifier.size(28.dp)) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                Text(
                    participant.name.firstOrNull()?.uppercase() ?: "?",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = FinTrackColors.Dark.accent,
                )
            }
        }
        Spacer(Modifier.width(FinTrackSpacing.space2))
        Text(participant.name, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Text(formatInr(participant.share), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.width(FinTrackSpacing.space2))
        TextButton(onClick = onToggle) { Text(if (participant.settled) "Settled" else "Settle") }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SplitFormSheet(form: SplitFormState, viewModel: SplitsViewModel) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = viewModel::closeForm, sheetState = sheetState, contentWindowInsets = { WindowInsets.systemBars }) {
        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 640.dp).padding(FinTrackSpacing.space5)) {
            Text(if (form.editingId != null) "Edit Split" else "New Split", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = form.nlText,
                    onValueChange = viewModel::updateNlText,
                    label = { Text("Describe it, e.g. \"Dinner 1200 split with Raj and Priya\"") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(FinTrackSpacing.space2))
                IconButton(onClick = viewModel::parseFromText, enabled = !form.isParsing) {
                    if (form.isParsing) CircularProgressIndicator(modifier = Modifier.size(20.dp)) else Icon(Icons.Filled.AutoAwesome, contentDescription = "Parse with AI")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = form.description,
                onValueChange = { v -> viewModel.updateForm { it.copy(description = v) } },
                label = { Text("Description") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                OutlinedTextField(
                    value = form.totalAmount,
                    onValueChange = { v -> viewModel.updateForm { it.copy(totalAmount = v) } },
                    label = { Text("Total amount") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.date,
                    onValueChange = { v -> viewModel.updateForm { it.copy(date = v) } },
                    label = { Text("Date (YYYY-MM-DD)") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))

            Text("Participants (excl. you)", style = MaterialTheme.typography.labelMedium)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            form.participantNames.forEachIndexed { index, name ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(bottom = FinTrackSpacing.space2)) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { v -> viewModel.updateParticipantField(index, v) },
                        label = { Text("Name") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = { viewModel.removeParticipantField(index) }) {
                        Icon(Icons.Filled.Close, contentDescription = "Remove participant")
                    }
                }
            }
            TextButton(onClick = viewModel::addParticipantField) { Text("+ Add person") }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            val total = form.totalAmount.toDoubleOrNull()
            val peopleCount = form.participantNames.count { it.isNotBlank() } + 1
            if (total != null && total > 0) {
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        "Split $peopleCount ways → ${formatInr(total / peopleCount)} each",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(FinTrackSpacing.space3),
                    )
                }
                Spacer(Modifier.height(FinTrackSpacing.space3))
            }

            form.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(FinTrackSpacing.space3))
            }

            Button(onClick = viewModel::save, enabled = !form.isSaving, modifier = Modifier.fillMaxWidth()) {
                if (form.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text(if (form.editingId != null) "Save Changes" else "Create Split")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}
