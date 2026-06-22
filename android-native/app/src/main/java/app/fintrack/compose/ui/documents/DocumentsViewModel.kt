package app.fintrack.compose.ui.documents

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.DOCUMENT_ALLOWED_EXTENSIONS
import app.fintrack.compose.data.api.DOCUMENT_MAX_FILE_SIZE_BYTES
import app.fintrack.compose.data.api.DOCUMENT_TYPES
import app.fintrack.compose.data.api.DocumentDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.documents.DocumentsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

fun financialYearOptions(count: Int = 5): List<String> {
    val now = LocalDate.now()
    val startYear = if (now.monthValue >= 4) now.year else now.year - 1
    return (0 until count).map { offset ->
        val y = startYear - offset
        "$y-${(y + 1).toString().takeLast(2)}"
    }
}

data class UploadFormState(
    val pickedUri: Uri? = null,
    val pickedFileName: String = "",
    val pickedFileSize: Long = 0,
    val pickedMimeType: String = "",
    val name: String = "",
    val type: String = DOCUMENT_TYPES.first().first,
    val financialYear: String = "",
    val description: String = "",
    val isUploading: Boolean = false,
    val error: String? = null,
)

data class DocumentsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val documents: List<DocumentDto> = emptyList(),
    val typeFilter: String? = null,
    val fyFilter: String? = null,
    val showUploadSheet: Boolean = false,
    val uploadForm: UploadFormState = UploadFormState(),
    val deletingId: String? = null,
    val actionError: String? = null,
) {
    val filtered: List<DocumentDto>
        get() = documents
            .filter { typeFilter == null || it.type == typeFilter }
            .filter { fyFilter == null || it.financial_year == fyFilter }

    val availableFinancialYears: List<String>
        get() = documents.mapNotNull { it.financial_year }.distinct().sortedDescending()
}

@HiltViewModel
class DocumentsViewModel @Inject constructor(
    private val repository: DocumentsRepository,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val _uiState = MutableStateFlow(DocumentsUiState())
    val uiState: StateFlow<DocumentsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val documents = repository.getAll()
                _uiState.update { it.copy(isLoading = false, documents = documents) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load your documents.")) }
            }
        }
    }

    fun setTypeFilter(type: String?) = _uiState.update { it.copy(typeFilter = type) }
    fun setFyFilter(fy: String?) = _uiState.update { it.copy(fyFilter = fy) }

    fun openUploadSheet() = _uiState.update { it.copy(showUploadSheet = true, uploadForm = UploadFormState()) }
    fun closeUploadSheet() = _uiState.update { it.copy(showUploadSheet = false) }

    fun updateUploadForm(transform: (UploadFormState) -> UploadFormState) =
        _uiState.update { it.copy(uploadForm = transform(it.uploadForm).copy(error = null)) }

    fun onFilePicked(uri: Uri) {
        var displayName = ""
        var size = 0L
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (cursor.moveToFirst()) {
                if (nameIdx >= 0) displayName = cursor.getString(nameIdx) ?: ""
                if (sizeIdx >= 0) size = cursor.getLong(sizeIdx)
            }
        }
        val extension = "." + displayName.substringAfterLast('.', "").lowercase()
        if (extension !in DOCUMENT_ALLOWED_EXTENSIONS) {
            updateUploadForm { it.copy(error = "Unsupported file type. Allowed: ${DOCUMENT_ALLOWED_EXTENSIONS.joinToString(", ")}") }
            return
        }
        if (size > DOCUMENT_MAX_FILE_SIZE_BYTES) {
            updateUploadForm { it.copy(error = "File is too large. Maximum size is 20MB.") }
            return
        }
        val mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"
        updateUploadForm {
            it.copy(
                pickedUri = uri,
                pickedFileName = displayName,
                pickedFileSize = size,
                pickedMimeType = mimeType,
                name = it.name.ifBlank { displayName.substringBeforeLast('.', displayName) },
            )
        }
    }

    fun upload() {
        val form = _uiState.value.uploadForm
        val uri = form.pickedUri
        if (uri == null) {
            updateUploadForm { it.copy(error = "Choose a file to upload.") }
            return
        }
        if (form.name.isBlank()) {
            updateUploadForm { it.copy(error = "Document name is required.") }
            return
        }
        viewModelScope.launch {
            updateUploadForm { it.copy(isUploading = true, error = null) }
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: throw IllegalStateException("Couldn't read the selected file.")
                repository.upload(
                    bytes = bytes,
                    fileName = form.pickedFileName,
                    mimeType = form.pickedMimeType,
                    name = form.name.trim(),
                    type = form.type,
                    financialYear = form.financialYear.ifBlank { null },
                    description = form.description.trim().ifBlank { null },
                )
                _uiState.update { it.copy(showUploadSheet = false) }
                load()
            } catch (e: Exception) {
                updateUploadForm { it.copy(isUploading = false, error = e.toUserMessage("Couldn't upload this document.")) }
            }
        }
    }

    fun download(document: DocumentDto) {
        viewModelScope.launch {
            try {
                val result = repository.getDownloadUrl(document.id)
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(result.download_url)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't open this document.")) }
            }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(deletingId = id) }
            try {
                repository.delete(id)
                _uiState.update { it.copy(deletingId = null, documents = it.documents.filterNot { d -> d.id == id }) }
            } catch (e: Exception) {
                _uiState.update { it.copy(deletingId = null, actionError = e.toUserMessage("Couldn't delete this document.")) }
            }
        }
    }

    fun clearActionError() = _uiState.update { it.copy(actionError = null) }
}
