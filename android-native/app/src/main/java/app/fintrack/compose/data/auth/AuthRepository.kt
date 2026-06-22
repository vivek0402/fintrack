package app.fintrack.compose.data.auth

import app.fintrack.compose.data.api.AuthApiService
import app.fintrack.compose.data.api.ForgotPasswordRequest
import app.fintrack.compose.data.api.LoginRequest
import app.fintrack.compose.data.api.RegisterRequest
import app.fintrack.compose.data.api.ResendOtpRequest
import app.fintrack.compose.data.api.ResetPasswordRequest
import app.fintrack.compose.data.api.UserDto
import app.fintrack.compose.data.api.VerifyEmailRequest
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Mirrors frontend/store/authStore.ts's setAuth/logout contract: a successful
 * login/verify-email persists the token via [TokenManager]; logout clears it.
 * User identity itself isn't persisted locally (unlike the web app's Zustand
 * store) — [me] re-fetches it from the server on cold start when a token exists,
 * which is the idiomatic Android pattern and avoids a second source of truth.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val api: AuthApiService,
    private val tokenManager: TokenManager,
) {
    val isLoggedIn: Flow<Boolean> = tokenManager.tokenFlow.map { !it.isNullOrEmpty() }

    suspend fun register(fullName: String, email: String, password: String) =
        api.register(RegisterRequest(fullName, email, password))

    suspend fun verifyEmail(email: String, otp: String): UserDto? {
        val response = api.verifyEmail(VerifyEmailRequest(email, otp))
        response.token?.let { tokenManager.saveToken(it) }
        return response.user
    }

    suspend fun resendOtp(email: String, type: String) = api.resendOtp(ResendOtpRequest(email, type))

    suspend fun forgotPassword(email: String) = api.forgotPassword(ForgotPasswordRequest(email))

    suspend fun resetPassword(email: String, otp: String, newPassword: String) =
        api.resetPassword(ResetPasswordRequest(email, otp, newPassword))

    suspend fun login(email: String, password: String): UserDto? {
        val response = api.login(LoginRequest(email, password))
        response.token?.let { tokenManager.saveToken(it) }
        return response.user
    }

    suspend fun me(): UserDto = api.me().user

    suspend fun logout() = tokenManager.clearToken()
}
