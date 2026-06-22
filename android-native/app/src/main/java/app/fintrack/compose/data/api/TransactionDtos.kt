package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

/**
 * `amount` arrives as a JSON string, not a number — this backend (node-postgres,
 * no custom type parser) serializes NUMERIC columns as strings on raw row
 * passthroughs. The web frontend handles this the same way (parseFloat() at the
 * point of use, see frontend/app/budgets/page.tsx). Parse with amount.toDoubleOrNull().
 */
@Serializable
data class TransactionDto(
    val id: String,
    val type: String,
    val amount: String,
    val description: String,
    val notes: String? = null,
    val tags: List<String>? = null,
    val date: String,
    val category_id: String? = null,
    val category_name: String? = null,
    val category_icon: String? = null,
    val category_color: String? = null,
    val group_name: String? = null,
    val account_id: Int? = null,
    val payment_method: String? = null,
    val is_regretted: Boolean = false,
    val created_at: String? = null,
)

@Serializable
data class TransactionsResponse(val transactions: List<TransactionDto>)

@Serializable
data class TransactionResponse(val transaction: TransactionDto)

@Serializable
data class CreateTransactionRequest(
    val type: String,
    val amount: Double,
    val description: String,
    val date: String,
    val category_id: String? = null,
    val notes: String? = null,
    val tags: List<String>? = null,
    val account_id: Int? = null,
    val payment_method: String? = null,
)

@Serializable
data class UpdateTransactionRequest(
    val type: String? = null,
    val amount: Double? = null,
    val description: String? = null,
    val date: String? = null,
    val category_id: String? = null,
    val notes: String? = null,
    val tags: List<String>? = null,
    val payment_method: String? = null,
)
