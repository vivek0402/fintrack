package app.fintrack.compose.ui.analytics

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.ai.AiRepository
import app.fintrack.compose.data.api.RegretPatternsResponse
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.transactions.TransactionsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AnalyticsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val transactions: List<TransactionDto> = emptyList(),
    val isRegretLoading: Boolean = false,
    val regretPatterns: RegretPatternsResponse? = null,
    val regretError: String? = null,
)

@HiltViewModel
class AnalyticsViewModel @Inject constructor(
    private val transactionsRepository: TransactionsRepository,
    private val aiRepository: AiRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AnalyticsUiState())
    val uiState: StateFlow<AnalyticsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val now = LocalDate.now().year
                val current = transactionsRepository.getAll(year = now)
                val previous = transactionsRepository.getAll(year = now - 1)
                _uiState.update { it.copy(isLoading = false, transactions = current + previous) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load your analytics.")) }
            }
            loadRegretPatterns()
        }
    }

    private fun loadRegretPatterns() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRegretLoading = true, regretError = null) }
            try {
                val patterns = aiRepository.getRegretPatterns()
                _uiState.update { it.copy(isRegretLoading = false, regretPatterns = patterns) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isRegretLoading = false, regretError = e.toUserMessage("Couldn't load regret insights.")) }
            }
        }
    }
}
