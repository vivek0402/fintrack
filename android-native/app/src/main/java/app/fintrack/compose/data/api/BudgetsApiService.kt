package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface BudgetsApiService {
    @GET("api/budgets")
    suspend fun getAll(@Query("month") month: Int? = null, @Query("year") year: Int? = null): BudgetsResponse

    @POST("api/budgets")
    suspend fun create(@Body body: CreateBudgetRequest): BudgetResponse

    @DELETE("api/budgets/{id}")
    suspend fun delete(@Path("id") id: String): MessageResponse
}
