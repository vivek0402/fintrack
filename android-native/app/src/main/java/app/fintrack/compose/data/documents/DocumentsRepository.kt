package app.fintrack.compose.data.documents

import app.fintrack.compose.data.api.DocumentDownloadUrlResponse
import app.fintrack.compose.data.api.DocumentDto
import app.fintrack.compose.data.api.DocumentsApiService
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

@Singleton
class DocumentsRepository @Inject constructor(
    private val api: DocumentsApiService,
) {
    suspend fun getAll(type: String? = null, financialYear: String? = null): List<DocumentDto> =
        api.getAll(type, financialYear)

    suspend fun upload(
        bytes: ByteArray,
        fileName: String,
        mimeType: String,
        name: String,
        type: String,
        financialYear: String?,
        description: String?,
    ): DocumentDto {
        val filePart = MultipartBody.Part.createFormData(
            "file", fileName, bytes.toRequestBody(mimeType.toMediaTypeOrNull()),
        )
        val textType = "text/plain".toMediaTypeOrNull()
        return api.upload(
            file = filePart,
            name = name.toRequestBody(textType),
            type = type.toRequestBody(textType),
            financialYear = financialYear?.toRequestBody(textType),
            description = description?.toRequestBody(textType),
        )
    }

    suspend fun getDownloadUrl(id: String): DocumentDownloadUrlResponse = api.getDownloadUrl(id)

    suspend fun delete(id: String) {
        api.delete(id)
    }
}
