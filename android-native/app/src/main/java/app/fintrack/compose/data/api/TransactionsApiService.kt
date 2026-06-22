package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface TransactionsApiService {
    @GET("api/transactions/search")
    suspend fun search(@Query("q") query: String, @Query("limit") limit: Int? = null): TransactionsResponse

    @GET("api/transactions")
    suspend fun getAll(
        @Query("type") type: String? = null,
        @Query("month") month: Int? = null,
        @Query("year") year: Int? = null,
        @Query("category_id") categoryId: String? = null,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): TransactionsResponse

    @POST("api/transactions")
    suspend fun create(@Body body: CreateTransactionRequest): TransactionResponse

    @PUT("api/transactions/{id}")
    suspend fun update(@Path("id") id: String, @Body body: UpdateTransactionRequest): TransactionResponse

    @DELETE("api/transactions/{id}")
    suspend fun delete(@Path("id") id: String): MessageResponse

    @PATCH("api/transactions/{id}/regret")
    suspend fun toggleRegret(@Path("id") id: String): TransactionResponse
}
