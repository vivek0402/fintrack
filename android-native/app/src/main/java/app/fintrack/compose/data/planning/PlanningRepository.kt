package app.fintrack.compose.data.planning

import app.fintrack.compose.data.api.CashflowResponse
import app.fintrack.compose.data.api.CreateScenarioRequest
import app.fintrack.compose.data.api.FireRequest
import app.fintrack.compose.data.api.FireResponse
import app.fintrack.compose.data.api.PlanningApiService
import app.fintrack.compose.data.api.ScenarioDto
import app.fintrack.compose.data.api.SimulateScenarioRequest
import app.fintrack.compose.data.api.SimulateScenarioResponse
import app.fintrack.compose.data.api.SipRequest
import app.fintrack.compose.data.api.SipResponse
import kotlinx.serialization.json.JsonObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PlanningRepository @Inject constructor(
    private val api: PlanningApiService,
) {
    suspend fun getCashflow(): CashflowResponse = api.getCashflow()

    suspend fun calculateFire(
        monthlyExpenses: Double?,
        expectedAnnualReturnPct: Double,
        inflationPct: Double,
        swrPct: Double,
        extraMonthlySavings: Double,
    ): FireResponse = api.calculateFire(
        FireRequest(monthlyExpenses, expectedAnnualReturnPct, inflationPct, swrPct, extraMonthlySavings)
    )

    suspend fun calculateSipGoalBased(targetYears: Double, goalAmount: Double, expectedAnnualReturnPct: Double): SipResponse =
        api.calculateSip(SipRequest(mode = "goal_based", expected_annual_return_pct = expectedAnnualReturnPct, target_years = targetYears, goal_amount = goalAmount))

    suspend fun calculateSipGrowthBased(targetYears: Double, monthlySip: Double, expectedAnnualReturnPct: Double): SipResponse =
        api.calculateSip(SipRequest(mode = "growth_based", expected_annual_return_pct = expectedAnnualReturnPct, target_years = targetYears, monthly_sip = monthlySip))

    suspend fun getScenarios(): List<ScenarioDto> = api.getScenarios().scenarios

    suspend fun createScenario(title: String, type: String, inputsJson: JsonObject, resultJson: JsonObject?): ScenarioDto =
        api.createScenario(CreateScenarioRequest(title, type, inputsJson, resultJson)).scenario

    suspend fun deleteScenario(id: String) = api.deleteScenario(id)

    suspend fun simulateScenario(type: String, inputs: JsonObject): SimulateScenarioResponse =
        api.simulateScenario(SimulateScenarioRequest(type, inputs))
}
