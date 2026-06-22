package app.fintrack.compose.data.accounts

import app.fintrack.compose.data.api.AccountDto
import app.fintrack.compose.data.api.AccountsApiService
import app.fintrack.compose.data.api.CreateAccountRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AccountsRepository @Inject constructor(
    private val api: AccountsApiService,
) {
    suspend fun getAll(): List<AccountDto> = api.getAll().accounts

    suspend fun create(
        name: String,
        icon: String?,
        color: String?,
        startingBalance: Double,
        accountType: String,
        lastFour: String?,
    ): AccountDto = api.create(
        CreateAccountRequest(
            name = name,
            icon = icon,
            color = color,
            starting_balance = startingBalance,
            account_type = accountType,
            last_four = lastFour,
        )
    ).account

    suspend fun setDefault(id: Int) = api.setDefault(id)

    suspend fun delete(id: Int) = api.delete(id)
}
