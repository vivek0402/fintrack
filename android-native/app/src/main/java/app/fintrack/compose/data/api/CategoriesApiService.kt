package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface CategoriesApiService {
    @GET("api/categories")
    suspend fun getAll(): CategoriesResponse

    @POST("api/categories")
    suspend fun create(@Body body: CreateCategoryRequest): CategoryResponse

    @DELETE("api/categories/{id}")
    suspend fun delete(@Path("id") id: String): MessageResponse
}
