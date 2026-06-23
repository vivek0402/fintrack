package app.fintrack.compose.data.recurring

import app.fintrack.compose.data.api.CreateRecurringRequest
import app.fintrack.compose.data.api.ProcessRecurringResponse
import app.fintrack.compose.data.api.RecurringApiService
import app.fintrack.compose.data.api.RecurringDto
import app.fintrack.compose.data.api.UpdateRecurringRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RecurringRepository @Inject constructor(
    private val api: RecurringApiService,
) {
    suspend fun getAll(): List<RecurringDto> = api.getAll().recurring

    suspend fun create(
        type: String,
        amount: Double,
        description: String,
        categoryId: String?,
        frequency: String,
        dayOfMonth: Int?,
    ): RecurringDto = api.create(
        CreateRecurringRequest(type, amount, description, category_id = categoryId, frequency = frequency, day_of_month = dayOfMonth)
    ).recurring

    suspend fun update(
        id: String,
        type: String,
        amount: Double,
        description: String,
        categoryId: String?,
        frequency: String,
        dayOfMonth: Int?,
    ): RecurringDto = api.update(
        id,
        UpdateRecurringRequest(type, amount, description, frequency = frequency, day_of_month = dayOfMonth, category_id = categoryId)
    ).recurring

    suspend fun toggle(id: String): RecurringDto = api.toggle(id).recurring

    suspend fun delete(id: String) = api.delete(id)

    suspend fun process(): ProcessRecurringResponse = api.process()
}
