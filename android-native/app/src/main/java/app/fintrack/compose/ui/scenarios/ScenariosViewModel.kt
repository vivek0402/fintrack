package app.fintrack.compose.ui.scenarios

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.ScenarioDto
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.planning.PlanningRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class ScenarioField(val key: String, val label: String, val default: String = "")

val SCENARIO_FIELDS: Map<String, List<ScenarioField>> = mapOf(
    "investment_growth" to listOf(
        ScenarioField("monthly_amount", "Monthly investment"),
        ScenarioField("annual_return_pct", "Annual return %", "12"),
        ScenarioField("years", "Years", "10"),
        ScenarioField("initial_lumpsum", "Initial lumpsum (optional)", "0"),
    ),
    "loan_impact" to listOf(
        ScenarioField("loan_amount", "Loan amount"),
        ScenarioField("interest_rate_pct", "Interest rate %"),
        ScenarioField("tenure_months", "Tenure (months)"),
    ),
    "expense_reduction" to listOf(
        ScenarioField("monthly_reduction_amount", "Monthly amount to cut"),
        ScenarioField("investment_return_pct", "Investment return % (if redirected)", "12"),
        ScenarioField("years", "Years", "10"),
    ),
    "income_change" to listOf(
        ScenarioField("monthly_income_increase", "Monthly income increase"),
        ScenarioField("savings_rate_of_increase_pct", "% of increase saved", "50"),
        ScenarioField("investment_return_pct", "Investment return %", "12"),
        ScenarioField("years", "Years", "10"),
    ),
)

val SCENARIO_TYPE_LABELS = mapOf(
    "investment_growth" to "Investment Growth",
    "loan_impact" to "New Loan Impact",
    "expense_reduction" to "Cut an Expense",
    "income_change" to "Income Increase",
)

data class ScenariosUiState(
    val type: String = "investment_growth",
    val inputs: Map<String, String> = SCENARIO_FIELDS["investment_growth"]!!.associate { it.key to it.default },
    val redirectToInvestment: Boolean = true,
    val isSimulating: Boolean = false,
    val error: String? = null,
    val result: JsonObject? = null,
    val isSaving: Boolean = false,
    val saved: Boolean = false,
    val savedScenarios: List<ScenarioDto> = emptyList(),
    val isLoadingSaved: Boolean = true,
)

@HiltViewModel
class ScenariosViewModel @Inject constructor(
    private val planningRepository: PlanningRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ScenariosUiState())
    val uiState: StateFlow<ScenariosUiState> = _uiState.asStateFlow()

    init {
        loadSaved()
    }

    fun loadSaved() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingSaved = true) }
            try {
                val scenarios = planningRepository.getScenarios()
                _uiState.update { it.copy(isLoadingSaved = false, savedScenarios = scenarios) }
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoadingSaved = false) }
            }
        }
    }

    fun setType(type: String) = _uiState.update {
        it.copy(
            type = type,
            inputs = SCENARIO_FIELDS[type]!!.associate { f -> f.key to f.default },
            result = null,
            saved = false,
            error = null,
        )
    }

    fun updateInput(key: String, value: String) = _uiState.update {
        it.copy(inputs = it.inputs + (key to value), error = null, result = null, saved = false)
    }

    fun toggleRedirect() = _uiState.update { it.copy(redirectToInvestment = !it.redirectToInvestment, result = null) }

    fun simulate() {
        val state = _uiState.value
        val fields = SCENARIO_FIELDS[state.type] ?: return
        val parsed = mutableMapOf<String, Double>()
        for (field in fields) {
            val raw = state.inputs[field.key].orEmpty()
            val value = raw.toDoubleOrNull()
            if (value == null) {
                _uiState.update { it.copy(error = "Enter a valid ${field.label.lowercase()}.") }
                return
            }
            parsed[field.key] = value
        }

        val inputsJson = buildJsonObject {
            parsed.forEach { (k, v) -> put(k, JsonPrimitive(v)) }
            if (state.type == "expense_reduction") put("redirect_to_investment", JsonPrimitive(state.redirectToInvestment))
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSimulating = true, error = null) }
            try {
                val response = planningRepository.simulateScenario(state.type, inputsJson)
                _uiState.update { it.copy(isSimulating = false, result = response.result) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isSimulating = false, error = e.toUserMessage("Couldn't run this scenario.")) }
            }
        }
    }

    fun save() {
        val state = _uiState.value
        val result = state.result ?: return
        val fields = SCENARIO_FIELDS[state.type] ?: return
        val inputsJson = buildJsonObject {
            fields.forEach { f -> state.inputs[f.key]?.toDoubleOrNull()?.let { put(f.key, JsonPrimitive(it)) } }
            if (state.type == "expense_reduction") put("redirect_to_investment", JsonPrimitive(state.redirectToInvestment))
        }
        val title = "${SCENARIO_TYPE_LABELS[state.type]} — ${result["summary_text"]?.jsonPrimitive?.content?.take(40) ?: "Scenario"}"

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true) }
            try {
                planningRepository.createScenario(title, state.type, inputsJson, result)
                _uiState.update { it.copy(isSaving = false, saved = true) }
                loadSaved()
            } catch (e: Exception) {
                _uiState.update { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save scenario.")) }
            }
        }
    }

    fun deleteSaved(id: String) {
        viewModelScope.launch {
            try {
                planningRepository.deleteScenario(id)
                loadSaved()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't delete scenario.")) }
            }
        }
    }
}
