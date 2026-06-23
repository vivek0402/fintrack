package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

@Serializable
data class SummaryDto(
    val total_income: Double,
    val total_expenses: Double,
    val balance: Double,
    val savings_rate: Double,
    val month: Int,
    val year: Int,
)

/** `total` is a raw SUM() passthrough — arrives as a JSON string, see TransactionDtos.kt's note. */
@Serializable
data class CategoryBreakdownDto(
    val name: String,
    val color: String? = null,
    val icon: String? = null,
    val total: String,
)

@Serializable
data class SummaryResponse(
    val summary: SummaryDto,
    val category_breakdown: List<CategoryBreakdownDto>,
)

@Serializable
data class NetWorthCurrentDto(
    val total_bank_balance: Double,
    val total_investments: Double,
    val total_assets: Double,
    val total_credit_outstanding: Double,
    val total_loans_outstanding: Double,
    val total_liabilities: Double,
    val net_worth: Double,
)

/** Raw row passthrough from net_worth_snapshots — numeric fields arrive as JSON strings. */
@Serializable
data class NetWorthHistoryPointDto(
    val snapshot_date: String,
    val net_worth: String,
    val total_assets: String,
    val total_liabilities: String,
)

@Serializable
data class NetWorthResponse(
    val current: NetWorthCurrentDto,
    val history: List<NetWorthHistoryPointDto>,
)

@Serializable
data class WealthVelocitySnapshotDto(val snapshot_date: String, val net_worth: Double)

@Serializable
data class MomChangeDto(
    val from_date: String,
    val to_date: String,
    val absolute_change: Double,
    val pct_change: Double,
)

@Serializable
data class WealthVelocityResponse(
    val snapshots: List<WealthVelocitySnapshotDto>,
    val mom_changes: List<MomChangeDto>,
    val avg_monthly_growth: Double,
    val avg_monthly_growth_pct: Double,
    val trend: String,
    val message: String? = null,
)

/** year/month come from Postgres EXTRACT() (double precision) — real JSON numbers. total is a raw SUM() passthrough — JSON string. */
@Serializable
data class TrendPointDto(
    val year: Double,
    val month: Double,
    val type: String,
    val total: String,
)

@Serializable
data class TrendsResponse(val trends: List<TrendPointDto>)

@Serializable
data class InvestmentRatioResponse(
    val invested_this_month: Double,
    val income_this_month: Double,
    val ratio_pct: Double,
)

@Serializable
data class AssetAllocationItemDto(
    val category: String,
    val label: String,
    val amount: Double,
    val actual_pct: Double,
    val recommended_pct: Double,
    val deviation: Double,
)

@Serializable
data class AssetAllocationResponse(
    val allocations: List<AssetAllocationItemDto>,
    val total_assets: Double,
    val deviation_score: Double,
    val recommendation_note: String,
)
