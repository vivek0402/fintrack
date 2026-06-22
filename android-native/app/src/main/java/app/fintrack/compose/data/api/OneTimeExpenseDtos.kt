package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

val OT_CATEGORIES = listOf("Travel", "Event", "Electronics", "Medical", "Education", "Home", "Vehicle", "Gift", "Investment", "Other")
val OT_PAYMENT_METHODS = listOf("Cash", "UPI", "Credit Card", "Debit Card", "Net Banking", "Other")

/** `amount` is a raw NUMERIC passthrough — a JSON string, see [OneTimeExpenseDto]'s note. */
@Serializable
data class OneTimeExpenseItemDto(
    val id: String,
    val expense_id: String? = null,
    val description: String,
    val amount: String,
    val category: String? = null,
    val date: String,
    val payment_method: String? = null,
    val notes: String? = null,
    val transaction_id: String? = null,
)

/**
 * `amount`/`computed_amount` are raw NUMERIC passthroughs on the parent row — JSON
 * strings. `total_amount`/`item_count` are explicitly `::float`/`::int` cast server-side
 * in the aggregate GET query, so those two arrive as real JSON numbers.
 */
@Serializable
data class OneTimeExpenseDto(
    val id: String,
    val bank_account_id: Int? = null,
    val title: String,
    val category: String? = null,
    val notes: String? = null,
    val icon: String? = null,
    val color: String? = null,
    val start_date: String? = null,
    val end_date: String? = null,
    val bank_account_name: String? = null,
    val total_amount: Double = 0.0,
    val item_count: Int = 0,
    val items: List<OneTimeExpenseItemDto> = emptyList(),
)

@Serializable
data class OneTimeExpensesResponse(val expenses: List<OneTimeExpenseDto>)

@Serializable
data class OneTimeExpenseResponse(val expense: OneTimeExpenseDto)

@Serializable
data class OneTimeExpenseItemResponse(val item: OneTimeExpenseItemDto)

@Serializable
data class DeleteOneTimeExpenseResponse(val success: Boolean = true, val restoredAmount: Double = 0.0)

@Serializable
data class CreateOneTimeExpenseRequest(
    val title: String,
    val category: String? = null,
    val notes: String? = null,
    val start_date: String? = null,
    val end_date: String? = null,
    val bank_account_id: Int? = null,
)

@Serializable
data class UpdateOneTimeExpenseRequest(
    val title: String? = null,
    val category: String? = null,
    val notes: String? = null,
    val bank_account_id: Int? = null,
    val start_date: String? = null,
    val end_date: String? = null,
)

@Serializable
data class CreateOneTimeExpenseItemRequest(
    val description: String,
    val amount: Double,
    val date: String,
    val category: String? = null,
    val payment_method: String? = null,
    val notes: String? = null,
)
