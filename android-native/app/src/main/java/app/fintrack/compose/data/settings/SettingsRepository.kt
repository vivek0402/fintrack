package app.fintrack.compose.data.settings

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * Device-local app preferences — mirrors the web app's localStorage flags
 * (`onboarded-${user.id}`, theme choice) via DataStore instead. Reuses the
 * same Preferences DataStore as [app.fintrack.compose.data.auth.TokenManager];
 * these are unrelated key namespaces in one file, not a reason for two stores.
 */
@Singleton
class SettingsRepository @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    private val themeKey = stringPreferencesKey("theme_preference") // "dark" | "light" | absent = system

    val themeFlow: Flow<String?> = dataStore.data.map { it[themeKey] }

    suspend fun setTheme(theme: String) {
        dataStore.edit { it[themeKey] = theme }
    }

    suspend fun isOnboarded(userId: String): Boolean =
        dataStore.data.first()[onboardedKey(userId)] ?: false

    suspend fun setOnboarded(userId: String) {
        dataStore.edit { it[onboardedKey(userId)] = true }
    }

    private fun onboardedKey(userId: String) = booleanPreferencesKey("onboarded_$userId")
}
