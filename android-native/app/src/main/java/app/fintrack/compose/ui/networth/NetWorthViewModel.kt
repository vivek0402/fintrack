package app.fintrack.compose.ui.networth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.analytics.AnalyticsRepository
import app.fintrack.compose.data.api.NetWorthResponse
import app.fintrack.compose.data.api.WealthVelocityResponse
import app.fintrack.compose.data.api.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class NetWorthUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val netWorth: NetWorthResponse? = null,
    val wealthVelocity: WealthVelocityResponse? = null,
)

@HiltViewModel
class NetWorthViewModel @Inject constructor(
    private val analyticsRepository: AnalyticsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(NetWorthUiState())
    val uiState: StateFlow<NetWorthUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                coroutineScope {
                    val netWorthDeferred = async { analyticsRepository.getNetWorth() }
                    val velocityDeferred = async { analyticsRepository.getWealthVelocity() }
                    _uiState.update {
                        it.copy(isLoading = false, netWorth = netWorthDeferred.await(), wealthVelocity = velocityDeferred.await())
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load net worth.")) }
            }
        }
    }
}
