package app.fintrack.compose.data.opportunities

import app.fintrack.compose.data.api.OpportunitiesApiService
import app.fintrack.compose.data.api.OpportunityDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OpportunitiesRepository @Inject constructor(
    private val api: OpportunitiesApiService,
) {
    suspend fun detect(): List<OpportunityDto> = api.detect().opportunities

    suspend fun dismiss(id: String) = api.dismiss(id)

    suspend fun markActedOn(id: String) = api.markActedOn(id)
}
