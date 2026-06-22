package app.fintrack.compose.ui.groups

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.ExpenseGroupDto
import app.fintrack.compose.data.api.GroupSplitDto
import app.fintrack.compose.data.api.GroupSplitShareDto
import app.fintrack.compose.data.api.SettlementDto
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

private val GROUP_TABS = listOf("Transactions", "Splits", "Settle Up")

@Composable
fun GroupsScreen(viewModel: GroupsViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    var pendingDeleteGroupId by remember { mutableStateOf<Int?>(null) }

    Box(modifier = Modifier.fillMaxSize()) {
        if (state.selectedGroupId != null) {
            val group = state.groups.find { it.id == state.selectedGroupId }
            GroupDetailContent(
                state = state,
                groupName = group?.name ?: state.detail?.group?.name.orEmpty(),
                groupEmoji = group?.emoji ?: state.detail?.group?.emoji.orEmpty(),
                viewModel = viewModel,
            )
        } else {
            when {
                state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                state.error != null -> Text(
                    state.error.orEmpty(),
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
                )
                state.groups.isEmpty() -> Text(
                    "No groups yet. Create one to start splitting expenses.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
                )
                else -> LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
                    item {
                        Text("Groups", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(FinTrackSpacing.space4))
                    }
                    items(state.groups, key = { it.id }) { group ->
                        GroupCard(
                            group = group,
                            onClick = { viewModel.openGroup(group.id) },
                            onEdit = { viewModel.openEditGroupForm(group) },
                            onDelete = { pendingDeleteGroupId = group.id },
                        )
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                    }
                }
            }
            FloatingActionButton(
                onClick = viewModel::openCreateGroupForm,
                modifier = Modifier.align(Alignment.BottomEnd).padding(FinTrackSpacing.space5),
            ) {
                Icon(Icons.Filled.Add, contentDescription = "New group")
            }
        }
    }

    if (state.showGroupForm) {
        GroupFormSheet(state.groupForm, onDismiss = viewModel::closeGroupForm, viewModel = viewModel)
    }
    if (state.showSplitForm) {
        SplitFormSheet(state.splitForm, onDismiss = viewModel::closeSplitForm, viewModel = viewModel)
    }
    if (state.showLinkSearch) {
        LinkSearchSheet(state, viewModel)
    }

    pendingDeleteGroupId?.let { id ->
        AlertDialog(
            onDismissRequest = { pendingDeleteGroupId = null },
            title = { Text("Delete group?") },
            text = { Text("This won't delete linked transactions, but splits and settlements will be removed.") },
            confirmButton = { TextButton(onClick = { viewModel.deleteGroup(id); pendingDeleteGroupId = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { pendingDeleteGroupId = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun GroupCard(group: ExpenseGroupDto, onClick: () -> Unit, onEdit: () -> Unit, onDelete: () -> Unit) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space4)) {
            Text(group.emoji, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.width(FinTrackSpacing.space3))
            Column(modifier = Modifier.weight(1f)) {
                Text(group.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                Text(
                    "${group.member_count} members · ${formatInr(group.total_spent.toDoubleOrNull() ?: 0.0)} spent",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onEdit) { Icon(Icons.Filled.Edit, contentDescription = "Edit", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
private fun GroupDetailContent(state: GroupsUiState, groupName: String, groupEmoji: String, viewModel: GroupsViewModel) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3)) {
            IconButton(onClick = viewModel::closeGroup) { Icon(Icons.Filled.ArrowBack, contentDescription = "Back") }
            Text("$groupEmoji $groupName", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            state.detail?.group?.let { group ->
                IconButton(onClick = { viewModel.openEditGroupForm(group) }) {
                    Icon(Icons.Filled.Edit, contentDescription = "Edit group", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        TabRow(selectedTabIndex = state.selectedTab) {
            GROUP_TABS.forEachIndexed { index, label ->
                Tab(selected = state.selectedTab == index, onClick = { viewModel.selectTab(index) }, text = { Text(label) })
            }
        }

        when {
            state.isLoadingDetail -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.detail == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Couldn't load this group.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> Box(modifier = Modifier.fillMaxSize()) {
                when (state.selectedTab) {
                    0 -> TransactionsTab(state.detail.transactions, onUnlink = viewModel::unlinkTransaction, onAddExisting = viewModel::openLinkSearch)
                    1 -> SplitsTab(
                        splits = state.detail.splits,
                        onAddSplit = viewModel::openCreateSplitForm,
                        onEditSplit = viewModel::openEditSplitForm,
                        onToggleSettle = viewModel::toggleShareSettle,
                    )
                    2 -> SettleUpTab(state.settlements, state.isLoadingSettlements)
                }
            }
        }
    }
}

@Composable
private fun TransactionsTab(transactions: List<TransactionDto>, onUnlink: (String) -> Unit, onAddExisting: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize()) {
        if (transactions.isEmpty()) {
            Text(
                "No transactions linked yet.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
        } else {
            LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
                items(transactions, key = { it.id }) { tx ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2)) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(tx.description, style = MaterialTheme.typography.bodyMedium)
                            Text(tx.date.take(10), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(formatInr(tx.amount.toDoubleOrNull() ?: 0.0), style = MaterialTheme.typography.bodyMedium)
                        IconButton(onClick = { onUnlink(tx.id) }) {
                            Icon(Icons.Filled.Close, contentDescription = "Unlink", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
        FloatingActionButton(onClick = onAddExisting, modifier = Modifier.align(Alignment.BottomEnd).padding(FinTrackSpacing.space5)) {
            Icon(Icons.Filled.Add, contentDescription = "Link transaction")
        }
    }
}

@Composable
private fun SplitsTab(splits: List<GroupSplitDto>, onAddSplit: () -> Unit, onEditSplit: (GroupSplitDto) -> Unit, onToggleSettle: (Int, Int) -> Unit) {
    Box(modifier = Modifier.fillMaxSize()) {
        if (splits.isEmpty()) {
            Text(
                "No splits logged yet.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
            )
        } else {
            LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
                items(splits, key = { it.id }) { split ->
                    SplitCard(split, onClick = { onEditSplit(split) }, onToggleSettle = onToggleSettle)
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                }
            }
        }
        FloatingActionButton(onClick = onAddSplit, modifier = Modifier.align(Alignment.BottomEnd).padding(FinTrackSpacing.space5)) {
            Icon(Icons.Filled.Add, contentDescription = "Add split")
        }
    }
}

@Composable
private fun SplitCard(split: GroupSplitDto, onClick: () -> Unit, onToggleSettle: (Int, Int) -> Unit) {
    val allSettled = split.shares.all { it.settled }
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(split.description, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    Text("Paid by ${split.paid_by} · ${split.date.take(10)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(formatInr(split.total_amount.toDoubleOrNull() ?: 0.0), style = MaterialTheme.typography.bodyMedium)
                    Text(
                        if (allSettled) "Settled" else "Pending",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (allSettled) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp,
                    )
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            split.shares.forEach { share -> ShareRow(share, onToggle = { onToggleSettle(split.id, share.id) }) }
        }
    }
}

@Composable
private fun ShareRow(share: GroupSplitShareDto, onToggle: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
        Text(share.member, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
        Text(formatInr(share.amount), style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.width(FinTrackSpacing.space2))
        TextButton(onClick = onToggle) { Text(if (share.settled) "Settled" else "Settle Up") }
    }
}

@Composable
private fun SettleUpTab(settlements: List<SettlementDto>?, isLoading: Boolean) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        when {
            isLoading -> CircularProgressIndicator()
            settlements == null -> Text("Couldn't load settlements.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            settlements.isEmpty() -> Text("All settled up!", style = MaterialTheme.typography.titleMedium, color = FinTrackColors.Dark.colorInc)
            else -> LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4), modifier = Modifier.fillMaxSize()) {
                items(settlements) { settlement ->
                    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3)) {
                            Text("${settlement.from} owes ${settlement.to}", style = MaterialTheme.typography.bodyMedium)
                            Text(formatInr(settlement.amount), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                        }
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                }
            }
        }
    }
}

// ─── Forms ──────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GroupFormSheet(form: GroupFormState, onDismiss: () -> Unit, viewModel: GroupsViewModel) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 600.dp).padding(FinTrackSpacing.space5)) {
            Text(if (form.editingId != null) "Edit Group" else "New Group", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                OutlinedTextField(
                    value = form.emoji,
                    onValueChange = { v -> viewModel.updateGroupForm { it.copy(emoji = v) } },
                    label = { Text("Emoji") },
                    singleLine = true,
                    modifier = Modifier.width(90.dp),
                )
                OutlinedTextField(
                    value = form.name,
                    onValueChange = { v -> viewModel.updateGroupForm { it.copy(name = v) } },
                    label = { Text("Group name") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.description,
                onValueChange = { v -> viewModel.updateGroupForm { it.copy(description = v) } },
                label = { Text("Description (optional)") },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.budget,
                onValueChange = { v -> viewModel.updateGroupForm { it.copy(budget = v) } },
                label = { Text("Budget (optional)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space4))

            Text("Members", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            form.members.forEachIndexed { index, member ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(bottom = FinTrackSpacing.space2)) {
                    OutlinedTextField(
                        value = member.name,
                        onValueChange = { v -> viewModel.updateMemberField(index) { it.copy(name = v) } },
                        label = { Text("Name") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(FinTrackSpacing.space2))
                    OutlinedTextField(
                        value = member.email,
                        onValueChange = { v -> viewModel.updateMemberField(index) { it.copy(email = v) } },
                        label = { Text("Email (optional)") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = { viewModel.removeMemberField(index) }) {
                        Icon(Icons.Filled.Close, contentDescription = "Remove member")
                    }
                }
            }
            TextButton(onClick = viewModel::addMemberField) { Text("+ Add Member") }

            form.error?.let {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(FinTrackSpacing.space5))
            Button(onClick = viewModel::saveGroup, enabled = !form.isSaving, modifier = Modifier.fillMaxWidth()) {
                if (form.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text(if (form.editingId != null) "Save Changes" else "Create Group")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SplitFormSheet(form: SplitFormState, onDismiss: () -> Unit, viewModel: GroupsViewModel) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 640.dp).padding(FinTrackSpacing.space5)) {
            Text(if (form.editingId != null) "Edit Split" else "Add Split", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = form.description,
                onValueChange = { v -> viewModel.updateSplitForm { it.copy(description = v) } },
                label = { Text("Description") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                OutlinedTextField(
                    value = form.totalAmount,
                    onValueChange = { v -> viewModel.updateSplitForm { it.copy(totalAmount = v) } },
                    label = { Text("Total amount") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.date,
                    onValueChange = { v -> viewModel.updateSplitForm { it.copy(date = v) } },
                    label = { Text("Date (YYYY-MM-DD)") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            Text("Paid by", style = MaterialTheme.typography.labelMedium)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                form.participants.forEach { name ->
                    FilterChip(selected = form.paidBy == name, onClick = { viewModel.updateSplitForm { it.copy(paidBy = name) } }, label = { Text(name) })
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))

            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
                FilterChip(selected = form.mode == SplitMode.EQUAL, onClick = { viewModel.setSplitMode(SplitMode.EQUAL) }, label = { Text("Equal Split") })
                FilterChip(selected = form.mode == SplitMode.CUSTOM, onClick = { viewModel.setSplitMode(SplitMode.CUSTOM) }, label = { Text("Custom Split") })
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            Text("Participants", style = MaterialTheme.typography.labelMedium)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            val total = form.totalAmount.toDoubleOrNull() ?: 0.0
            val includedList = form.participants.filter { form.included.contains(it) }
            val equalShare = if (includedList.isNotEmpty()) total / includedList.size else 0.0

            form.participants.forEach { name ->
                val included = form.included.contains(name)
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
                    FilterChip(selected = included, onClick = { viewModel.toggleParticipant(name) }, label = { Text(name) })
                    Spacer(Modifier.width(FinTrackSpacing.space2))
                    if (included) {
                        if (form.mode == SplitMode.EQUAL) {
                            Text(formatInr(equalShare), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            OutlinedTextField(
                                value = form.customAmounts[name].orEmpty(),
                                onValueChange = { v -> viewModel.updateCustomAmount(name, v) },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }

            if (form.mode == SplitMode.CUSTOM) {
                val sum = includedList.sumOf { form.customAmounts[it]?.toDoubleOrNull() ?: 0.0 }
                Spacer(Modifier.height(FinTrackSpacing.space2))
                Text(
                    "${formatInr(sum)} of ${formatInr(total)} allocated",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (Math.abs(sum - total) < 0.5) FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp,
                )
            }

            form.error?.let {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(FinTrackSpacing.space5))
            Button(onClick = viewModel::saveSplit, enabled = !form.isSaving, modifier = Modifier.fillMaxWidth()) {
                if (form.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text(if (form.editingId != null) "Save Changes" else "Add Split")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LinkSearchSheet(state: GroupsUiState, viewModel: GroupsViewModel) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = viewModel::closeLinkSearch, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 500.dp).padding(FinTrackSpacing.space5)) {
            Text("Link Existing Transaction", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = state.linkSearchQuery,
                onValueChange = viewModel::updateLinkSearchQuery,
                label = { Text("Search by description") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            when {
                state.isSearching -> CircularProgressIndicator(modifier = Modifier.padding(FinTrackSpacing.space3))
                state.linkSearchResults.isEmpty() && state.linkSearchQuery.length >= 2 -> Text(
                    "No matching transactions.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> LazyColumn {
                    items(state.linkSearchResults, key = { it.id }) { tx ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth().clickable { viewModel.linkTransaction(tx.id) }.padding(vertical = FinTrackSpacing.space2),
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(tx.description, style = MaterialTheme.typography.bodyMedium)
                                Text(tx.date.take(10), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(formatInr(tx.amount.toDoubleOrNull() ?: 0.0), style = MaterialTheme.typography.bodyMedium)
                        }
                        HorizontalDivider()
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
    }
}
