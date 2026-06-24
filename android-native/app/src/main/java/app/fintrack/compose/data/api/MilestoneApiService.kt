package app.fintrack.compose.data.api

import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

interface MilestoneApiService {
    @GET("api/milestones")
    suspend fun getAll(): MilestonesResponse

    @POST("api/milestones")
    suspend fun create(@Body body: MilestoneRequest): MilestoneResponse

    /** Plain JsonObject body (not a typed DTO) so an explicit `null` parent_id can unlink from a parent — kotlinx.serialization omits null-default fields from typed @Serializable bodies. */
    @PATCH("api/milestones/{id}")
    suspend fun update(@Path("id") id: String, @Body body: JsonObject): MilestoneResponse

    @PATCH("api/milestones/{id}/progress")
    suspend fun updateProgress(@Path("id") id: String, @Body body: MilestoneProgressRequest): MilestoneResponse

    @DELETE("api/milestones/{id}")
    suspend fun delete(@Path("id") id: String): MilestoneDeleteResponse
}
