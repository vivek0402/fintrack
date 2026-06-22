package app.fintrack.compose.data.notifications

import app.fintrack.compose.data.api.NotificationsApiService
import app.fintrack.compose.data.api.RegisterTokenRequest
import com.google.android.gms.tasks.Tasks
import com.google.firebase.messaging.FirebaseMessaging
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Singleton
class NotificationsRepository @Inject constructor(
    private val api: NotificationsApiService,
) {
    suspend fun registerToken(token: String) = api.registerToken(RegisterTokenRequest(token))

    suspend fun unregisterToken(token: String) = api.unregisterToken(RegisterTokenRequest(token))

    /**
     * Fetches the current FCM token and registers it with the backend. No-ops
     * silently if Firebase isn't configured yet (no google-services.json — see
     * app/build.gradle.kts) or the device has no Play Services; this is
     * best-effort and must never block or fail a login/register flow.
     */
    suspend fun registerCurrentDeviceToken() {
        runCatching {
            val token = withContext(Dispatchers.IO) { Tasks.await(FirebaseMessaging.getInstance().token) }
            registerToken(token)
        }
    }
}
