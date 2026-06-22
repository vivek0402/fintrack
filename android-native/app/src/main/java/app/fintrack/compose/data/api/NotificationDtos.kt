package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

@Serializable
data class RegisterTokenRequest(val token: String, val platform: String = "android")

@Serializable
data class OkResponse(val ok: Boolean = false)
