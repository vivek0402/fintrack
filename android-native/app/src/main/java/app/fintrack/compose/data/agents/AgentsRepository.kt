package app.fintrack.compose.data.agents

import app.fintrack.compose.data.api.AgentConversationDto
import app.fintrack.compose.data.api.AgentConversationSummaryDto
import app.fintrack.compose.data.api.AgentsApiService
import app.fintrack.compose.data.api.SendAgentMessageRequest
import app.fintrack.compose.data.api.SendAgentMessageResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AgentsRepository @Inject constructor(
    private val api: AgentsApiService,
) {
    suspend fun sendMessage(message: String, conversationId: String?): SendAgentMessageResponse =
        api.sendMessage(SendAgentMessageRequest(message, conversationId))

    suspend fun getConversations(): List<AgentConversationSummaryDto> = api.getConversations().conversations

    suspend fun getConversation(id: String): AgentConversationDto = api.getConversation(id).conversation

    suspend fun deleteConversation(id: String) {
        api.deleteConversation(id)
    }
}
