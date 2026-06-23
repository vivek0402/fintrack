package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

@Serializable
data class CamsPurchaseDetailDto(val date: String, val units: Double, val price_per_unit: Double)

/** LLM-emitted JSON.parse() output server-side — numeric fields are real JSON numbers, not NUMERIC passthroughs. */
@Serializable
data class CamsHoldingDto(
    val folio_number: String? = null,
    val fund_house: String? = null,
    val scheme_name: String,
    val units: Double,
    val nav: Double,
    val current_value: Double,
    val purchase_details: List<CamsPurchaseDetailDto> = emptyList(),
)

@Serializable
data class CamsImportUploadResponse(
    val jobId: String,
    val holdingsCount: Int = 0,
    val holdings: List<CamsHoldingDto> = emptyList(),
)

@Serializable
data class CamsConfirmRequest(val holdings: List<CamsHoldingDto>)

@Serializable
data class CamsConfirmResponse(val created: Int = 0, val updated: Int = 0, val skipped: Int = 0, val imported: Int = 0)
