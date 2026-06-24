package app.fintrack.compose.ui.savingsplan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.ai.AiRepository
import app.fintrack.compose.data.api.ForecastCalendarDataDto
import app.fintrack.compose.data.api.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ForecastUiState(
    val isLoading: Boolean = false,
    val isGenerated: Boolean = false,
    val error: String? = null,
    val data: ForecastCalendarDataDto? = null,
)

@HiltViewModel
class ForecastViewModel @Inject constructor(
    private val aiRepository: AiRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ForecastUiState())
    val uiState: StateFlow<ForecastUiState> = _uiState.asStateFlow()

    fun generate(force: Boolean = false) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val data = aiRepository.getForecastCalendar(force)
                _uiState.update { it.copy(isLoading = false, isGenerated = true, data = data) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't generate forecast.")) }
            }
        }
    }
}
