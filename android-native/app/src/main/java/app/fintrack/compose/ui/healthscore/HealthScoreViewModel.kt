package app.fintrack.compose.ui.healthscore

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.analytics.AnalyticsRepository
import app.fintrack.compose.data.budgets.BudgetsRepository
import app.fintrack.compose.data.debt.DebtRepository
import app.fintrack.compose.data.goals.GoalsRepository
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.domain.HealthBudgetInput
import app.fintrack.compose.domain.HealthGoalInput
import app.fintrack.compose.domain.HealthScoreInput
import app.fintrack.compose.domain.HealthScoreResult
import app.fintrack.compose.domain.calculateHealthScore
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HealthScoreUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val result: HealthScoreResult? = null,
)

@HiltViewModel
class HealthScoreViewModel @Inject constructor(
    private val analyticsRepository: AnalyticsRepository,
    private val budgetsRepository: BudgetsRepository,
    private val goalsRepository: GoalsRepository,
    private val debtRepository: DebtRepository,
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
                val now = LocalDate.now()
                val month = now.monthValue
                val year = now.year
                coroutineScope {
                    val summaryDeferred = async { analyticsRepository.getSummary(month, year) }
                    val trendsDeferred = async { analyticsRepository.getTrends() }
                    val budgetsDeferred = async { budgetsRepository.getAll(month, year) }
                    val goalsDeferred = async { goalsRepository.getAll() }
                    val investRatioDeferred = async { runCatching { analyticsRepository.getInvestmentRatio() }.getOrNull() }
                    val dtiDeferred = async { runCatching { debtRepository.getDti() }.getOrNull() }
                    val ccDeferred = async { runCatching { debtRepository.getCreditUtilization() }.getOrNull() }

                    val summary = summaryDeferred.await().summary
                    val trends = trendsDeferred.await().trends
                    val budgets = budgetsDeferred.await()
                    val goals = goalsDeferred.await()
                    val investRatio = investRatioDeferred.await()
                    val dti = dtiDeferred.await()
                    val cc = ccDeferred.await()

                    val monthMap = LinkedHashMap<String, Pair<Double, Double>>()
                    trends.sortedWith(compareBy({ it.year }, { it.month })).forEach { row ->
                        val key = "${row.year.toInt()}-${row.month.toInt()}"
                        val (inc, exp) = monthMap[key] ?: (0.0 to 0.0)
                        val total = row.total.toDoubleOrNull() ?: 0.0
                        monthMap[key] = if (row.type == "income") (total to exp) else (inc to total)
                    }
                    val lastSix = monthMap.values.toList().takeLast(6)

                    val input = HealthScoreInput(
                        income = summary.total_income,
                        expenses = summary.total_expenses,
                        budgets = budgets.map { HealthBudgetInput(it.amount.toDoubleOrNull() ?: 0.0, it.spent.toDoubleOrNull() ?: 0.0) },
                        goals = goals.map { HealthGoalInput(it.saved_amount.toDoubleOrNull() ?: 0.0, it.target_amount.toDoubleOrNull() ?: 0.0, it.deadline) },
                        monthlyIncome = lastSix.map { it.first },
                        monthlyExpenses = lastSix.map { it.second },
                        investedThisMonth = investRatio?.invested_this_month ?: 0.0,
                        dtiRatio = dti?.dti_ratio ?: 0.0,
                        ccUtilizationPct = cc?.aggregate?.overall_utilization_pct ?: 0.0,
                    )

                    _uiState.update { it.copy(isLoading = false, result = calculateHealthScore(input)) }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't calculate your health score.")) }
            }
        }
    }
}
