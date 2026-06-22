package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

/**
 * `starting_balance`/`total_income`/`total_expenses`/`current_balance` are raw
 * NUMERIC/SUM() passthroughs — JSON strings, see TransactionDtos.kt's note.
 * The stats fields are only populated on GET/PATCH (STATS query); the create
 * response returns the bare inserted row, so they're nullable here.
 */
@Serializable
data class AccountDto(
    val id: Int,
    val name: String,
    val icon: String? = null,
    val color: String? = null,
    val starting_balance: String,
    val is_default: Boolean = false,
    val balance_as_of: String? = null,
    val account_type: String? = null,
    val last_four: String? = null,
    val total_income: String? = null,
    val total_expenses: String? = null,
    val transaction_count: String? = null,
    val current_balance: String? = null,
)

@Serializable
data class AccountsResponse(val accounts: List<AccountDto>)

@Serializable
data class AccountResponse(val account: AccountDto, val transactions_linked: Int = 0)

@Serializable
data class SetDefaultResponse(val success: Boolean, val transactions_linked: Int = 0)

@Serializable
data class SuccessResponse(val success: Boolean)

@Serializable
data class CreateAccountRequest(
    val name: String,
    val icon: String? = null,
    val color: String? = null,
    val starting_balance: Double = 0.0,
    val is_default: Boolean = false,
    val balance_as_of: String? = null,
    val account_type: String = "Savings",
    val last_four: String? = null,
)

@Serializable
data class UpdateAccountRequest(
    val name: String? = null,
    val icon: String? = null,
    val color: String? = null,
    val starting_balance: Double? = null,
    val is_default: Boolean? = null,
    val balance_as_of: String? = null,
    val account_type: String? = null,
    val last_four: String? = null,
)
