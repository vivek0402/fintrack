package app.fintrack.compose.data.investments

import app.fintrack.compose.data.api.CamsConfirmRequest
import app.fintrack.compose.data.api.CamsConfirmResponse
import app.fintrack.compose.data.api.CamsHoldingDto
import app.fintrack.compose.data.api.CamsImportApiService
import app.fintrack.compose.data.api.CamsImportUploadResponse
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

@Singleton
class CamsImportRepository @Inject constructor(
    private val api: CamsImportApiService,
) {
    suspend fun uploadStatement(bytes: ByteArray, fileName: String): CamsImportUploadResponse {
        val part = MultipartBody.Part.createFormData(
            "pdf", fileName, bytes.toRequestBody("application/pdf".toMediaTypeOrNull()),
        )
        return api.uploadStatement(part)
    }

    suspend fun confirmImport(jobId: String, holdings: List<CamsHoldingDto>): CamsConfirmResponse =
        api.confirmImport(jobId, CamsConfirmRequest(holdings))
}
