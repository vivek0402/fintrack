package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

/**
 * `units`/`purchase_price_per_unit`/`current_nav_or_price` are raw NUMERIC
 * columns (JSON strings); `current_value`/`total_invested`/`unrealized_gain`/
 * `unrealized_gain_pct` are computed server-side in JS via parseFloat() math
 * before being spread back onto the row, so they arrive as real JSON numbers.
 */
@Serializable
data class InvestmentDto(
    val id: String,
    val type: String,
    val name: String,
    val ticker_or_folio: String? = null,
    val units: String,
    val purchase_price_per_unit: String,
    val current_nav_or_price: String,
    val purchase_date: String,
    val account_label: String? = null,
    val notes: String? = null,
    val current_value: Double,
    val total_invested: Double,
    val unrealized_gain: Double,
    val unrealized_gain_pct: Double,
)

@Serializable
data class InvestmentsResponse(val investments: List<InvestmentDto>)

@Serializable
data class InvestmentResponse(val investment: InvestmentDto)

@Serializable
data class InvestmentByTypeDto(
    val type: String,
    val count: Int,
    val total_invested: Double,
    val total_current_value: Double,
    val unrealized_gain_pct: Double,
)

@Serializable
data class TopHoldingDto(
    val id: String,
    val name: String,
    val type: String,
    val current_value: Double,
    val unrealized_gain_pct: Double,
)

@Serializable
data class InvestmentSummaryResponse(
    val total_invested: Double,
    val total_current_value: Double,
    val total_unrealized_gain: Double,
    val total_unrealized_gain_pct: Double,
    val by_type: List<InvestmentByTypeDto>,
    val top_holdings: List<TopHoldingDto>,
)

@Serializable
data class CreateInvestmentRequest(
    val type: String,
    val name: String,
    val ticker_or_folio: String? = null,
    val units: Double,
    val purchase_price_per_unit: Double,
    val current_nav_or_price: Double,
    val purchase_date: String,
    val account_label: String? = null,
    val notes: String? = null,
)

@Serializable
data class UpdateInvestmentRequest(
    val current_nav_or_price: Double? = null,
    val units: Double? = null,
    val name: String? = null,
    val account_label: String? = null,
    val notes: String? = null,
)

val INVESTMENT_TYPES = listOf("mutual_fund", "stock", "fd", "ppf", "nps", "gold", "crypto", "other")
