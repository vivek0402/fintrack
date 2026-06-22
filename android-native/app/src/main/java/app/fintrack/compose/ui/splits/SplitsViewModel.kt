package app.fintrack.compose.ui.splits

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.ai.AiRepository
import app.fintrack.compose.data.api.ExpenseSplitDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.splits.SplitsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SplitFormState(
    val editingId: String? = null,
    val description: String = "",
    val totalAmount: String = "",
    val date: String = LocalDate.now().toString(),
    val participantNames: List<String> = listOf(""),
    val nlText: String = "",
    val isParsing: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class SplitsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val splits: List<ExpenseSplitDto> = emptyList(),
    val showForm: Boolean = false,
    val form: SplitFormState = SplitFormState(),
    val actionError: String? = null,
)

@HiltViewModel
class SplitsViewModel @Inject constructor(
    private val splitsRepository: SplitsRepository,
    private val aiRepository: AiRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SplitsUiState())
    val uiState: StateFlow<SplitsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val splits = splitsRepository.getAll()
                _uiState.update { it.copy(isLoading = false, splits = splits) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load your splits.")) }
            }
        }
    }

    fun openCreateForm() = _uiState.update { it.copy(showForm = true, form = SplitFormState()) }

    fun openEditForm(split: ExpenseSplitDto) {
        _uiState.update {
            it.copy(
                showForm = true,
                form = SplitFormState(
                    editingId = split.id,
                    description = split.description,
                    totalAmount = split.total_amount,
                    date = split.date.take(10),
                    participantNames = split.participants.map { p -> p.name }.ifEmpty { listOf("") },
                ),
            )
        }
    }

    fun closeForm() = _uiState.update { it.copy(showForm = false) }

    fun updateForm(transform: (SplitFormState) -> SplitFormState) =
        _uiState.update { it.copy(form = transform(it.form).copy(error = null)) }

    fun addParticipantField() = updateForm { it.copy(participantNames = it.participantNames + "") }

    fun removeParticipantField(index: Int) = updateForm {
        it.copy(participantNames = it.participantNames.filterIndexed { i, _ -> i != index }.ifEmpty { listOf("") })
    }

    fun updateParticipantField(index: Int, value: String) = updateForm {
        it.copy(participantNames = it.participantNames.mapIndexed { i, name -> if (i == index) value else name })
    }

    fun updateNlText(value: String) = _uiState.update { it.copy(form = it.form.copy(nlText = value)) }

    fun parseFromText() {
        val text = _uiState.value.form.nlText
        if (text.isBlank()) return
        viewModelScope.launch {
            updateForm { it.copy(isParsing = true) }
            try {
                val parsed = aiRepository.parseSplit(text)
                if (parsed != null) {
                    updateForm {
                        it.copy(
                            isParsing = false,
                            description = parsed.description ?: it.description,
                            totalAmount = parsed.total_amount?.toString() ?: it.totalAmount,
                            participantNames = parsed.participants?.map { p -> p.name }?.ifEmpty { null } ?: it.participantNames,
                        )
                    }
                } else {
                    updateForm { it.copy(isParsing = false, error = "Could not parse. Please enter details manually.") }
                }
            } catch (e: Exception) {
                updateForm { it.copy(isParsing = false, error = e.toUserMessage("Could not parse. Please enter details manually.")) }
            }
        }
    }

    fun save() {
        val form = _uiState.value.form
        val total = form.totalAmount.toDoubleOrNull()
        val names = form.participantNames.map { it.trim() }.filter { it.isNotBlank() }
        if (form.description.isBlank() || total == null || total <= 0 || names.isEmpty()) {
            updateForm { it.copy(error = "Enter a description, a valid total, and at least one participant.") }
            return
        }
        viewModelScope.launch {
            updateForm { it.copy(isSaving = true, error = null) }
            try {
                if (form.editingId != null) {
                    splitsRepository.update(form.editingId, form.description.trim(), total, names, form.date)
                } else {
                    splitsRepository.create(form.description.trim(), total, names, form.date)
                }
                _uiState.update { it.copy(showForm = false) }
                load()
            } catch (e: Exception) {
                updateForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save this split.")) }
            }
        }
    }

    fun settle(splitId: String, index: Int) {
        viewModelScope.launch {
            try {
                val updated = splitsRepository.settle(splitId, index)
                _uiState.update { state -> state.copy(splits = state.splits.map { if (it.id == splitId) updated else it }) }
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't update settlement.")) }
            }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try {
                splitsRepository.delete(id)
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't delete this split.")) }
            }
        }
    }

    fun clearActionError() = _uiState.update { it.copy(actionError = null) }
}
