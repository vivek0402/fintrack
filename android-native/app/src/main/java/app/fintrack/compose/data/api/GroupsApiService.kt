package app.fintrack.compose.data.api

import kotlinx.serialization.json.JsonElement
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.PUT
import retrofit2.http.POST
import retrofit2.http.Path

interface GroupsApiService {
    @GET("api/groups")
    suspend fun getAll(): GroupsResponse

    @POST("api/groups")
    suspend fun create(@Body body: CreateGroupRequest): GroupResponse

    @GET("api/groups/{id}")
    suspend fun getDetail(@Path("id") id: Int): GroupDetailResponse

    @PATCH("api/groups/{id}")
    suspend fun update(@Path("id") id: Int, @Body body: UpdateGroupRequest): GroupResponse

    @DELETE("api/groups/{id}")
    suspend fun delete(@Path("id") id: Int): SuccessResponse

    @POST("api/groups/{id}/transactions/{txId}")
    suspend fun linkTransaction(@Path("id") id: Int, @Path("txId") txId: String): SuccessResponse

    @DELETE("api/groups/{id}/transactions/{txId}")
    suspend fun unlinkTransaction(@Path("id") id: Int, @Path("txId") txId: String): SuccessResponse

    @POST("api/groups/{id}/splits")
    suspend fun addSplit(@Path("id") id: Int, @Body body: CreateSplitRequest): SplitResponse

    @PUT("api/groups/{id}/splits/{splitId}")
    suspend fun updateSplit(@Path("id") id: Int, @Path("splitId") splitId: Int, @Body body: CreateSplitRequest): SplitResponse

    @PATCH("api/groups/{id}/splits/{splitId}/shares/{shareId}/settle")
    suspend fun toggleShareSettle(@Path("id") id: Int, @Path("splitId") splitId: Int, @Path("shareId") shareId: Int): JsonElement

    @GET("api/groups/{id}/settlements")
    suspend fun getSettlements(@Path("id") id: Int): SettlementsResponse
}
