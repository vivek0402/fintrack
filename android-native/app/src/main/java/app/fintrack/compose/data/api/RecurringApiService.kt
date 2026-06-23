package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface RecurringApiService {
    @GET("api/recurring")
    suspend fun getAll(): RecurringListResponse

    @POST("api/recurring")
    suspend fun create(@Body body: CreateRecurringRequest): RecurringSingleResponse

    @PUT("api/recurring/{id}")
    suspend fun update(@Path("id") id: String, @Body body: UpdateRecurringRequest): RecurringSingleResponse

    @PATCH("api/recurring/{id}/toggle")
    suspend fun toggle(@Path("id") id: String): RecurringSingleResponse

    @DELETE("api/recurring/{id}")
    suspend fun delete(@Path("id") id: String): MessageResponse

    @POST("api/recurring/process")
    suspend fun process(): ProcessRecurringResponse
}
