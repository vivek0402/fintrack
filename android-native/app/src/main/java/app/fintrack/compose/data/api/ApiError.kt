package app.fintrack.compose.data.api

import java.io.IOException
import kotlinx.serialization.json.Json
import retrofit2.HttpException

@kotlinx.serialization.Serializable
private data class ErrorBody(val error: String? = null)

private val errorJson = Json { ignoreUnknownKeys = true }

/** Every backend route returns errors as `{ error: "..." }` — mirrors err.response?.data?.error on the web app. */
fun Throwable.toUserMessage(fallback: String = "Something went wrong."): String = when (this) {
    is HttpException -> {
        val raw = response()?.errorBody()?.string()
        val parsed = raw?.let { runCatching { errorJson.decodeFromString<ErrorBody>(it).error }.getOrNull() }
        parsed ?: fallback
    }
    is IOException -> "Network error. Check your connection."
    else -> fallback
}
