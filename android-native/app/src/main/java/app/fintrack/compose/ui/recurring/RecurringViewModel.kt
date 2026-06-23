package app.fintrack.compose.ui.recurring

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.ai.AiRepository
import app.fintrack.compose.data.api.CategoryDto
import app.fintrack.compose.data.api.RecurringDto
import app.fintrack.compose.data.api.RecurringPatternDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.categories.CategoriesRepository
import app.fintrack.compose.data.recurring.RecurringRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RecurringFormState(
    val type: String = "expense",
    val amount: String = "",
    val description: String = "",
    val categoryId: String? = null,
    val frequency: String = "monthly",
    val dayOfMonth: String = "1",
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class RecurringUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val recurring: List<RecurringDto> = emptyList(),
    val categories: List<CategoryDto> = emptyList(),
    val showForm: Boolean = false,
    val form: RecurringFormState = RecurringFormState(),
    val editingId: String? = null,
    val editForm: RecurringFormState = RecurringFormState(),
    val isProcessing: Boolean = false,
    val patterns: List<RecurringPatternDto> = emptyList(),
    val dismissedPatternIndices: Set<Int> = emptySet(),
    val addingPatternIndex: Int? = null,
) {
    val visiblePatterns: List<Pair<Int, RecurringPatternDto>>
        get() = patterns.withIndex().filter { it.index !in dismissedPatternIndices }.map { it.index to it.value }
}

@HiltViewModel
class RecurringViewModel @Inject constructor(
    private val recurringRepository: RecurringRepository,
    private val categoriesRepository: CategoriesRepository,
    private val aiRepository: AiRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(RecurringUiState())
    val uiState: StateFlow<RecurringUiState> = _uiState.asStateFlow()

    init {
        loadCategories()
        load()
        loadPatterns()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val recurring = recurringRepository.getAll()
                _uiState.update { it.copy(isLoading = false, recurring = recurring) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load recurring transactions.")) }
            }
        }
    }

    private fun loadCategories() {
        viewModelScope.launch {
            try {
                _uiState.update { it.copy(categories = categoriesRepository.getAll()) }
            } catch (_: Exception) { /* category picker just stays empty; not fatal */ }
        }
    }

    fun openCreateForm() = _uiState.update { it.copy(showForm = true, form = RecurringFormState()) }
    fun closeForm() = _uiState.update { it.copy(showForm = false) }

    fun updateForm(transform: (RecurringFormState) -> RecurringFormState) =
        _uiState.update { it.copy(form = transform(it.form).copy(error = null)) }

    fun save() {
        val form = _uiState.value.form
        val amount = form.amount.toDoubleOrNull()
        if (form.description.isBlank()) {
            updateForm { it.copy(error = "Enter a description.") }
            return
        }
        if (amount == null || amount <= 0) {
            updateForm { it.copy(error = "Enter a valid amount.") }
            return
        }
        val dayOfMonth = form.dayOfMonth.toIntOrNull()?.takeIf { it in 1..31 }
        viewModelScope.launch {
            updateForm { it.copy(isSaving = true, error = null) }
            try {
                recurringRepository.create(
                    type = form.type,
                    amount = amount,
                    description = form.description.trim(),
                    categoryId = form.categoryId,
                    frequency = form.frequency,
                    dayOfMonth = if (form.frequency == "monthly") dayOfMonth else null,
                )
                _uiState.update { it.copy(showForm = false) }
                load()
            } catch (e: Exception) {
                updateForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save recurring transaction.")) }
            }
        }
    }

    fun toggle(id: String) {
        viewModelScope.launch {
            try {
                recurringRepository.toggle(id)
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't update.")) }
            }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try {
                recurringRepository.delete(id)
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't delete.")) }
            }
        }
    }

    fun openEditForm(item: RecurringDto) {
        _uiState.update {
            it.copy(
                editingId = item.id,
                editForm = RecurringFormState(
                    type = item.type,
                    amount = item.amount,
                    description = item.description,
                    categoryId = item.category_id,
                    frequency = item.frequency,
                    dayOfMonth = (item.day_of_month ?: 1).toString(),
                ),
            )
        }
    }

    fun closeEditForm() = _uiState.update { it.copy(editingId = null) }

    fun updateEditForm(transform: (RecurringFormState) -> RecurringFormState) =
        _uiState.update { it.copy(editForm = transform(it.editForm).copy(error = null)) }

    fun saveEdit() {
        val id = _uiState.value.editingId ?: return
        val form = _uiState.value.editForm
        val amount = form.amount.toDoubleOrNull()
        if (form.description.isBlank()) {
            updateEditForm { it.copy(error = "Enter a description.") }
            return
        }
        if (amount == null || amount <= 0) {
            updateEditForm { it.copy(error = "Enter a valid amount.") }
            return
        }
        val dayOfMonth = form.dayOfMonth.toIntOrNull()?.takeIf { it in 1..31 }
        viewModelScope.launch {
            updateEditForm { it.copy(isSaving = true, error = null) }
            try {
                recurringRepository.update(
                    id = id,
                    type = form.type,
                    amount = amount,
                    description = form.description.trim(),
                    categoryId = form.categoryId,
                    frequency = form.frequency,
                    dayOfMonth = if (form.frequency == "monthly") dayOfMonth else null,
                )
                _uiState.update { it.copy(editingId = null) }
                load()
            } catch (e: Exception) {
                updateEditForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't update.")) }
            }
        }
    }

    fun processRecurring() {
        viewModelScope.launch {
            _uiState.update { it.copy(isProcessing = true) }
            try {
                recurringRepository.process()
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't process recurring transactions.")) }
            } finally {
                _uiState.update { it.copy(isProcessing = false) }
            }
        }
    }

    private fun loadPatterns() {
        viewModelScope.launch {
            try {
                val patterns = aiRepository.detectPatterns()
                _uiState.update { it.copy(patterns = patterns, dismissedPatternIndices = emptySet()) }
            } catch (_: Exception) { /* pattern suggestions are best-effort, not fatal */ }
        }
    }

    fun dismissPattern(index: Int) =
        _uiState.update { it.copy(dismissedPatternIndices = it.dismissedPatternIndices + index) }

    fun addPattern(index: Int, pattern: RecurringPatternDto) {
        viewModelScope.launch {
            _uiState.update { it.copy(addingPatternIndex = index) }
            try {
                recurringRepository.create(
                    type = "expense",
                    amount = pattern.amount,
                    description = pattern.description ?: pattern.merchant ?: "Recurring",
                    categoryId = null,
                    frequency = pattern.frequency,
                    dayOfMonth = null,
                )
                _uiState.update { it.copy(dismissedPatternIndices = it.dismissedPatternIndices + index) }
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't add as recurring.")) }
            } finally {
                _uiState.update { it.copy(addingPatternIndex = null) }
            }
        }
    }
}
