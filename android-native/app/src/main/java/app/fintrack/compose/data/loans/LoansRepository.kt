package app.fintrack.compose.data.loans

import app.fintrack.compose.data.api.AmortizationResponse
import app.fintrack.compose.data.api.CreateLoanRequest
import app.fintrack.compose.data.api.CreatePrepaymentRequest
import app.fintrack.compose.data.api.LoanDto
import app.fintrack.compose.data.api.LoansApiService
import app.fintrack.compose.data.api.PrepaymentDto
import app.fintrack.compose.data.api.UpdateLoanRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LoansRepository @Inject constructor(
    private val api: LoansApiService,
) {
    suspend fun getActiveLoans(): List<LoanDto> = api.getAll(active = "true").loans

    suspend fun createLoan(body: CreateLoanRequest): LoanDto = api.create(body).loan

    suspend fun updateLoan(id: String, body: UpdateLoanRequest): LoanDto = api.update(id, body).loan

    suspend fun markRepaid(id: String) {
        api.markRepaid(id)
    }

    suspend fun getAmortization(id: String): AmortizationResponse = api.getAmortization(id)

    suspend fun addPrepayment(id: String, amount: Double, date: String, notes: String?): PrepaymentDto =
        api.addPrepayment(id, CreatePrepaymentRequest(amount, date, notes)).prepayment

    suspend fun getPrepayments(id: String): List<PrepaymentDto> = api.getPrepayments(id).prepayments
}
