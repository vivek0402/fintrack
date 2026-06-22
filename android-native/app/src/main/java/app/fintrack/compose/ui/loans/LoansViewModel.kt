package app.fintrack.compose.ui.loans

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.fintrack.compose.data.api.AmortizationResponse
import app.fintrack.compose.data.api.CreateLoanRequest
import app.fintrack.compose.data.api.LoanDto
import app.fintrack.compose.data.api.UpdateLoanRequest
import app.fintrack.compose.data.api.toUserMessage
import app.fintrack.compose.data.loans.LoansRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoanFormState(
    val editingId: String? = null,
    val name: String = "",
    val type: String = "personal_loan",
    val principalAmount: String = "",
    val disbursementDate: String = "",
    val tenureMonths: String = "",
    val interestRatePct: String = "",
    val outstandingBalance: String = "",
    val emiAmount: String = "",
    val bankOrLender: String = "",
    val notes: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
)

data class LoansUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val loans: List<LoanDto> = emptyList(),
    val showForm: Boolean = false,
    val form: LoanFormState = LoanFormState(),
    val expandedLoanId: String? = null,
    val amortization: AmortizationResponse? = null,
    val isLoadingAmortization: Boolean = false,
    val showPrepaymentForm: Boolean = false,
    val prepaymentLoanId: String? = null,
    val prepaymentAmount: String = "",
    val prepaymentDate: String = LocalDate.now().toString(),
    val prepaymentNotes: String = "",
    val isSavingPrepayment: Boolean = false,
    val prepaymentError: String? = null,
)

@HiltViewModel
class LoansViewModel @Inject constructor(
    private val loansRepository: LoansRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(LoansUiState())
    val uiState: StateFlow<LoansUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val loans = loansRepository.getActiveLoans()
                _uiState.update { it.copy(isLoading = false, loans = loans) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.toUserMessage("Couldn't load your loans.")) }
            }
        }
    }

    fun openCreateForm() = _uiState.update { it.copy(showForm = true, form = LoanFormState(disbursementDate = LocalDate.now().toString())) }

    fun openEditForm(loan: LoanDto) = _uiState.update {
        it.copy(
            showForm = true,
            form = LoanFormState(
                editingId = loan.id,
                name = loan.name,
                type = loan.type,
                outstandingBalance = loan.outstanding_balance,
                interestRatePct = loan.interest_rate_pct,
                emiAmount = loan.emi_amount.orEmpty(),
                bankOrLender = loan.bank_or_lender.orEmpty(),
                notes = loan.notes.orEmpty(),
            ),
        )
    }

    fun closeForm() = _uiState.update { it.copy(showForm = false) }

    fun updateForm(transform: (LoanFormState) -> LoanFormState) =
        _uiState.update { it.copy(form = transform(it.form).copy(error = null)) }

    fun save() {
        val form = _uiState.value.form
        viewModelScope.launch {
            updateForm { it.copy(isSaving = true, error = null) }
            try {
                if (form.editingId != null) {
                    val interestRate = form.interestRatePct.toDoubleOrNull()
                    val outstanding = form.outstandingBalance.toDoubleOrNull()
                    loansRepository.updateLoan(
                        form.editingId,
                        UpdateLoanRequest(
                            name = form.name.trim().ifBlank { null },
                            outstanding_balance = outstanding,
                            interest_rate_pct = interestRate,
                            emi_amount = form.emiAmount.toDoubleOrNull(),
                            bank_or_lender = form.bankOrLender.trim().ifBlank { null },
                            notes = form.notes.trim().ifBlank { null },
                        ),
                    )
                } else {
                    val principal = form.principalAmount.toDoubleOrNull()
                    val tenure = form.tenureMonths.toIntOrNull()
                    val interestRate = form.interestRatePct.toDoubleOrNull()
                    val outstanding = form.outstandingBalance.toDoubleOrNull()
                    if (form.name.isBlank() || principal == null || tenure == null || interestRate == null || outstanding == null || form.disbursementDate.isBlank()) {
                        updateForm { it.copy(isSaving = false, error = "Fill in all required fields.") }
                        return@launch
                    }
                    loansRepository.createLoan(
                        CreateLoanRequest(
                            name = form.name.trim(),
                            type = form.type,
                            principal_amount = principal,
                            disbursement_date = form.disbursementDate.trim(),
                            tenure_months = tenure,
                            interest_rate_pct = interestRate,
                            outstanding_balance = outstanding,
                            emi_amount = form.emiAmount.toDoubleOrNull(),
                            bank_or_lender = form.bankOrLender.trim().ifBlank { null },
                            notes = form.notes.trim().ifBlank { null },
                        ),
                    )
                }
                _uiState.update { it.copy(showForm = false) }
                load()
            } catch (e: Exception) {
                updateForm { it.copy(isSaving = false, error = e.toUserMessage("Couldn't save this loan.")) }
            }
        }
    }

    fun markRepaid(id: String) {
        viewModelScope.launch {
            try {
                loansRepository.markRepaid(id)
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.toUserMessage("Couldn't update this loan.")) }
            }
        }
    }

    fun toggleExpand(loanId: String) {
        val state = _uiState.value
        if (state.expandedLoanId == loanId) {
            _uiState.update { it.copy(expandedLoanId = null, amortization = null) }
            return
        }
        _uiState.update { it.copy(expandedLoanId = loanId, amortization = null, isLoadingAmortization = true) }
        viewModelScope.launch {
            try {
                val result = loansRepository.getAmortization(loanId)
                _uiState.update { it.copy(isLoadingAmortization = false, amortization = result) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoadingAmortization = false, error = e.toUserMessage("Couldn't load the amortization schedule.")) }
            }
        }
    }

    fun openPrepaymentForm(loanId: String) = _uiState.update {
        it.copy(showPrepaymentForm = true, prepaymentLoanId = loanId, prepaymentAmount = "", prepaymentNotes = "", prepaymentError = null)
    }

    fun closePrepaymentForm() = _uiState.update { it.copy(showPrepaymentForm = false, prepaymentLoanId = null) }

    fun updatePrepaymentAmount(value: String) = _uiState.update { it.copy(prepaymentAmount = value, prepaymentError = null) }
    fun updatePrepaymentDate(value: String) = _uiState.update { it.copy(prepaymentDate = value, prepaymentError = null) }
    fun updatePrepaymentNotes(value: String) = _uiState.update { it.copy(prepaymentNotes = value) }

    fun savePrepayment() {
        val state = _uiState.value
        val loanId = state.prepaymentLoanId ?: return
        val amount = state.prepaymentAmount.toDoubleOrNull()
        if (amount == null || amount <= 0) {
            _uiState.update { it.copy(prepaymentError = "Enter a valid amount.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSavingPrepayment = true, prepaymentError = null) }
            try {
                loansRepository.addPrepayment(loanId, amount, state.prepaymentDate, state.prepaymentNotes.trim().ifBlank { null })
                _uiState.update { it.copy(isSavingPrepayment = false, showPrepaymentForm = false, prepaymentLoanId = null) }
                load()
                if (state.expandedLoanId == loanId) {
                    val refreshed = loansRepository.getAmortization(loanId)
                    _uiState.update { it.copy(amortization = refreshed) }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isSavingPrepayment = false, prepaymentError = e.toUserMessage("Couldn't log this prepayment.")) }
            }
        }
    }
}
