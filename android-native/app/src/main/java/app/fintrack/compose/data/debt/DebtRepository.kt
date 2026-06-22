package app.fintrack.compose.data.debt

import app.fintrack.compose.data.api.CreditUtilizationResponse
import app.fintrack.compose.data.api.DebtApiService
import app.fintrack.compose.data.api.DtiResponse
import app.fintrack.compose.data.api.PayoffOptimizerResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DebtRepository @Inject constructor(
    private val api: DebtApiService,
) {
    suspend fun getDti(): DtiResponse = api.getDti()

    suspend fun getCreditUtilization(): CreditUtilizationResponse = api.getCreditUtilization()

    suspend fun getPayoffOptimizer(extraMonthlyPayment: Double? = null): PayoffOptimizerResponse =
        api.getPayoffOptimizer(extraMonthlyPayment)
}
