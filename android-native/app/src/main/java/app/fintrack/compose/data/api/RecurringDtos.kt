package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

/** `amount` is a raw NUMERIC column — JSON string, see TransactionDtos.kt's note. */
@Serializable
data class RecurringDto(
    val id: String,
    val type: String,
    val amount: String,
    val description: String,
    val notes: String? = null,
    val frequency: String,
    val day_of_month: Int? = null,
    val next_due_date: String,
    val is_active: Boolean = true,
    val category_id: String? = null,
    val category_name: String? = null,
    val category_color: String? = null,
    val category_icon: String? = null,
)

@Serializable
data class RecurringListResponse(val recurring: List<RecurringDto>)

@Serializable
data class RecurringSingleResponse(val recurring: RecurringDto)

@Serializable
data class CreateRecurringRequest(
    val type: String,
    val amount: Double,
    val description: String,
    val notes: String? = null,
    val category_id: String? = null,
    val frequency: String,
    val day_of_month: Int? = null,
)

@Serializable
data class UpdateRecurringRequest(
    val type: String,
    val amount: Double,
    val description: String,
    val frequency: String,
    val day_of_month: Int? = null,
    val category_id: String? = null,
)

val RECURRING_FREQUENCIES = listOf("daily", "weekly", "monthly")
