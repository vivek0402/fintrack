package app.fintrack.compose.ui.profile

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Receipt
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.settings.NotifPrefs
import app.fintrack.compose.ui.onboarding.ONBOARDING_CURRENCIES
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import java.io.OutputStreamWriter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(onLoggedOut: () -> Unit, onNavigateToTax: () -> Unit, viewModel: ProfileViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(state.loggedOut) {
        if (state.loggedOut) onLoggedOut()
    }

    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        val csv = state.exportCsv
        if (uri != null && csv != null) {
            context.contentResolver.openOutputStream(uri)?.use { stream ->
                OutputStreamWriter(stream).use { it.write(csv) }
            }
        }
        viewModel.clearExportCsv()
    }
    LaunchedEffect(state.exportCsv) {
        if (state.exportCsv != null) {
            exportLauncher.launch("fintrack-export-${java.time.LocalDate.now().year}.csv")
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error.orEmpty(),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
            state.profile != null -> ProfileContent(
                state = state,
                profile = state.profile!!,
                onEdit = viewModel::openEdit,
                onChangePassword = viewModel::openPasswordForm,
                onLogout = viewModel::logout,
                onSetTheme = viewModel::setTheme,
                onToggleNotif = viewModel::toggleNotifPref,
                onToggleCoach = viewModel::toggleCoach,
                onNavigateToTax = onNavigateToTax,
                onExport = viewModel::export,
                onClearCache = viewModel::clearCache,
            )
        }
    }

    if (state.isEditing) {
        EditProfileSheet(state = state, onDismiss = viewModel::closeEdit, onUpdate = viewModel::updateEditForm, onSave = viewModel::saveEdit)
    }
    if (state.showPasswordForm) {
        ChangePasswordSheet(
            state = state,
            onDismiss = viewModel::closePasswordForm,
            onUpdate = viewModel::updatePasswordForm,
            onSubmit = viewModel::submitPasswordChange,
        )
    }
}

@Composable
private fun ProfileContent(
    state: ProfileUiState,
    profile: app.fintrack.compose.data.api.ProfileDto,
    onEdit: () -> Unit,
    onChangePassword: () -> Unit,
    onLogout: () -> Unit,
    onSetTheme: (String) -> Unit,
    onToggleNotif: ((NotifPrefs) -> NotifPrefs) -> Unit,
    onToggleCoach: () -> Unit,
    onNavigateToTax: () -> Unit,
    onExport: () -> Unit,
    onClearCache: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(FinTrackSpacing.space4),
    ) {
        Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(FinTrackSpacing.space6)) {
                Text(profile.full_name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Text(profile.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(FinTrackSpacing.space2))
                Text(
                    "Currency: ${profile.currency ?: "INR"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(FinTrackSpacing.space3))

        Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3), modifier = Modifier.fillMaxWidth()) {
            ProfileStat("Transactions", profile.total_transactions?.toIntOrNull()?.toString() ?: "0", Modifier.weight(1f))
            ProfileStat("Budgets", profile.total_budgets?.toIntOrNull()?.toString() ?: "0", Modifier.weight(1f))
            ProfileStat("Months", state.monthsTracked.toString(), Modifier.weight(1f))
        }
        Spacer(Modifier.height(FinTrackSpacing.space5))

        Button(onClick = onEdit, modifier = Modifier.fillMaxWidth()) { Text("Edit Profile") }
        Spacer(Modifier.height(FinTrackSpacing.space2))
        OutlinedButton(onClick = onChangePassword, modifier = Modifier.fillMaxWidth()) { Text("Change Password") }
        Spacer(Modifier.height(FinTrackSpacing.space5))

        AppearanceCard(theme = state.theme, onSetTheme = onSetTheme)
        Spacer(Modifier.height(FinTrackSpacing.space3))
        DataCard(isExporting = state.isExporting, isClearingCache = state.isClearingCache, onExport = onExport, onClearCache = onClearCache)
        Spacer(Modifier.height(FinTrackSpacing.space3))
        NotificationsCard(prefs = state.notifPrefs, onToggle = onToggleNotif)
        Spacer(Modifier.height(FinTrackSpacing.space3))
        AppCard(coachEnabled = state.coachEnabled, onNavigateToTax = onNavigateToTax, onToggleCoach = onToggleCoach)
        Spacer(Modifier.height(FinTrackSpacing.space5))

        OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
            Text("Log Out", color = FinTrackColors.Dark.colorExp)
        }
    }
}

@Composable
private fun AppearanceCard(theme: String, onSetTheme: (String) -> Unit) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Palette, contentDescription = null, tint = FinTrackColors.Dark.accent)
                Spacer(Modifier.width(FinTrackSpacing.space2))
                Text("Appearance", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                listOf("light" to "☀️ Light", "dark" to "🌙 Dark").forEach { (key, label) ->
                    val selected = theme == key
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (selected) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface,
                        onClick = { onSetTheme(key) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            label,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                            modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space3),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DataCard(isExporting: Boolean, isClearingCache: Boolean, onExport: () -> Unit, onClearCache: () -> Unit) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text("Data", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            SettingsActionRow(
                icon = Icons.Filled.FileDownload,
                label = "Export Data",
                sub = "Download all transactions as CSV",
                isLoading = isExporting,
                onClick = onExport,
            )
            HorizontalDivider()
            SettingsActionRow(
                icon = Icons.Filled.DeleteSweep,
                label = "Clear AI Cache",
                sub = "Force-refresh AI analysis results",
                isLoading = isClearingCache,
                onClick = onClearCache,
            )
        }
    }
}

@Composable
private fun AppCard(coachEnabled: Boolean, onNavigateToTax: () -> Unit, onToggleCoach: () -> Unit) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text("App", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            SettingsActionRow(
                icon = Icons.Filled.Receipt,
                label = "Tax Settings",
                sub = "Indian income tax estimate",
                onClick = onNavigateToTax,
            )
            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2)) {
                Icon(Icons.Filled.Bolt, contentDescription = null, tint = FinTrackColors.Dark.accent)
                Spacer(Modifier.width(FinTrackSpacing.space3))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Proactive spending alerts", style = MaterialTheme.typography.bodyMedium)
                    Text("Budget warnings and coaching on dashboard", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = coachEnabled, onCheckedChange = { onToggleCoach() })
            }
        }
    }
}

@Composable
private fun NotificationsCard(prefs: NotifPrefs, onToggle: ((NotifPrefs) -> NotifPrefs) -> Unit) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Notifications, contentDescription = null, tint = FinTrackColors.Dark.accent)
                Spacer(Modifier.width(FinTrackSpacing.space2))
                Text("Notifications", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            NotifToggleRow("Budget alerts", "When a category exceeds 80% of budget", prefs.budgetAlerts) { v -> onToggle { it.copy(budgetAlerts = v) } }
            NotifToggleRow("Bill due reminders", "3 days before a recurring bill is due", prefs.billReminders) { v -> onToggle { it.copy(billReminders = v) } }
            NotifToggleRow("Goal milestone alerts", "At 25%, 50%, 75%, and 100% funded", prefs.goalAlerts) { v -> onToggle { it.copy(goalAlerts = v) } }
            NotifToggleRow("Weekly spending summary", "Every Sunday with your week's totals", prefs.weeklySummary) { v -> onToggle { it.copy(weeklySummary = v) } }
        }
    }
}

@Composable
private fun NotifToggleRow(label: String, sub: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    HorizontalDivider()
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2)) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(sub, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun SettingsActionRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    sub: String,
    isLoading: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2),
    ) {
        Icon(icon, contentDescription = null, tint = FinTrackColors.Dark.accent)
        Spacer(Modifier.width(FinTrackSpacing.space3))
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(sub, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (isLoading) {
            CircularProgressIndicator(modifier = Modifier.padding(FinTrackSpacing.space2))
        } else {
            IconButton(onClick = onClick) {
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun ProfileStat(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = modifier) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditProfileSheet(
    state: ProfileUiState,
    onDismiss: () -> Unit,
    onUpdate: ((EditProfileFormState) -> EditProfileFormState) -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    val form = state.editForm
    var currencyMenuExpanded by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, contentWindowInsets = { WindowInsets.systemBars }) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text("Edit Profile", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = form.fullName,
                onValueChange = { v -> onUpdate { it.copy(fullName = v) } },
                label = { Text("Full name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.email,
                onValueChange = { v -> onUpdate { it.copy(email = v) } },
                label = { Text("Email") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            ExposedDropdownMenuBox(expanded = currencyMenuExpanded, onExpandedChange = { currencyMenuExpanded = it }) {
                OutlinedTextField(
                    value = form.currency,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Currency") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = currencyMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = currencyMenuExpanded, onDismissRequest = { currencyMenuExpanded = false }) {
                    ONBOARDING_CURRENCIES.forEach { currency ->
                        DropdownMenuItem(
                            text = { Text("${currency.symbol} ${currency.code}") },
                            onClick = { onUpdate { it.copy(currency = currency.code) }; currencyMenuExpanded = false },
                        )
                    }
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
                    Text("Save")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}

@Composable
private fun PasswordStrengthIndicator(password: String) {
    val strength = if (password.length < 6) "weak" else if (password.length < 10) "good" else "strong"
    val color = when (strength) {
        "weak" -> FinTrackColors.Dark.colorExp
        "good" -> FinTrackColors.Dark.colorWarn
        else -> FinTrackColors.Dark.colorInc
    }
    val widthFraction = when (strength) {
        "weak" -> 0.25f
        "good" -> 0.6f
        else -> 1f
    }
    Column {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text("Password strength", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(strength, style = MaterialTheme.typography.labelSmall, color = color)
        }
        Spacer(Modifier.height(FinTrackSpacing.space1))
        Surface(shape = RoundedCornerShape(2.dp), color = MaterialTheme.colorScheme.outline, modifier = Modifier.fillMaxWidth().height(4.dp)) {
            Surface(color = color, modifier = Modifier.fillMaxWidth(widthFraction).height(4.dp)) {}
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChangePasswordSheet(
    state: ProfileUiState,
    onDismiss: () -> Unit,
    onUpdate: ((ChangePasswordFormState) -> ChangePasswordFormState) -> Unit,
    onSubmit: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    val form = state.passwordForm

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, contentWindowInsets = { WindowInsets.systemBars }) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text("Change Password", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            if (form.success) {
                Text("Password updated.", color = FinTrackColors.Dark.colorInc)
                Spacer(Modifier.height(FinTrackSpacing.space4))
                TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("Done") }
                Spacer(Modifier.height(FinTrackSpacing.space5))
                return@Column
            }

            OutlinedTextField(
                value = form.currentPassword,
                onValueChange = { v -> onUpdate { it.copy(currentPassword = v) } },
                label = { Text("Current password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.newPassword,
                onValueChange = { v -> onUpdate { it.copy(newPassword = v) } },
                label = { Text("New password (min. 6 characters)") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
            if (form.newPassword.isNotEmpty()) {
                Spacer(Modifier.height(FinTrackSpacing.space2))
                PasswordStrengthIndicator(form.newPassword)
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.confirmPassword,
                onValueChange = { v -> onUpdate { it.copy(confirmPassword = v) } },
                label = { Text("Confirm new password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
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
                    Text("Update Password")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}
