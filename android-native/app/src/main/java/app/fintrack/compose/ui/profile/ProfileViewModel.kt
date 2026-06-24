package app.fintrack.compose.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.ai.AiRepository
import app.fintrack.compose.data.api.ProfileDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.auth.AuthRepository
import app.fintrack.compose.data.profile.ProfileRepository
import app.fintrack.compose.data.settings.NotifPrefs
import app.fintrack.compose.data.settings.SettingsRepository
import app.fintrack.compose.data.transactions.TransactionsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EditProfileFormState(
    val fullName: String = "",
    val email: String = "",
    val currency: String = "INR",
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class ChangePasswordFormState(
    val currentPassword: String = "",
    val newPassword: String = "",
    val confirmPassword: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
    val success: Boolean = false,
)

data class ProfileUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val profile: ProfileDto? = null,
    val isEditing: Boolean = false,
    val editForm: EditProfileFormState = EditProfileFormState(),
    val showPasswordForm: Boolean = false,
    val passwordForm: ChangePasswordFormState = ChangePasswordFormState(),
    val loggedOut: Boolean = false,
    val theme: String = "dark",
    val notifPrefs: NotifPrefs = NotifPrefs(),
    val coachEnabled: Boolean = true,
    val isExporting: Boolean = false,
    val exportCsv: String? = null,
    val isClearingCache: Boolean = false,
    val dataActionMessage: String? = null,
) {
    val monthsTracked: Int get() {
        val createdAt = profile?.created_at?.take(10) ?: return 1
        val created = runCatching { LocalDate.parse(createdAt) }.getOrNull() ?: return 1
        val days = java.time.temporal.ChronoUnit.DAYS.between(created, LocalDate.now())
        return (days / 30).toInt().coerceAtLeast(1)
    }
}

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val profileRepository: ProfileRepository,
    private val authRepository: AuthRepository,
    private val settingsRepository: SettingsRepository,
    private val transactionsRepository: TransactionsRepository,
    private val aiRepository: AiRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val profile = profileRepository.getProfile()
                val theme = settingsRepository.themeFlow.first() ?: "dark"
                val notifPrefs = settingsRepository.notifPrefsFlow.first()
                val coachEnabled = settingsRepository.coachEnabledFlow.first()
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        profile = profile,
                        theme = theme,
                        notifPrefs = notifPrefs,
                        coachEnabled = coachEnabled,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load profile.")) }
            }
        }
    }

    fun setTheme(theme: String) {
        _uiState.update { it.copy(theme = theme) }
        viewModelScope.launch { settingsRepository.setTheme(theme) }
    }

    fun toggleNotifPref(transform: (NotifPrefs) -> NotifPrefs) {
        val updated = transform(_uiState.value.notifPrefs)
        _uiState.update { it.copy(notifPrefs = updated) }
        viewModelScope.launch { settingsRepository.setNotifPrefs(updated) }
    }

    fun toggleCoach() {
        val updated = !_uiState.value.coachEnabled
        _uiState.update { it.copy(coachEnabled = updated) }
        viewModelScope.launch { settingsRepository.setCoachEnabled(updated) }
    }

    fun export() {
        viewModelScope.launch {
            _uiState.update { it.copy(isExporting = true) }
            try {
                val transactions = transactionsRepository.getAll()
                val headers = listOf("Date", "Description", "Type", "Amount", "Category", "Notes", "Tags")
                val rows = transactions.map { tx ->
                    listOf(
                        tx.date.take(10),
                        "\"${tx.description.replace("\"", "\"\"")}\"",
                        tx.type,
                        tx.amount,
                        tx.category_name.orEmpty(),
                        "\"${tx.notes.orEmpty().replace("\"", "\"\"")}\"",
                        tx.tags.orEmpty().joinToString(";"),
                    ).joinToString(",")
                }
                val csv = (listOf(headers.joinToString(",")) + rows).joinToString("\n")
                _uiState.update { it.copy(isExporting = false, exportCsv = csv) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isExporting = false, dataActionMessage = e.toUserMessage("Export failed.")) }
            }
        }
    }

    fun clearExportCsv() = _uiState.update { it.copy(exportCsv = null) }

    fun clearCache() {
        viewModelScope.launch {
            _uiState.update { it.copy(isClearingCache = true) }
            val results = AiRepository.CLEARABLE_CACHE_KEYS.map { key ->
                runCatching { aiRepository.clearCache(key) }
            }
            val failed = results.count { it.isFailure }
            _uiState.update {
                it.copy(
                    isClearingCache = false,
                    dataActionMessage = if (failed > 0) "AI cache partially cleared ($failed failed)" else "AI cache cleared",
                )
            }
        }
    }

    fun clearDataActionMessage() = _uiState.update { it.copy(dataActionMessage = null) }

    fun openEdit() {
        val profile = _uiState.value.profile ?: return
        _uiState.update {
            it.copy(
                isEditing = true,
                editForm = EditProfileFormState(
                    fullName = profile.full_name,
                    email = profile.email,
                    currency = profile.currency ?: "INR",
                ),
            )
        }
    }

    fun closeEdit() = _uiState.update { it.copy(isEditing = false) }

    fun updateEditForm(transform: (EditProfileFormState) -> EditProfileFormState) =
        _uiState.update { it.copy(editForm = transform(it.editForm).copy(error = null)) }

    fun saveEdit() {
        val form = _uiState.value.editForm
        if (form.fullName.isBlank() || form.email.isBlank()) {
            updateEditForm { it.copy(error = "Name and email are required.") }
            return
        }
        viewModelScope.launch {
            updateEditForm { it.copy(isSaving = true, error = null) }
            try {
                profileRepository.updateProfile(form.fullName.trim(), form.email.trim(), form.currency)
                _uiState.update { it.copy(isEditing = false) }
                load()
            } catch (e: Exception) {
                updateEditForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save profile.")) }
            }
        }
    }

    fun openPasswordForm() = _uiState.update { it.copy(showPasswordForm = true, passwordForm = ChangePasswordFormState()) }
    fun closePasswordForm() = _uiState.update { it.copy(showPasswordForm = false) }

    fun updatePasswordForm(transform: (ChangePasswordFormState) -> ChangePasswordFormState) =
        _uiState.update { it.copy(passwordForm = transform(it.passwordForm).copy(error = null)) }

    fun submitPasswordChange() {
        val form = _uiState.value.passwordForm
        if (form.newPassword.length < 6) {
            updatePasswordForm { it.copy(error = "New password must be at least 6 characters.") }
            return
        }
        if (form.newPassword != form.confirmPassword) {
            updatePasswordForm { it.copy(error = "Passwords don't match.") }
            return
        }
        viewModelScope.launch {
            updatePasswordForm { it.copy(isSaving = true, error = null) }
            try {
                profileRepository.changePassword(form.currentPassword, form.newPassword)
                _uiState.update { it.copy(passwordForm = ChangePasswordFormState(success = true)) }
            } catch (e: Exception) {
                updatePasswordForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't change password.")) }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
            _uiState.update { it.copy(loggedOut = true) }
        }
    }
}
