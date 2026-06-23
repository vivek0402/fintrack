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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.AgentConversationSummaryDto
import app.fintrack.compose.data.api.AgentMessageDto
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

private val STARTER_PROMPTS = listOf(
    "Which loan should I pay off first?",
    "How can I save more tax this year?",
    "Where am I overspending this month?",
    "Am I on track for my FIRE goal?",
)

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
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = FinTrackSpacing.space5)) {
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
                    Spacer(Modifier.height(FinTrackSpacing.space5))
                    Column(verticalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
                        STARTER_PROMPTS.forEach { prompt ->
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = FinTrackColors.Dark.accent.copy(alpha = 0.06f),
                                onClick = { viewModel.sendStarterPrompt(prompt) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(
                                    prompt,
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.padding(horizontal = FinTrackSpacing.space3, vertical = FinTrackSpacing.space3),
                                )
                            }
                        }
                    }
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
            if (isUser) {
                Text(
                    message.content,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space3),
                )
            } else {
                ChatMarkdown(message.content, modifier = Modifier.padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space3))
            }
        }
    }
}

private sealed class MdBlock {
    data class Paragraph(val lines: List<AnnotatedString>) : MdBlock()
    data class BulletList(val items: List<AnnotatedString>) : MdBlock()
    data class NumberedList(val items: List<AnnotatedString>) : MdBlock()
}

private val BULLET_RE = Regex("""^\s*[-*]\s+""")
private val NUMBERED_RE = Regex("""^\s*\d+\.\s+""")
private val BOLD_RE = Regex("""\*\*[^*]+\*\*""")

private fun renderInline(text: String): AnnotatedString = buildAnnotatedString {
    var lastIndex = 0
    for (match in BOLD_RE.findAll(text)) {
        append(text.substring(lastIndex, match.range.first))
        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(match.value.removeSurrounding("**")) }
        lastIndex = match.range.last + 1
    }
    append(text.substring(lastIndex))
}

private fun parseChatMarkdown(content: String): List<MdBlock> {
    val lines = content.split("\n")
    val blocks = mutableListOf<MdBlock>()
    var i = 0
    while (i < lines.size) {
        val line = lines[i]
        if (line.isBlank()) {
            i++
            continue
        }
        if (BULLET_RE.containsMatchIn(line)) {
            val items = mutableListOf<AnnotatedString>()
            while (i < lines.size && BULLET_RE.containsMatchIn(lines[i])) {
                items.add(renderInline(BULLET_RE.replace(lines[i], "")))
                i++
            }
            blocks.add(MdBlock.BulletList(items))
            continue
        }
        if (NUMBERED_RE.containsMatchIn(line)) {
            val items = mutableListOf<AnnotatedString>()
            while (i < lines.size && NUMBERED_RE.containsMatchIn(lines[i])) {
                items.add(renderInline(NUMBERED_RE.replace(lines[i], "")))
                i++
            }
            blocks.add(MdBlock.NumberedList(items))
            continue
        }
        val paraLines = mutableListOf<AnnotatedString>()
        while (i < lines.size && lines[i].isNotBlank() && !BULLET_RE.containsMatchIn(lines[i]) && !NUMBERED_RE.containsMatchIn(lines[i])) {
            paraLines.add(renderInline(lines[i]))
            i++
        }
        blocks.add(MdBlock.Paragraph(paraLines))
    }
    return blocks
}

@Composable
private fun ChatMarkdown(content: String, modifier: Modifier = Modifier) {
    val blocks = remember(content) { parseChatMarkdown(content) }
    Column(modifier = modifier) {
        blocks.forEachIndexed { index, block ->
            when (block) {
                is MdBlock.Paragraph -> Text(
                    buildAnnotatedString {
                        block.lines.forEachIndexed { lineIdx, line ->
                            append(line)
                            if (lineIdx < block.lines.size - 1) append("\n")
                        }
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
                is MdBlock.BulletList -> Column {
                    block.items.forEach { item ->
                        Row {
                            Text("•  ", style = MaterialTheme.typography.bodyMedium)
                            Text(item, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
                is MdBlock.NumberedList -> Column {
                    block.items.forEachIndexed { itemIdx, item ->
                        Row {
                            Text("${itemIdx + 1}.  ", style = MaterialTheme.typography.bodyMedium)
                            Text(item, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            if (index < blocks.size - 1) Spacer(Modifier.height(4.dp))
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
