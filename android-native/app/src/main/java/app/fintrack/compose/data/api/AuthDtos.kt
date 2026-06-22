package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

/**
 * Mirrors backend/src/routes/auth.js response/request shapes exactly —
 * see frontend/lib/api.ts's authAPI group for the canonical request shapes
 * this was ported from.
 */

@Serializable
data class RegisterRequest(val full_name: String, val email: String, val password: String)

@Serializable
data class VerifyEmailRequest(val email: String, val otp: String)

@Serializable
data class ResendOtpRequest(val email: String, val type: String) // "register" | "reset_password"

@Serializable
data class ForgotPasswordRequest(val email: String)

@Serializable
data class ResetPasswordRequest(val email: String, val otp: String, val new_password: String)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class UserDto(
    val id: String,
    val full_name: String,
    val email: String,
    val currency: String? = null,
    val created_at: String? = null,
)

@Serializable
data class AuthResponse(
    val message: String? = null,
    val token: String? = null,
    val user: UserDto? = null,
    val unverified: Boolean? = null,
)

@Serializable
data class MeResponse(val user: UserDto)

@Serializable
data class MessageResponse(val message: String? = null, val email: String? = null)
