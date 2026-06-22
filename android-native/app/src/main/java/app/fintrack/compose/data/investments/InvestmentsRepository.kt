package app.fintrack.compose.data.investments

import app.fintrack.compose.data.api.CreateInvestmentRequest
import app.fintrack.compose.data.api.InvestmentDto
import app.fintrack.compose.data.api.InvestmentSummaryResponse
import app.fintrack.compose.data.api.InvestmentsApiService
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class InvestmentsRepository @Inject constructor(
    private val api: InvestmentsApiService,
) {
    suspend fun getAll(): List<InvestmentDto> = api.getAll().investments

    suspend fun getSummary(): InvestmentSummaryResponse = api.getSummary()

    suspend fun create(
        type: String,
        name: String,
        tickerOrFolio: String?,
        units: Double,
        purchasePricePerUnit: Double,
        currentNavOrPrice: Double,
        purchaseDate: String,
    ): InvestmentDto = api.create(
        CreateInvestmentRequest(
            type = type,
            name = name,
            ticker_or_folio = tickerOrFolio,
            units = units,
            purchase_price_per_unit = purchasePricePerUnit,
            current_nav_or_price = currentNavOrPrice,
            purchase_date = purchaseDate,
        )
    ).investment

    suspend fun delete(id: String) = api.delete(id)
}
