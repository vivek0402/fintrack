package app.fintrack.compose.data.tax

import app.fintrack.compose.data.api.AdvanceTaxResponse
import app.fintrack.compose.data.api.CapitalGainsResponse
import app.fintrack.compose.data.api.Create80cRequest
import app.fintrack.compose.data.api.CreateCapitalTransactionRequest
import app.fintrack.compose.data.api.EightyCSummaryResponse
import app.fintrack.compose.data.api.HraExemptionResponse
import app.fintrack.compose.data.api.ItrReadinessResponse
import app.fintrack.compose.data.api.LogAdvanceTaxPaymentRequest
import app.fintrack.compose.data.api.LtaResponse
import app.fintrack.compose.data.api.TaxApiService
import app.fintrack.compose.data.api.TaxInvestmentDto
import app.fintrack.compose.data.api.TaxProfileDto
import app.fintrack.compose.data.api.Update80cRequest
import app.fintrack.compose.data.api.UpdateItrChecklistRequest
import app.fintrack.compose.data.api.UpdateTaxProfileRequest
import javax.inject.Inject
import javax.inject.Singleton
import retrofit2.HttpException

@Singleton
class TaxRepository @Inject constructor(
    private val api: TaxApiService,
) {
    suspend fun getProfile(): TaxProfileDto? = try {
        api.getProfile()
    } catch (e: HttpException) {
        if (e.code() == 404) null else throw e
    }

    suspend fun saveProfile(body: UpdateTaxProfileRequest): TaxProfileDto = api.saveProfile(body)

    suspend fun getHra(): HraExemptionResponse = api.getHra()

    suspend fun getLta(): LtaResponse = api.getLta()

    suspend fun getAdvanceTax(): AdvanceTaxResponse = api.getAdvanceTax()

    suspend fun logAdvanceTaxPayment(installmentNumber: Int, amountPaid: Double, paidOnDate: String) {
        api.logAdvanceTaxPayment(LogAdvanceTaxPaymentRequest(installmentNumber, amountPaid, paidOnDate))
    }

    suspend fun getItrReadiness(): ItrReadinessResponse = api.getItrReadiness()

    suspend fun updateItrChecklist(key: String, value: Boolean): ItrReadinessResponse =
        api.updateItrChecklist(UpdateItrChecklistRequest(key, value))

    suspend fun get80cSummary(): EightyCSummaryResponse = api.get80cSummary()

    suspend fun add80c(type: String, name: String, amount: Double): TaxInvestmentDto =
        api.add80c(Create80cRequest(type, name, amount)).tax_investment

    suspend fun update80c(id: String, name: String?, amount: Double?): TaxInvestmentDto =
        api.update80c(id, Update80cRequest(name, amount)).tax_investment

    suspend fun delete80c(id: String) {
        api.delete80c(id)
    }

    suspend fun getCapitalGains(): CapitalGainsResponse = api.getCapitalGains()

    suspend fun addCapitalTransaction(
        assetName: String,
        assetType: String,
        transactionType: String,
        units: Double,
        pricePerUnit: Double,
        transactionDate: String,
    ) {
        api.addCapitalTransaction(
            CreateCapitalTransactionRequest(assetName, assetType, transactionType, units, pricePerUnit, transactionDate),
        )
    }
}
