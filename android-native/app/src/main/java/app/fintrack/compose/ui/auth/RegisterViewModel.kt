package app.fintrack.compose.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.auth.AuthRepository
import app.fintrack.compose.data.notifications.NotificationsRepository
import app.fintrack.compose.data.settings.SettingsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class RegisterStep { FORM, VERIFY }

data class RegisterUiState(
    val step: RegisterStep = RegisterStep.FORM,
    val fullName: String = "",
    val email: String = "",
    val password: String = "",
    val otp: String = "",
    val pendingEmail: String = "",
    val cooldownSeconds: Int = 0,
    val isLoading: Boolean = false,
    val error: String? = null,
    val verifySuccess: Boolean = false,
    val needsOnboarding: Boolean = false,
)

@HiltViewModel
class RegisterViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val notificationsRepository: NotificationsRepository,
    private val settingsRepository: SettingsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(RegisterUiState())
    val uiState: StateFlow<RegisterUiState> = _uiState.asStateFlow()

    fun onFullNameChange(value: String) = _uiState.update { it.copy(fullName = value, error = null) }
    fun onEmailChange(value: String) = _uiState.update { it.copy(email = value, error = null) }
    fun onPasswordChange(value: String) = _uiState.update { it.copy(password = value, error = null) }
    fun onOtpChange(value: String) = _uiState.update { it.copy(otp = value.filter(Char::isDigit).take(6), error = null) }

    fun register() {
        val state = _uiState.value
        if (state.password.length < 6) {
            _uiState.update { it.copy(error = "Password must be at least 6 characters.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                authRepository.register(state.fullName, state.email, state.password)
                _uiState.update { it.copy(isLoading = false, step = RegisterStep.VERIFY, pendingEmail = state.email) }
                startCooldown()
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Registration failed.")) }
            }
        }
    }

    fun verify() {
        val state = _uiState.value
        if (state.otp.length != 6) {
            _uiState.update { it.copy(error = "Enter the 6-digit code sent to your email.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val user = authRepository.verifyEmail(state.pendingEmail, state.otp)
                val needsOnboarding = user?.id?.let { !settingsRepository.isOnboarded(it) } ?: true
                _uiState.update { it.copy(isLoading = false, verifySuccess = true, needsOnboarding = needsOnboarding) }
                notificationsRepository.registerCurrentDeviceToken()
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Verification failed.")) }
            }
        }
    }

    fun resendOtp() {
        val email = _uiState.value.pendingEmail
        viewModelScope.launch {
            try {
                authRepository.resendOtp(email, "register")
                startCooldown()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Failed to resend code.")) }
            }
        }
    }

    fun backToForm() = _uiState.update { it.copy(step = RegisterStep.FORM, error = null, otp = "") }

    private fun startCooldown(seconds: Int = 60) {
        viewModelScope.launch {
            for (s in seconds downTo 0) {
                _uiState.update { it.copy(cooldownSeconds = s) }
                delay(1000)
            }
        }
    }
}
