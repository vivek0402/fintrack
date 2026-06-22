package app.fintrack.compose.data.splits

import app.fintrack.compose.data.api.CreateExpenseSplitRequest
import app.fintrack.compose.data.api.ExpenseSplitDto
import app.fintrack.compose.data.api.ExpenseSplitParticipantInput
import app.fintrack.compose.data.api.SplitsApiService
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SplitsRepository @Inject constructor(
    private val api: SplitsApiService,
) {
    suspend fun getAll(): List<ExpenseSplitDto> = api.getAll().splits

    suspend fun create(description: String, totalAmount: Double, participantNames: List<String>, date: String?): ExpenseSplitDto =
        api.create(CreateExpenseSplitRequest(description, totalAmount, participantNames.map { ExpenseSplitParticipantInput(it) }, date)).split

    suspend fun update(id: String, description: String, totalAmount: Double, participantNames: List<String>, date: String?): ExpenseSplitDto =
        api.update(id, CreateExpenseSplitRequest(description, totalAmount, participantNames.map { ExpenseSplitParticipantInput(it) }, date)).split

    suspend fun settle(id: String, index: Int): ExpenseSplitDto = api.settle(id, index).split

    suspend fun delete(id: String) {
        api.delete(id)
    }
}
