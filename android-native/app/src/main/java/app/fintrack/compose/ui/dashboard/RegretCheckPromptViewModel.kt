package app.fintrack.compose.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.data.settings.SettingsRepository
import app.fintrack.compose.data.transactions.TransactionsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val WEEK_MS = 7L * 24 * 60 * 60 * 1000

data class RegretCheckPromptUiState(
    val show: Boolean = false,
    val transactions: List<TransactionDto> = emptyList(),
    val marks: Map<String, String?> = emptyMap(),
    val isSubmitting: Boolean = false,
)

@HiltViewModel
class RegretCheckPromptViewModel @Inject constructor(
    private val transactionsRepository: TransactionsRepository,
    private val settingsRepository: SettingsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(RegretCheckPromptUiState())
    val uiState: StateFlow<RegretCheckPromptUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val last = settingsRepository.lastRegretCheckFlow.first()
            val due = last == null || System.currentTimeMillis() - last > WEEK_MS
            if (!due) return@launch

            try {
                val cutoff = LocalDate.now().minusDays(7)
                val recent = transactionsRepository.getAll(type = "expense").filter { tx ->
                    val amount = tx.amount.toDoubleOrNull() ?: 0.0
                    val date = runCatching { LocalDate.parse(tx.date.take(10)) }.getOrNull()
                    amount > 200 && date != null && !date.isBefore(cutoff)
                }
                if (recent.size >= 3) {
                    _uiState.update { it.copy(show = true, transactions = recent, marks = recent.associate { tx -> tx.id to null }) }
                } else {
                    settingsRepository.markRegretCheckDone()
                }
            } catch (_: Exception) {
                // Silent, matching web: a failed fetch just means the prompt doesn't show this session.
            }
        }
    }

    fun toggle(id: String, value: String) {
        _uiState.update { state ->
            val current = state.marks[id]
            state.copy(marks = state.marks + (id to if (current == value) null else value))
        }
    }

    fun submit() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            val toToggle = _uiState.value.marks.filterValues { it == "regret" }.keys
            toToggle.forEach { id -> runCatching { transactionsRepository.toggleRegret(id) } }
            settingsRepository.markRegretCheckDone()
            _uiState.update { it.copy(isSubmitting = false, show = false) }
        }
    }

    fun dismiss() {
        viewModelScope.launch { settingsRepository.markRegretCheckDone() }
        _uiState.update { it.copy(show = false) }
    }
}
