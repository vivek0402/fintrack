package app.fintrack.compose.ui.fire

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.FireResponse
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.planning.PlanningRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FireUiState(
    val monthlyExpenses: String = "",
    val expectedAnnualReturnPct: String = "12",
    val inflationPct: String = "6",
    val swrPct: String = "4",
    val extraMonthlySavings: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val result: FireResponse? = null,
)

@HiltViewModel
class FireCalculatorViewModel @Inject constructor(
    private val planningRepository: PlanningRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(FireUiState())
    val uiState: StateFlow<FireUiState> = _uiState.asStateFlow()

    init {
        calculate()
    }

    fun update(transform: (FireUiState) -> FireUiState) = _uiState.update { transform(it).copy(error = null) }

    fun calculate() {
        val state = _uiState.value
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val result = planningRepository.calculateFire(
                    monthlyExpenses = state.monthlyExpenses.toDoubleOrNull(),
                    expectedAnnualReturnPct = state.expectedAnnualReturnPct.toDoubleOrNull() ?: 12.0,
                    inflationPct = state.inflationPct.toDoubleOrNull() ?: 6.0,
                    swrPct = state.swrPct.toDoubleOrNull() ?: 4.0,
                    extraMonthlySavings = state.extraMonthlySavings.toDoubleOrNull() ?: 0.0,
                )
                _uiState.update { it.copy(isLoading = false, result = result) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't calculate FIRE projection.")) }
            }
        }
    }
}
