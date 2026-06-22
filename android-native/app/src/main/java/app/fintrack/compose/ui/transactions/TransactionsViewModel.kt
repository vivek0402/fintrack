package app.fintrack.compose.ui.transactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
)

@HiltViewModel
class TransactionsViewModel @Inject constructor(
    private val transactionsRepository: TransactionsRepository,
    private val categoriesRepository: CategoriesRepository,
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
