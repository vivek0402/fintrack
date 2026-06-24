package app.fintrack.compose.data.milestones

import app.fintrack.compose.data.api.MilestoneApiService
import app.fintrack.compose.data.api.MilestoneDeleteResponse
import app.fintrack.compose.data.api.MilestoneDto
import app.fintrack.compose.data.api.MilestoneProgressRequest
import app.fintrack.compose.data.api.MilestoneRequest
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Singleton
class MilestoneRepository @Inject constructor(
    private val api: MilestoneApiService,
) {
    suspend fun getAll(): List<MilestoneDto> = api.getAll().milestones

    suspend fun create(
        name: String,
        description: String?,
        targetDate: String,
        targetAmount: Double?,
        currentAmount: Double?,
        parentId: String?,
        priority: Int?,
    ): MilestoneDto = api.create(
        MilestoneRequest(
            name = name,
            description = description,
            target_date = targetDate,
            target_amount = targetAmount,
            current_amount = currentAmount,
            parent_id = parentId,
            priority = priority,
        ),
    ).milestone

    /** `parentId == null` explicitly unlinks an existing parent (sends a literal JSON null, not an omitted field). */
    suspend fun update(
        id: String,
        name: String,
        description: String?,
        targetDate: String,
        targetAmount: Double?,
        currentAmount: Double?,
        parentId: String?,
        priority: Int?,
    ): MilestoneDto {
        val body = buildJsonObject {
            put("name", JsonPrimitive(name))
            put("description", description?.let { JsonPrimitive(it) } ?: JsonNull)
            put("target_date", JsonPrimitive(targetDate))
            put("target_amount", targetAmount?.let { JsonPrimitive(it) } ?: JsonNull)
            put("current_amount", currentAmount?.let { JsonPrimitive(it) } ?: JsonNull)
            put("parent_id", parentId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("priority", priority?.let { JsonPrimitive(it) } ?: JsonNull)
        }
        return api.update(id, body).milestone
    }

    suspend fun updateProgress(id: String, currentAmount: Double?, status: String?): MilestoneDto =
        api.updateProgress(id, MilestoneProgressRequest(currentAmount, status)).milestone

    suspend fun delete(id: String): MilestoneDeleteResponse = api.delete(id)
}
