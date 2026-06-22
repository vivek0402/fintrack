package app.fintrack.compose.data.api

import kotlinx.serialization.json.JsonElement
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface TaxApiService {
    @GET("api/tax/profile")
    suspend fun getProfile(@Query("fy") fy: String? = null): TaxProfileDto

    @POST("api/tax/profile")
    suspend fun saveProfile(@Body body: UpdateTaxProfileRequest): TaxProfileDto

    @GET("api/tax/hra")
    suspend fun getHra(): HraExemptionResponse

    @GET("api/tax/lta")
    suspend fun getLta(): LtaResponse

    @GET("api/tax/advance-tax")
    suspend fun getAdvanceTax(): AdvanceTaxResponse

    @POST("api/tax/advance-tax/payment")
    suspend fun logAdvanceTaxPayment(@Body body: LogAdvanceTaxPaymentRequest): JsonElement

    @GET("api/tax/itr-readiness")
    suspend fun getItrReadiness(): ItrReadinessResponse

    @PATCH("api/tax/itr-readiness")
    suspend fun updateItrChecklist(@Body body: UpdateItrChecklistRequest): ItrReadinessResponse

    @GET("api/tax/80c-summary")
    suspend fun get80cSummary(@Query("fy") fy: String? = null): EightyCSummaryResponse

    @POST("api/tax/80c")
    suspend fun add80c(@Body body: Create80cRequest): TaxInvestmentResponse

    @PATCH("api/tax/80c/{id}")
    suspend fun update80c(@Path("id") id: String, @Body body: Update80cRequest): TaxInvestmentResponse

    @DELETE("api/tax/80c/{id}")
    suspend fun delete80c(@Path("id") id: String): DeleteConversationResponse

    @GET("api/tax/capital-gains")
    suspend fun getCapitalGains(@Query("fy") fy: String? = null): CapitalGainsResponse

    @POST("api/tax/capital-transaction")
    suspend fun addCapitalTransaction(@Body body: CreateCapitalTransactionRequest): JsonElement
}
