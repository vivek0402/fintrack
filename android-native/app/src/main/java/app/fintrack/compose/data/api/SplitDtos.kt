package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

@Serializable
data class ExpenseSplitParticipantDto(
    val name: String,
    val share: Double = 0.0,
    val settled: Boolean = false,
)

@Serializable
data class ExpenseSplitDto(
    val id: String,
    val user_id: String? = null,
    val transaction_id: String? = null,
    val total_amount: String,
    val description: String,
    val split_count: Int,
    val your_share: String,
    val participants: List<ExpenseSplitParticipantDto>,
    val date: String,
    val created_at: String? = null,
)

@Serializable
data class ExpenseSplitsResponse(val splits: List<ExpenseSplitDto>)

@Serializable
data class ExpenseSplitResponse(val split: ExpenseSplitDto)

@Serializable
data class ExpenseSplitParticipantInput(val name: String)

@Serializable
data class CreateExpenseSplitRequest(
    val description: String,
    val total_amount: Double,
    val participants: List<ExpenseSplitParticipantInput>,
    val date: String? = null,
)
