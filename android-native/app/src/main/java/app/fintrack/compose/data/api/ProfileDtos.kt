package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

@Serializable
data class UpdateProfileRequest(val full_name: String, val email: String, val currency: String)

@Serializable
data class UpdateProfileUserDto(val id: String, val full_name: String, val email: String, val currency: String? = null)

@Serializable
data class UpdateProfileResponse(val user: UpdateProfileUserDto)

/** `total_transactions`/`total_budgets` are COUNT(*) — JSON strings, see TransactionDtos.kt's note. */
@Serializable
data class ProfileDto(
    val id: String,
    val full_name: String,
    val email: String,
    val currency: String? = null,
    val created_at: String? = null,
    val total_transactions: String? = null,
    val total_budgets: String? = null,
)

@Serializable
data class ProfileGetResponse(val profile: ProfileDto)

@Serializable
data class ChangePasswordRequest(val current_password: String, val new_password: String)
