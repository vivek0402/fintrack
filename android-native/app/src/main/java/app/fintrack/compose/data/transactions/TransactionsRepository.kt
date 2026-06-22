package app.fintrack.compose.data.transactions

import app.fintrack.compose.data.api.CreateTransactionRequest
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.data.api.TransactionsApiService
import app.fintrack.compose.data.api.UpdateTransactionRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TransactionsRepository @Inject constructor(
    private val api: TransactionsApiService,
) {
    suspend fun getAll(type: String? = null, month: Int? = null, year: Int? = null): List<TransactionDto> =
        api.getAll(type = type, month = month, year = year).transactions

    suspend fun search(query: String): List<TransactionDto> = api.search(query).transactions

    suspend fun create(
        type: String,
        amount: Double,
        description: String,
        date: String,
        categoryId: String?,
        notes: String?,
        paymentMethod: String?,
    ): TransactionDto = api.create(
        CreateTransactionRequest(
            type = type,
            amount = amount,
            description = description,
            date = date,
            category_id = categoryId,
            notes = notes,
            payment_method = paymentMethod,
        )
    ).transaction

    suspend fun update(
        id: String,
        type: String,
        amount: Double,
        description: String,
        date: String,
        categoryId: String?,
        notes: String?,
        paymentMethod: String?,
    ): TransactionDto = api.update(
        id,
        UpdateTransactionRequest(
            type = type,
            amount = amount,
            description = description,
            date = date,
            category_id = categoryId,
            notes = notes,
            payment_method = paymentMethod,
        )
    ).transaction

    suspend fun delete(id: String) = api.delete(id)

    suspend fun toggleRegret(id: String): TransactionDto = api.toggleRegret(id).transaction
}
