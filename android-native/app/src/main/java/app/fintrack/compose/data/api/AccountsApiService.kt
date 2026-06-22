package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

interface AccountsApiService {
    @GET("api/accounts")
    suspend fun getAll(): AccountsResponse

    @POST("api/accounts")
    suspend fun create(@Body body: CreateAccountRequest): AccountResponse

    @PATCH("api/accounts/{id}")
    suspend fun update(@Path("id") id: Int, @Body body: UpdateAccountRequest): AccountResponse

    @PATCH("api/accounts/{id}/set-default")
    suspend fun setDefault(@Path("id") id: Int): SetDefaultResponse

    @DELETE("api/accounts/{id}")
    suspend fun delete(@Path("id") id: Int): SuccessResponse
}
