package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

/** `amount`/`spent` arrive as JSON strings — see TransactionDtos.kt's note on NUMERIC columns. */
@Serializable
data class BudgetDto(
    val id: String,
    val category_id: String,
    val category_name: String? = null,
    val category_icon: String? = null,
    val category_color: String? = null,
    val amount: String,
    val spent: String,
    val month: Int,
    val year: Int,
)

@Serializable
data class BudgetsResponse(val budgets: List<BudgetDto>)

@Serializable
data class BudgetResponse(val budget: BudgetDto)

@Serializable
data class CreateBudgetRequest(
    val category_id: String,
    val amount: Double,
    val month: Int,
    val year: Int,
)
