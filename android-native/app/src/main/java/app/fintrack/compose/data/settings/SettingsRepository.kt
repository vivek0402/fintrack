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
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

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

    // ─── Savings Plan: Pay Yourself First auto-save amounts (mirrors web's `fintrack-auto-save-plan` localStorage key) ───

    private val autoSavePlanKey = stringPreferencesKey("auto_save_plan_json")

    val autoSavePlanFlow: Flow<Map<String, Double>> = dataStore.data.map { decodeMap(it[autoSavePlanKey]) }

    suspend fun setAutoSaveAmount(goalId: String, amount: Double) {
        dataStore.edit { prefs ->
            val updated = decodeMap(prefs[autoSavePlanKey]) + (goalId to amount)
            prefs[autoSavePlanKey] = Json.encodeToString(updated)
        }
    }

    private fun decodeMap(raw: String?): Map<String, Double> =
        raw?.let { runCatching { Json.decodeFromString<Map<String, Double>>(it) }.getOrNull() } ?: emptyMap()

    // ─── Savings Plan: 30-Day Challenges start dates (mirrors web's `fintrack-challenge-{id}` localStorage keys) ───

    private fun challengeStartKey(id: String) = stringPreferencesKey("challenge_start_$id")

    val challengeStartsFlow: Flow<Map<String, String>> = dataStore.data.map { prefs ->
        CHALLENGE_IDS.mapNotNull { id -> prefs[challengeStartKey(id)]?.let { id to it } }.toMap()
    }

    suspend fun setChallengeStart(id: String, isoDate: String) {
        dataStore.edit { it[challengeStartKey(id)] = isoDate }
    }

    suspend fun clearChallengeStart(id: String) {
        dataStore.edit { it.remove(challengeStartKey(id)) }
    }

    companion object {
        val CHALLENGE_IDS = listOf("no-eating-out", "coffee", "no-spend-weekend")
    }
}
