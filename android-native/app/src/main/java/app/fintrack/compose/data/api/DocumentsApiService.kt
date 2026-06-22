package app.fintrack.compose.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

interface DocumentsApiService {
    @Multipart
    @POST("api/documents")
    suspend fun upload(
        @Part file: MultipartBody.Part,
        @Part("name") name: RequestBody,
        @Part("type") type: RequestBody,
        @Part("financial_year") financialYear: RequestBody?,
        @Part("description") description: RequestBody?,
    ): DocumentDto

    @GET("api/documents")
    suspend fun getAll(@Query("type") type: String? = null, @Query("financial_year") financialYear: String? = null): List<DocumentDto>

    @GET("api/documents/{id}/download-url")
    suspend fun getDownloadUrl(@Path("id") id: String): DocumentDownloadUrlResponse

    @DELETE("api/documents/{id}")
    suspend fun delete(@Path("id") id: String): DeleteConversationResponse
}
