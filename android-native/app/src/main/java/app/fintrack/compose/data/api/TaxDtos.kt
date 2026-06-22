package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

val TAX_INVESTMENT_TYPES = listOf(
    "ppf" to "PPF", "elss" to "ELSS", "epf" to "EPF", "life_insurance" to "Life Insurance",
    "nsc" to "NSC", "tax_saver_fd" to "Tax-saver FD", "nps" to "NPS",
    "home_loan_principal" to "Home Loan Principal", "tuition_fees" to "Tuition Fees", "other" to "Other",
)
val CAPITAL_ASSET_TYPES = listOf("equity" to "Equity", "debt" to "Debt", "gold" to "Gold", "real_estate" to "Real Estate", "other" to "Other")
val CITY_TYPES = listOf("metro" to "Metro", "non_metro" to "Non-metro")
val TAX_REGIMES = listOf("old" to "Old Regime", "new" to "New Regime", "not_decided" to "Not Decided")

@Serializable
data class TaxProfileDto(
    val financial_year: String,
    val employer_name: String? = null,
    val basic_salary_monthly: String,
    val hra_component_monthly: String,
    val lta_component_annual: String,
    val special_allowance_monthly: String,
    val rent_paid_monthly: String,
    val city_type: String,
    val lta_claims_used_in_block: Int,
    val preferred_regime: String,
)

@Serializable
data class UpdateTaxProfileRequest(
    val financial_year: String? = null,
    val employer_name: String? = null,
    val basic_salary_monthly: Double,
    val hra_component_monthly: Double? = null,
    val lta_component_annual: Double? = null,
    val special_allowance_monthly: Double? = null,
    val rent_paid_monthly: Double? = null,
    val city_type: String? = null,
    val lta_claims_used_in_block: Int? = null,
    val preferred_regime: String? = null,
)

@Serializable
data class HraExemptionInputsDto(
    val basic_salary_monthly: Double,
    val hra_component_monthly: Double,
    val rent_paid_monthly: Double,
    val city_type: String,
    val annual_basic: Double,
    val annual_hra_received: Double,
    val annual_rent_paid: Double,
)

@Serializable
data class HraExemptionResponse(
    val financial_year: String,
    val inputs: HraExemptionInputsDto,
    val value_a_actual_hra: Double,
    val value_b_pct_of_basic: Double,
    val value_c_rent_minus_10pct_basic: Double,
    val exempt_hra: Double,
    val taxable_hra: Double,
    val limiting_factor: String,
    val optimization_potential: Double? = null,
    val explanation: String,
)

@Serializable
data class LtaResponse(
    val financial_year: String,
    val lta_component: Double,
    val claims_used: Int,
    val claims_remaining: Int,
    val next_claim_expires_in_months: Int,
    val next_block_start: String,
    val recommendation: String? = null,
)

@Serializable
data class AdvanceTaxIncomeEstimatesDto(
    val transaction_based_estimate: Double,
    val profile_based_estimate: Double? = null,
    val ytd_income: Double,
    val months_elapsed: Int,
    val months_remaining: Int,
)

@Serializable
data class AdvanceTaxDeductionsDto(
    val deduction_80c: Double,
    val standard_deduction_old: Double,
    val standard_deduction_new: Double,
    val hra_exempt: Double,
)

@Serializable
data class InstallmentScheduleEntryDto(
    val installment_number: Int,
    val due_date: String,
    val cumulative_pct_due: Int,
    val cumulative_amount_due: Double,
    val installment_amount: Double,
    val amount_paid: Double,
    val paid_on_date: String? = null,
    val status: String,
)

@Serializable
data class AdvanceTaxResponse(
    val financial_year: String,
    val estimated_income: Double,
    val income_estimates: AdvanceTaxIncomeEstimatesDto,
    val deductions: AdvanceTaxDeductionsDto,
    val old_regime_tax: Double,
    val new_regime_tax: Double,
    val recommended_regime: String,
    val tax_savings_from_better_regime: Double,
    val is_applicable: Boolean,
    val installment_schedule: List<InstallmentScheduleEntryDto> = emptyList(),
    val explanation: String? = null,
)

@Serializable
data class LogAdvanceTaxPaymentRequest(
    val installment_number: Int,
    val amount_paid: Double,
    val paid_on_date: String,
    val financial_year: String? = null,
    val payment_reference: String? = null,
)

@Serializable
data class ItrChecklistItemDto(val key: String, val label: String, val type: String, val weight: Int, val status: String)

@Serializable
data class ItrReadinessResponse(
    val financial_year: String,
    val score: Int,
    val completion_summary: String,
    val next_action: String? = null,
    val items: List<ItrChecklistItemDto> = emptyList(),
)

@Serializable
data class UpdateItrChecklistRequest(val key: String, val value: Boolean)

@Serializable
data class TaxInvestmentDto(
    val id: String,
    val investment_id: String? = null,
    val type: String,
    val name: String,
    val amount: String,
    val deduction_section: String,
    val financial_year: String,
)

@Serializable
data class EightyCBreakdownDto(val type: String, val total: Double)

@Serializable
data class EightyCCandidateDto(val id: String, val name: String, val type: String, val amount: Double)

@Serializable
data class EightyCSummaryResponse(
    val financial_year: String,
    val total_claimed: Double,
    val limit: Int,
    val remaining: Double,
    val utilization_pct: Double,
    val breakdown_by_type: List<EightyCBreakdownDto> = emptyList(),
    val entries: List<TaxInvestmentDto> = emptyList(),
    val auto_add_candidates: List<EightyCCandidateDto> = emptyList(),
)

@Serializable
data class Create80cRequest(
    val type: String,
    val name: String,
    val amount: Double,
    val investment_id: String? = null,
    val financial_year: String? = null,
    val deduction_section: String? = null,
)

@Serializable
data class Update80cRequest(val name: String? = null, val amount: Double? = null)

@Serializable
data class TaxInvestmentResponse(val tax_investment: TaxInvestmentDto)

@Serializable
data class CapitalGainTransactionDto(
    val asset_name: String,
    val buy_date: String,
    val sell_date: String,
    val holding_period_days: Int,
    val units: Double,
    val buy_price: Double,
    val sell_price: Double,
    val gain_loss_amount: Double,
    val gain_type: String,
)

@Serializable
data class CapitalGainsResponse(
    val financial_year: String,
    val stcg_equity: Double,
    val ltcg_equity: Double,
    val stcg_other: Double,
    val ltcg_other: Double,
    val total_gains: Double,
    val transactions: List<CapitalGainTransactionDto> = emptyList(),
)

@Serializable
data class CreateCapitalTransactionRequest(
    val asset_name: String,
    val asset_type: String,
    val transaction_type: String,
    val units: Double,
    val price_per_unit: Double,
    val transaction_date: String,
)
