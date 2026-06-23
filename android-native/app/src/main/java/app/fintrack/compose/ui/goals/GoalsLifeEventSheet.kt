package app.fintrack.compose.ui.goals

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.LifeEventMilestoneDto
import app.fintrack.compose.data.api.LifeEventPlanDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalsLifeEventSheet(
    form: LifeEventFormState,
    plan: LifeEventPlanDto?,
    onDismiss: () -> Unit,
    onUpdate: ((LifeEventFormState) -> LifeEventFormState) -> Unit,
    onSubmit: () -> Unit,
    onPlanAnother: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        if (plan == null) {
            LifeEventForm(form = form, onUpdate = onUpdate, onSubmit = onSubmit)
        } else {
            LifeEventPlanResult(plan = plan, onPlanAnother = onPlanAnother, onClose = onDismiss)
        }
    }
}

@Composable
private fun LifeEventForm(
    form: LifeEventFormState,
    onUpdate: ((LifeEventFormState) -> LifeEventFormState) -> Unit,
    onSubmit: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
        Text("Plan a Life Event", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(FinTrackSpacing.space4))

        Text("Life Event Type", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(FinTrackSpacing.space2))
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2),
            verticalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2),
            modifier = Modifier.fillMaxWidth().height(160.dp),
        ) {
            items(LIFE_EVENT_TYPES) { (type, label) ->
                val selected = form.eventType == type
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (selected) FinTrackColors.Dark.accent.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceVariant,
                    modifier = Modifier.fillMaxWidth().clickable { onUpdate { it.copy(eventType = type) } },
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2),
                    ) {
                        Text(
                            label,
                            style = MaterialTheme.typography.labelSmall,
                            color = if (selected) FinTrackColors.Dark.accent else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

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
            value = form.targetDate,
            onValueChange = { v -> onUpdate { it.copy(targetDate = v) } },
            label = { Text("Target date") },
            placeholder = { Text("YYYY-MM-DD") },
            singleLine = true,
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
                Text("✨ Generate Plan")
            }
        }
        Spacer(Modifier.height(FinTrackSpacing.space5))
    }
}

@Composable
private fun LifeEventPlanResult(plan: LifeEventPlanDto, onPlanAnother: () -> Unit, onClose: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
        Text("Your Plan", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(FinTrackSpacing.space4))

        Surface(
            shape = RoundedCornerShape(12.dp),
            color = (if (plan.is_achievable) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp).copy(alpha = 0.08f),
        ) {
            Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
                plan.summary?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                }
                Text(
                    "${formatInr(plan.monthly_required)}/month needed",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = FinTrackColors.Dark.colorInc,
                )
                plan.difficulty?.let {
                    Text(it.replaceFirstChar { c -> c.uppercase() }, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        if (plan.milestones.isNotEmpty()) {
            Spacer(Modifier.height(FinTrackSpacing.space4))
            Text("Key Milestones", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            LazyColumn(modifier = Modifier.height(180.dp)) {
                items(plan.milestones) { milestone -> MilestoneRow(milestone) }
            }
        }

        if (plan.tips.isNotEmpty()) {
            Spacer(Modifier.height(FinTrackSpacing.space4))
            Text("Tips", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            plan.tips.forEach { tip ->
                Text("💡 $tip", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(FinTrackSpacing.space1))
            }
        }

        Spacer(Modifier.height(FinTrackSpacing.space5))
        Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
            TextButton(onClick = onPlanAnother) { Text("Plan Another") }
            Button(onClick = onClose) { Text("Done") }
        }
        Spacer(Modifier.height(FinTrackSpacing.space3))
    }
}

@Composable
private fun MilestoneRow(milestone: LifeEventMilestoneDto) {
    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Month ${milestone.month}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(milestone.label, style = MaterialTheme.typography.bodySmall)
        }
        Text(
            formatInr(milestone.target_saved),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = FinTrackColors.Dark.colorInc,
        )
    }
}
