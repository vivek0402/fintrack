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
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import app.fintrack.compose.data.api.GoalDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import kotlin.math.min

@Composable
fun SavingsToolsTab(viewModel: SavingsToolsViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error.orEmpty(),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            else -> LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
                item { StreakCard(state.streak); Spacer(Modifier.height(FinTrackSpacing.space4)) }
                item { PayYourselfFirstSection(state, viewModel::setAutoSaveAmount); Spacer(Modifier.height(FinTrackSpacing.space4)) }
                item { RoundUpSection(state, viewModel::toggleRoundUp, viewModel::selectRoundUpGoal); Spacer(Modifier.height(FinTrackSpacing.space4)) }
                item { Text("30-Day Challenges", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold); Spacer(Modifier.height(FinTrackSpacing.space3)) }
                items(CHALLENGES) { challenge ->
                    ChallengeCard(
                        challenge = challenge,
                        estimate = state.challengeEstimates.getOrElse(CHALLENGES.indexOf(challenge)) { 0.0 },
                        progress = state.challengeProgress(challenge),
                        onStart = { viewModel.startChallenge(challenge.id) },
                        onStop = { viewModel.stopChallenge(challenge.id) },
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                }
            }
        }
    }
}

@Composable
private fun StreakCard(streak: Int) {
    Surface(shape = RoundedCornerShape(16.dp), color = FinTrackColors.Dark.colorWarn.copy(alpha = 0.10f), modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text("🔥", style = MaterialTheme.typography.displaySmall)
            Spacer(Modifier.width(FinTrackSpacing.space3))
            Column {
                Text(
                    if (streak > 0) "$streak month${if (streak == 1) "" else "s"} surplus streak" else "No streak yet",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    if (streak > 0) "Income has beaten expenses every month for $streak month${if (streak == 1) "" else "s"} running." else "Spend less than you earn this month to start a streak.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun PayYourselfFirstSection(state: SavingsToolsUiState, onAmountChange: (String, Double) -> Unit) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text("Pay Yourself First", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text("Set a monthly auto-save amount per goal", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space3))

            if (state.activeGoals.isEmpty()) {
                Text("No active goals yet. Create a goal to start a savings plan.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                state.activeGoals.forEach { goal -> GoalSavePlanRow(goal, state, onAmountChange) }
                Spacer(Modifier.height(FinTrackSpacing.space2))
                HorizontalDivider()
                Spacer(Modifier.height(FinTrackSpacing.space2))
                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Text("Total auto-save", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                    Text(
                        "${formatInr(state.totalAutoSave)}/mo (${"%.1f".format(state.autoSavePctOfIncome)}% of income)",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Bold,
                        color = FinTrackColors.Dark.accent,
                    )
                }
            }
        }
    }
}

@Composable
private fun GoalSavePlanRow(goal: GoalDto, state: SavingsToolsUiState, onAmountChange: (String, Double) -> Unit) {
    var amountText by remember(goal.id, state.savePlan[goal.id]) { mutableStateOf(state.savePlan[goal.id]?.takeIf { it > 0 }?.toString() ?: "") }
    val target = goal.target_amount.toDoubleOrNull() ?: 0.0
    val saved = goal.saved_amount.toDoubleOrNull() ?: 0.0
    val remaining = (target - saved).coerceAtLeast(0.0)
    val monthly = state.savePlan[goal.id] ?: 0.0
    val onTrack = state.isGoalOnTrack(goal)
    val projected = state.projectedDate(remaining, monthly)

    Column(modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(goal.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    if (onTrack != null) {
                        Spacer(Modifier.width(FinTrackSpacing.space2))
                        Text(if (onTrack) "✓ On track" else "⚠ Behind", style = MaterialTheme.typography.labelSmall, color = if (onTrack) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorWarn)
                    }
                }
                Text("${formatInr(saved)} of ${formatInr(target)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (projected != null) {
                    Text("Projected completion: $projected", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            OutlinedTextField(
                value = amountText,
                onValueChange = { v ->
                    amountText = v
                    onAmountChange(goal.id, v.toDoubleOrNull() ?: 0.0)
                },
                label = { Text("₹/mo") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.width(120.dp),
            )
        }
        if (target > 0) {
            Spacer(Modifier.height(FinTrackSpacing.space1))
            LinearProgressIndicator(progress = { (saved / target).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RoundUpSection(state: SavingsToolsUiState, onToggle: () -> Unit, onSelectGoal: (String) -> Unit) {
    var menuExpanded by remember { mutableStateOf(false) }

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Round-Up Savings Simulator", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("Round every expense up to the nearest ₹10", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = state.roundUpEnabled, onCheckedChange = { onToggle() })
            }
            if (state.roundUpEnabled) {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                    RoundUpStat("Per month", formatInr(state.roundUpMonthly), Modifier.weight(1f))
                    RoundUpStat("Per year", formatInr(state.roundUpAnnual), Modifier.weight(1f))
                }
                if (state.activeGoals.isNotEmpty()) {
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    ExposedDropdownMenuBox(expanded = menuExpanded, onExpandedChange = { menuExpanded = it }) {
                        OutlinedTextField(
                            value = state.activeGoals.find { it.id == state.roundUpGoalId }?.name ?: "Choose a goal",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Send round-ups to") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = menuExpanded) },
                            modifier = Modifier.fillMaxWidth().menuAnchor(),
                        )
                        ExposedDropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            state.activeGoals.forEach { goal ->
                                DropdownMenuItem(text = { Text(goal.name) }, onClick = { onSelectGoal(goal.id); menuExpanded = false })
                            }
                        }
                    }
                    if (state.roundUpGoalId != null) {
                        Spacer(Modifier.height(FinTrackSpacing.space2))
                        Text(
                            "This is a simulation — round-ups aren't automatically deposited yet.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RoundUpStat(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(12.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.10f), modifier = modifier) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space3)) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = FinTrackColors.Dark.accent)
        }
    }
}

@Composable
private fun ChallengeCard(
    challenge: Challenge,
    estimate: Double,
    progress: ChallengeProgress,
    onStart: () -> Unit,
    onStop: () -> Unit,
) {
    val isDone = progress.active && progress.daysCompleted >= challenge.days
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(challenge.emoji, style = MaterialTheme.typography.headlineSmall)
                Spacer(Modifier.width(FinTrackSpacing.space3))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(challenge.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                        if (isDone) {
                            Spacer(Modifier.width(FinTrackSpacing.space2))
                            Surface(shape = RoundedCornerShape(20.dp), color = FinTrackColors.Dark.colorInc.copy(alpha = 0.14f)) {
                                Text("Done!", style = MaterialTheme.typography.labelSmall, color = FinTrackColors.Dark.colorInc, modifier = Modifier.padding(horizontal = FinTrackSpacing.space2, vertical = 2.dp))
                            }
                        }
                    }
                    Text(challenge.desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                "Est. savings: ~${formatInr(estimate)}/week based on your recent spending",
                style = MaterialTheme.typography.labelSmall,
                color = FinTrackColors.Dark.colorInc,
            )
            Spacer(Modifier.height(FinTrackSpacing.space2))
            if (progress.active) {
                LinearProgressIndicator(progress = { (progress.pct / 100f).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Text("Day ${min(progress.daysCompleted, challenge.days)} of ${challenge.days}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = onStop) { Text("Stop") }
                }
            } else {
                Button(onClick = onStart, modifier = Modifier.fillMaxWidth()) { Text("Start Challenge") }
            }
        }
    }
}
