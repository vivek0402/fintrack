package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface SplitsApiService {
    @GET("api/splits")
    suspend fun getAll(): ExpenseSplitsResponse

    @POST("api/splits")
    suspend fun create(@Body body: CreateExpenseSplitRequest): ExpenseSplitResponse

    @PUT("api/splits/{id}")
    suspend fun update(@Path("id") id: String, @Body body: CreateExpenseSplitRequest): ExpenseSplitResponse

    @PATCH("api/splits/{id}/settle/{index}")
    suspend fun settle(@Path("id") id: String, @Path("index") index: Int): ExpenseSplitResponse

    @DELETE("api/splits/{id}")
    suspend fun delete(@Path("id") id: String): SuccessResponse
}
