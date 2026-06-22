package app.fintrack.compose.data.goals

import app.fintrack.compose.data.api.CreateGoalRequest
import app.fintrack.compose.data.api.GoalDto
import app.fintrack.compose.data.api.GoalsApiService
import app.fintrack.compose.data.api.UpdateFundsRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class GoalsRepository @Inject constructor(
    private val api: GoalsApiService,
) {
    suspend fun getAll(): List<GoalDto> = api.getAll().goals

    suspend fun create(name: String, targetAmount: Double, deadline: String?, color: String?): GoalDto =
        api.create(CreateGoalRequest(name, targetAmount, deadline, color)).goal

    suspend fun addFunds(id: String, amount: Double): GoalDto = api.updateFunds(id, UpdateFundsRequest(amount)).goal

    suspend fun delete(id: String) = api.delete(id)
}
