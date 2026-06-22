package app.fintrack.compose.ui.tax

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.ai.AiRepository
import app.fintrack.compose.data.api.AdvanceTaxResponse
import app.fintrack.compose.data.api.CapitalGainsResponse
import app.fintrack.compose.data.api.EightyCSummaryResponse
import app.fintrack.compose.data.api.HraExemptionResponse
import app.fintrack.compose.data.api.ItrReadinessResponse
import app.fintrack.compose.data.api.LtaResponse
import app.fintrack.compose.data.api.SalaryIntelligenceResponse
import app.fintrack.compose.data.api.TaxEstimateDataDto
import app.fintrack.compose.data.api.TaxProfileDto
import app.fintrack.compose.data.api.UpdateTaxProfileRequest
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.tax.TaxRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ProfileFormState(
    val basicSalaryMonthly: String = "",
    val hraComponentMonthly: String = "",
    val ltaComponentAnnual: String = "",
    val specialAllowanceMonthly: String = "",
    val rentPaidMonthly: String = "",
    val cityType: String = "non_metro",
    val ltaClaimsUsed: String = "0",
    val preferredRegime: String = "not_decided",
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class EightyCFormState(
    val type: String = "ppf",
    val name: String = "",
    val amount: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class CapitalTxnFormState(
    val assetName: String = "",
    val assetType: String = "equity",
    val transactionType: String = "buy",
    val units: String = "",
    val pricePerUnit: String = "",
    val transactionDate: String = LocalDate.now().toString(),
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class TaxUiState(
    val isLoading: Boolean = true,
    val profile: TaxProfileDto? = null,
    val hra: HraExemptionResponse? = null,
    val lta: LtaResponse? = null,
    val advanceTax: AdvanceTaxResponse? = null,
    val itrReadiness: ItrReadinessResponse? = null,
    val eightyC: EightyCSummaryResponse? = null,
    val capitalGains: CapitalGainsResponse? = null,
    val actionError: String? = null,
    val showProfileForm: Boolean = false,
    val profileForm: ProfileFormState = ProfileFormState(),
    val show80cForm: Boolean = false,
    val eightyCForm: EightyCFormState = EightyCFormState(),
    val showCapitalTxnForm: Boolean = false,
    val capitalTxnForm: CapitalTxnFormState = CapitalTxnFormState(),
    val payingInstallment: Int? = null,
    val paymentAmount: String = "",
    val paymentDate: String = LocalDate.now().toString(),
    val isSavingPayment: Boolean = false,
    val estimateData: TaxEstimateDataDto? = null,
    val isEstimateLoading: Boolean = false,
    val estimateGenerated: Boolean = false,
    val estimateError: String? = null,
    val salaryData: SalaryIntelligenceResponse? = null,
    val isSalaryLoading: Boolean = false,
    val salaryGenerated: Boolean = false,
    val salaryError: String? = null,
)

@HiltViewModel
class TaxViewModel @Inject constructor(
    private val taxRepository: TaxRepository,
    private val aiRepository: AiRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(TaxUiState())
    val uiState: StateFlow<TaxUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val profile = runCatching { taxRepository.getProfile() }.getOrNull()
            val eightyC = runCatching { taxRepository.get80cSummary() }.getOrNull()
            val capitalGains = runCatching { taxRepository.getCapitalGains() }.getOrNull()
            val advanceTax = runCatching { taxRepository.getAdvanceTax() }.getOrNull()
            val itrReadiness = runCatching { taxRepository.getItrReadiness() }.getOrNull()
            val hra = runCatching { taxRepository.getHra() }.getOrNull()
            val lta = runCatching { taxRepository.getLta() }.getOrNull()
            _uiState.update {
                it.copy(
                    isLoading = false,
                    profile = profile,
                    eightyC = eightyC,
                    capitalGains = capitalGains,
                    advanceTax = advanceTax,
                    itrReadiness = itrReadiness,
                    hra = hra,
                    lta = lta,
                )
            }
        }
    }

    fun openProfileForm() {
        val profile = _uiState.value.profile
        _uiState.update {
            it.copy(
                showProfileForm = true,
                profileForm = if (profile != null) {
                    ProfileFormState(
                        basicSalaryMonthly = profile.basic_salary_monthly,
                        hraComponentMonthly = profile.hra_component_monthly,
                        ltaComponentAnnual = profile.lta_component_annual,
                        specialAllowanceMonthly = profile.special_allowance_monthly,
                        rentPaidMonthly = profile.rent_paid_monthly,
                        cityType = profile.city_type,
                        ltaClaimsUsed = profile.lta_claims_used_in_block.toString(),
                        preferredRegime = profile.preferred_regime,
                    )
                } else {
                    ProfileFormState()
                },
            )
        }
    }

    fun closeProfileForm() = _uiState.update { it.copy(showProfileForm = false) }

    fun updateProfileForm(transform: (ProfileFormState) -> ProfileFormState) =
        _uiState.update { it.copy(profileForm = transform(it.profileForm).copy(error = null)) }

    fun saveProfile() {
        val form = _uiState.value.profileForm
        val basicSalary = form.basicSalaryMonthly.toDoubleOrNull()
        if (basicSalary == null || basicSalary < 0) {
            updateProfileForm { it.copy(error = "Enter a valid monthly basic salary.") }
            return
        }
        viewModelScope.launch {
            updateProfileForm { it.copy(isSaving = true, error = null) }
            try {
                taxRepository.saveProfile(
                    UpdateTaxProfileRequest(
                        basic_salary_monthly = basicSalary,
                        hra_component_monthly = form.hraComponentMonthly.toDoubleOrNull(),
                        lta_component_annual = form.ltaComponentAnnual.toDoubleOrNull(),
                        special_allowance_monthly = form.specialAllowanceMonthly.toDoubleOrNull(),
                        rent_paid_monthly = form.rentPaidMonthly.toDoubleOrNull(),
                        city_type = form.cityType,
                        lta_claims_used_in_block = form.ltaClaimsUsed.toIntOrNull(),
                        preferred_regime = form.preferredRegime,
                    ),
                )
                _uiState.update { it.copy(showProfileForm = false) }
                load()
            } catch (e: Exception) {
                updateProfileForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save your salary profile.")) }
            }
        }
    }

    fun openEightyCForm() = _uiState.update { it.copy(show80cForm = true, eightyCForm = EightyCFormState()) }
    fun closeEightyCForm() = _uiState.update { it.copy(show80cForm = false) }
    fun updateEightyCForm(transform: (EightyCFormState) -> EightyCFormState) =
        _uiState.update { it.copy(eightyCForm = transform(it.eightyCForm).copy(error = null)) }

    fun saveEightyC() {
        val form = _uiState.value.eightyCForm
        val amount = form.amount.toDoubleOrNull()
        if (form.name.isBlank() || amount == null || amount <= 0) {
            updateEightyCForm { it.copy(error = "Enter a name and a valid amount.") }
            return
        }
        viewModelScope.launch {
            updateEightyCForm { it.copy(isSaving = true, error = null) }
            try {
                taxRepository.add80c(form.type, form.name.trim(), amount)
                _uiState.update { it.copy(show80cForm = false) }
                load()
            } catch (e: Exception) {
                updateEightyCForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save this investment.")) }
            }
        }
    }

    fun deleteEightyC(id: String) {
        viewModelScope.launch {
            try {
                taxRepository.delete80c(id)
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't delete this entry.")) }
            }
        }
    }

    fun openCapitalTxnForm() = _uiState.update { it.copy(showCapitalTxnForm = true, capitalTxnForm = CapitalTxnFormState()) }
    fun closeCapitalTxnForm() = _uiState.update { it.copy(showCapitalTxnForm = false) }
    fun updateCapitalTxnForm(transform: (CapitalTxnFormState) -> CapitalTxnFormState) =
        _uiState.update { it.copy(capitalTxnForm = transform(it.capitalTxnForm).copy(error = null)) }

    fun saveCapitalTxn() {
        val form = _uiState.value.capitalTxnForm
        val units = form.units.toDoubleOrNull()
        val price = form.pricePerUnit.toDoubleOrNull()
        if (form.assetName.isBlank() || units == null || units <= 0 || price == null || price < 0) {
            updateCapitalTxnForm { it.copy(error = "Fill in all fields with valid values.") }
            return
        }
        viewModelScope.launch {
            updateCapitalTxnForm { it.copy(isSaving = true, error = null) }
            try {
                taxRepository.addCapitalTransaction(
                    form.assetName.trim(), form.assetType, form.transactionType, units, price, form.transactionDate,
                )
                _uiState.update { it.copy(showCapitalTxnForm = false) }
                load()
            } catch (e: Exception) {
                updateCapitalTxnForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't log this transaction.")) }
            }
        }
    }

    fun toggleItrChecklistItem(key: String, value: Boolean) {
        viewModelScope.launch {
            try {
                val updated = taxRepository.updateItrChecklist(key, value)
                _uiState.update { it.copy(itrReadiness = updated) }
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.toUserMessage("Couldn't update checklist.")) }
            }
        }
    }

    fun openPaymentForm(installmentNumber: Int, suggestedAmount: Double) =
        _uiState.update { it.copy(payingInstallment = installmentNumber, paymentAmount = suggestedAmount.toString(), paymentDate = LocalDate.now().toString()) }

    fun closePaymentForm() = _uiState.update { it.copy(payingInstallment = null) }
    fun updatePaymentAmount(value: String) = _uiState.update { it.copy(paymentAmount = value) }
    fun updatePaymentDate(value: String) = _uiState.update { it.copy(paymentDate = value) }

    fun savePayment() {
        val state = _uiState.value
        val installment = state.payingInstallment ?: return
        val amount = state.paymentAmount.toDoubleOrNull()
        if (amount == null || amount < 0) {
            _uiState.update { it.copy(actionError = "Enter a valid amount.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSavingPayment = true) }
            try {
                taxRepository.logAdvanceTaxPayment(installment, amount, state.paymentDate)
                _uiState.update { it.copy(isSavingPayment = false, payingInstallment = null) }
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(isSavingPayment = false, actionError = e.toUserMessage("Couldn't log this payment.")) }
            }
        }
    }

    fun clearActionError() = _uiState.update { it.copy(actionError = null) }

    fun generateTaxEstimate(force: Boolean = false) {
        viewModelScope.launch {
            _uiState.update { it.copy(isEstimateLoading = true, estimateError = null) }
            try {
                val data = aiRepository.getTaxEstimate(force)
                _uiState.update { it.copy(isEstimateLoading = false, estimateGenerated = true, estimateData = data) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isEstimateLoading = false,
                        estimateError = e.toUserMessage("Failed to generate tax estimate. Please try again."),
                        estimateData = null,
                    )
                }
            }
        }
    }

    fun analyseSalary() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSalaryLoading = true, salaryError = null) }
            try {
                val data = aiRepository.getSalaryIntelligence()
                _uiState.update { it.copy(isSalaryLoading = false, salaryGenerated = true, salaryData = data) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSalaryLoading = false,
                        salaryError = e.toUserMessage("Failed to analyse salary pattern. Please try again."),
                        salaryData = null,
                    )
                }
            }
        }
    }
}
