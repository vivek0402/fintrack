package app.fintrack.compose.ui.cashflow

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.CashflowResponse
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.planning.PlanningRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CashFlowUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val cashflow: CashflowResponse? = null,
)

@HiltViewModel
class CashFlowViewModel @Inject constructor(
    private val planningRepository: PlanningRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(CashFlowUiState())
    val uiState: StateFlow<CashFlowUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val cashflow = planningRepository.getCashflow()
                _uiState.update { it.copy(isLoading = false, cashflow = cashflow) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load cash flow.")) }
            }
        }
    }
}
