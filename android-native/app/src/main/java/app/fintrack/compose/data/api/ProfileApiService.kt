package app.fintrack.compose.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PUT

interface ProfileApiService {
    @GET("api/profile")
    suspend fun getProfile(): ProfileGetResponse

    @PUT("api/profile")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): UpdateProfileResponse

    @PUT("api/profile/password")
    suspend fun changePassword(@Body body: ChangePasswordRequest): MessageResponse
}
