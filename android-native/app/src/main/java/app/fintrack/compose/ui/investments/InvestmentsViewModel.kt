package app.fintrack.compose.ui.investments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.InvestmentDto
import app.fintrack.compose.data.api.InvestmentSummaryResponse
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.investments.InvestmentsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
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
)

@HiltViewModel
class InvestmentsViewModel @Inject constructor(
    private val investmentsRepository: InvestmentsRepository,
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
}
