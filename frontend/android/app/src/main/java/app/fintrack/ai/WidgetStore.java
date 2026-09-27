package app.fintrack.ai;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

/**
 * Everything the widgets keep on the device: the widget-scoped token and the
 * last good summary (so widgets render instantly after a reboot, offline, or
 * before the first refresh finishes).
 *
 * Stored in EncryptedSharedPreferences, like the app-lock PIN hash, in its
 * own file ("fintrack_widget_secure") that backup_rules.xml and
 * data_extraction_rules.xml keep out of backups: the Keystore key that
 * encrypts it never leaves this phone, so a restored copy is unreadable.
 */
final class WidgetStore {

    static final String PREFS_NAME = "fintrack_widget_secure";
    private static final String TAG = "FinTrackWidget";

    private static final String KEY_TOKEN = "widget_token";
    private static final String KEY_SUMMARY = "summary_json";
    private static final String KEY_LAST_SUCCESS = "last_success_ms";
    private static final String KEY_LAST_ATTEMPT = "last_attempt_ms";

    private WidgetStore() {}

    @SuppressWarnings("deprecation")
    private static SharedPreferences open(Context ctx) throws Exception {
        MasterKey key = new MasterKey.Builder(ctx)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build();
        return EncryptedSharedPreferences.create(
            ctx,
            PREFS_NAME,
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }

    /** Null only if encrypted storage is unusable even after a reset. */
    static synchronized SharedPreferences prefs(Context context) {
        Context ctx = context.getApplicationContext();
        try {
            return open(ctx);
        } catch (Exception first) {
            // Classically: file restored onto a device without the Keystore key.
            Log.w(TAG, "Widget prefs unreadable, resetting", first);
            ctx.deleteSharedPreferences(PREFS_NAME);
            try {
                return open(ctx);
            } catch (Exception second) {
                Log.e(TAG, "Widget prefs unavailable", second);
                return null;
            }
        }
    }

    static String getToken(Context ctx) {
        SharedPreferences p = prefs(ctx);
        return p == null ? null : p.getString(KEY_TOKEN, null);
    }

    /** A different token means a new sign-in: drop any cache from the previous one. */
    static synchronized boolean saveToken(Context ctx, String token) {
        SharedPreferences p = prefs(ctx);
        if (p == null) return false;
        if (token.equals(p.getString(KEY_TOKEN, null))) return true;
        return p.edit().clear().putString(KEY_TOKEN, token).commit();
    }

    static String getSummaryJson(Context ctx) {
        SharedPreferences p = prefs(ctx);
        return p == null ? null : p.getString(KEY_SUMMARY, null);
    }

    static long getLastSuccess(Context ctx) {
        SharedPreferences p = prefs(ctx);
        return p == null ? 0 : p.getLong(KEY_LAST_SUCCESS, 0);
    }

    static long getLastAttempt(Context ctx) {
        SharedPreferences p = prefs(ctx);
        return p == null ? 0 : p.getLong(KEY_LAST_ATTEMPT, 0);
    }

    static void markAttempt(Context ctx, long nowMs) {
        SharedPreferences p = prefs(ctx);
        if (p != null) p.edit().putLong(KEY_LAST_ATTEMPT, nowMs).apply();
    }

    /**
     * Caches a summary fetched with {@code token} — unless that token is no
     * longer the stored one (the user signed out while the request was in
     * flight), so a late response can't put numbers back on a signed-out widget.
     */
    static synchronized boolean saveSummaryIfToken(Context ctx, String token, String json, long nowMs) {
        SharedPreferences p = prefs(ctx);
        if (p == null || token == null || !token.equals(p.getString(KEY_TOKEN, null))) return false;
        return p.edit().putString(KEY_SUMMARY, json).putLong(KEY_LAST_SUCCESS, nowMs).commit();
    }

    /**
     * The server rejected {@code token}: sign the widgets out — unless the app
     * already saved a newer token meanwhile, which must not be wiped.
     */
    static synchronized void clearTokenIfSame(Context ctx, String token) {
        SharedPreferences p = prefs(ctx);
        if (p == null) return;
        String current = p.getString(KEY_TOKEN, null);
        if (current == null || current.equals(token)) clearAll(ctx);
    }

    /** Signed out / token rejected: forget the token AND the cached numbers. */
    static synchronized void clearAll(Context ctx) {
        SharedPreferences p = prefs(ctx);
        if (p != null) {
            p.edit().clear().commit();
        } else {
            ctx.getApplicationContext().deleteSharedPreferences(PREFS_NAME);
        }
    }
}
