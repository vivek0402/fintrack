package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface OneTimeExpensesApiService {
    @GET("api/one-time-expenses")
    suspend fun getAll(): OneTimeExpensesResponse

    @POST("api/one-time-expenses")
    suspend fun create(@Body body: CreateOneTimeExpenseRequest): OneTimeExpenseResponse

    @PUT("api/one-time-expenses/{id}")
    suspend fun update(@Path("id") id: String, @Body body: UpdateOneTimeExpenseRequest): OneTimeExpenseResponse

    @DELETE("api/one-time-expenses/{id}")
    suspend fun delete(@Path("id") id: String): DeleteOneTimeExpenseResponse

    @POST("api/one-time-expenses/{id}/items")
    suspend fun addItem(@Path("id") id: String, @Body body: CreateOneTimeExpenseItemRequest): OneTimeExpenseItemResponse

    @PUT("api/one-time-expenses/{id}/items/{itemId}")
    suspend fun updateItem(
        @Path("id") id: String,
        @Path("itemId") itemId: String,
        @Body body: CreateOneTimeExpenseItemRequest,
    ): OneTimeExpenseItemResponse

    @DELETE("api/one-time-expenses/{id}/items/{itemId}")
    suspend fun deleteItem(@Path("id") id: String, @Path("itemId") itemId: String): SuccessResponse
}
