package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

@Serializable
data class DebtBreakdownLoanDto(val id: String, val name: String, val emi: Double)

@Serializable
data class DebtBreakdownCardDto(val id: String, val name: String, val minimum_payment: Double)

@Serializable
data class DtiResponse(
    val monthly_income: Double,
    val monthly_loan_emi: Double,
    val monthly_credit_obligation: Double,
    val total_monthly_debt_obligation: Double,
    val dti_ratio: Double,
    val status: String,
    val breakdown_loans: List<DebtBreakdownLoanDto> = emptyList(),
    val breakdown_cards: List<DebtBreakdownCardDto> = emptyList(),
)

@Serializable
data class CreditCardUtilizationDto(
    val id: String,
    val name: String,
    val bank_name: String? = null,
    val last4: String? = null,
    val outstanding_balance: Double,
    val credit_limit: Double,
    val utilization_pct: Double,
    val status: String,
)

@Serializable
data class CreditUtilizationAggregateDto(
    val total_outstanding: Double,
    val total_limit: Double,
    val overall_utilization_pct: Double,
    val status: String,
)

@Serializable
data class CreditUtilizationResponse(
    val per_card: List<CreditCardUtilizationDto> = emptyList(),
    val aggregate: CreditUtilizationAggregateDto,
    val recommendation: String? = null,
)

@Serializable
data class PayoffSequenceEntryDto(val loan_id: String, val name: String, val payoff_month: Int)

@Serializable
data class PayoffBaselineDto(val months: Int, val total_interest: Double)

@Serializable
data class PayoffStrategyDto(
    val months: Int,
    val total_interest: Double,
    val interest_saved: Double? = null,
    val payoff_sequence: List<PayoffSequenceEntryDto> = emptyList(),
)

@Serializable
data class PayoffOptimizerResponse(
    val baseline: PayoffBaselineDto? = null,
    val avalanche: PayoffStrategyDto? = null,
    val snowball: PayoffStrategyDto? = null,
    val recommendation: String? = null,
    val message: String? = null,
)
