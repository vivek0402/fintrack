package app.fintrack.compose.data.auth

import javax.inject.Inject
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/** Mirrors frontend/lib/api.ts's axios request interceptor — attaches the JWT to every request. */
class AuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { tokenManager.getToken() }
        val request = chain.request().newBuilder()
            .apply { if (!token.isNullOrEmpty()) addHeader("Authorization", "Bearer $token") }
            .build()
        return chain.proceed(request)
    }
}
