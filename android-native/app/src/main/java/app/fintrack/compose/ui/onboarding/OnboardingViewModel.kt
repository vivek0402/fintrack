package app.fintrack.compose.ui.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.CategoryDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.auth.AuthRepository
import app.fintrack.compose.data.budgets.BudgetsRepository
import app.fintrack.compose.data.categories.CategoriesRepository
import app.fintrack.compose.data.profile.ProfileRepository
import app.fintrack.compose.data.settings.SettingsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class OnboardingStep { WELCOME, CURRENCY, THEME, BUDGETS }

data class CurrencyOption(val code: String, val symbol: String, val label: String, val flag: String)

val ONBOARDING_CURRENCIES = listOf(
    CurrencyOption("INR", "₹", "Indian Rupee", "🇮🇳"),
    CurrencyOption("USD", "$", "US Dollar", "🇺🇸"),
    CurrencyOption("EUR", "€", "Euro", "🇪🇺"),
    CurrencyOption("GBP", "£", "British Pound", "🇬🇧"),
    CurrencyOption("AED", "د.إ", "UAE Dirham", "🇦🇪"),
    CurrencyOption("SGD", "S$", "Singapore Dollar", "🇸🇬"),
)

data class PopularBudget(val name: String, val defaultAmount: Int, val icon: String)

val POPULAR_BUDGETS = listOf(
    PopularBudget("Food", 5000, "🍽"),
    PopularBudget("Transport", 2000, "🚗"),
    PopularBudget("Shopping", 3000, "🛍"),
    PopularBudget("Subscriptions", 1000, "📱"),
    PopularBudget("Health", 2000, "💊"),
    PopularBudget("Utilities", 1500, "⚡"),
)

data class OnboardingUiState(
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    val error: String? = null,
    val step: OnboardingStep = OnboardingStep.WELCOME,
    val firstName: String = "there",
    val fullName: String = "",
    val email: String = "",
    val currency: String = "INR",
    val categories: List<CategoryDto> = emptyList(),
    val selectedBudgetNames: Set<String> = emptySet(),
    val budgetAmounts: Map<String, Int> = POPULAR_BUDGETS.associate { it.name to it.defaultAmount },
    val finished: Boolean = false,
)

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val categoriesRepository: CategoriesRepository,
    private val profileRepository: ProfileRepository,
    private val settingsRepository: SettingsRepository,
    private val budgetsRepository: BudgetsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(OnboardingUiState())
    val uiState: StateFlow<OnboardingUiState> = _uiState.asStateFlow()

    private var userId: String? = null

    init {
        viewModelScope.launch {
            try {
                val user = authRepository.me()
                userId = user.id
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        fullName = user.full_name,
                        email = user.email,
                        currency = user.currency ?: "INR",
                        firstName = user.full_name.split(' ').firstOrNull().orEmpty().ifBlank { "there" },
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load your profile.")) }
            }
            try {
                val categories = categoriesRepository.getAll()
                _uiState.update { it.copy(categories = categories) }
            } catch (_: Exception) { /* budget step just shows nothing selectable; not fatal */ }
        }
    }

    fun goToWelcome() = _uiState.update { it.copy(step = OnboardingStep.WELCOME) }
    fun goToCurrency() = _uiState.update { it.copy(step = OnboardingStep.CURRENCY) }
    fun goToTheme() = _uiState.update { it.copy(step = OnboardingStep.THEME) }

    fun selectCurrency(code: String) = _uiState.update { it.copy(currency = code) }

    fun confirmCurrency() {
        val state = _uiState.value
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true) }
            try {
                profileRepository.updateProfile(state.fullName, state.email, state.currency)
            } catch (_: Exception) { /* best-effort — don't block onboarding on a profile save hiccup */ }
            _uiState.update { it.copy(isSaving = false, step = OnboardingStep.THEME) }
        }
    }

    fun selectTheme(theme: String) {
        viewModelScope.launch {
            settingsRepository.setTheme(theme)
            _uiState.update { it.copy(step = OnboardingStep.BUDGETS) }
        }
    }

    fun toggleBudget(name: String) = _uiState.update { state ->
        val selected = state.selectedBudgetNames
        state.copy(selectedBudgetNames = if (name in selected) selected - name else selected + name)
    }

    fun updateBudgetAmount(name: String, amount: Int) = _uiState.update { state ->
        state.copy(budgetAmounts = state.budgetAmounts + (name to amount))
    }

    fun finish() {
        val state = _uiState.value
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true) }
            try {
                val month = LocalDate.now().monthValue
                val year = LocalDate.now().year
                for (name in state.selectedBudgetNames) {
                    val category = state.categories.find { it.name == name } ?: continue
                    val amount = (state.budgetAmounts[name] ?: continue).toDouble()
                    runCatching { budgetsRepository.create(category.id, amount, month, year) }
                }
                markOnboarded()
            } finally {
                _uiState.update { it.copy(isSaving = false, finished = true) }
            }
        }
    }

    fun skip() {
        viewModelScope.launch {
            markOnboarded()
            _uiState.update { it.copy(finished = true) }
        }
    }

    private suspend fun markOnboarded() {
        userId?.let { settingsRepository.setOnboarded(it) }
    }
}
