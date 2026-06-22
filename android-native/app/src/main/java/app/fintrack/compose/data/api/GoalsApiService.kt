package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface GoalsApiService {
    @GET("api/goals")
    suspend fun getAll(): GoalsResponse

    @POST("api/goals")
    suspend fun create(@Body body: CreateGoalRequest): GoalResponse

    @PUT("api/goals/{id}")
    suspend fun update(@Path("id") id: String, @Body body: UpdateGoalRequest): GoalResponse

    @PATCH("api/goals/{id}/funds")
    suspend fun updateFunds(@Path("id") id: String, @Body body: UpdateFundsRequest): GoalResponse

    @DELETE("api/goals/{id}")
    suspend fun delete(@Path("id") id: String): MessageResponse
}
