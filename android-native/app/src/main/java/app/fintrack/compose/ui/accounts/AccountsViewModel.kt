package app.fintrack.compose.ui.accounts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.accounts.AccountsRepository
import app.fintrack.compose.data.api.AccountDto
import app.fintrack.compose.data.api.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AccountFormState(
    val name: String = "",
    val startingBalance: String = "",
    val accountType: String = "Savings",
    val lastFour: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class AccountsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val accounts: List<AccountDto> = emptyList(),
    val showForm: Boolean = false,
    val form: AccountFormState = AccountFormState(),
)

val ACCOUNT_TYPES = listOf("Savings", "Current", "Salary", "Credit", "Wallet", "Other")

@HiltViewModel
class AccountsViewModel @Inject constructor(
    private val accountsRepository: AccountsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AccountsUiState())
    val uiState: StateFlow<AccountsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val accounts = accountsRepository.getAll()
                _uiState.update { it.copy(isLoading = false, accounts = accounts) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load accounts.")) }
            }
        }
    }

    fun openCreateForm() = _uiState.update { it.copy(showForm = true, form = AccountFormState()) }
    fun closeForm() = _uiState.update { it.copy(showForm = false) }

    fun updateForm(transform: (AccountFormState) -> AccountFormState) =
        _uiState.update { it.copy(form = transform(it.form).copy(error = null)) }

    fun save() {
        val form = _uiState.value.form
        if (form.name.isBlank()) {
            updateForm { it.copy(error = "Enter an account name.") }
            return
        }
        val balance = form.startingBalance.toDoubleOrNull() ?: 0.0
        viewModelScope.launch {
            updateForm { it.copy(isSaving = true, error = null) }
            try {
                accountsRepository.create(
                    name = form.name.trim(),
                    icon = null,
                    color = null,
                    startingBalance = balance,
                    accountType = form.accountType,
                    lastFour = form.lastFour.trim().takeIf { it.isNotEmpty() },
                )
                _uiState.update { it.copy(showForm = false) }
                load()
            } catch (e: Exception) {
                updateForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save account.")) }
            }
        }
    }

    fun setDefault(id: Int) {
        viewModelScope.launch {
            try {
                accountsRepository.setDefault(id)
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't set default account.")) }
            }
        }
    }

    fun delete(id: Int) {
        viewModelScope.launch {
            try {
                accountsRepository.delete(id)
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't delete account.")) }
            }
        }
    }
}
