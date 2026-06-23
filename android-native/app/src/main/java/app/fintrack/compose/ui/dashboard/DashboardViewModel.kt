package app.fintrack.compose.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.ai.AiRepository
import app.fintrack.compose.data.analytics.AnalyticsRepository
import app.fintrack.compose.data.api.BudgetDto
import app.fintrack.compose.data.api.CreditUtilizationResponse
import app.fintrack.compose.data.api.DailyBriefingDto
import app.fintrack.compose.data.api.DtiResponse
import app.fintrack.compose.data.api.GoalDto
import app.fintrack.compose.data.api.InvestmentRatioResponse
import app.fintrack.compose.data.api.NetWorthResponse
import app.fintrack.compose.data.api.OpportunityDto
import app.fintrack.compose.data.api.ProfileDto
import app.fintrack.compose.data.api.SummaryResponse
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.data.api.TrendsResponse
import app.fintrack.compose.data.api.WealthVelocityResponse
import app.fintrack.compose.data.api.WeeklyBriefingDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.budgets.BudgetsRepository
import app.fintrack.compose.data.debt.DebtRepository
import app.fintrack.compose.data.goals.GoalsRepository
import app.fintrack.compose.data.opportunities.OpportunitiesRepository
import app.fintrack.compose.data.profile.ProfileRepository
import app.fintrack.compose.data.transactions.TransactionsRepository
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

data class DashboardUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val summary: SummaryResponse? = null,
    val netWorth: NetWorthResponse? = null,
    val wealthVelocity: WealthVelocityResponse? = null,
    val trends: TrendsResponse? = null,
    val investmentRatio: InvestmentRatioResponse? = null,
    val budgets: List<BudgetDto> = emptyList(),
    val recentTransactions: List<TransactionDto> = emptyList(),
    val goals: List<GoalDto> = emptyList(),
    val dti: DtiResponse? = null,
    val creditUtilization: CreditUtilizationResponse? = null,
    val profile: ProfileDto? = null,
    val dismissedCreditAlert: Boolean = false,
    val dismissedDtiAlert: Boolean = false,

    val dailyBrief: DailyBriefingDto? = null,
    val isDailyBriefLoading: Boolean = true,
    val isDailyBriefRefreshing: Boolean = false,
    val dailyBriefError: String? = null,

    val weeklyBrief: WeeklyBriefingDto? = null,
    val isWeeklyBriefLoading: Boolean = true,
    val weeklyBriefError: String? = null,

    val opportunities: List<OpportunityDto> = emptyList(),
    val isOpportunitiesLoading: Boolean = true,
) {
    /** Deterministic port of web's calculateHealthScore() — see HealthScoreCalculator.kt. */
    val healthScoreResult: HealthScoreResult?
        get() {
            val s = summary?.summary ?: return null
            val trendRows = trends?.trends.orEmpty()
            val monthMap = LinkedHashMap<String, Pair<Double, Double>>()
            trendRows.sortedWith(compareBy({ it.year }, { it.month })).forEach { row ->
                val key = "${row.year.toInt()}-${row.month.toInt()}"
                val (inc, exp) = monthMap[key] ?: (0.0 to 0.0)
                val total = row.total.toDoubleOrNull() ?: 0.0
                monthMap[key] = if (row.type == "income") (total to exp) else (inc to total)
            }
            val lastSix = monthMap.values.toList().takeLast(6)
            return calculateHealthScore(
                HealthScoreInput(
                    income = s.total_income,
                    expenses = s.total_expenses,
                    budgets = budgets.map { HealthBudgetInput(it.amount.toDoubleOrNull() ?: 0.0, it.spent.toDoubleOrNull() ?: 0.0) },
                    goals = goals.map { HealthGoalInput(it.saved_amount.toDoubleOrNull() ?: 0.0, it.target_amount.toDoubleOrNull() ?: 0.0, it.deadline) },
                    monthlyIncome = lastSix.map { it.first },
                    monthlyExpenses = lastSix.map { it.second },
                    investedThisMonth = investmentRatio?.invested_this_month ?: 0.0,
                    dtiRatio = dti?.dti_ratio ?: 0.0,
                    ccUtilizationPct = creditUtilization?.aggregate?.overall_utilization_pct ?: 0.0,
                ),
            )
        }
}

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val analyticsRepository: AnalyticsRepository,
    private val aiRepository: AiRepository,
    private val budgetsRepository: BudgetsRepository,
    private val transactionsRepository: TransactionsRepository,
    private val goalsRepository: GoalsRepository,
    private val debtRepository: DebtRepository,
    private val profileRepository: ProfileRepository,
    private val opportunitiesRepository: OpportunitiesRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        load()
        loadDailyBrief()
        loadWeeklyBrief()
        loadOpportunities()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val now = LocalDate.now()
                coroutineScope {
                    val summaryDeferred = async { analyticsRepository.getSummary() }
                    val netWorthDeferred = async { analyticsRepository.getNetWorth() }
                    val wealthVelocityDeferred = async { analyticsRepository.getWealthVelocity() }
                    val trendsDeferred = async { analyticsRepository.getTrends() }
                    val investmentRatioDeferred = async { analyticsRepository.getInvestmentRatio() }
                    val budgetsDeferred = async { budgetsRepository.getAll(now.monthValue, now.year) }
                    val transactionsDeferred = async { transactionsRepository.getAll(month = now.monthValue, year = now.year) }
                    val goalsDeferred = async { goalsRepository.getAll() }
                    val dtiDeferred = async { runCatching { debtRepository.getDti() }.getOrNull() }
                    val creditUtilDeferred = async { runCatching { debtRepository.getCreditUtilization() }.getOrNull() }
                    val profileDeferred = async { runCatching { profileRepository.getProfile() }.getOrNull() }
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            summary = summaryDeferred.await(),
                            netWorth = netWorthDeferred.await(),
                            wealthVelocity = wealthVelocityDeferred.await(),
                            trends = trendsDeferred.await(),
                            investmentRatio = investmentRatioDeferred.await(),
                            budgets = budgetsDeferred.await(),
                            recentTransactions = transactionsDeferred.await(),
                            goals = goalsDeferred.await(),
                            dti = dtiDeferred.await(),
                            creditUtilization = creditUtilDeferred.await(),
                            profile = profileDeferred.await(),
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load dashboard.")) }
            }
        }
    }

    private fun loadDailyBrief() {
        viewModelScope.launch {
            _uiState.update { it.copy(isDailyBriefLoading = true, dailyBriefError = null) }
            try {
                val brief = aiRepository.getDailyBrief()
                _uiState.update { it.copy(isDailyBriefLoading = false, dailyBrief = brief) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isDailyBriefLoading = false, dailyBriefError = e.toUserMessage("Couldn't load your daily brief.")) }
            }
        }
    }

    fun refreshDailyBrief() {
        viewModelScope.launch {
            _uiState.update { it.copy(isDailyBriefRefreshing = true, dailyBriefError = null) }
            try {
                val brief = aiRepository.refreshDailyBrief()
                _uiState.update { it.copy(isDailyBriefRefreshing = false, dailyBrief = brief) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isDailyBriefRefreshing = false, dailyBriefError = e.toUserMessage("Couldn't refresh right now.")) }
            }
        }
    }

    private fun loadWeeklyBrief() {
        viewModelScope.launch {
            _uiState.update { it.copy(isWeeklyBriefLoading = true, weeklyBriefError = null) }
            try {
                val brief = aiRepository.getWeeklyBrief()
                _uiState.update { it.copy(isWeeklyBriefLoading = false, weeklyBrief = brief) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isWeeklyBriefLoading = false, weeklyBriefError = e.toUserMessage("Couldn't load your weekly brief.")) }
            }
        }
    }

    private fun loadOpportunities() {
        viewModelScope.launch {
            _uiState.update { it.copy(isOpportunitiesLoading = true) }
            try {
                val opportunities = opportunitiesRepository.detect()
                _uiState.update { it.copy(isOpportunitiesLoading = false, opportunities = opportunities) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isOpportunitiesLoading = false) }
            }
        }
    }

    fun dismissCreditAlert() = _uiState.update { it.copy(dismissedCreditAlert = true) }
    fun dismissDtiAlert() = _uiState.update { it.copy(dismissedDtiAlert = true) }

    fun dismissOpportunity(id: String) {
        _uiState.update { it.copy(opportunities = it.opportunities.filter { o -> o.id != id }) }
        viewModelScope.launch { runCatching { opportunitiesRepository.dismiss(id) } }
    }

    fun markOpportunityActedOn(id: String) {
        _uiState.update { it.copy(opportunities = it.opportunities.filter { o -> o.id != id }) }
        viewModelScope.launch { runCatching { opportunitiesRepository.markActedOn(id) } }
    }
}
