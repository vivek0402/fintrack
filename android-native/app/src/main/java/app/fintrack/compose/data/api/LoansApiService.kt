package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface LoansApiService {
    @GET("api/loans")
    suspend fun getAll(@Query("active") active: String? = null): LoansResponse

    @POST("api/loans")
    suspend fun create(@Body body: CreateLoanRequest): LoanResponse

    @PATCH("api/loans/{id}")
    suspend fun update(@Path("id") id: String, @Body body: UpdateLoanRequest): LoanResponse

    @DELETE("api/loans/{id}")
    suspend fun markRepaid(@Path("id") id: String): DeleteConversationResponse

    @GET("api/loans/{id}/amortization")
    suspend fun getAmortization(@Path("id") id: String): AmortizationResponse

    @POST("api/loans/{id}/prepayments")
    suspend fun addPrepayment(@Path("id") id: String, @Body body: CreatePrepaymentRequest): CreatePrepaymentResponse

    @GET("api/loans/{id}/prepayments")
    suspend fun getPrepayments(@Path("id") id: String): PrepaymentsResponse
}
