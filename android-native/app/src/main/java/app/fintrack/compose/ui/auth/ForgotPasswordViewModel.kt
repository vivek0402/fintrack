package app.fintrack.compose.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ForgotPasswordStep { EMAIL, RESET, DONE }

data class ForgotPasswordUiState(
    val step: ForgotPasswordStep = ForgotPasswordStep.EMAIL,
    val email: String = "",
    val pendingEmail: String = "",
    val otp: String = "",
    val newPassword: String = "",
    val cooldownSeconds: Int = 0,
    val isLoading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ForgotPasswordViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ForgotPasswordUiState())
    val uiState: StateFlow<ForgotPasswordUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) = _uiState.update { it.copy(email = value, error = null) }
    fun onOtpChange(value: String) = _uiState.update { it.copy(otp = value.filter(Char::isDigit).take(6), error = null) }
    fun onNewPasswordChange(value: String) = _uiState.update { it.copy(newPassword = value, error = null) }

    fun requestOtp() {
        val email = _uiState.value.email
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                authRepository.forgotPassword(email)
                _uiState.update { it.copy(isLoading = false, step = ForgotPasswordStep.RESET, pendingEmail = email) }
                startCooldown()
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Something went wrong.")) }
            }
        }
    }

    fun resetPassword() {
        val state = _uiState.value
        if (state.otp.length != 6) {
            _uiState.update { it.copy(error = "Enter the 6-digit code sent to your email.") }
            return
        }
        if (state.newPassword.length < 6) {
            _uiState.update { it.copy(error = "Password must be at least 6 characters.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                authRepository.resetPassword(state.pendingEmail, state.otp, state.newPassword)
                _uiState.update { it.copy(isLoading = false, step = ForgotPasswordStep.DONE) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Reset failed.")) }
            }
        }
    }

    fun resendOtp() {
        val email = _uiState.value.pendingEmail
        viewModelScope.launch {
            try {
                authRepository.resendOtp(email, "reset_password")
                startCooldown()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Failed to resend code.")) }
            }
        }
    }

    fun backToEmail() = _uiState.update { it.copy(step = ForgotPasswordStep.EMAIL, error = null, otp = "", newPassword = "") }

    private fun startCooldown(seconds: Int = 60) {
        viewModelScope.launch {
            for (s in seconds downTo 0) {
                _uiState.update { it.copy(cooldownSeconds = s) }
                delay(1000)
            }
        }
    }
}
