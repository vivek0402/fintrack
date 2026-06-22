package app.fintrack.compose.data.onetime

import app.fintrack.compose.data.api.CreateOneTimeExpenseItemRequest
import app.fintrack.compose.data.api.CreateOneTimeExpenseRequest
import app.fintrack.compose.data.api.OneTimeExpenseDto
import app.fintrack.compose.data.api.OneTimeExpenseItemDto
import app.fintrack.compose.data.api.OneTimeExpensesApiService
import app.fintrack.compose.data.api.UpdateOneTimeExpenseRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OneTimeExpensesRepository @Inject constructor(
    private val api: OneTimeExpensesApiService,
) {
    suspend fun getAll(): List<OneTimeExpenseDto> = api.getAll().expenses

    suspend fun create(
        title: String,
        category: String?,
        notes: String?,
        startDate: String?,
        endDate: String?,
        bankAccountId: Int?,
    ): OneTimeExpenseDto = api.create(CreateOneTimeExpenseRequest(title, category, notes, startDate, endDate, bankAccountId)).expense

    suspend fun update(
        id: String,
        title: String,
        category: String?,
        notes: String?,
        startDate: String?,
        endDate: String?,
        bankAccountId: Int?,
    ): OneTimeExpenseDto = api.update(id, UpdateOneTimeExpenseRequest(title, category, notes, bankAccountId, startDate, endDate)).expense

    suspend fun delete(id: String): Double = api.delete(id).restoredAmount

    suspend fun addItem(
        expenseId: String,
        description: String,
        amount: Double,
        date: String,
        category: String?,
        paymentMethod: String?,
        notes: String?,
    ): OneTimeExpenseItemDto =
        api.addItem(expenseId, CreateOneTimeExpenseItemRequest(description, amount, date, category, paymentMethod, notes)).item

    suspend fun updateItem(
        expenseId: String,
        itemId: String,
        description: String,
        amount: Double,
        date: String,
        category: String?,
        paymentMethod: String?,
        notes: String?,
    ): OneTimeExpenseItemDto =
        api.updateItem(expenseId, itemId, CreateOneTimeExpenseItemRequest(description, amount, date, category, paymentMethod, notes)).item

    suspend fun deleteItem(expenseId: String, itemId: String) {
        api.deleteItem(expenseId, itemId)
    }
}
