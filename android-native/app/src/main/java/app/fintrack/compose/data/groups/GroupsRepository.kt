package app.fintrack.compose.data.groups

import app.fintrack.compose.data.api.CreateGroupRequest
import app.fintrack.compose.data.api.CreateSplitRequest
import app.fintrack.compose.data.api.ExpenseGroupDto
import app.fintrack.compose.data.api.GroupDetailResponse
import app.fintrack.compose.data.api.GroupMemberInput
import app.fintrack.compose.data.api.GroupSplitDto
import app.fintrack.compose.data.api.GroupsApiService
import app.fintrack.compose.data.api.SettlementDto
import app.fintrack.compose.data.api.SplitShareInput
import app.fintrack.compose.data.api.UpdateGroupRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class GroupsRepository @Inject constructor(
    private val api: GroupsApiService,
) {
    suspend fun getAll(): List<ExpenseGroupDto> = api.getAll().groups

    suspend fun create(name: String, emoji: String, description: String?, budget: Double?, members: List<GroupMemberInput>): ExpenseGroupDto =
        api.create(CreateGroupRequest(name, emoji, description, budget, members = members)).group

    suspend fun getDetail(id: Int): GroupDetailResponse = api.getDetail(id)

    suspend fun update(id: Int, name: String, emoji: String, description: String?, budget: Double?, members: List<GroupMemberInput>): ExpenseGroupDto =
        api.update(id, UpdateGroupRequest(name, emoji, description, budget, members = members)).group

    suspend fun delete(id: Int) {
        api.delete(id)
    }

    suspend fun linkTransaction(groupId: Int, transactionId: String) {
        api.linkTransaction(groupId, transactionId)
    }

    suspend fun unlinkTransaction(groupId: Int, transactionId: String) {
        api.unlinkTransaction(groupId, transactionId)
    }

    suspend fun addSplit(groupId: Int, description: String, totalAmount: Double, paidBy: String, date: String, shares: List<SplitShareInput>): GroupSplitDto =
        api.addSplit(groupId, CreateSplitRequest(description, totalAmount, paidBy, date, shares)).split

    suspend fun updateSplit(groupId: Int, splitId: Int, description: String, totalAmount: Double, paidBy: String, date: String, shares: List<SplitShareInput>): GroupSplitDto =
        api.updateSplit(groupId, splitId, CreateSplitRequest(description, totalAmount, paidBy, date, shares)).split

    suspend fun toggleShareSettle(groupId: Int, splitId: Int, shareId: Int) {
        api.toggleShareSettle(groupId, splitId, shareId)
    }

    suspend fun getSettlements(id: Int): List<SettlementDto> = api.getSettlements(id).settlements
}
