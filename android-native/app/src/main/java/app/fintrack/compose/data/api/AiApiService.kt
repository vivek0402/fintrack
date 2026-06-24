package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface AiApiService {
    @POST("api/ai/health-report")
    suspend fun getHealthReport(@Body body: HealthReportRequest = HealthReportRequest()): HealthReportResponse

    @GET("api/ai/briefing/daily/latest")
    suspend fun getDailyBrief(): DailyBriefingDto

    @POST("api/ai/briefing/daily/generate")
    suspend fun refreshDailyBrief(): DailyBriefingDto

    @GET("api/ai/briefing/latest")
    suspend fun getWeeklyBrief(): WeeklyBriefingDto

    @GET("api/ai/regret-patterns")
    suspend fun getRegretPatterns(): RegretPatternsResponse

    @GET("api/ai/tax-estimate")
    suspend fun getTaxEstimate(@Query("force") force: Boolean? = null): TaxEstimateResponse

    @GET("api/ai/salary-intelligence")
    suspend fun getSalaryIntelligence(): SalaryIntelligenceResponse

    @POST("api/ai/parse-split")
    suspend fun parseSplit(@Body body: ParseSplitTextRequest): ParseSplitResponse

    @POST("api/ai/quick-add")
    suspend fun quickAdd(@Body body: QuickAddRequest): QuickAddResponse

    @GET("api/ai/detect-patterns")
    suspend fun detectPatterns(): DetectPatternsResponse

    @POST("api/ai/life-event")
    suspend fun lifeEvent(@Body body: LifeEventRequest): LifeEventResponse

    @GET("api/ai/forecast-calendar")
    suspend fun getForecastCalendar(@Query("force") force: Boolean? = null): ForecastCalendarResponse

    @DELETE("api/ai/cache/{key}")
    suspend fun clearCache(@Path("key") key: String): SuccessResponse
}
