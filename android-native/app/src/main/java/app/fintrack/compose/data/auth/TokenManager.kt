package app.fintrack.compose.data.auth

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * Replaces the Capacitor app's plaintext SharedPreferences token bridge
 * (FinTrackNativePlugin.java) with Jetpack DataStore. Mirrors
 * frontend/store/authStore.ts's persisted-token contract (one JWT, 7-day
 * server-side expiry — this layer just stores/clears it, the OkHttp
 * AuthInterceptor + a future 401 handler own the expiry/logout behavior).
 */
@Singleton
class TokenManager @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    private val tokenKey = stringPreferencesKey("auth_token")

    val tokenFlow: Flow<String?> = dataStore.data.map { it[tokenKey] }

    suspend fun getToken(): String? = dataStore.data.first()[tokenKey]

    suspend fun saveToken(token: String) {
        dataStore.edit { it[tokenKey] = token }
    }

    suspend fun clearToken() {
        dataStore.edit { it.remove(tokenKey) }
    }
}
