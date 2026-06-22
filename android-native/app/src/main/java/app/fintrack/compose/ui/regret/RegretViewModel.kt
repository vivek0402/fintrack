package app.fintrack.compose.ui.regret

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.ai.AiRepository
import app.fintrack.compose.data.api.RegretPatternsResponse
import app.fintrack.compose.data.api.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RegretUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val result: RegretPatternsResponse? = null,
)

@HiltViewModel
class RegretViewModel @Inject constructor(
    private val aiRepository: AiRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(RegretUiState())
    val uiState: StateFlow<RegretUiState> = _uiState.asStateFlow()

    fun analyse() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val result = aiRepository.getRegretPatterns()
                _uiState.update { it.copy(isLoading = false, result = result) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't analyse your regretted purchases.")) }
            }
        }
    }
}
