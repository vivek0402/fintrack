package app.fintrack.compose.data.api

import retrofit2.http.GET
import retrofit2.http.Query

interface DebtApiService {
    @GET("api/debt/dti")
    suspend fun getDti(): DtiResponse

    @GET("api/debt/credit-utilization")
    suspend fun getCreditUtilization(): CreditUtilizationResponse

    @GET("api/debt/payoff-optimizer")
    suspend fun getPayoffOptimizer(@Query("extra_monthly_payment") extraMonthlyPayment: Double? = null): PayoffOptimizerResponse
}
