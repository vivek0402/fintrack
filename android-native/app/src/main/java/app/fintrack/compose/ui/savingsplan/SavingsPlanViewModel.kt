package app.fintrack.compose.ui.savingsplan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.SipResponse
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.planning.PlanningRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class SipMode { GOAL_BASED, GROWTH_BASED }

data class SavingsPlanUiState(
    val mode: SipMode = SipMode.GOAL_BASED,
    val targetYears: String = "10",
    val expectedAnnualReturnPct: String = "12",
    val goalAmount: String = "",
    val monthlySip: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val result: SipResponse? = null,
)

@HiltViewModel
class SavingsPlanViewModel @Inject constructor(
    private val planningRepository: PlanningRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SavingsPlanUiState())
    val uiState: StateFlow<SavingsPlanUiState> = _uiState.asStateFlow()

    fun update(transform: (SavingsPlanUiState) -> SavingsPlanUiState) =
        _uiState.update { transform(it).copy(error = null, result = null) }

    fun setMode(mode: SipMode) = _uiState.update { it.copy(mode = mode, error = null, result = null) }

    fun calculate() {
        val state = _uiState.value
        val years = state.targetYears.toDoubleOrNull()
        val returnPct = state.expectedAnnualReturnPct.toDoubleOrNull() ?: 12.0
        if (years == null || years <= 0) {
            _uiState.update { it.copy(error = "Enter a valid number of years.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val result = when (state.mode) {
                    SipMode.GOAL_BASED -> {
                        val goal = state.goalAmount.toDoubleOrNull()
                        if (goal == null || goal <= 0) {
                            _uiState.update { it.copy(isLoading = false, error = "Enter a valid goal amount.") }
                            return@launch
                        }
                        planningRepository.calculateSipGoalBased(years, goal, returnPct)
                    }
                    SipMode.GROWTH_BASED -> {
                        val sip = state.monthlySip.toDoubleOrNull()
                        if (sip == null || sip <= 0) {
                            _uiState.update { it.copy(isLoading = false, error = "Enter a valid monthly SIP amount.") }
                            return@launch
                        }
                        planningRepository.calculateSipGrowthBased(years, sip, returnPct)
                    }
                }
                _uiState.update { it.copy(isLoading = false, result = result) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't calculate SIP plan.")) }
            }
        }
    }
}
