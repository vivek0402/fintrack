package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.POST

interface AgentsApiService {
    @POST("api/agents/message")
    suspend fun sendMessage(@Body body: SendAgentMessageRequest): SendAgentMessageResponse

    @GET("api/agents/conversations")
    suspend fun getConversations(): AgentConversationListResponse

    @GET("api/agents/conversations/{id}")
    suspend fun getConversation(@Path("id") id: String): AgentConversationDetailResponse

    @DELETE("api/agents/conversations/{id}")
    suspend fun deleteConversation(@Path("id") id: String): DeleteConversationResponse
}
