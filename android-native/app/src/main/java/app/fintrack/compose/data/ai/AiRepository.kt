package app.fintrack.compose.data.ai

import app.fintrack.compose.data.api.AiApiService
import app.fintrack.compose.data.api.DailyBriefingDto
import app.fintrack.compose.data.api.HealthReportRequest
import app.fintrack.compose.data.api.HealthReportResponse
import app.fintrack.compose.data.api.LifeEventRequest
import app.fintrack.compose.data.api.LifeEventResponse
import app.fintrack.compose.data.api.ParseSplitTextRequest
import app.fintrack.compose.data.api.ParsedSplitDto
import app.fintrack.compose.data.api.QuickAddParsedDto
import app.fintrack.compose.data.api.QuickAddRequest
import app.fintrack.compose.data.api.RecurringPatternDto
import app.fintrack.compose.data.api.RegretPatternsResponse
import app.fintrack.compose.data.api.SalaryIntelligenceResponse
import app.fintrack.compose.data.api.TaxEstimateDataDto
import app.fintrack.compose.data.api.WeeklyBriefingDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AiRepository @Inject constructor(
    private val api: AiApiService,
) {
    suspend fun getHealthReport(month: Int? = null, year: Int? = null): HealthReportResponse =
        api.getHealthReport(HealthReportRequest(month, year))

    suspend fun getDailyBrief(): DailyBriefingDto = api.getDailyBrief()

    suspend fun refreshDailyBrief(): DailyBriefingDto = api.refreshDailyBrief()

    suspend fun getWeeklyBrief(): WeeklyBriefingDto = api.getWeeklyBrief()

    suspend fun getRegretPatterns(): RegretPatternsResponse = api.getRegretPatterns()

    suspend fun getTaxEstimate(force: Boolean = false): TaxEstimateDataDto? =
        api.getTaxEstimate(if (force) true else null).data

    suspend fun getSalaryIntelligence(): SalaryIntelligenceResponse = api.getSalaryIntelligence()

    suspend fun parseSplit(text: String): ParsedSplitDto? = api.parseSplit(ParseSplitTextRequest(text)).parsed

    suspend fun quickAdd(text: String): QuickAddParsedDto? = api.quickAdd(QuickAddRequest(text)).data

    suspend fun detectPatterns(): List<RecurringPatternDto> = api.detectPatterns().patterns

    suspend fun planLifeEvent(eventType: String, targetAmount: Double, targetDate: String): LifeEventResponse =
        api.lifeEvent(LifeEventRequest(eventType, targetAmount, targetDate))
}
