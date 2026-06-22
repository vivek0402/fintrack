package app.fintrack.compose.data.api

import retrofit2.http.GET
import retrofit2.http.Query

interface AnalyticsApiService {
    @GET("api/analytics/summary")
    suspend fun getSummary(@Query("month") month: Int? = null, @Query("year") year: Int? = null): SummaryResponse

    @GET("api/analytics/networth")
    suspend fun getNetWorth(): NetWorthResponse

    @GET("api/analytics/wealth-velocity")
    suspend fun getWealthVelocity(): WealthVelocityResponse

    @GET("api/analytics/trends")
    suspend fun getTrends(): TrendsResponse

    @GET("api/analytics/investment-ratio")
    suspend fun getInvestmentRatio(): InvestmentRatioResponse
}
