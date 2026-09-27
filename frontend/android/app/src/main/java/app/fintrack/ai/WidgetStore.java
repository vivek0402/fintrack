package app.fintrack.ai;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import java.security.KeyStoreException;

import javax.crypto.AEADBadTagException;

/**
 * Everything the widgets keep on the device: the widget-scoped token and the
 * last good summary (so widgets render instantly after a reboot, offline, or
 * before the first refresh finishes).
 *
 * Stored in EncryptedSharedPreferences, like the app-lock PIN hash, in its
 * own file ("fintrack_widget_secure") that backup_rules.xml and
 * data_extraction_rules.xml keep out of backups: the Keystore key that
 * encrypts it never leaves this phone, so a restored copy is unreadable.
 *
 * The instance is opened once and cached: building the MasterKey and the Tink
 * keysets costs tens of milliseconds, and widget rendering reads several keys
 * on the main thread. The file is deleted only on genuine corruption (a
 * decrypt tag failure or an unusable Keystore key); any other error is logged
 * and treated as "no data" for that one read, leaving the file alone.
 */
final class WidgetStore {

    static final String PREFS_NAME = "fintrack_widget_secure";
    private static final String TAG = "FinTrackWidget";

    private static final String KEY_TOKEN = "widget_token";
    private static final String KEY_SUMMARY = "summary_json";
    private static final String KEY_LAST_SUCCESS = "last_success_ms";
    private static final String KEY_LAST_ATTEMPT = "last_attempt_ms";

    private static final Object LOCK = new Object();
    private static volatile SharedPreferences cached;

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

    /**
     * True only for errors that mean the stored data can never be decrypted
     * again (e.g. restored onto a phone without the Keystore key, or a
     * damaged file): a GCM tag mismatch or a Keystore failure, anywhere in
     * the cause chain.
     */
    static boolean isCorruption(Throwable t) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (c instanceof AEADBadTagException || c instanceof KeyStoreException) return true;
            if (c.getCause() == c) break;
        }
        return false;
    }

    /** Drop the unreadable file so the next open starts fresh. */
    private static void resetCorrupt(Context ctx, Throwable why) {
        Log.w(TAG, "Widget prefs corrupt, resetting", why);
        synchronized (LOCK) {
            cached = null;
            ctx.getApplicationContext().deleteSharedPreferences(PREFS_NAME);
        }
    }

    /** The shared instance, or null if it can't be opened right now. */
    static SharedPreferences prefs(Context context) {
        SharedPreferences p = cached;
        if (p != null) return p;
        Context ctx = context.getApplicationContext();
        synchronized (LOCK) {
            if (cached != null) return cached;
            try {
                cached = open(ctx);
            } catch (Exception first) {
                if (!isCorruption(first)) {
                    // Transient (e.g. Keystore busy): don't destroy anything,
                    // and don't cache the failure; the next call retries.
                    Log.w(TAG, "Widget prefs unavailable for now", first);
                    return null;
                }
                Log.w(TAG, "Widget prefs corrupt, resetting", first);
                ctx.deleteSharedPreferences(PREFS_NAME);
                try {
                    cached = open(ctx);
                } catch (Exception second) {
                    Log.e(TAG, "Widget prefs unavailable", second);
                    return null;
                }
            }
            return cached;
        }
    }

    private static String readString(Context ctx, String key) {
        SharedPreferences p = prefs(ctx);
        if (p == null) return null;
        try {
            return p.getString(key, null);
        } catch (Exception e) {
            if (isCorruption(e)) resetCorrupt(ctx, e);
            else Log.w(TAG, "Widget prefs read failed: " + key, e);
            return null;
        }
    }

    private static long readLong(Context ctx, String key) {
        SharedPreferences p = prefs(ctx);
        if (p == null) return 0;
        try {
            return p.getLong(key, 0);
        } catch (Exception e) {
            if (isCorruption(e)) resetCorrupt(ctx, e);
            else Log.w(TAG, "Widget prefs read failed: " + key, e);
            return 0;
        }
    }

    static String getToken(Context ctx) {
        return readString(ctx, KEY_TOKEN);
    }

    static String getSummaryJson(Context ctx) {
        return readString(ctx, KEY_SUMMARY);
    }

    static long getLastSuccess(Context ctx) {
        return readLong(ctx, KEY_LAST_SUCCESS);
    }

    static long getLastAttempt(Context ctx) {
        return readLong(ctx, KEY_LAST_ATTEMPT);
    }

    /** A different token means a new sign-in: drop any cache from the previous one. */
    static synchronized boolean saveToken(Context ctx, String token) {
        SharedPreferences p = prefs(ctx);
        if (p == null) return false;
        try {
            if (token.equals(p.getString(KEY_TOKEN, null))) return true;
            return p.edit().clear().putString(KEY_TOKEN, token).commit();
        } catch (Exception e) {
            Log.w(TAG, "Could not save widget token", e);
            return false;
        }
    }

    static void markAttempt(Context ctx, long nowMs) {
        SharedPreferences p = prefs(ctx);
        if (p == null) return;
        try {
            p.edit().putLong(KEY_LAST_ATTEMPT, nowMs).apply();
        } catch (Exception e) {
            Log.w(TAG, "Could not record widget refresh attempt", e);
        }
    }

    /**
     * Caches a summary fetched with {@code token}, unless that token is no
     * longer the stored one (the user signed out while the request was in
     * flight), so a late response can't put numbers back on a signed-out widget.
     */
    static synchronized boolean saveSummaryIfToken(Context ctx, String token, String json, long nowMs) {
        SharedPreferences p = prefs(ctx);
        if (p == null || token == null) return false;
        try {
            if (!token.equals(p.getString(KEY_TOKEN, null))) return false;
            return p.edit().putString(KEY_SUMMARY, json).putLong(KEY_LAST_SUCCESS, nowMs).commit();
        } catch (Exception e) {
            Log.w(TAG, "Could not cache widget summary", e);
            return false;
        }
    }

    /**
     * The server rejected {@code token}: sign the widgets out, unless the app
     * already saved a newer token meanwhile, which must not be wiped.
     */
    static synchronized void clearTokenIfSame(Context ctx, String token) {
        String current = readString(ctx, KEY_TOKEN);
        if (current == null || current.equals(token)) clearAll(ctx);
    }

    /** Signed out / token rejected: forget the token AND the cached numbers. */
    static synchronized void clearAll(Context ctx) {
        SharedPreferences p = prefs(ctx);
        boolean cleared = false;
        if (p != null) {
            try {
                cleared = p.edit().clear().commit();
            } catch (Exception e) {
                Log.w(TAG, "Could not clear widget prefs", e);
            }
        }
        if (!cleared) {
            // Sign-out must not leave numbers behind: drop the file outright.
            synchronized (LOCK) {
                cached = null;
                ctx.getApplicationContext().deleteSharedPreferences(PREFS_NAME);
            }
        }
    }
}
