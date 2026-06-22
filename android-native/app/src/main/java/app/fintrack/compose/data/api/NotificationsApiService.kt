package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.POST

interface NotificationsApiService {
    @POST("api/notifications/register-token")
    suspend fun registerToken(@Body body: RegisterTokenRequest): OkResponse

    @DELETE("api/notifications/register-token")
    suspend fun unregisterToken(@Body body: RegisterTokenRequest): OkResponse
}
