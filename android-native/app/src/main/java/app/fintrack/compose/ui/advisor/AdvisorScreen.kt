package app.fintrack.compose.ui.advisor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.AgentConversationSummaryDto
import app.fintrack.compose.data.api.AgentMessageDto
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdvisorScreen(viewModel: AdvisorViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()

    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.size - 1)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space3),
        ) {
            Text("Fin", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Row {
                IconButton(onClick = viewModel::startNewChat) {
                    Icon(Icons.Filled.Add, contentDescription = "New chat")
                }
                IconButton(onClick = viewModel::openHistory) {
                    Icon(Icons.Filled.History, contentDescription = "Chat history")
                }
            }
        }

        if (state.messages.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().weight(1f), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "Ask Fin anything about your money",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium,
                    )
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                    Text(
                        "Debt, investments, tax, or budgets — Fin knows your numbers.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space2),
                modifier = Modifier.fillMaxWidth().weight(1f),
            ) {
                items(state.messages) { message ->
                    MessageBubble(message)
                    Spacer(Modifier.height(FinTrackSpacing.space3))
                }
                if (state.isSending) {
                    item { TypingBubble() }
                }
            }
        }

        state.error?.let {
            Text(
                it,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space1),
            )
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space4),
        ) {
            OutlinedTextField(
                value = state.input,
                onValueChange = viewModel::updateInput,
                placeholder = { Text("Message Fin…") },
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(FinTrackSpacing.space2))
            IconButton(
                onClick = viewModel::send,
                enabled = state.input.isNotBlank() && !state.isSending,
            ) {
                Icon(Icons.Filled.ArrowUpward, contentDescription = "Send", tint = FinTrackColors.Dark.accent)
            }
        }
    }

    if (state.showHistory) {
        HistorySheet(
            conversations = state.conversations,
            isLoading = state.isLoadingHistory,
            onDismiss = viewModel::closeHistory,
            onSelect = viewModel::openConversation,
            onDelete = viewModel::deleteConversation,
        )
    }
}

@Composable
private fun MessageBubble(message: AgentMessageDto) {
    val isUser = message.role == "user"
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = if (isUser) FinTrackColors.Dark.accent.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surface,
            modifier = Modifier.widthIn(max = 300.dp),
        ) {
            Text(
                message.content,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space3),
            )
        }
    }
}

@Composable
private fun TypingBubble() {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
        Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface) {
            CircularProgressIndicator(
                modifier = Modifier.padding(FinTrackSpacing.space4).height(16.dp).widthIn(max = 16.dp),
                strokeWidth = 2.dp,
                color = FinTrackColors.Dark.accent,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HistorySheet(
    conversations: List<AgentConversationSummaryDto>,
    isLoading: Boolean,
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text("Chat History", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            when {
                isLoading -> Box(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space6), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                conversations.isEmpty() -> Text(
                    "No past conversations yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> conversations.forEach { conversation ->
                    ConversationRow(conversation, onSelect = { onSelect(conversation.id) }, onDelete = { onDelete(conversation.id) })
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }
    }
}

@Composable
private fun ConversationRow(conversation: AgentConversationSummaryDto, onSelect: () -> Unit, onDelete: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        onClick = onSelect,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3)) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    conversation.title?.takeIf { it.isNotBlank() } ?: "Untitled chat",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    "${conversation.message_count} messages",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
