package app.fintrack.compose.ui.auth

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegisterScreen(
    onVerifySuccess: (needsOnboarding: Boolean) -> Unit,
    onNavigateToLogin: () -> Unit,
    viewModel: RegisterViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(state.verifySuccess) {
        if (state.verifySuccess) onVerifySuccess(state.needsOnboarding)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = FinTrackSpacing.space6),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            when (state.step) {
                RegisterStep.FORM -> {
                    Text("Create account", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        "Start your financial journey",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space8))

                    OutlinedTextField(
                        value = state.fullName,
                        onValueChange = viewModel::onFullNameChange,
                        label = { Text("Full Name") },
                        leadingIcon = { Icon(Icons.Filled.Person, contentDescription = null) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    OutlinedTextField(
                        value = state.email,
                        onValueChange = viewModel::onEmailChange,
                        label = { Text("Email") },
                        leadingIcon = { Icon(Icons.Filled.Email, contentDescription = null) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    OutlinedTextField(
                        value = state.password,
                        onValueChange = viewModel::onPasswordChange,
                        label = { Text("Password (min. 6 characters)") },
                        leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null) },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (state.password.isNotEmpty()) {
                        Spacer(Modifier.height(FinTrackSpacing.space2))
                        RegisterPasswordStrength(state.password)
                    }

                    state.error?.let {
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }

                    Spacer(Modifier.height(FinTrackSpacing.space4))
                    Button(onClick = viewModel::register, enabled = !state.isLoading, modifier = Modifier.fillMaxWidth()) {
                        if (state.isLoading) {
                            CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                        } else {
                            Text("Create Account")
                        }
                    }

                    Spacer(Modifier.height(FinTrackSpacing.space6))
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Already have an account?", style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = onNavigateToLogin) { Text("Sign in") }
                    }
                }

                RegisterStep.VERIFY -> {
                    Text("Check your email", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        "We sent a 6-digit code to ${state.pendingEmail}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space8))

                    OutlinedTextField(
                        value = state.otp,
                        onValueChange = viewModel::onOtpChange,
                        label = { Text("6-digit code") },
                        leadingIcon = { Icon(Icons.Filled.VerifiedUser, contentDescription = null) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    state.error?.let {
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }

                    Spacer(Modifier.height(FinTrackSpacing.space4))
                    Button(onClick = viewModel::verify, enabled = !state.isLoading, modifier = Modifier.fillMaxWidth()) {
                        if (state.isLoading) {
                            CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                        } else {
                            Text("Verify Email")
                        }
                    }

                    Spacer(Modifier.height(FinTrackSpacing.space3))
                    if (state.cooldownSeconds > 0) {
                        Text("Resend code in ${state.cooldownSeconds}s", style = MaterialTheme.typography.bodySmall)
                    } else {
                        TextButton(onClick = viewModel::resendOtp) { Text("Resend code") }
                    }

                    Spacer(Modifier.height(FinTrackSpacing.space4))
                    TextButton(onClick = viewModel::backToForm) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, modifier = Modifier.padding(end = FinTrackSpacing.space1))
                        Text("Back to registration")
                    }
                }
            }

            Spacer(Modifier.height(FinTrackSpacing.space8))
        }
    }
}

@Composable
private fun RegisterPasswordStrength(password: String) {
    val strength = when {
        password.length < 6 -> 1
        password.length < 8 -> 2
        password.any { it.isDigit() } && password.any { !it.isLetterOrDigit() } -> 4
        else -> 3
    }
    val colors = listOf(FinTrackColors.Dark.colorExp, FinTrackColors.Dark.colorWarn, FinTrackColors.Dark.accent, FinTrackColors.Dark.colorInc)
    val labels = listOf("Too short", "Fair", "Good", "Strong")
    val color = colors[strength - 1]

    Column {
        Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
            repeat(4) { i ->
                Surface(
                    color = if (i < strength) color else MaterialTheme.colorScheme.outline,
                    modifier = Modifier.weight(1f).height(3.dp),
                ) {}
            }
        }
        Spacer(Modifier.height(FinTrackSpacing.space1))
        Text(labels[strength - 1], style = MaterialTheme.typography.labelSmall, color = color)
    }
}
