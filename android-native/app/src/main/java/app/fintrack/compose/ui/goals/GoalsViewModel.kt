package app.fintrack.compose.ui.goals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.ai.AiRepository
import app.fintrack.compose.data.api.GoalDto
import app.fintrack.compose.data.api.LifeEventPlanDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.goals.GoalsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

val GOAL_COLORS = listOf("#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2")

val LIFE_EVENT_TYPES = listOf(
    "wedding" to "Wedding",
    "bike" to "Bike",
    "vacation" to "Vacation",
    "home" to "Home",
    "baby" to "Baby",
    "education" to "Education",
    "car" to "Car",
    "business" to "Business",
    "emergency" to "Emergency",
)

data class LifeEventFormState(
    val eventType: String = "",
    val targetAmount: String = "",
    val targetDate: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class GoalFormState(
    val name: String = "",
    val targetAmount: String = "",
    val deadline: String = "",
    val color: String = GOAL_COLORS.first(),
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
    val editingId: String? = null,
    val editForm: GoalFormState = GoalFormState(),
    val showLifeEvent: Boolean = false,
    val lifeEventForm: LifeEventFormState = LifeEventFormState(),
    val lifeEventPlan: LifeEventPlanDto? = null,
    val showBurst: Boolean = false,
)

@HiltViewModel
class GoalsViewModel @Inject constructor(
    private val goalsRepository: GoalsRepository,
    private val aiRepository: AiRepository,
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
                goalsRepository.create(form.name.trim(), target, deadline = form.deadline.trim().ifBlank { null }, color = form.color)
                _uiState.update { it.copy(showForm = false) }
                load()
            } catch (e: Exception) {
                updateForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save goal.")) }
            }
        }
    }

    fun openEditForm(goal: GoalDto) {
        _uiState.update {
            it.copy(
                editingId = goal.id,
                editForm = GoalFormState(
                    name = goal.name,
                    targetAmount = goal.target_amount,
                    deadline = goal.deadline?.take(10) ?: "",
                    color = goal.color ?: GOAL_COLORS.first(),
                ),
            )
        }
    }

    fun closeEditForm() = _uiState.update { it.copy(editingId = null) }

    fun updateEditForm(transform: (GoalFormState) -> GoalFormState) =
        _uiState.update { it.copy(editForm = transform(it.editForm).copy(error = null)) }

    fun saveEdit() {
        val id = _uiState.value.editingId ?: return
        val form = _uiState.value.editForm
        val target = form.targetAmount.toDoubleOrNull()
        if (form.name.isBlank()) {
            updateEditForm { it.copy(error = "Enter a goal name.") }
            return
        }
        if (target == null || target <= 0) {
            updateEditForm { it.copy(error = "Enter a valid target amount.") }
            return
        }
        viewModelScope.launch {
            updateEditForm { it.copy(isSaving = true, error = null) }
            try {
                goalsRepository.update(id, form.name.trim(), target, deadline = form.deadline.trim().ifBlank { null }, color = form.color)
                _uiState.update { it.copy(editingId = null) }
                load()
            } catch (e: Exception) {
                updateEditForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't update goal.")) }
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
        val goal = _uiState.value.goals.find { it.id == goalId }
        val wasComplete = goal?.let { (it.saved_amount.toDoubleOrNull() ?: 0.0) >= (it.target_amount.toDoubleOrNull() ?: 0.0) } ?: false
        val nowComplete = goal?.let { (it.saved_amount.toDoubleOrNull() ?: 0.0) + amount >= (it.target_amount.toDoubleOrNull() ?: 0.0) } ?: false
        viewModelScope.launch {
            updateFundsForm { it.copy(isSaving = true, error = null) }
            try {
                goalsRepository.addFunds(goalId, amount)
                _uiState.update { it.copy(fundsForm = null, showBurst = amount > 0 && !wasComplete && nowComplete) }
                load()
            } catch (e: Exception) {
                updateFundsForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't update funds.")) }
            }
        }
    }

    fun dismissBurst() = _uiState.update { it.copy(showBurst = false) }

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

    fun openLifeEventForm() = _uiState.update { it.copy(showLifeEvent = true, lifeEventForm = LifeEventFormState(), lifeEventPlan = null) }
    fun closeLifeEventForm() = _uiState.update { it.copy(showLifeEvent = false) }

    fun updateLifeEventForm(transform: (LifeEventFormState) -> LifeEventFormState) =
        _uiState.update { it.copy(lifeEventForm = transform(it.lifeEventForm).copy(error = null)) }

    fun planAnother() = _uiState.update { it.copy(lifeEventForm = LifeEventFormState(), lifeEventPlan = null) }

    fun submitLifeEvent() {
        val form = _uiState.value.lifeEventForm
        val target = form.targetAmount.toDoubleOrNull()
        if (form.eventType.isBlank()) {
            updateLifeEventForm { it.copy(error = "Choose a life event type.") }
            return
        }
        if (target == null || target <= 0) {
            updateLifeEventForm { it.copy(error = "Enter a valid target amount.") }
            return
        }
        if (form.targetDate.isBlank()) {
            updateLifeEventForm { it.copy(error = "Enter a target date.") }
            return
        }
        viewModelScope.launch {
            updateLifeEventForm { it.copy(isSaving = true, error = null) }
            try {
                val response = aiRepository.planLifeEvent(form.eventType, target, form.targetDate)
                _uiState.update { it.copy(lifeEventPlan = response.plan, lifeEventForm = it.lifeEventForm.copy(isSaving = false)) }
                load()
            } catch (e: Exception) {
                updateLifeEventForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't create a plan.")) }
            }
        }
    }
}
