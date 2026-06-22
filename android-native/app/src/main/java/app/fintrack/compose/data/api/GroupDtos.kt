package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

@Serializable
data class ExpenseGroupDto(
    val id: Int,
    val name: String,
    val emoji: String,
    val description: String? = null,
    val budget: String? = null,
    val currency: String,
    val member_count: String,
    val total_spent: String,
)

@Serializable
data class GroupsResponse(val groups: List<ExpenseGroupDto>)

@Serializable
data class GroupResponse(val group: ExpenseGroupDto)

@Serializable
data class GroupMemberDto(val id: Int, val group_id: Int, val name: String, val email: String? = null)

@Serializable
data class GroupSplitShareDto(
    val id: Int,
    val split_id: Int,
    val member: String,
    val amount: Double,
    val settled: Boolean,
    val settled_at: String? = null,
)

@Serializable
data class GroupSplitDto(
    val id: Int,
    val group_id: Int,
    val description: String,
    val total_amount: String,
    val paid_by: String,
    val date: String,
    val shares: List<GroupSplitShareDto> = emptyList(),
)

@Serializable
data class GroupDetailResponse(
    val group: ExpenseGroupDto,
    val members: List<GroupMemberDto>,
    val transactions: List<TransactionDto>,
    val splits: List<GroupSplitDto>,
)

@Serializable
data class GroupMemberInput(val name: String, val email: String? = null)

@Serializable
data class CreateGroupRequest(
    val name: String,
    val emoji: String = "👥",
    val description: String? = null,
    val budget: Double? = null,
    val currency: String = "INR",
    val members: List<GroupMemberInput> = emptyList(),
)

@Serializable
data class UpdateGroupRequest(
    val name: String? = null,
    val emoji: String? = null,
    val description: String? = null,
    val budget: Double? = null,
    val currency: String? = null,
    val members: List<GroupMemberInput>? = null,
)

@Serializable
data class SplitShareInput(val member: String, val amount: Double)

@Serializable
data class CreateSplitRequest(
    val description: String,
    val total_amount: Double,
    val paid_by: String,
    val date: String? = null,
    val shares: List<SplitShareInput>,
)

@Serializable
data class SplitResponse(val split: GroupSplitDto)

@Serializable
data class SettlementDto(val from: String, val to: String, val amount: Double)

@Serializable
data class SettlementsResponse(val settlements: List<SettlementDto>)
