package app.fintrack.compose.ui.savingsplan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.MilestoneDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.milestones.MilestoneRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MilestoneFormState(
    val name: String = "",
    val targetDate: String = "",
    val description: String = "",
    val targetAmount: String = "",
    val currentAmount: String = "0",
    val parentId: String? = null,
    val priority: String = "0",
    val error: String? = null,
    val isSaving: Boolean = false,
)

val MILESTONE_STATUS_OPTIONS = listOf(
    "not_started" to "Not Started",
    "in_progress" to "In Progress",
    "achieved" to "Achieved",
    "missed" to "Missed",
)

data class MilestonesUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val milestones: List<MilestoneDto> = emptyList(),
    val expandedIds: Set<String> = emptySet(),
    val showForm: Boolean = false,
    val editingId: String? = null,
    val form: MilestoneFormState = MilestoneFormState(),
    val progressEditId: String? = null,
    val progressAmount: String = "",
    val progressStatus: String = "in_progress",
    val deleteTargetId: String? = null,
) {
    val totalCount: Int get() = milestones.size
    val achievedCount: Int get() = milestones.count { it.status == "achieved" }
    val onTrackCount: Int get() = milestones.count { it.status != "achieved" && it.feasibility.is_on_track == true }
}

@HiltViewModel
class MilestonesViewModel @Inject constructor(
    private val repository: MilestoneRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(MilestonesUiState())
    val uiState: StateFlow<MilestonesUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val milestones = repository.getAll()
                _uiState.update { it.copy(isLoading = false, milestones = milestones) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load milestones.")) }
            }
        }
    }

    fun toggleExpanded(id: String) = _uiState.update {
        it.copy(expandedIds = if (id in it.expandedIds) it.expandedIds - id else it.expandedIds + id)
    }

    fun openAddForm() = _uiState.update { it.copy(showForm = true, editingId = null, form = MilestoneFormState()) }

    fun openEditForm(milestone: MilestoneDto) = _uiState.update {
        it.copy(
            showForm = true,
            editingId = milestone.id,
            form = MilestoneFormState(
                name = milestone.name,
                targetDate = milestone.target_date.take(10),
                description = milestone.description.orEmpty(),
                targetAmount = milestone.target_amount.orEmpty(),
                currentAmount = milestone.current_amount,
                parentId = milestone.parent_id,
                priority = milestone.priority.toString(),
            ),
        )
    }

    fun closeForm() = _uiState.update { it.copy(showForm = false, editingId = null) }

    fun updateForm(transform: (MilestoneFormState) -> MilestoneFormState) =
        _uiState.update { it.copy(form = transform(it.form).copy(error = null)) }

    fun submitForm() {
        val state = _uiState.value
        val form = state.form
        if (form.name.isBlank()) {
            _uiState.update { it.copy(form = it.form.copy(error = "Name is required.")) }
            return
        }
        if (form.targetDate.isBlank()) {
            _uiState.update { it.copy(form = it.form.copy(error = "Target date is required.")) }
            return
        }
        val targetAmount = form.targetAmount.toDoubleOrNull()
        val currentAmount = form.currentAmount.toDoubleOrNull() ?: 0.0
        val priority = form.priority.toIntOrNull() ?: 0

        viewModelScope.launch {
            _uiState.update { it.copy(form = it.form.copy(isSaving = true)) }
            try {
                if (state.editingId != null) {
                    repository.update(
                        id = state.editingId,
                        name = form.name,
                        description = form.description.ifBlank { null },
                        targetDate = form.targetDate,
                        targetAmount = targetAmount,
                        currentAmount = currentAmount,
                        parentId = form.parentId,
                        priority = priority,
                    )
                } else {
                    repository.create(
                        name = form.name,
                        description = form.description.ifBlank { null },
                        targetDate = form.targetDate,
                        targetAmount = targetAmount,
                        currentAmount = currentAmount,
                        parentId = form.parentId,
                        priority = priority,
                    )
                }
                _uiState.update { it.copy(showForm = false, editingId = null) }
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(form = it.form.copy(isSaving = false, error = e.toUserMessage("Couldn't save milestone."))) }
            }
        }
    }

    fun openProgressPanel(milestone: MilestoneDto) = _uiState.update {
        it.copy(progressEditId = milestone.id, progressAmount = milestone.current_amount, progressStatus = milestone.status)
    }

    fun updateProgressAmount(value: String) = _uiState.update { it.copy(progressAmount = value) }
    fun updateProgressStatus(value: String) = _uiState.update { it.copy(progressStatus = value) }
    fun closeProgressPanel() = _uiState.update { it.copy(progressEditId = null) }

    fun saveProgress() {
        val id = _uiState.value.progressEditId ?: return
        val amount = _uiState.value.progressAmount.toDoubleOrNull()
        val status = _uiState.value.progressStatus
        viewModelScope.launch {
            try {
                repository.updateProgress(id, amount, status)
                _uiState.update { it.copy(progressEditId = null) }
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't update progress.")) }
            }
        }
    }

    fun requestDelete(id: String) = _uiState.update { it.copy(deleteTargetId = id) }
    fun cancelDelete() = _uiState.update { it.copy(deleteTargetId = null) }

    fun confirmDelete() {
        val id = _uiState.value.deleteTargetId ?: return
        viewModelScope.launch {
            try {
                repository.delete(id)
                _uiState.update { it.copy(deleteTargetId = null) }
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(deleteTargetId = null, error = e.toUserMessage("Couldn't delete milestone.")) }
            }
        }
    }
}
