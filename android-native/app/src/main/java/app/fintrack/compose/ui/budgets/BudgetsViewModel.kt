package app.fintrack.compose.ui.budgets

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.BudgetDto
import app.fintrack.compose.data.api.CategoryDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.budgets.BudgetsRepository
import app.fintrack.compose.data.categories.CategoriesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class BudgetFormState(
    val categoryId: String? = null,
    val amount: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class BudgetsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val budgets: List<BudgetDto> = emptyList(),
    val categories: List<CategoryDto> = emptyList(),
    val month: Int = LocalDate.now().monthValue,
    val year: Int = LocalDate.now().year,
    val showForm: Boolean = false,
    val form: BudgetFormState = BudgetFormState(),
)

@HiltViewModel
class BudgetsViewModel @Inject constructor(
    private val budgetsRepository: BudgetsRepository,
    private val categoriesRepository: CategoriesRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(BudgetsUiState())
    val uiState: StateFlow<BudgetsUiState> = _uiState.asStateFlow()

    init {
        loadCategories()
        loadBudgets()
    }

    fun loadBudgets() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val state = _uiState.value
                val budgets = budgetsRepository.getAll(state.month, state.year)
                _uiState.update { it.copy(isLoading = false, budgets = budgets) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load budgets.")) }
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

    fun openCreateForm() = _uiState.update { it.copy(showForm = true, form = BudgetFormState()) }
    fun closeForm() = _uiState.update { it.copy(showForm = false) }

    fun updateForm(transform: (BudgetFormState) -> BudgetFormState) =
        _uiState.update { it.copy(form = transform(it.form).copy(error = null)) }

    fun save() {
        val state = _uiState.value
        val form = state.form
        val amount = form.amount.toDoubleOrNull()
        if (form.categoryId == null) {
            updateForm { it.copy(error = "Choose a category.") }
            return
        }
        if (amount == null || amount <= 0) {
            updateForm { it.copy(error = "Enter a valid amount.") }
            return
        }
        viewModelScope.launch {
            updateForm { it.copy(isSaving = true, error = null) }
            try {
                budgetsRepository.create(form.categoryId, amount, state.month, state.year)
                _uiState.update { it.copy(showForm = false) }
                loadBudgets()
            } catch (e: Exception) {
                updateForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save budget.")) }
            }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try {
                budgetsRepository.delete(id)
                loadBudgets()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't delete budget.")) }
            }
        }
    }
}
