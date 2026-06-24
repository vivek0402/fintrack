package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

/** `days_remaining`/`months_remaining`/`amount_remaining`/`monthly_needed` are computed server-side as plain JS numbers, not NUMERIC passthroughs. */
@Serializable
data class MilestoneFeasibilityDto(
    val days_remaining: Int,
    val months_remaining: Int,
    val amount_remaining: Double? = null,
    val monthly_needed: Double? = null,
    val is_on_track: Boolean? = null,
)

/** `target_amount`/`current_amount` are NUMERIC(15,2) columns — JSON strings. `priority` is INTEGER — a real number. */
@Serializable
data class MilestoneDto(
    val id: String,
    val name: String,
    val description: String? = null,
    val target_date: String,
    val target_amount: String? = null,
    val current_amount: String = "0",
    val parent_id: String? = null,
    val parent_name: String? = null,
    val priority: Int = 0,
    val status: String = "not_started",
    val feasibility: MilestoneFeasibilityDto,
    val overdue: Boolean = false,
)

@Serializable
data class MilestonesResponse(val milestones: List<MilestoneDto>)

@Serializable
data class MilestoneResponse(val milestone: MilestoneDto)

@Serializable
data class MilestoneRequest(
    val name: String? = null,
    val description: String? = null,
    val target_date: String? = null,
    val target_amount: Double? = null,
    val current_amount: Double? = null,
    val parent_id: String? = null,
    val priority: Int? = null,
    val status: String? = null,
)

@Serializable
data class MilestoneProgressRequest(
    val current_amount: Double? = null,
    val status: String? = null,
)

@Serializable
data class MilestoneDeleteResponse(val message: String, val children_unlinked: Int = 0)
