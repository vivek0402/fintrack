package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface PlanningApiService {
    @GET("api/planning/cashflow")
    suspend fun getCashflow(): CashflowResponse

    @POST("api/planning/fire")
    suspend fun calculateFire(@Body body: FireRequest): FireResponse

    @POST("api/planning/sip")
    suspend fun calculateSip(@Body body: SipRequest): SipResponse

    @GET("api/planning/scenarios")
    suspend fun getScenarios(): ScenariosResponse

    @POST("api/planning/scenarios")
    suspend fun createScenario(@Body body: CreateScenarioRequest): ScenarioResponse

    @DELETE("api/planning/scenarios/{id}")
    suspend fun deleteScenario(@Path("id") id: String): MessageResponse

    @POST("api/planning/scenarios/simulate")
    suspend fun simulateScenario(@Body body: SimulateScenarioRequest): SimulateScenarioResponse
}
