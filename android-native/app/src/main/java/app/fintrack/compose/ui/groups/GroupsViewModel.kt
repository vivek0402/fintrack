package app.fintrack.compose.ui.groups

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.ExpenseGroupDto
import app.fintrack.compose.data.api.GroupDetailResponse
import app.fintrack.compose.data.api.GroupMemberInput
import app.fintrack.compose.data.api.GroupSplitDto
import app.fintrack.compose.data.api.SettlementDto
import app.fintrack.compose.data.api.SplitShareInput
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.groups.GroupsRepository
import app.fintrack.compose.data.transactions.TransactionsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class SplitMode { EQUAL, CUSTOM }

data class GroupMemberFieldState(val name: String = "", val email: String = "")

data class GroupFormState(
    val editingId: Int? = null,
    val name: String = "",
    val emoji: String = "👥",
    val description: String = "",
    val budget: String = "",
    val members: List<GroupMemberFieldState> = listOf(GroupMemberFieldState()),
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class SplitFormState(
    val editingId: Int? = null,
    val description: String = "",
    val totalAmount: String = "",
    val paidBy: String = "Me",
    val date: String = LocalDate.now().toString(),
    val mode: SplitMode = SplitMode.EQUAL,
    val participants: List<String> = listOf("Me"),
    val included: Set<String> = setOf("Me"),
    val customAmounts: Map<String, String> = emptyMap(),
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class GroupsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val groups: List<ExpenseGroupDto> = emptyList(),
    val selectedGroupId: Int? = null,
    val detail: GroupDetailResponse? = null,
    val isLoadingDetail: Boolean = false,
    val selectedTab: Int = 0,
    val settlements: List<SettlementDto>? = null,
    val isLoadingSettlements: Boolean = false,
    val showGroupForm: Boolean = false,
    val groupForm: GroupFormState = GroupFormState(),
    val showSplitForm: Boolean = false,
    val splitForm: SplitFormState = SplitFormState(),
    val showLinkSearch: Boolean = false,
    val linkSearchQuery: String = "",
    val linkSearchResults: List<TransactionDto> = emptyList(),
    val isSearching: Boolean = false,
    val actionError: String? = null,
)

@HiltViewModel
class GroupsViewModel @Inject constructor(
    private val groupsRepository: GroupsRepository,
    private val transactionsRepository: TransactionsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(GroupsUiState())
    val uiState: StateFlow<GroupsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val groups = groupsRepository.getAll()
                _uiState.update { it.copy(isLoading = false, groups = groups) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load your groups.")) }
            }
        }
    }

    fun openGroup(id: Int) {
        _uiState.update { it.copy(selectedGroupId = id, selectedTab = 0, detail = null, settlements = null, isLoadingDetail = true) }
        viewModelScope.launch {
            try {
                val detail = groupsRepository.getDetail(id)
                _uiState.update { it.copy(isLoadingDetail = false, detail = detail) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoadingDetail = false, error = e.toUserMessage("Couldn't load this group.")) }
            }
        }
    }

    fun closeGroup() = _uiState.update { it.copy(selectedGroupId = null, detail = null, settlements = null) }

    fun selectTab(index: Int) {
        _uiState.update { it.copy(selectedTab = index) }
        val groupId = _uiState.value.selectedGroupId
        if (index == 2 && groupId != null && _uiState.value.settlements == null) {
            loadSettlements(groupId)
        }
    }

    private fun loadSettlements(groupId: Int) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingSettlements = true) }
            try {
                val settlements = groupsRepository.getSettlements(groupId)
                _uiState.update { it.copy(isLoadingSettlements = false, settlements = settlements) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoadingSettlements = false, actionError = e.toUserMessage("Couldn't load settlements.")) }
            }
        }
    }

    private fun refreshDetail() {
        val id = _uiState.value.selectedGroupId ?: return
        viewModelScope.launch {
            try {
                val detail = groupsRepository.getDetail(id)
                _uiState.update { it.copy(detail = detail) }
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't refresh this group.")) }
            }
        }
        loadSettlements(id)
    }

    // ─── Group form ─────────────────────────────────────────────────────

    fun openCreateGroupForm() = _uiState.update { it.copy(showGroupForm = true, groupForm = GroupFormState()) }

    fun openEditGroupForm(group: ExpenseGroupDto) {
        val members = _uiState.value.detail?.members?.map { GroupMemberFieldState(it.name, it.email.orEmpty()) }
            ?: listOf(GroupMemberFieldState())
        _uiState.update {
            it.copy(
                showGroupForm = true,
                groupForm = GroupFormState(
                    editingId = group.id,
                    name = group.name,
                    emoji = group.emoji,
                    description = group.description.orEmpty(),
                    budget = group.budget.orEmpty(),
                    members = members.ifEmpty { listOf(GroupMemberFieldState()) },
                ),
            )
        }
    }

    fun closeGroupForm() = _uiState.update { it.copy(showGroupForm = false) }

    fun updateGroupForm(transform: (GroupFormState) -> GroupFormState) =
        _uiState.update { it.copy(groupForm = transform(it.groupForm).copy(error = null)) }

    fun addMemberField() = updateGroupForm { it.copy(members = it.members + GroupMemberFieldState()) }

    fun removeMemberField(index: Int) = updateGroupForm { it.copy(members = it.members.filterIndexed { i, _ -> i != index }) }

    fun updateMemberField(index: Int, transform: (GroupMemberFieldState) -> GroupMemberFieldState) = updateGroupForm {
        it.copy(members = it.members.mapIndexed { i, m -> if (i == index) transform(m) else m })
    }

    fun saveGroup() {
        val form = _uiState.value.groupForm
        if (form.name.isBlank()) {
            updateGroupForm { it.copy(error = "Group name is required.") }
            return
        }
        val members = form.members.filter { it.name.isNotBlank() }.map { GroupMemberInput(it.name.trim(), it.email.trim().ifBlank { null }) }
        val budget = form.budget.toDoubleOrNull()
        viewModelScope.launch {
            updateGroupForm { it.copy(isSaving = true, error = null) }
            try {
                if (form.editingId != null) {
                    groupsRepository.update(form.editingId, form.name.trim(), form.emoji, form.description.trim().ifBlank { null }, budget, members)
                } else {
                    groupsRepository.create(form.name.trim(), form.emoji, form.description.trim().ifBlank { null }, budget, members)
                }
                _uiState.update { it.copy(showGroupForm = false) }
                load()
                if (form.editingId != null) refreshDetail()
            } catch (e: Exception) {
                updateGroupForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save this group.")) }
            }
        }
    }

    fun deleteGroup(id: Int) {
        viewModelScope.launch {
            try {
                groupsRepository.delete(id)
                if (_uiState.value.selectedGroupId == id) closeGroup()
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't delete this group.")) }
            }
        }
    }

    // ─── Link transaction ───────────────────────────────────────────────

    fun openLinkSearch() = _uiState.update { it.copy(showLinkSearch = true, linkSearchQuery = "", linkSearchResults = emptyList()) }
    fun closeLinkSearch() = _uiState.update { it.copy(showLinkSearch = false) }

    fun updateLinkSearchQuery(query: String) {
        _uiState.update { it.copy(linkSearchQuery = query) }
        if (query.trim().length < 2) {
            _uiState.update { it.copy(linkSearchResults = emptyList()) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSearching = true) }
            try {
                val results = transactionsRepository.search(query.trim())
                _uiState.update { it.copy(isSearching = false, linkSearchResults = results) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isSearching = false, actionError = e.toUserMessage("Search failed.")) }
            }
        }
    }

    fun linkTransaction(transactionId: String) {
        val groupId = _uiState.value.selectedGroupId ?: return
        viewModelScope.launch {
            try {
                groupsRepository.linkTransaction(groupId, transactionId)
                _uiState.update { it.copy(showLinkSearch = false) }
                refreshDetail()
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't link this transaction.")) }
            }
        }
    }

    fun unlinkTransaction(transactionId: String) {
        val groupId = _uiState.value.selectedGroupId ?: return
        viewModelScope.launch {
            try {
                groupsRepository.unlinkTransaction(groupId, transactionId)
                refreshDetail()
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't unlink this transaction.")) }
            }
        }
    }

    // ─── Splits ─────────────────────────────────────────────────────────

    private fun allParticipantNames(): List<String> {
        val members = _uiState.value.detail?.members?.map { it.name } ?: emptyList()
        return listOf("Me") + members
    }

    fun openCreateSplitForm() {
        val participants = allParticipantNames()
        _uiState.update {
            it.copy(
                showSplitForm = true,
                splitForm = SplitFormState(participants = participants, included = participants.toSet()),
            )
        }
    }

    fun openEditSplitForm(split: GroupSplitDto) {
        val participants = allParticipantNames()
        val includedFromShares = split.shares.map { it.member }.toSet()
        _uiState.update {
            it.copy(
                showSplitForm = true,
                splitForm = SplitFormState(
                    editingId = split.id,
                    description = split.description,
                    totalAmount = split.total_amount,
                    paidBy = split.paid_by,
                    date = split.date.take(10),
                    mode = SplitMode.CUSTOM,
                    participants = participants,
                    included = includedFromShares,
                    customAmounts = split.shares.associate { it.member to it.amount.toString() },
                ),
            )
        }
    }

    fun closeSplitForm() = _uiState.update { it.copy(showSplitForm = false) }

    fun updateSplitForm(transform: (SplitFormState) -> SplitFormState) =
        _uiState.update { it.copy(splitForm = transform(it.splitForm).copy(error = null)) }

    fun setSplitMode(mode: SplitMode) = updateSplitForm { it.copy(mode = mode) }

    fun toggleParticipant(name: String) = updateSplitForm {
        val newIncluded = if (it.included.contains(name)) it.included - name else it.included + name
        it.copy(included = newIncluded)
    }

    fun updateCustomAmount(name: String, value: String) = updateSplitForm {
        it.copy(customAmounts = it.customAmounts + (name to value))
    }

    fun saveSplit() {
        val groupId = _uiState.value.selectedGroupId ?: return
        val form = _uiState.value.splitForm
        val total = form.totalAmount.toDoubleOrNull()
        val included = form.participants.filter { form.included.contains(it) }

        if (form.description.isBlank() || total == null || total <= 0 || included.isEmpty()) {
            updateSplitForm { it.copy(error = "Fill in a description, a valid total, and at least one participant.") }
            return
        }

        val shares: List<SplitShareInput> = if (form.mode == SplitMode.EQUAL) {
            val each = Math.round((total / included.size) * 100) / 100.0
            val remainder = Math.round((total - each * (included.size - 1)) * 100) / 100.0
            included.mapIndexed { index, name -> SplitShareInput(name, if (index == included.lastIndex) remainder else each) }
        } else {
            val parsed = included.map { name -> name to (form.customAmounts[name]?.toDoubleOrNull() ?: 0.0) }
            val sum = parsed.sumOf { it.second }
            if (Math.abs(sum - total) > 0.5) {
                updateSplitForm { it.copy(error = "Custom amounts (${"%.2f".format(sum)}) don't add up to the total (${"%.2f".format(total)}).") }
                return
            }
            parsed.map { SplitShareInput(it.first, it.second) }
        }

        viewModelScope.launch {
            updateSplitForm { it.copy(isSaving = true, error = null) }
            try {
                if (form.editingId != null) {
                    groupsRepository.updateSplit(groupId, form.editingId, form.description.trim(), total, form.paidBy, form.date, shares)
                } else {
                    groupsRepository.addSplit(groupId, form.description.trim(), total, form.paidBy, form.date, shares)
                }
                _uiState.update { it.copy(showSplitForm = false) }
                refreshDetail()
            } catch (e: Exception) {
                updateSplitForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save this split.")) }
            }
        }
    }

    fun toggleShareSettle(splitId: Int, shareId: Int) {
        val groupId = _uiState.value.selectedGroupId ?: return
        viewModelScope.launch {
            try {
                groupsRepository.toggleShareSettle(groupId, splitId, shareId)
                refreshDetail()
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't update settlement.")) }
            }
        }
    }

    fun clearActionError() = _uiState.update { it.copy(actionError = null) }
}
