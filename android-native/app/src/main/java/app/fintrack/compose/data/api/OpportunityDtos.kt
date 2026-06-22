package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

/** Raw `SELECT *` passthrough from the opportunities table — amount_saved (NUMERIC, nullable) arrives as a JSON string. */
@Serializable
data class OpportunityDto(
    val id: String,
    val type: String,
    val title: String,
    val description: String,
    val amount_saved: String? = null,
    val priority: Int,
    val action_label: String,
    val action_route: String? = null,
    val status: String,
)

@Serializable
data class DetectOpportunitiesResponse(
    val detected_count: Int,
    val opportunities: List<OpportunityDto>,
)

@Serializable
data class OpportunitiesSummaryDto(
    val active_count: Int,
    val dismissed_count: Int,
    val acted_on_count: Int,
)

@Serializable
data class OpportunitiesListResponse(
    val opportunities: List<OpportunityDto>,
    val summary: OpportunitiesSummaryDto,
)
