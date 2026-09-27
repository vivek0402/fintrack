package app.fintrack.ai;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Fetches GET /api/widget/summary with the widget-scoped token and redraws
 * every widget.
 *  - 200: cache the JSON + time of success.
 *  - 401/403: the token is expired or revoked. Forget it and the cached
 *    numbers and show "Open FinTrack to set up" — never old numbers with no
 *    warning. The next app start issues a fresh token.
 *  - Network error / 5xx / 429: keep the last good data; its timestamp turns
 *    into "3h ago" once it's more than 2h old.
 */
public class WidgetRefreshWorker extends Worker {

    private static final String TAG = "FinTrackWidget";
    private static final int TIMEOUT_MS = 20_000;

    public WidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        String token = WidgetStore.getToken(ctx);
        if (token == null) {
            // Signed out (or never set up): make sure no stale numbers linger.
            WidgetStore.clearAll(ctx);
            WidgetRenderer.updateAll(ctx);
            return Result.success();
        }

        WidgetStore.markAttempt(ctx, System.currentTimeMillis());
        HttpURLConnection conn = null;
        try {
            URL url = new URL(BuildConfig.API_URL + "/api/widget/summary");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setUseCaches(false);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("Accept", "application/json");

            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_OK) {
                String body = readAll(conn.getInputStream());
                new JSONObject(body); // only cache what parses
                WidgetStore.saveSummaryIfToken(ctx, token, body, System.currentTimeMillis());
            } else if (code == HttpURLConnection.HTTP_UNAUTHORIZED || code == HttpURLConnection.HTTP_FORBIDDEN) {
                Log.i(TAG, "Widget token rejected (" + code + "), signing widgets out");
                WidgetStore.clearTokenIfSame(ctx, token);
            } else {
                Log.w(TAG, "Widget summary HTTP " + code + ", keeping last good data");
            }
        } catch (Exception e) {
            Log.w(TAG, "Widget refresh failed, keeping last good data", e);
        } finally {
            if (conn != null) conn.disconnect();
        }

        WidgetRenderer.updateAll(ctx);
        // Always success: the 30-minute period is the retry. A failure result
        // would only stack WorkManager backoff on top of it.
        return Result.success();
    }

    private static String readAll(InputStream in) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[4096];
            int n;
            while ((n = reader.read(buf)) != -1) sb.append(buf, 0, n);
            return sb.toString();
        }
    }
}
