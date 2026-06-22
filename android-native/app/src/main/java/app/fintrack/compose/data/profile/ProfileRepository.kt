package app.fintrack.compose.data.profile

import app.fintrack.compose.data.api.ChangePasswordRequest
import app.fintrack.compose.data.api.ProfileApiService
import app.fintrack.compose.data.api.ProfileDto
import app.fintrack.compose.data.api.UpdateProfileRequest
import app.fintrack.compose.data.api.UpdateProfileUserDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepository @Inject constructor(
    private val api: ProfileApiService,
) {
    suspend fun getProfile(): ProfileDto = api.getProfile().profile

    suspend fun updateProfile(fullName: String, email: String, currency: String): UpdateProfileUserDto =
        api.updateProfile(UpdateProfileRequest(fullName, email, currency)).user

    suspend fun changePassword(currentPassword: String, newPassword: String) =
        api.changePassword(ChangePasswordRequest(currentPassword, newPassword))
}
