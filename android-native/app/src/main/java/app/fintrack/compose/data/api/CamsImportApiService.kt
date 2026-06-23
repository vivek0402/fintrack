package app.fintrack.compose.data.api

import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path

interface CamsImportApiService {
    @Multipart
    @POST("api/import/cams-statement")
    suspend fun uploadStatement(@Part pdf: MultipartBody.Part): CamsImportUploadResponse

    @POST("api/import/cams-statement/{jobId}/confirm")
    suspend fun confirmImport(@Path("jobId") jobId: String, @Body body: CamsConfirmRequest): CamsConfirmResponse
}
