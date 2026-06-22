package app.fintrack.compose.ui.goals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.GoalDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.goals.GoalsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class GoalFormState(
    val name: String = "",
    val targetAmount: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class AddFundsFormState(
    val goalId: String? = null,
    val amount: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class GoalsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val goals: List<GoalDto> = emptyList(),
    val showForm: Boolean = false,
    val form: GoalFormState = GoalFormState(),
    val fundsForm: AddFundsFormState? = null,
)

@HiltViewModel
class GoalsViewModel @Inject constructor(
    private val goalsRepository: GoalsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(GoalsUiState())
    val uiState: StateFlow<GoalsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val goals = goalsRepository.getAll()
                _uiState.update { it.copy(isLoading = false, goals = goals) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load goals.")) }
            }
        }
    }

    fun openCreateForm() = _uiState.update { it.copy(showForm = true, form = GoalFormState()) }
    fun closeForm() = _uiState.update { it.copy(showForm = false) }

    fun updateForm(transform: (GoalFormState) -> GoalFormState) =
        _uiState.update { it.copy(form = transform(it.form).copy(error = null)) }

    fun save() {
        val form = _uiState.value.form
        val target = form.targetAmount.toDoubleOrNull()
        if (form.name.isBlank()) {
            updateForm { it.copy(error = "Enter a goal name.") }
            return
        }
        if (target == null || target <= 0) {
            updateForm { it.copy(error = "Enter a valid target amount.") }
            return
        }
        viewModelScope.launch {
            updateForm { it.copy(isSaving = true, error = null) }
            try {
                goalsRepository.create(form.name.trim(), target, deadline = null, color = null)
                _uiState.update { it.copy(showForm = false) }
                load()
            } catch (e: Exception) {
                updateForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save goal.")) }
            }
        }
    }

    fun openAddFunds(goalId: String) = _uiState.update { it.copy(fundsForm = AddFundsFormState(goalId = goalId)) }
    fun closeAddFunds() = _uiState.update { it.copy(fundsForm = null) }

    fun updateFundsForm(transform: (AddFundsFormState) -> AddFundsFormState) =
        _uiState.update { state -> state.fundsForm?.let { state.copy(fundsForm = transform(it).copy(error = null)) } ?: state }

    fun submitFunds() {
        val form = _uiState.value.fundsForm ?: return
        val goalId = form.goalId ?: return
        val amount = form.amount.toDoubleOrNull()
        if (amount == null || amount == 0.0) {
            updateFundsForm { it.copy(error = "Enter a non-zero amount.") }
            return
        }
        viewModelScope.launch {
            updateFundsForm { it.copy(isSaving = true, error = null) }
            try {
                goalsRepository.addFunds(goalId, amount)
                _uiState.update { it.copy(fundsForm = null) }
                load()
            } catch (e: Exception) {
                updateFundsForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't update funds.")) }
            }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try {
                goalsRepository.delete(id)
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't delete goal.")) }
            }
        }
    }
}
