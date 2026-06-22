package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** All numeric fields here are parseFloat(...toFixed(2))'d server-side — real JSON numbers. */
@Serializable
data class CashflowMonthDto(
    val month: String,
    val projected_income: Double,
    val projected_expenses: Double,
    val fixed_outflows: Double,
    val net_cashflow: Double,
    val running_balance: Double,
    val status: String, // "surplus" | "healthy" | "tight" | "at_risk"
)

@Serializable
data class CashflowSummaryDto(
    val average_monthly_surplus: Double,
    val total_projected_annual_income: Double,
    val total_projected_annual_expenses: Double,
    val months_at_risk: Int,
    val months_surplus: Int,
)

@Serializable
data class LoanBreakdownDto(val name: String, val emi: Double)

@Serializable
data class CashflowResponse(
    val months: List<CashflowMonthDto>,
    val summary: CashflowSummaryDto,
    val average_monthly_income: Double,
    val average_monthly_expenses: Double,
    val average_monthly_expenses_by_category: Map<String, Double> = emptyMap(),
    val fixed_monthly_outflows: Double,
    val recurring_outflows: Double,
    val loan_breakdown: List<LoanBreakdownDto> = emptyList(),
)

// ─── FIRE calculator ─────────────────────────────────────────────────────────

@Serializable
data class FireRequest(
    val monthly_expenses: Double? = null,
    val expected_annual_return_pct: Double = 12.0,
    val inflation_pct: Double = 6.0,
    val swr_pct: Double = 4.0,
    val extra_monthly_savings: Double = 0.0,
)

@Serializable
data class YearsMonthsDto(val years: Int? = null, val months: Int? = null, val total_months: Int? = null)

@Serializable
data class YearsToFireDto(
    val base: YearsMonthsDto,
    val step_up_10pct: YearsMonthsDto,
    val extra_10k: YearsMonthsDto,
)

@Serializable
data class SavingsTargetsDto(val target_10yr: Double, val target_15yr: Double, val target_20yr: Double)

@Serializable
data class PortfolioProjectionPointDto(val year: Int, val portfolio_value: Double? = null)

@Serializable
data class FireResponse(
    val corpus_needed_real: Double,
    val corpus_needed_nominal: Double? = null,
    val current_net_worth: Double,
    val monthly_expenses: Double,
    val monthly_savings: Double,
    val real_annual_return_pct: Double,
    val years_to_fire: YearsToFireDto,
    val fire_date: String? = null,
    val savings_targets: SavingsTargetsDto,
    val portfolio_projection: List<PortfolioProjectionPointDto>,
)

// ─── SIP calculator ──────────────────────────────────────────────────────────

@Serializable
data class SipRequest(
    val mode: String, // "goal_based" | "growth_based"
    val expected_annual_return_pct: Double = 12.0,
    val target_years: Double,
    val goal_amount: Double? = null,
    val monthly_sip: Double? = null,
)

/** `sip_amount`/`lumpsum_alternative`/`step_up_sip` are goal_based-only; `corpus` is growth_based-only. */
@Serializable
data class SipResponse(
    val mode: String,
    val sip_amount: Double? = null,
    val lumpsum_alternative: Double? = null,
    val step_up_sip: Double? = null,
    val corpus: Double? = null,
    val total_invested: Double,
    val total_returns: Double,
    val wealth_ratio: Double,
    val projection: List<PortfolioProjectionPointDto>,
)

// ─── Scenarios ───────────────────────────────────────────────────────────────

@Serializable
data class ScenarioDto(
    val id: String,
    val title: String,
    val type: String,
    val inputs_json: JsonObject,
    val result_json: JsonObject? = null,
    val created_at: String? = null,
    val updated_at: String? = null,
)

@Serializable
data class ScenariosResponse(val scenarios: List<ScenarioDto>)

@Serializable
data class ScenarioResponse(val scenario: ScenarioDto)

@Serializable
data class CreateScenarioRequest(
    val title: String,
    val type: String,
    val inputs_json: JsonObject,
    val result_json: JsonObject? = null,
)

@Serializable
data class SimulateScenarioRequest(val type: String, val inputs: JsonObject)

@Serializable
data class SimulateScenarioResponse(val type: String, val inputs: JsonObject, val result: JsonObject)

val SCENARIO_TYPES = listOf("investment_growth", "loan_impact", "expense_reduction", "income_change")
