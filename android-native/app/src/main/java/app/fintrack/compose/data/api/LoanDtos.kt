package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

val LOAN_TYPES = listOf(
    "home_loan" to "Home Loan",
    "car_loan" to "Car Loan",
    "personal_loan" to "Personal Loan",
    "education_loan" to "Education Loan",
    "gold_loan" to "Gold Loan",
    "business_loan" to "Business Loan",
    "other" to "Other",
)

@Serializable
data class LoanDto(
    val id: String,
    val name: String,
    val type: String,
    val principal_amount: String,
    val disbursement_date: String,
    val tenure_months: Int,
    val interest_rate_pct: String,
    val emi_amount: String? = null,
    val outstanding_balance: String,
    val bank_or_lender: String? = null,
    val account_number_last4: String? = null,
    val prepayment_penalty_pct: String? = null,
    val is_active: Boolean = true,
    val notes: String? = null,
    val months_remaining: Int? = null,
    val total_interest_remaining: Double? = null,
    val amortization_error: String? = null,
)

@Serializable
data class LoansResponse(val loans: List<LoanDto>)

@Serializable
data class LoanResponse(val loan: LoanDto)

@Serializable
data class CreateLoanRequest(
    val name: String,
    val type: String,
    val principal_amount: Double,
    val disbursement_date: String,
    val tenure_months: Int,
    val interest_rate_pct: Double,
    val outstanding_balance: Double,
    val emi_amount: Double? = null,
    val bank_or_lender: String? = null,
    val account_number_last4: String? = null,
    val prepayment_penalty_pct: Double? = null,
    val notes: String? = null,
)

@Serializable
data class UpdateLoanRequest(
    val name: String? = null,
    val outstanding_balance: Double? = null,
    val interest_rate_pct: Double? = null,
    val emi_amount: Double? = null,
    val bank_or_lender: String? = null,
    val notes: String? = null,
    val is_active: Boolean? = null,
)

@Serializable
data class AmortizationScheduleEntryDto(
    val month: Int,
    val date: String,
    val opening_balance: Double,
    val emi: Double,
    val interest_component: Double,
    val principal_component: Double,
    val closing_balance: Double,
    val cumulative_interest: Double,
)

@Serializable
data class AmortizationSummaryDto(
    val total_months: Int,
    val total_interest: Double,
    val total_amount_payable: Double,
    val payoff_date: String? = null,
    val emi: Double,
)

@Serializable
data class AmortizationResponse(
    val schedule: List<AmortizationScheduleEntryDto>,
    val summary: AmortizationSummaryDto,
)

@Serializable
data class PrepaymentDto(
    val id: String,
    val loan_id: String,
    val amount: String,
    val prepayment_date: String,
    val months_saved: Int? = null,
    val interest_saved: String? = null,
    val notes: String? = null,
)

@Serializable
data class CreatePrepaymentRequest(
    val amount: Double,
    val prepayment_date: String,
    val notes: String? = null,
)

@Serializable
data class CreatePrepaymentResponse(val prepayment: PrepaymentDto)

@Serializable
data class PrepaymentsResponse(val prepayments: List<PrepaymentDto>)
