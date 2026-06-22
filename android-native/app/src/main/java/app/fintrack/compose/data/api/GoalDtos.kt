package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

/** `target_amount`/`saved_amount` are raw NUMERIC columns — JSON strings, see TransactionDtos.kt's note. */
@Serializable
data class GoalDto(
    val id: String,
    val name: String,
    val target_amount: String,
    val saved_amount: String,
    val deadline: String? = null,
    val color: String? = null,
    val icon: String? = null,
)

@Serializable
data class GoalsResponse(val goals: List<GoalDto>)

@Serializable
data class GoalResponse(val goal: GoalDto)

@Serializable
data class CreateGoalRequest(
    val name: String,
    val target_amount: Double,
    val deadline: String? = null,
    val color: String? = null,
    val icon: String? = null,
)

@Serializable
data class UpdateGoalRequest(
    val name: String,
    val target_amount: Double,
    val deadline: String? = null,
    val color: String? = null,
)

@Serializable
data class UpdateFundsRequest(val amount: Double)
