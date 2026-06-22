package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

@Serializable
data class HealthReportRequest(val month: Int? = null, val year: Int? = null)

@Serializable
data class HealthScoresDto(
    val income_stability: Double,
    val expense_control: Double,
    val budget_adherence: Double,
    val savings_rate: Double,
    val goal_progress: Double,
)

@Serializable
data class HealthSummaryDto(
    val totalIncome: Double,
    val totalExpenses: Double,
    val savingsRate: Double,
    val balance: Double,
    val transactionCount: Int,
)

@Serializable
data class HealthTopCategoryDto(val name: String, val amount: Double)

/** `pct` is JSON number 0 OR a toFixed() string (e.g. "42") depending on a backend ternary — decoded leniently as String either way. */
@Serializable
data class HealthBudgetPerformanceDto(
    val category: String? = null,
    val budgeted: Double,
    val spent: Double,
    val pct: String,
)

@Serializable
data class HealthGoalProgressDto(
    val name: String,
    val target: Double,
    val saved: Double,
    val pct: String,
)

@Serializable
data class DailyBriefPointDto(
    val key: String,
    val label: String,
    val value: String,
    val insight: String,
)

@Serializable
data class DailyBriefingDto(
    val id: String,
    val brief_date: String,
    val points: List<DailyBriefPointDto>,
    val narrative: String,
    val action_of_the_day: String,
)

/** Same point shape as the daily brief (buildBriefingPoints() is shared server-side). */
@Serializable
data class WeeklyBriefingDto(
    val id: String,
    val week_of: String,
    val points: List<DailyBriefPointDto>,
    val narrative: String,
    val action_of_the_week: String,
)

@Serializable
data class RegretPatternDto(
    val pattern: String,
    val count: Int,
    val total_amount: Double,
    val tip: String,
)

@Serializable
data class RegretPatternsResponse(
    val patterns: List<RegretPatternDto>? = null,
    val insight: String? = null,
    val count: Int = 0,
    val total: Double = 0.0,
)

@Serializable
data class TaxRegimeBreakdownDto(
    val taxableIncome: Double = 0.0,
    val standardDeduction: Double = 0.0,
    val deduction80C: Double? = null,
    val tax: Double = 0.0,
    val cess: Double = 0.0,
    val total: Double = 0.0,
)

@Serializable
data class TaxEstimateSlabDto(
    val slab: String,
    val rate: String,
    val tax: Double = 0.0,
)

@Serializable
data class TaxEstimateDataDto(
    val grossIncome: Double = 0.0,
    val fyPeriod: String? = null,
    val oldRegime: TaxRegimeBreakdownDto? = null,
    val newRegime: TaxRegimeBreakdownDto? = null,
    val recommendedRegime: String? = null,
    val savings: Double? = null,
    val breakdown: List<TaxEstimateSlabDto> = emptyList(),
    val tips: List<String> = emptyList(),
    val disclaimer: String? = null,
)

@Serializable
data class TaxEstimateResponse(
    val success: Boolean = true,
    val data: TaxEstimateDataDto? = null,
)

@Serializable
data class SalaryPlanItemDto(
    val percentage: Double = 0.0,
    val amount: Double = 0.0,
    val reason: String? = null,
)

@Serializable
data class SalaryIntelligenceResponse(
    val detected: Boolean = false,
    val salary: Double? = null,
    val description: String? = null,
    val plan: Map<String, SalaryPlanItemDto>? = null,
    val insight: String? = null,
    val from_cache: Boolean = false,
)

@Serializable
data class ParseSplitTextRequest(val text: String)

@Serializable
data class ParsedSplitDto(
    val description: String? = null,
    val total_amount: Double? = null,
    val split_count: Int? = null,
    val participants: List<ExpenseSplitParticipantInput>? = null,
)

@Serializable
data class ParseSplitResponse(
    val parsed: ParsedSplitDto? = null,
    val error: String? = null,
)

@Serializable
data class HealthReportResponse(
    val health_score: Double,
    val grade: String,
    val narrative: String,
    val strengths: List<String> = emptyList(),
    val improvements: List<String> = emptyList(),
    val scores: HealthScoresDto,
    val summary: HealthSummaryDto,
    val topCategories: List<HealthTopCategoryDto> = emptyList(),
    val budgetPerformance: List<HealthBudgetPerformanceDto> = emptyList(),
    val goalsProgress: List<HealthGoalProgressDto> = emptyList(),
    val month: Int,
    val year: Int,
)
