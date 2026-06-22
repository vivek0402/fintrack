package app.fintrack.compose.ui.debt

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.CreditUtilizationResponse
import app.fintrack.compose.data.api.DtiResponse
import app.fintrack.compose.data.api.PayoffOptimizerResponse
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.debt.DebtRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DebtUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val dti: DtiResponse? = null,
    val creditUtilization: CreditUtilizationResponse? = null,
    val payoffOptimizer: PayoffOptimizerResponse? = null,
    val extraMonthlyPayment: String = "",
    val isRecalculating: Boolean = false,
)

@HiltViewModel
class DebtViewModel @Inject constructor(
    private val debtRepository: DebtRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(DebtUiState())
    val uiState: StateFlow<DebtUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                coroutineScope {
                    val dtiDeferred = async { debtRepository.getDti() }
                    val creditDeferred = async { debtRepository.getCreditUtilization() }
                    val payoffDeferred = async { debtRepository.getPayoffOptimizer() }
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            dti = dtiDeferred.await(),
                            creditUtilization = creditDeferred.await(),
                            payoffOptimizer = payoffDeferred.await(),
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load your debt overview.")) }
            }
        }
    }

    fun updateExtraPayment(value: String) = _uiState.update { it.copy(extraMonthlyPayment = value) }

    fun recalculatePayoff() {
        val extra = _uiState.value.extraMonthlyPayment.toDoubleOrNull()
        viewModelScope.launch {
            _uiState.update { it.copy(isRecalculating = true, error = null) }
            try {
                val result = debtRepository.getPayoffOptimizer(extra)
                _uiState.update { it.copy(isRecalculating = false, payoffOptimizer = result) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isRecalculating = false, error = e.toUserMessage("Couldn't recalculate the payoff plan.")) }
            }
        }
    }
}
