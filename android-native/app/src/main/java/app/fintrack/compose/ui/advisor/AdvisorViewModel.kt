package app.fintrack.compose.ui.advisor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.agents.AgentsRepository
import app.fintrack.compose.data.api.AgentConversationSummaryDto
import app.fintrack.compose.data.api.AgentMessageDto
import app.fintrack.compose.data.api.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AdvisorUiState(
    val messages: List<AgentMessageDto> = emptyList(),
    val conversationId: String? = null,
    val input: String = "",
    val isSending: Boolean = false,
    val error: String? = null,
    val showHistory: Boolean = false,
    val isLoadingHistory: Boolean = false,
    val conversations: List<AgentConversationSummaryDto> = emptyList(),
)

@HiltViewModel
class AdvisorViewModel @Inject constructor(
    private val agentsRepository: AgentsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AdvisorUiState())
    val uiState: StateFlow<AdvisorUiState> = _uiState.asStateFlow()

    fun updateInput(value: String) = _uiState.update { it.copy(input = value, error = null) }

    fun sendStarterPrompt(prompt: String) {
        updateInput(prompt)
        send()
    }

    fun send() {
        val state = _uiState.value
        val text = state.input.trim()
        if (text.isBlank() || state.isSending) return

        val userMessage = AgentMessageDto(role = "user", content = text, timestamp = Instant.now().toString())
        _uiState.update {
            it.copy(messages = it.messages + userMessage, input = "", isSending = true, error = null)
        }

        viewModelScope.launch {
            try {
                val response = agentsRepository.sendMessage(text, state.conversationId)
                _uiState.update {
                    it.copy(isSending = false, conversationId = response.conversation_id, messages = response.messages)
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSending = false,
                        messages = it.messages.dropLast(1),
                        input = text,
                        error = e.toUserMessage("Fin couldn't respond. Try again."),
                    )
                }
            }
        }
    }

    fun startNewChat() = _uiState.update { it.copy(messages = emptyList(), conversationId = null, error = null, showHistory = false) }

    fun openHistory() {
        _uiState.update { it.copy(showHistory = true, isLoadingHistory = true) }
        viewModelScope.launch {
            try {
                val conversations = agentsRepository.getConversations()
                _uiState.update { it.copy(isLoadingHistory = false, conversations = conversations) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoadingHistory = false, error = e.toUserMessage("Couldn't load chat history.")) }
            }
        }
    }

    fun closeHistory() = _uiState.update { it.copy(showHistory = false) }

    fun openConversation(id: String) {
        viewModelScope.launch {
            try {
                val conversation = agentsRepository.getConversation(id)
                _uiState.update {
                    it.copy(
                        conversationId = conversation.id,
                        messages = conversation.messages,
                        showHistory = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't load that conversation.")) }
            }
        }
    }

    fun deleteConversation(id: String) {
        viewModelScope.launch {
            try {
                agentsRepository.deleteConversation(id)
                _uiState.update { it.copy(conversations = it.conversations.filter { c -> c.id != id }) }
                if (_uiState.value.conversationId == id) {
                    _uiState.update { it.copy(messages = emptyList(), conversationId = null) }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't delete conversation.")) }
            }
        }
    }
}
