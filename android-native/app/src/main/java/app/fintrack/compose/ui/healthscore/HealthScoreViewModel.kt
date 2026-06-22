package app.fintrack.compose.ui.healthscore

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.ai.AiRepository
import app.fintrack.compose.data.api.HealthReportResponse
import app.fintrack.compose.data.api.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HealthScoreUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val report: HealthReportResponse? = null,
)

@HiltViewModel
class HealthScoreViewModel @Inject constructor(
    private val aiRepository: AiRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(HealthScoreUiState())
    val uiState: StateFlow<HealthScoreUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val report = aiRepository.getHealthReport()
                _uiState.update { it.copy(isLoading = false, report = report) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't generate health report.")) }
            }
        }
    }
}
