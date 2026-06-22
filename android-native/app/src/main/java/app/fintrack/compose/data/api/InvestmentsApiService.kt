package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

interface InvestmentsApiService {
    @GET("api/investments")
    suspend fun getAll(): InvestmentsResponse

    @GET("api/investments/summary")
    suspend fun getSummary(): InvestmentSummaryResponse

    @POST("api/investments")
    suspend fun create(@Body body: CreateInvestmentRequest): InvestmentResponse

    @PATCH("api/investments/{id}")
    suspend fun update(@Path("id") id: String, @Body body: UpdateInvestmentRequest): InvestmentResponse

    @DELETE("api/investments/{id}")
    suspend fun delete(@Path("id") id: String): MessageResponse
}
