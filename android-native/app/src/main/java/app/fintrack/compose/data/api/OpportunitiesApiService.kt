package app.fintrack.compose.data.api

import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

interface OpportunitiesApiService {
    @POST("api/ai/opportunities/detect")
    suspend fun detect(): DetectOpportunitiesResponse

    @GET("api/ai/opportunities")
    suspend fun getAll(): OpportunitiesListResponse

    @PATCH("api/ai/opportunities/{id}/dismiss")
    suspend fun dismiss(@Path("id") id: String): OpportunityDto

    @PATCH("api/ai/opportunities/{id}/acted-on")
    suspend fun markActedOn(@Path("id") id: String): OpportunityDto
}
