package app.fintrack.compose.data.analytics

import app.fintrack.compose.data.api.AnalyticsApiService
import app.fintrack.compose.data.api.InvestmentRatioResponse
import app.fintrack.compose.data.api.NetWorthResponse
import app.fintrack.compose.data.api.SummaryResponse
import app.fintrack.compose.data.api.TrendsResponse
import app.fintrack.compose.data.api.WealthVelocityResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AnalyticsRepository @Inject constructor(
    private val api: AnalyticsApiService,
) {
    suspend fun getSummary(): SummaryResponse = api.getSummary()
    suspend fun getNetWorth(): NetWorthResponse = api.getNetWorth()
    suspend fun getWealthVelocity(): WealthVelocityResponse = api.getWealthVelocity()
    suspend fun getTrends(): TrendsResponse = api.getTrends()
    suspend fun getInvestmentRatio(): InvestmentRatioResponse = api.getInvestmentRatio()
}
