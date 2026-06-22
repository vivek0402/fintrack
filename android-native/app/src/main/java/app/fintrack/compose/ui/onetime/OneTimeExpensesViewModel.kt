package app.fintrack.compose.ui.onetime

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.accounts.AccountsRepository
import app.fintrack.compose.data.api.AccountDto
import app.fintrack.compose.data.api.CategoryDto
import app.fintrack.compose.data.api.OT_CATEGORIES
import app.fintrack.compose.data.api.OneTimeExpenseDto
import app.fintrack.compose.data.api.OneTimeExpenseItemDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.categories.CategoriesRepository
import app.fintrack.compose.data.onetime.OneTimeExpensesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ExpenseFormState(
    val editingId: String? = null,
    val title: String = "",
    val category: String = OT_CATEGORIES.last(),
    val notes: String = "",
    val startDate: String = "",
    val endDate: String = "",
    val bankAccountId: Int? = null,
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class ItemFormState(
    val editingId: String? = null,
    val description: String = "",
    val amount: String = "",
    val date: String = LocalDate.now().toString(),
    val category: String = "",
    val paymentMethod: String = "Cash",
    val notes: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class OneTimeExpensesUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val expenses: List<OneTimeExpenseDto> = emptyList(),
    val accounts: List<AccountDto> = emptyList(),
    val categories: List<CategoryDto> = emptyList(),
    val expandedId: String? = null,
    val showExpenseForm: Boolean = false,
    val expenseForm: ExpenseFormState = ExpenseFormState(),
    val itemFormExpenseId: String? = null,
    val showItemForm: Boolean = false,
    val itemForm: ItemFormState = ItemFormState(),
    val actionError: String? = null,
)

@HiltViewModel
class OneTimeExpensesViewModel @Inject constructor(
    private val repository: OneTimeExpensesRepository,
    private val accountsRepository: AccountsRepository,
    private val categoriesRepository: CategoriesRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(OneTimeExpensesUiState())
    val uiState: StateFlow<OneTimeExpensesUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val expenses = repository.getAll()
                val accounts = runCatching { accountsRepository.getAll() }.getOrDefault(emptyList())
                val categories = runCatching { categoriesRepository.getAll() }.getOrDefault(emptyList())
                _uiState.update { it.copy(isLoading = false, expenses = expenses, accounts = accounts, categories = categories) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load your one-time expenses.")) }
            }
        }
    }

    private fun refresh() {
        viewModelScope.launch {
            try {
                val expenses = repository.getAll()
                _uiState.update { it.copy(expenses = expenses) }
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't refresh.")) }
            }
        }
    }

    fun toggleExpand(id: String) = _uiState.update { it.copy(expandedId = if (it.expandedId == id) null else id) }

    fun openCreateExpenseForm() = _uiState.update { it.copy(showExpenseForm = true, expenseForm = ExpenseFormState()) }

    fun openEditExpenseForm(expense: OneTimeExpenseDto) {
        _uiState.update {
            it.copy(
                showExpenseForm = true,
                expenseForm = ExpenseFormState(
                    editingId = expense.id,
                    title = expense.title,
                    category = expense.category ?: OT_CATEGORIES.last(),
                    notes = expense.notes.orEmpty(),
                    startDate = expense.start_date?.take(10).orEmpty(),
                    endDate = expense.end_date?.take(10).orEmpty(),
                    bankAccountId = expense.bank_account_id,
                ),
            )
        }
    }

    fun closeExpenseForm() = _uiState.update { it.copy(showExpenseForm = false) }

    fun updateExpenseForm(transform: (ExpenseFormState) -> ExpenseFormState) =
        _uiState.update { it.copy(expenseForm = transform(it.expenseForm).copy(error = null)) }

    fun saveExpense() {
        val form = _uiState.value.expenseForm
        if (form.title.isBlank()) {
            updateExpenseForm { it.copy(error = "Expense name is required.") }
            return
        }
        viewModelScope.launch {
            updateExpenseForm { it.copy(isSaving = true, error = null) }
            try {
                if (form.editingId != null) {
                    repository.update(
                        form.editingId, form.title.trim(), form.category, form.notes.trim().ifBlank { null },
                        form.startDate.ifBlank { null }, form.endDate.ifBlank { null }, form.bankAccountId,
                    )
                } else {
                    repository.create(
                        form.title.trim(), form.category, form.notes.trim().ifBlank { null },
                        form.startDate.ifBlank { null }, form.endDate.ifBlank { null }, form.bankAccountId,
                    )
                }
                _uiState.update { it.copy(showExpenseForm = false) }
                load()
            } catch (e: Exception) {
                updateExpenseForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save this expense.")) }
            }
        }
    }

    fun deleteExpense(id: String) {
        viewModelScope.launch {
            try {
                repository.delete(id)
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't delete this expense.")) }
            }
        }
    }

    fun openAddItemForm(expenseId: String) =
        _uiState.update { it.copy(showItemForm = true, itemFormExpenseId = expenseId, itemForm = ItemFormState()) }

    fun openEditItemForm(expenseId: String, item: OneTimeExpenseItemDto) {
        _uiState.update {
            it.copy(
                showItemForm = true,
                itemFormExpenseId = expenseId,
                itemForm = ItemFormState(
                    editingId = item.id,
                    description = item.description,
                    amount = item.amount,
                    date = item.date.take(10),
                    category = item.category.orEmpty(),
                    paymentMethod = item.payment_method ?: "Cash",
                    notes = item.notes.orEmpty(),
                ),
            )
        }
    }

    fun closeItemForm() = _uiState.update { it.copy(showItemForm = false) }

    fun updateItemForm(transform: (ItemFormState) -> ItemFormState) =
        _uiState.update { it.copy(itemForm = transform(it.itemForm).copy(error = null)) }

    fun saveItem() {
        val expenseId = _uiState.value.itemFormExpenseId ?: return
        val form = _uiState.value.itemForm
        val amount = form.amount.toDoubleOrNull()
        if (form.description.isBlank() || amount == null || amount <= 0) {
            updateItemForm { it.copy(error = "Enter a description and a valid amount.") }
            return
        }
        viewModelScope.launch {
            updateItemForm { it.copy(isSaving = true, error = null) }
            try {
                if (form.editingId != null) {
                    repository.updateItem(
                        expenseId, form.editingId, form.description.trim(), amount, form.date,
                        form.category.ifBlank { null }, form.paymentMethod, form.notes.trim().ifBlank { null },
                    )
                } else {
                    repository.addItem(
                        expenseId, form.description.trim(), amount, form.date,
                        form.category.ifBlank { null }, form.paymentMethod, form.notes.trim().ifBlank { null },
                    )
                }
                _uiState.update { it.copy(showItemForm = false) }
                refresh()
            } catch (e: Exception) {
                updateItemForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save this item.")) }
            }
        }
    }

    fun deleteItem(expenseId: String, itemId: String) {
        viewModelScope.launch {
            try {
                repository.deleteItem(expenseId, itemId)
                refresh()
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't delete this item.")) }
            }
        }
    }

    fun clearActionError() = _uiState.update { it.copy(actionError = null) }
}
