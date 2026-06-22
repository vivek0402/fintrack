package app.fintrack.compose.ui.onboarding

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

private val STEP_LABELS = listOf("Welcome", "Currency", "Appearance", "Budgets")

@Composable
fun OnboardingScreen(onFinished: () -> Unit, viewModel: OnboardingViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(state.finished) {
        if (state.finished) onFinished()
    }

    if (state.isLoading) {
        Box(modifier = Modifier.fillMaxSize()) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
        }
        return
    }

    val stepIndex = state.step.ordinal

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = FinTrackSpacing.space5, vertical = FinTrackSpacing.space6),
    ) {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("FinTrack", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            TextButton(onClick = viewModel::skip) { Text("Skip setup") }
        }
        Spacer(Modifier.height(FinTrackSpacing.space5))

        Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
            STEP_LABELS.forEachIndexed { i, label ->
                Text(
                    label,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (i <= stepIndex) FontWeight.Bold else FontWeight.Normal,
                    color = if (i <= stepIndex) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        Spacer(Modifier.height(FinTrackSpacing.space2))
        Surface(shape = RoundedCornerShape(2.dp), color = MaterialTheme.colorScheme.outline, modifier = Modifier.fillMaxWidth().height(3.dp)) {
            Surface(
                color = FinTrackColors.Dark.accent,
                modifier = Modifier.fillMaxWidth((stepIndex + 1) / STEP_LABELS.size.toFloat()).height(3.dp),
            ) {}
        }
        Spacer(Modifier.height(FinTrackSpacing.space6))

        when (state.step) {
            OnboardingStep.WELCOME -> WelcomeStep(firstName = state.firstName, onNext = viewModel::goToCurrency)
            OnboardingStep.CURRENCY -> CurrencyStep(
                state = state,
                onSelect = viewModel::selectCurrency,
                onBack = viewModel::goToWelcome,
                onNext = viewModel::confirmCurrency,
            )
            OnboardingStep.THEME -> ThemeStep(onSelect = viewModel::selectTheme, onBack = viewModel::goToCurrency)
            OnboardingStep.BUDGETS -> BudgetsStep(
                state = state,
                onToggle = viewModel::toggleBudget,
                onAmountChange = viewModel::updateBudgetAmount,
                onBack = viewModel::goToTheme,
                onFinish = viewModel::finish,
            )
        }
    }
}

@Composable
private fun WelcomeStep(firstName: String, onNext: () -> Unit) {
    Text("Welcome, $firstName.", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(FinTrackSpacing.space2))
    Text(
        "Let's get FinTrack set up for you. Takes about a minute.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(FinTrackSpacing.space8))
    Button(onClick = onNext, modifier = Modifier.fillMaxWidth()) { Text("Get Started") }
}

@Composable
private fun CurrencyStep(state: OnboardingUiState, onSelect: (String) -> Unit, onBack: () -> Unit, onNext: () -> Unit) {
    Text("Choose your currency", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(FinTrackSpacing.space2))
    Text(
        "All amounts will be displayed in this currency.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(FinTrackSpacing.space5))

    ONBOARDING_CURRENCIES.forEach { currency ->
        val selected = state.currency == currency.code
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = if (selected) FinTrackColors.Dark.accent.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth().padding(bottom = FinTrackSpacing.space2),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelect(currency.code) }
                    .padding(FinTrackSpacing.space4),
            ) {
                Text(currency.flag, style = MaterialTheme.typography.titleMedium)
                Column(modifier = Modifier.weight(1f).padding(start = FinTrackSpacing.space3)) {
                    Text("${currency.symbol} ${currency.code}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(currency.label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (selected) Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = FinTrackColors.Dark.accent)
            }
        }
    }

    Spacer(Modifier.height(FinTrackSpacing.space3))
    Button(onClick = onNext, enabled = !state.isSaving, modifier = Modifier.fillMaxWidth()) {
        if (state.isSaving) {
            CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
        } else {
            Text("Continue")
        }
    }
    Spacer(Modifier.height(FinTrackSpacing.space2))
    TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
}

@Composable
private fun ThemeStep(onSelect: (String) -> Unit, onBack: () -> Unit) {
    Text("How should it look?", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(FinTrackSpacing.space2))
    Text(
        "Pick your preferred appearance. You can change it anytime in Settings.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(FinTrackSpacing.space5))

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth().clickable { onSelect("dark") }.padding(bottom = FinTrackSpacing.space3),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space4)) {
            Text("Dark", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(
                "AMOLED black — recommended for OLED screens",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth().clickable { onSelect("light") },
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space4)) {
            Text("Light", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(
                "Clean and bright — great for daytime use",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    Spacer(Modifier.height(FinTrackSpacing.space5))
    TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
}

@Composable
private fun BudgetsStep(
    state: OnboardingUiState,
    onToggle: (String) -> Unit,
    onAmountChange: (String, Int) -> Unit,
    onBack: () -> Unit,
    onFinish: () -> Unit,
) {
    Text("Set monthly budgets", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(FinTrackSpacing.space2))
    Text(
        "Select categories and set limits. You can change these anytime.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(FinTrackSpacing.space5))

    POPULAR_BUDGETS.forEach { budget ->
        val available = state.categories.any { it.name == budget.name }
        if (!available) return@forEach
        val selected = budget.name in state.selectedBudgetNames
        var editing by remember { mutableStateOf(false) }
        var editingValue by remember { mutableStateOf("") }

        Surface(
            shape = RoundedCornerShape(12.dp),
            color = if (selected) FinTrackColors.Dark.accent.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth().padding(bottom = FinTrackSpacing.space2),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3)) {
                Text(budget.icon, style = MaterialTheme.typography.titleMedium)
                Text(budget.name, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f).padding(start = FinTrackSpacing.space3))

                if (editing) {
                    OutlinedTextField(
                        value = editingValue,
                        onValueChange = { editingValue = it },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(0.6f),
                    )
                    TextButton(onClick = {
                        editingValue.toIntOrNull()?.takeIf { it > 0 }?.let { onAmountChange(budget.name, it) }
                        editing = false
                    }) { Text("OK") }
                } else {
                    Text(
                        formatInr((state.budgetAmounts[budget.name] ?: budget.defaultAmount).toDouble()) + "/mo",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(end = FinTrackSpacing.space2),
                    )
                    TextButton(onClick = { editingValue = (state.budgetAmounts[budget.name] ?: budget.defaultAmount).toString(); editing = true }) {
                        Text("Edit")
                    }
                    TextButton(onClick = { onToggle(budget.name) }) { Text(if (selected) "Remove" else "Add") }
                }
            }
        }
    }

    Spacer(Modifier.height(FinTrackSpacing.space3))
    Button(onClick = onFinish, enabled = !state.isSaving, modifier = Modifier.fillMaxWidth()) {
        if (state.isSaving) {
            CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
        } else {
            Text(
                if (state.selectedBudgetNames.isNotEmpty()) "Set ${state.selectedBudgetNames.size} Budget(s) & Finish" else "Skip & Go to Dashboard"
            )
        }
    }
    Spacer(Modifier.height(FinTrackSpacing.space2))
    TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
}
