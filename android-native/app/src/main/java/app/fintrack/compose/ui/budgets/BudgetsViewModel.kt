package app.fintrack.compose.ui.budgets

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.analytics.AnalyticsRepository
import app.fintrack.compose.data.api.BudgetDto
import app.fintrack.compose.data.api.CategoryDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.budgets.BudgetsRepository
import app.fintrack.compose.data.categories.CategoriesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlin.math.ceil
import kotlin.math.floor
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
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

enum class BudgetHealthFilter { ALL, ON_TRACK, OVER, SUGGESTION }

data class BudgetSuggestion(
    val id: String,
    val categoryId: String,
    val categoryName: String?,
    val type: String,
    val avgSpend: Double,
    val currentBudget: Double,
    val suggestedAmount: Double,
)

private fun computeBudgetSuggestions(
    budgets: List<BudgetDto>,
    prev1: List<BudgetDto>,
    prev2: List<BudgetDto>,
    dismissed: Set<String>,
    month: Int,
    year: Int,
): List<BudgetSuggestion> {
    val out = mutableListOf<BudgetSuggestion>()
    for (b in budgets) {
        val catId = b.category_id
        val id = "$catId-$month-$year"
        if (id in dismissed) continue
        val p1 = prev1.find { it.category_id == catId }
        val p2 = prev2.find { it.category_id == catId }
        if (p1 == null && p2 == null) continue
        val spends = listOfNotNull(p1, p2).map { it.spent.toDoubleOrNull() ?: 0.0 }.filter { it > 0 }
        if (spends.isEmpty()) continue
        val avg = spends.sum() / spends.size
        fun amt(x: BudgetDto?) = x?.amount?.toDoubleOrNull() ?: 0.0
        fun spent(x: BudgetDto?) = x?.spent?.toDoubleOrNull() ?: 0.0
        val overCnt = listOfNotNull(p1, p2).count { amt(it) > 0 && spent(it) > amt(it) * 1.2 }
        val underCnt = listOfNotNull(p1, p2).count { amt(it) > 0 && spent(it) > 0 && spent(it) < amt(it) * 0.6 }
        val curAmt = b.amount.toDoubleOrNull() ?: 0.0
        if (overCnt >= 2) {
            val suggested = ceil(avg / 500) * 500
            if (suggested > curAmt) out.add(BudgetSuggestion(id, catId, b.category_name, "over", avg, curAmt, suggested))
        } else if (underCnt >= 2) {
            val suggested = maxOf(100.0, floor(avg / 100) * 100)
            if (suggested < curAmt) out.add(BudgetSuggestion(id, catId, b.category_name, "under", avg, curAmt, suggested))
        }
    }
    return out
}

data class BudgetsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val budgets: List<BudgetDto> = emptyList(),
    val categories: List<CategoryDto> = emptyList(),
    val month: Int = LocalDate.now().monthValue,
    val year: Int = LocalDate.now().year,
    val showForm: Boolean = false,
    val form: BudgetFormState = BudgetFormState(),
    val prevMonthBudgets: List<BudgetDto> = emptyList(),
    val prev2MonthBudgets: List<BudgetDto> = emptyList(),
    val monthlyIncome: Double = 0.0,
    val dismissedSuggestionIds: Set<String> = emptySet(),
    val rolloverEnabled: Set<String> = emptySet(),
    val zeroBasedMode: Boolean = false,
    val healthFilter: BudgetHealthFilter = BudgetHealthFilter.ALL,
    val editingId: String? = null,
    val editAmount: String = "",
    val isCopying: Boolean = false,
    val adjustingSuggestionId: String? = null,
) {
    val suggestions: List<BudgetSuggestion>
        get() = computeBudgetSuggestions(budgets, prevMonthBudgets, prev2MonthBudgets, dismissedSuggestionIds, month, year)

    val totalBudgeted: Double get() = budgets.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
    val totalSpent: Double get() = budgets.sumOf { it.spent.toDoubleOrNull() ?: 0.0 }
    val totalRemaining: Double get() = (totalBudgeted - totalSpent).coerceAtLeast(0.0)
    val overallRawPct: Double get() = if (totalBudgeted > 0) totalSpent / totalBudgeted * 100 else 0.0
    val overBudgetList: List<BudgetDto> get() = budgets.filter { (it.spent.toDoubleOrNull() ?: 0.0) > (it.amount.toDoubleOrNull() ?: 0.0) }
    val isOverTotal: Boolean get() = totalSpent > totalBudgeted
    val onTrackCount: Int get() = budgets.count { (it.spent.toDoubleOrNull() ?: 0.0) <= (it.amount.toDoubleOrNull() ?: 0.0) }
    val unallocated: Double get() = monthlyIncome - totalBudgeted
    val copyableCount: Int get() = prevMonthBudgets.count { pb -> budgets.none { it.category_id == pb.category_id } }
    val filteredBudgets: List<BudgetDto>
        get() = when (healthFilter) {
            BudgetHealthFilter.ALL -> budgets
            BudgetHealthFilter.ON_TRACK -> budgets.filter { (it.spent.toDoubleOrNull() ?: 0.0) <= (it.amount.toDoubleOrNull() ?: 0.0) }
            BudgetHealthFilter.OVER -> budgets.filter { (it.spent.toDoubleOrNull() ?: 0.0) > (it.amount.toDoubleOrNull() ?: 0.0) }
            BudgetHealthFilter.SUGGESTION -> budgets.filter { b -> suggestions.any { it.categoryId == b.category_id } }
        }
}

@HiltViewModel
class BudgetsViewModel @Inject constructor(
    private val budgetsRepository: BudgetsRepository,
    private val categoriesRepository: CategoriesRepository,
    private val analyticsRepository: AnalyticsRepository,
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
                val pm = if (state.month == 1) 12 else state.month - 1
                val py = if (state.month == 1) state.year - 1 else state.year
                val p2m = if (state.month <= 2) state.month + 10 else state.month - 2
                val p2y = if (state.month <= 2) state.year - 1 else state.year
                coroutineScope {
                    val budgetsDeferred = async { budgetsRepository.getAll(state.month, state.year) }
                    val prev1Deferred = async { runCatching { budgetsRepository.getAll(pm, py) }.getOrDefault(emptyList()) }
                    val prev2Deferred = async { runCatching { budgetsRepository.getAll(p2m, p2y) }.getOrDefault(emptyList()) }
                    val summaryDeferred = async { runCatching { analyticsRepository.getSummary(state.month, state.year) }.getOrNull() }
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            budgets = budgetsDeferred.await(),
                            prevMonthBudgets = prev1Deferred.await(),
                            prev2MonthBudgets = prev2Deferred.await(),
                            monthlyIncome = summaryDeferred.await()?.summary?.total_income ?: 0.0,
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load budgets.")) }
            }
        }
    }

    fun setHealthFilter(filter: BudgetHealthFilter) =
        _uiState.update { it.copy(healthFilter = if (it.healthFilter == filter) BudgetHealthFilter.ALL else filter) }

    fun toggleZeroBasedMode() = _uiState.update { it.copy(zeroBasedMode = !it.zeroBasedMode) }

    fun toggleRollover(categoryId: String) = _uiState.update {
        it.copy(rolloverEnabled = if (categoryId in it.rolloverEnabled) it.rolloverEnabled - categoryId else it.rolloverEnabled + categoryId)
    }

    fun dismissSuggestion(id: String) = _uiState.update { it.copy(dismissedSuggestionIds = it.dismissedSuggestionIds + id) }

    fun adjustSuggestion(suggestion: BudgetSuggestion) {
        viewModelScope.launch {
            _uiState.update { it.copy(adjustingSuggestionId = suggestion.id) }
            try {
                val state = _uiState.value
                budgetsRepository.create(suggestion.categoryId, suggestion.suggestedAmount, state.month, state.year)
                dismissSuggestion(suggestion.id)
                loadBudgets()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't update budget.")) }
            } finally {
                _uiState.update { it.copy(adjustingSuggestionId = null) }
            }
        }
    }

    fun copyFromLastMonth() {
        val state = _uiState.value
        val toCopy = state.prevMonthBudgets.filter { pb -> state.budgets.none { it.category_id == pb.category_id } }
        if (toCopy.isEmpty()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isCopying = true) }
            try {
                toCopy.forEach { pb -> budgetsRepository.create(pb.category_id, pb.amount.toDoubleOrNull() ?: 0.0, state.month, state.year) }
                _uiState.update { it.copy(isCopying = false) }
                loadBudgets()
            } catch (e: Exception) {
                _uiState.update { it.copy(isCopying = false, error = e.toUserMessage("Couldn't copy budgets.")) }
            }
        }
    }

    fun startEdit(budget: BudgetDto) = _uiState.update { it.copy(editingId = budget.id, editAmount = budget.amount) }

    fun cancelEdit() = _uiState.update { it.copy(editingId = null, editAmount = "") }

    fun updateEditAmount(value: String) = _uiState.update { it.copy(editAmount = value) }

    fun saveEdit(categoryId: String) {
        val state = _uiState.value
        val amount = state.editAmount.toDoubleOrNull()
        if (amount == null || amount <= 0) return
        viewModelScope.launch {
            try {
                budgetsRepository.create(categoryId, amount, state.month, state.year)
                _uiState.update { it.copy(editingId = null, editAmount = "") }
                loadBudgets()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't update budget.")) }
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
