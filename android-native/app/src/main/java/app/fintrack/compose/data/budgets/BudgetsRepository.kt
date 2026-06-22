package app.fintrack.compose.data.budgets

import app.fintrack.compose.data.api.BudgetDto
import app.fintrack.compose.data.api.BudgetsApiService
import app.fintrack.compose.data.api.CreateBudgetRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BudgetsRepository @Inject constructor(
    private val api: BudgetsApiService,
) {
    suspend fun getAll(month: Int? = null, year: Int? = null): List<BudgetDto> =
        api.getAll(month, year).budgets

    suspend fun create(categoryId: String, amount: Double, month: Int, year: Int): BudgetDto =
        api.create(CreateBudgetRequest(categoryId, amount, month, year)).budget

    suspend fun delete(id: String) = api.delete(id)
}
