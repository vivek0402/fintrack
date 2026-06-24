package app.fintrack.compose.ui.savingsplan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.analytics.AnalyticsRepository
import app.fintrack.compose.data.api.GoalDto
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.goals.GoalsRepository
import app.fintrack.compose.data.settings.SettingsRepository
import app.fintrack.compose.data.transactions.TransactionsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import kotlin.math.ceil
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class Challenge(val id: String, val emoji: String, val title: String, val desc: String, val days: Int, val keywords: List<String>)

val CHALLENGES = listOf(
    Challenge("no-eating-out", "🍕", "No Eating Out Week", "Skip restaurants & food delivery for 7 days", 7, listOf("restaurant", "food delivery", "zomato", "swiggy", "dining", "pizza", "burger")),
    Challenge("coffee", "☕", "Coffee Challenge", "Log ₹0 on café & coffee for 14 days", 14, listOf("café", "cafe", "coffee", "starbucks", "barista", "costa")),
    Challenge("no-spend-weekend", "🏠", "Weekend No-Spend", "Zero discretionary spend Sat & Sun for 4 weekends", 28, listOf("shopping", "entertainment", "movies", "games", "clothing", "accessories")),
)

private fun roundUp10(n: Double) = ceil(n / 10.0) * 10.0

private fun matchesKeywords(tx: TransactionDto, keywords: List<String>): Boolean {
    val haystack = ((tx.category_name ?: "") + " " + tx.description).lowercase()
    return keywords.any { haystack.contains(it) }
}

data class ChallengeProgress(val active: Boolean, val daysCompleted: Int, val pct: Float)

data class SavingsToolsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val goals: List<GoalDto> = emptyList(),
    val monthlyIncome: Double = 0.0,
    val savePlan: Map<String, Double> = emptyMap(),
    val roundUpEnabled: Boolean = false,
    val roundUpGoalId: String? = null,
    val roundUpMonthly: Double = 0.0,
    val challengeStarts: Map<String, String> = emptyMap(),
    val challengeEstimates: List<Double> = listOf(0.0, 0.0, 0.0),
    val streak: Int = 0,
) {
    val activeGoals: List<GoalDto> get() = goals.filter { (it.saved_amount.toDoubleOrNull() ?: 0.0) < (it.target_amount.toDoubleOrNull() ?: 0.0) }
    val totalAutoSave: Double get() = savePlan.values.sum()
    val autoSavePctOfIncome: Double get() = if (monthlyIncome > 0) (totalAutoSave / monthlyIncome) * 100 else 0.0
    val roundUpAnnual: Double get() = roundUpMonthly * 12

    fun challengeProgress(challenge: Challenge): ChallengeProgress {
        val startStr = challengeStarts[challenge.id] ?: return ChallengeProgress(false, 0, 0f)
        val start = runCatching { LocalDate.parse(startStr) }.getOrNull() ?: return ChallengeProgress(false, 0, 0f)
        val daysCompleted = java.time.temporal.ChronoUnit.DAYS.between(start, LocalDate.now()).toInt().coerceIn(0, challenge.days)
        return ChallengeProgress(true, daysCompleted, if (challenge.days > 0) (daysCompleted.toFloat() / challenge.days) * 100f else 0f)
    }

    fun projectedDate(remaining: Double, monthly: Double): String? {
        if (monthly <= 0 || remaining <= 0) return null
        val months = ceil(remaining / monthly).toInt()
        return LocalDate.now().plusMonths(months.toLong()).format(DateTimeFormatter.ofPattern("MMMM yyyy"))
    }

    fun isGoalOnTrack(goal: GoalDto): Boolean? {
        val deadline = goal.deadline?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
        val monthly = savePlan[goal.id] ?: return null
        if (monthly <= 0) return null
        val remaining = (goal.target_amount.toDoubleOrNull() ?: 0.0) - (goal.saved_amount.toDoubleOrNull() ?: 0.0)
        val days = java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), deadline).toInt()
        if (days <= 0) return false
        val monthsNeeded = ceil(remaining / monthly).toInt()
        val monthsAvailable = ceil(days / 30.0).toInt()
        return monthsNeeded <= monthsAvailable
    }
}

@HiltViewModel
class SavingsToolsViewModel @Inject constructor(
    private val goalsRepository: GoalsRepository,
    private val analyticsRepository: AnalyticsRepository,
    private val transactionsRepository: TransactionsRepository,
    private val settingsRepository: SettingsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SavingsToolsUiState())
    val uiState: StateFlow<SavingsToolsUiState> = _uiState.asStateFlow()

    private var allTransactions: List<TransactionDto> = emptyList()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                coroutineScope {
                    val goalsDeferred = async { goalsRepository.getAll() }
                    val summaryDeferred = async { analyticsRepository.getSummary() }
                    val trendsDeferred = async { analyticsRepository.getTrends() }
                    val transactionsDeferred = async { transactionsRepository.getAll(type = "expense") }
                    val savePlanDeferred = async { settingsRepository.autoSavePlanFlow.first() }
                    val challengeStartsDeferred = async { settingsRepository.challengeStartsFlow.first() }

                    val goals = goalsDeferred.await()
                    val summary = summaryDeferred.await()
                    val trends = trendsDeferred.await()
                    allTransactions = transactionsDeferred.await()
                    val savePlan = savePlanDeferred.await()
                    val challengeStarts = challengeStartsDeferred.await()

                    val monthMap = LinkedHashMap<String, Pair<Double, Double>>()
                    trends.trends.sortedWith(compareBy({ it.year }, { it.month })).forEach { row ->
                        val key = "${row.year.toInt()}-${row.month.toInt()}"
                        val (inc, exp) = monthMap[key] ?: (0.0 to 0.0)
                        val total = row.total.toDoubleOrNull() ?: 0.0
                        monthMap[key] = if (row.type == "income") (total to exp) else (inc to total)
                    }
                    var streak = 0
                    for ((_, pair) in monthMap.entries.reversed()) {
                        if (pair.first > pair.second) streak++ else break
                    }

                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            goals = goals,
                            monthlyIncome = summary.summary.total_income,
                            savePlan = savePlan,
                            challengeStarts = challengeStarts,
                            roundUpMonthly = computeRoundUpMonthly(allTransactions),
                            challengeEstimates = computeChallengeEstimates(allTransactions),
                            streak = streak,
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load savings tools.")) }
            }
        }
    }

    fun setAutoSaveAmount(goalId: String, amount: Double) {
        _uiState.update { it.copy(savePlan = it.savePlan + (goalId to amount)) }
        viewModelScope.launch { settingsRepository.setAutoSaveAmount(goalId, amount) }
    }

    fun toggleRoundUp() = _uiState.update { it.copy(roundUpEnabled = !it.roundUpEnabled) }
    fun selectRoundUpGoal(goalId: String) = _uiState.update { it.copy(roundUpGoalId = goalId) }

    fun startChallenge(id: String) {
        val today = LocalDate.now().toString()
        _uiState.update { it.copy(challengeStarts = it.challengeStarts + (id to today)) }
        viewModelScope.launch { settingsRepository.setChallengeStart(id, today) }
    }

    fun stopChallenge(id: String) {
        _uiState.update { it.copy(challengeStarts = it.challengeStarts - id) }
        viewModelScope.launch { settingsRepository.clearChallengeStart(id) }
    }

    private fun computeRoundUpMonthly(transactions: List<TransactionDto>): Double {
        val cutoff = LocalDate.now().minusDays(30)
        return transactions
            .filter { tx ->
                val date = runCatching { LocalDate.parse(tx.date.take(10)) }.getOrNull()
                date != null && !date.isBefore(cutoff)
            }
            .sumOf { tx ->
                val amount = tx.amount.toDoubleOrNull() ?: 0.0
                roundUp10(amount) - amount
            }
    }

    private fun computeChallengeEstimates(transactions: List<TransactionDto>): List<Double> {
        val today = LocalDate.now()
        val lastMonthStart = today.minusMonths(1).withDayOfMonth(1)
        val lastMonthEnd = today.withDayOfMonth(1).minusDays(1)
        val cutoff30 = today.minusDays(30)
        val fourWeeksAgo = today.minusDays(28)

        fun parsedDate(tx: TransactionDto) = runCatching { LocalDate.parse(tx.date.take(10)) }.getOrNull()
        fun amountOf(tx: TransactionDto) = tx.amount.toDoubleOrNull() ?: 0.0

        val lastMonthExpenses = transactions.filter { tx ->
            val d = parsedDate(tx)
            d != null && !d.isBefore(lastMonthStart) && !d.isAfter(lastMonthEnd)
        }
        val foodAmt = lastMonthExpenses.filter { matchesKeywords(it, CHALLENGES[0].keywords) }.sumOf(::amountOf)

        val coffeeAmt = transactions.filter { tx ->
            val d = parsedDate(tx)
            d != null && !d.isBefore(cutoff30) && matchesKeywords(tx, CHALLENGES[1].keywords)
        }.sumOf(::amountOf)

        val weekendAmt = transactions.filter { tx ->
            val d = parsedDate(tx)
            d != null && !d.isBefore(fourWeeksAgo) &&
                (d.dayOfWeek == java.time.DayOfWeek.SATURDAY || d.dayOfWeek == java.time.DayOfWeek.SUNDAY) &&
                matchesKeywords(tx, CHALLENGES[2].keywords)
        }.sumOf(::amountOf)

        return listOf(foodAmt / 4, coffeeAmt, weekendAmt / 4)
    }
}
