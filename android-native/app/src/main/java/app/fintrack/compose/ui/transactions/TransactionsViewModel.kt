package app.fintrack.compose.ui.transactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.ai.AiRepository
import app.fintrack.compose.data.api.CategoryDto
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.categories.CategoriesRepository
import app.fintrack.compose.data.transactions.TransactionsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class TransactionFormState(
    val editingId: String? = null,
    val type: String = "expense",
    val amount: String = "",
    val description: String = "",
    val date: String = LocalDate.now().toString(),
    val categoryId: String? = null,
    val notes: String = "",
    val paymentMethod: String = "Cash",
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class QuickAddState(
    val isOpen: Boolean = false,
    val text: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
)

data class TransactionsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val transactions: List<TransactionDto> = emptyList(),
    val categories: List<CategoryDto> = emptyList(),
    val filterType: String? = null,
    val selectedMonth: Int = LocalDate.now().monthValue,
    val selectedYear: Int = LocalDate.now().year,
    val isAllTime: Boolean = false,
    val showForm: Boolean = false,
    val form: TransactionFormState = TransactionFormState(),
    val quickAdd: QuickAddState = QuickAddState(),
    val selectMode: Boolean = false,
    val selectedIds: Set<String> = emptySet(),
    val searchQuery: String = "",
    val searchCategoryId: String? = null,
) {
    val visibleTransactions: List<TransactionDto>
        get() = transactions.filter { tx ->
            (searchQuery.isBlank() || tx.description.contains(searchQuery, ignoreCase = true)) &&
                (searchCategoryId == null || tx.category_id == searchCategoryId)
        }
}

@HiltViewModel
class TransactionsViewModel @Inject constructor(
    private val transactionsRepository: TransactionsRepository,
    private val categoriesRepository: CategoriesRepository,
    private val aiRepository: AiRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(TransactionsUiState())
    val uiState: StateFlow<TransactionsUiState> = _uiState.asStateFlow()

    init {
        loadCategories()
        loadTransactions()
    }

    fun setFilterType(type: String?) {
        _uiState.update { it.copy(filterType = type) }
        loadTransactions()
    }

    fun toggleAllTime() {
        _uiState.update { it.copy(isAllTime = !it.isAllTime) }
        loadTransactions()
    }

    fun loadTransactions() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val current = _uiState.value
                val txs = transactionsRepository.getAll(
                    type = current.filterType,
                    month = if (current.isAllTime) null else current.selectedMonth,
                    year = if (current.isAllTime) null else current.selectedYear,
                )
                _uiState.update { it.copy(isLoading = false, transactions = txs) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load transactions.")) }
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

    fun openCreateForm() = _uiState.update { it.copy(showForm = true, form = TransactionFormState()) }

    fun openEditForm(tx: TransactionDto) = _uiState.update {
        it.copy(
            showForm = true,
            form = TransactionFormState(
                editingId = tx.id,
                type = tx.type,
                amount = tx.amount,
                description = tx.description,
                date = tx.date.take(10),
                categoryId = tx.category_id,
                notes = tx.notes.orEmpty(),
                paymentMethod = tx.payment_method ?: "Cash",
            ),
        )
    }

    fun closeForm() = _uiState.update { it.copy(showForm = false) }

    fun updateForm(transform: (TransactionFormState) -> TransactionFormState) =
        _uiState.update { it.copy(form = transform(it.form).copy(error = null)) }

    fun openQuickAdd() = _uiState.update { it.copy(quickAdd = QuickAddState(isOpen = true)) }

    fun closeQuickAdd() = _uiState.update { it.copy(quickAdd = QuickAddState()) }

    fun updateQuickAddText(text: String) =
        _uiState.update { it.copy(quickAdd = it.quickAdd.copy(text = text, error = null)) }

    fun submitQuickAdd() {
        val text = _uiState.value.quickAdd.text
        if (text.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(quickAdd = it.quickAdd.copy(isLoading = true, error = null)) }
            try {
                val parsed = aiRepository.quickAdd(text)
                if (parsed == null) {
                    _uiState.update { it.copy(quickAdd = it.quickAdd.copy(isLoading = false, error = "Couldn't understand that. Try rephrasing.")) }
                    return@launch
                }
                val categoryId = parsed.category?.let { name ->
                    _uiState.value.categories.find { it.name.equals(name, ignoreCase = true) }?.id
                }
                _uiState.update {
                    it.copy(
                        quickAdd = QuickAddState(),
                        showForm = true,
                        form = TransactionFormState(
                            type = parsed.type,
                            amount = parsed.amount.toString(),
                            description = parsed.description,
                            date = parsed.date.take(10),
                            categoryId = categoryId,
                            notes = parsed.notes.orEmpty(),
                        ),
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(quickAdd = it.quickAdd.copy(isLoading = false, error = e.toUserMessage("Couldn't parse that."))) }
            }
        }
    }

    fun save() {
        val form = _uiState.value.form
        val amount = form.amount.toDoubleOrNull()
        if (amount == null || amount <= 0) {
            updateForm { it.copy(error = "Enter a valid amount.") }
            return
        }
        if (form.description.isBlank()) {
            updateForm { it.copy(error = "Description is required.") }
            return
        }
        viewModelScope.launch {
            updateForm { it.copy(isSaving = true, error = null) }
            try {
                if (form.editingId != null) {
                    transactionsRepository.update(
                        id = form.editingId,
                        type = form.type,
                        amount = amount,
                        description = form.description,
                        date = form.date,
                        categoryId = form.categoryId,
                        notes = form.notes.ifBlank { null },
                        paymentMethod = form.paymentMethod,
                    )
                } else {
                    transactionsRepository.create(
                        type = form.type,
                        amount = amount,
                        description = form.description,
                        date = form.date,
                        categoryId = form.categoryId,
                        notes = form.notes.ifBlank { null },
                        paymentMethod = form.paymentMethod,
                    )
                }
                _uiState.update { it.copy(showForm = false) }
                loadTransactions()
            } catch (e: Exception) {
                updateForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save transaction.")) }
            }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try {
                transactionsRepository.delete(id)
                loadTransactions()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't delete transaction.")) }
            }
        }
    }

    fun toggleSelectMode() {
        _uiState.update {
            if (it.selectMode) it.copy(selectMode = false, selectedIds = emptySet())
            else it.copy(selectMode = true)
        }
    }

    fun toggleSelected(id: String) {
        _uiState.update { state ->
            val current = state.selectedIds
            state.copy(selectedIds = if (id in current) current - id else current + id)
        }
    }

    fun selectAll() = _uiState.update { it.copy(selectedIds = it.visibleTransactions.map { tx -> tx.id }.toSet()) }

    fun setSearchQuery(query: String) = _uiState.update { it.copy(searchQuery = query) }

    fun setSearchCategoryId(categoryId: String?) = _uiState.update { it.copy(searchCategoryId = categoryId) }

    fun bulkDelete() {
        val ids = _uiState.value.selectedIds
        if (ids.isEmpty()) return
        viewModelScope.launch {
            var failures = 0
            for (id in ids) {
                try {
                    transactionsRepository.delete(id)
                } catch (_: Exception) {
                    failures++
                }
            }
            _uiState.update {
                it.copy(
                    selectMode = false,
                    selectedIds = emptySet(),
                    error = if (failures > 0) "Deleted ${ids.size - failures} of ${ids.size}; $failures failed." else null,
                )
            }
            loadTransactions()
        }
    }

    fun toggleRegret(id: String) {
        viewModelScope.launch {
            try {
                val updated = transactionsRepository.toggleRegret(id)
                _uiState.update { state ->
                    state.copy(transactions = state.transactions.map { if (it.id == id) updated else it })
                }
            } catch (_: Exception) { /* non-critical, silently ignore */ }
        }
    }
}
