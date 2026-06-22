package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

@Serializable
data class AgentMessageDto(
    val role: String,
    val content: String,
    val timestamp: String? = null,
)

@Serializable
data class SendAgentMessageRequest(
    val message: String,
    val conversation_id: String? = null,
)

@Serializable
data class SendAgentMessageResponse(
    val conversation_id: String,
    val response: String,
    val messages: List<AgentMessageDto>,
)

@Serializable
data class AgentConversationSummaryDto(
    val id: String,
    val agent_type: String,
    val title: String? = null,
    val updated_at: String,
    val message_count: Int,
)

@Serializable
data class AgentConversationListResponse(val conversations: List<AgentConversationSummaryDto>)

@Serializable
data class AgentConversationDto(
    val id: String,
    val agent_type: String,
    val title: String? = null,
    val messages: List<AgentMessageDto> = emptyList(),
    val updated_at: String? = null,
)

@Serializable
data class AgentConversationDetailResponse(val conversation: AgentConversationDto)

@Serializable
data class DeleteConversationResponse(val message: String)
