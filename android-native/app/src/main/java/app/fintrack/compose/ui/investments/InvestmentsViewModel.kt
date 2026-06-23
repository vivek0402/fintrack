package app.fintrack.compose.ui.investments

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.CamsHoldingDto
import app.fintrack.compose.data.api.InvestmentDto
import app.fintrack.compose.data.api.InvestmentSummaryResponse
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.investments.CamsImportRepository
import app.fintrack.compose.data.investments.InvestmentsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class CamsImportStep { Upload, Parsing, Review, Success }

data class CamsImportState(
    val step: CamsImportStep = CamsImportStep.Upload,
    val pickedUri: Uri? = null,
    val pickedFileName: String = "",
    val jobId: String? = null,
    val holdings: List<CamsHoldingDto> = emptyList(),
    val createdCount: Int = 0,
    val updatedCount: Int = 0,
    val isBusy: Boolean = false,
    val error: String? = null,
)

data class InvestmentFormState(
    val type: String = "mutual_fund",
    val name: String = "",
    val units: String = "",
    val purchasePricePerUnit: String = "",
    val currentNavOrPrice: String = "",
    val purchaseDate: String = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE),
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class InvestmentsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val investments: List<InvestmentDto> = emptyList(),
    val summary: InvestmentSummaryResponse? = null,
    val showForm: Boolean = false,
    val form: InvestmentFormState = InvestmentFormState(),
    val showCamsImport: Boolean = false,
    val camsImport: CamsImportState = CamsImportState(),
)

@HiltViewModel
class InvestmentsViewModel @Inject constructor(
    private val investmentsRepository: InvestmentsRepository,
    private val camsImportRepository: CamsImportRepository,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val _uiState = MutableStateFlow(InvestmentsUiState())
    val uiState: StateFlow<InvestmentsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                coroutineScope {
                    val investmentsDeferred = async { investmentsRepository.getAll() }
                    val summaryDeferred = async { investmentsRepository.getSummary() }
                    _uiState.update {
                        it.copy(isLoading = false, investments = investmentsDeferred.await(), summary = summaryDeferred.await())
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load investments.")) }
            }
        }
    }

    fun openCreateForm() = _uiState.update { it.copy(showForm = true, form = InvestmentFormState()) }
    fun closeForm() = _uiState.update { it.copy(showForm = false) }

    fun updateForm(transform: (InvestmentFormState) -> InvestmentFormState) =
        _uiState.update { it.copy(form = transform(it.form).copy(error = null)) }

    fun save() {
        val form = _uiState.value.form
        val units = form.units.toDoubleOrNull()
        val purchasePrice = form.purchasePricePerUnit.toDoubleOrNull()
        val currentPrice = form.currentNavOrPrice.toDoubleOrNull()
        if (form.name.isBlank()) {
            updateForm { it.copy(error = "Enter a name.") }
            return
        }
        if (units == null || units <= 0) {
            updateForm { it.copy(error = "Enter valid units.") }
            return
        }
        if (purchasePrice == null || purchasePrice < 0 || currentPrice == null || currentPrice < 0) {
            updateForm { it.copy(error = "Enter valid prices.") }
            return
        }
        viewModelScope.launch {
            updateForm { it.copy(isSaving = true, error = null) }
            try {
                investmentsRepository.create(
                    type = form.type,
                    name = form.name.trim(),
                    tickerOrFolio = null,
                    units = units,
                    purchasePricePerUnit = purchasePrice,
                    currentNavOrPrice = currentPrice,
                    purchaseDate = form.purchaseDate,
                )
                _uiState.update { it.copy(showForm = false) }
                load()
            } catch (e: Exception) {
                updateForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save investment.")) }
            }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try {
                investmentsRepository.delete(id)
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't delete investment.")) }
            }
        }
    }

    fun openCamsImport() = _uiState.update { it.copy(showCamsImport = true, camsImport = CamsImportState()) }
    fun closeCamsImport() = _uiState.update { it.copy(showCamsImport = false) }

    private fun updateCamsImport(transform: (CamsImportState) -> CamsImportState) =
        _uiState.update { it.copy(camsImport = transform(it.camsImport).copy(error = null)) }

    fun onCamsFilePicked(uri: Uri) {
        var displayName = ""
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (cursor.moveToFirst() && nameIdx >= 0) displayName = cursor.getString(nameIdx) ?: ""
        }
        val mimeType = context.contentResolver.getType(uri)
        if (mimeType != "application/pdf" && !displayName.lowercase().endsWith(".pdf")) {
            updateCamsImport { it.copy(error = "Please select a PDF file. CAMS CAS statements are downloaded as PDF.") }
            return
        }
        updateCamsImport { it.copy(pickedUri = uri, pickedFileName = displayName.ifBlank { "statement.pdf" }) }
    }

    fun parseCamsStatement() {
        val uri = _uiState.value.camsImport.pickedUri ?: return
        val fileName = _uiState.value.camsImport.pickedFileName
        viewModelScope.launch {
            updateCamsImport { it.copy(step = CamsImportStep.Parsing, isBusy = true, error = null) }
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: throw IllegalStateException("Couldn't read the selected file.")
                val response = camsImportRepository.uploadStatement(bytes, fileName)
                updateCamsImport {
                    it.copy(step = CamsImportStep.Review, isBusy = false, jobId = response.jobId, holdings = response.holdings)
                }
            } catch (e: Exception) {
                updateCamsImport { it.copy(step = CamsImportStep.Upload, isBusy = false, error = e.toUserMessage("Failed to parse CAMS statement. Please try again.")) }
            }
        }
    }

    fun removeCamsHolding(index: Int) =
        updateCamsImport { it.copy(holdings = it.holdings.filterIndexed { i, _ -> i != index }) }

    fun confirmCamsImport() {
        val state = _uiState.value.camsImport
        val jobId = state.jobId ?: return
        viewModelScope.launch {
            updateCamsImport { it.copy(isBusy = true, error = null) }
            try {
                val result = camsImportRepository.confirmImport(jobId, state.holdings)
                updateCamsImport {
                    it.copy(step = CamsImportStep.Success, isBusy = false, createdCount = result.created, updatedCount = result.updated)
                }
                load()
            } catch (e: Exception) {
                updateCamsImport { it.copy(isBusy = false, error = e.toUserMessage("Failed to import holdings.")) }
            }
        }
    }

    fun resetCamsImport() = updateCamsImport { CamsImportState() }
}
