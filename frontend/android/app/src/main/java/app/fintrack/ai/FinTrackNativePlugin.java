package app.fintrack.ai;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.view.WindowManager;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

@CapacitorPlugin(name = "FinTrackNative")
public class FinTrackNativePlugin extends Plugin {

    static final String PREFS_NAME = "fintrack_widget";
    static final String KEY_JWT = "jwt";

    // App lock. The non-secret "hide in recents" flag lives in plain private
    // prefs so MainActivity can read it cheaply before the WebView exists; the
    // PIN hash lives in EncryptedSharedPreferences.
    static final String LOCK_PREFS_NAME = "fintrack_lock";
    static final String KEY_HIDE_RECENTS = "hide_recents";
    private static final String SECURE_PREFS_NAME = "fintrack_lock_secure";
    private static final String KEY_PIN_HASH = "pin_hash";
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_STRONG;
    // Keystore key the fingerprint prompt is bound to. It can only be used
    // right after a successful BIOMETRIC_STRONG match, and Android destroys it
    // when a fingerprint is added or removed, so a finger enrolled later by
    // someone who knows the phone's screen-lock PIN can't open FinTrack.
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String BIOMETRIC_KEY_ALIAS = "fintrack_app_lock_biometric";
    private static final String CIPHER_TRANSFORMATION = "AES/GCM/NoPadding";

    @PluginMethod
    public void saveToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null) {
            call.reject("token is required");
            return;
        }
        getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_JWT, token)
            .apply();

        call.resolve();
    }

    @PluginMethod
    public void getFCMToken(PluginCall call) {
        String token = getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString("fcm_token", null);
        JSObject ret = new JSObject();
        ret.put("token", token != null ? token : "");
        call.resolve(ret);
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_JWT)
            .remove("budgets_json")
            .remove("summary_json")
            .remove("last_updated")
            .apply();

        call.resolve();
    }

    // ── Home-screen widgets ─────────────────────────────────────────────────
    // The widgets use their own long-lived, widget-scoped token (issued by
    // POST /api/widget/token), not the 15-minute access token above, so they
    // keep refreshing in the background. It lives in WidgetStore's
    // EncryptedSharedPreferences, excluded from backups.

    /** Whether any FinTrack widget is on the home screen (no point minting a token otherwise). */
    @PluginMethod
    public void hasWidgets(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("present", WidgetRefresh.hasAnyWidgets(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void hasWidgetToken(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("present", WidgetStore.getToken(getContext()) != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void saveWidgetToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.reject("token is required");
            return;
        }
        Context ctx = getContext();
        if (!WidgetStore.saveToken(ctx, token)) {
            call.reject("Could not save widget token");
            return;
        }
        WidgetRenderer.updateAll(ctx);
        WidgetRefresh.refreshNow(ctx);
        call.resolve();
    }

    /** Sign-out: forget the widget token and cached numbers, show "Open FinTrack to set up". */
    @PluginMethod
    public void clearWidgetToken(PluginCall call) {
        Context ctx = getContext();
        WidgetStore.clearAll(ctx);
        WidgetRenderer.updateAll(ctx);
        call.resolve();
    }

    /** Fetch fresh numbers now (app start, after a transaction is saved/edited/deleted). */
    @PluginMethod
    public void refreshWidgets(PluginCall call) {
        WidgetRefresh.refreshNow(getContext());
        call.resolve();
    }

    // ── Widget add sheet (QuickAddActivity) ─────────────────────────────────
    // Both are no-ops in MainActivity, so the web code can call them anywhere.

    /** Closes the add sheet; refreshWidgets=true after a save (the page's debounced refresh dies with it). */
    @PluginMethod
    public void closeQuickAdd(PluginCall call) {
        boolean refresh = Boolean.TRUE.equals(call.getBoolean("refreshWidgets", false));
        AppCompatActivity activity = getActivity();
        call.resolve();
        if (activity instanceof QuickAddActivity) {
            activity.runOnUiThread(() -> ((QuickAddActivity) activity).close(refresh));
        }
    }

    /** From the add sheet: open the full app (logged out, Forgot PIN) and close the sheet. */
    @PluginMethod
    public void openMainApp(PluginCall call) {
        AppCompatActivity activity = getActivity();
        call.resolve();
        if (activity instanceof QuickAddActivity) {
            activity.runOnUiThread(() -> ((QuickAddActivity) activity).openMainApp(false));
        }
    }

    // ── App lock: biometrics ────────────────────────────────────────────────

    @PluginMethod
    public void biometricStatus(PluginCall call) {
        int code = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        String status;
        if (code == BiometricManager.BIOMETRIC_SUCCESS) {
            status = "available";
        } else if (code == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
            status = "not_enrolled";
        } else {
            // NO_HARDWARE, HW_UNAVAILABLE, SECURITY_UPDATE_REQUIRED, UNSUPPORTED...
            status = "no_hardware";
        }
        JSObject ret = new JSObject();
        ret.put("status", status);
        ret.put("code", code);
        call.resolve(ret);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        String title = call.getString("title", "Unlock FinTrack");
        String subtitle = call.getString("subtitle");
        String negativeText = call.getString("negativeText", "Use PIN");
        AppCompatActivity activity = getActivity();
        if (activity == null) {
            resolveAuth(call, "error", -1, "No activity");
            return;
        }

        // Bind the prompt to the Keystore key. A missing key, or one Android
        // invalidated because fingerprints changed, is reported as
        // "invalidated": JS turns fingerprint off and asks for the PIN, and
        // re-enabling fingerprint in Settings makes a fresh key.
        final Cipher boundCipher;
        try {
            boundCipher = initBiometricCipher();
        } catch (KeyPermanentlyInvalidatedException e) {
            deleteKeyQuietly();
            resolveAuth(call, "invalidated", -1, "Fingerprints changed");
            return;
        } catch (Exception e) {
            // Anything else (Keystore busy, a one-off cipher-init failure) may
            // be transient: keep the key, so one hiccup can't permanently turn
            // fingerprint off. JS falls back to the PIN for this unlock only.
            Logger.error("FinTrackNative", "Biometric cipher init failed", e);
            resolveAuth(call, "error", -1, e.getMessage());
            return;
        }
        if (boundCipher == null) {
            resolveAuth(call, "invalidated", -1, "No biometric key");
            return;
        }

        activity.runOnUiThread(() -> {
            AtomicBoolean settled = new AtomicBoolean(false);
            try {
                BiometricPrompt prompt = new BiometricPrompt(
                    activity,
                    ContextCompat.getMainExecutor(getContext()),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            if (!settled.compareAndSet(false, true)) return;
                            // Success means the Keystore released the key: the
                            // authenticated cipher has to actually work.
                            BiometricPrompt.CryptoObject crypto = result.getCryptoObject();
                            Cipher authed = crypto != null ? crypto.getCipher() : null;
                            if (authed == null) {
                                resolveAuth(call, "error", -1, "No authenticated cipher");
                                return;
                            }
                            try {
                                authed.doFinal(new byte[] { 1 });
                                resolveAuth(call, "success", 0, null);
                            } catch (Exception e) {
                                Logger.error("FinTrackNative", "Authenticated cipher failed", e);
                                resolveAuth(call, "error", -1, e.getMessage());
                            }
                        }

                        @Override
                        public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                            if (!settled.compareAndSet(false, true)) return;
                            String result;
                            if (errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                                result = "use_pin";
                            } else if (errorCode == BiometricPrompt.ERROR_USER_CANCELED
                                || errorCode == BiometricPrompt.ERROR_CANCELED) {
                                result = "cancel";
                            } else {
                                // LOCKOUT, LOCKOUT_PERMANENT, NO_BIOMETRICS, HW_* ...
                                result = "error";
                            }
                            resolveAuth(call, result, errorCode, errString.toString());
                        }

                        // onAuthenticationFailed (finger not recognised) is not
                        // terminal — the system prompt stays up for another try.
                    }
                );

                BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setNegativeButtonText(negativeText)
                    .setAllowedAuthenticators(AUTHENTICATORS)
                    .setConfirmationRequired(false);
                if (subtitle != null && !subtitle.isEmpty()) info.setSubtitle(subtitle);

                prompt.authenticate(info.build(), new BiometricPrompt.CryptoObject(boundCipher));
            } catch (Exception e) {
                Logger.error("FinTrackNative", "BiometricPrompt failed", e);
                if (settled.compareAndSet(false, true)) resolveAuth(call, "error", -1, e.getMessage());
            }
        });
    }

    /** (Re)creates the biometric-bound key. Called whenever the user turns fingerprint on. */
    @PluginMethod
    public void enableBiometricKey(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            deleteKeyQuietly();
            KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
                BIOMETRIC_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // Every use needs a fresh strong-biometric match (no validity window).
                spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
            }
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
            generator.init(spec.build());
            generator.generateKey();
            ret.put("ok", true);
        } catch (Exception e) {
            Logger.error("FinTrackNative", "Could not create biometric key", e);
            ret.put("ok", false);
            ret.put("message", e.getMessage());
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void deleteBiometricKey(PluginCall call) {
        deleteKeyQuietly();
        call.resolve();
    }

    /** Null when no key exists; throws KeyPermanentlyInvalidatedException once Android revoked it. */
    private Cipher initBiometricCipher() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        SecretKey key = (SecretKey) keyStore.getKey(BIOMETRIC_KEY_ALIAS, null);
        if (key == null) return null;
        Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key);
        return cipher;
    }

    private void deleteKeyQuietly() {
        try {
            KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
            keyStore.load(null);
            if (keyStore.containsAlias(BIOMETRIC_KEY_ALIAS)) keyStore.deleteEntry(BIOMETRIC_KEY_ALIAS);
        } catch (Exception e) {
            Logger.error("FinTrackNative", "Could not delete biometric key", e);
        }
    }

    // ── App lock: monotonic clock ───────────────────────────────────────────

    /** Milliseconds since boot, deep sleep included. The user can't set it back. */
    @PluginMethod
    public void elapsedRealtime(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ms", SystemClock.elapsedRealtime());
        call.resolve(ret);
    }

    private void resolveAuth(PluginCall call, String result, int code, String message) {
        JSObject ret = new JSObject();
        ret.put("result", result);
        ret.put("code", code);
        if (message != null) ret.put("message", message);
        call.resolve(ret);
    }

    // ── App lock: FLAG_SECURE ───────────────────────────────────────────────

    @PluginMethod
    public void setSecureFlag(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getContext()
            .getSharedPreferences(LOCK_PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_HIDE_RECENTS, enabled)
            .apply();
        applySecureFlag(enabled, call);
    }

    private void applySecureFlag(boolean enabled, PluginCall call) {
        AppCompatActivity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            if (enabled) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ also has a per-activity recents screenshot switch.
                activity.setRecentsScreenshotEnabled(!enabled);
            }
            call.resolve();
        });
    }

    // ── App lock: PIN hash storage ──────────────────────────────────────────

    // EncryptedSharedPreferences backed by an AES-256 Android Keystore key. If
    // the file can't be opened (classically: restored from a backup onto a
    // device whose Keystore doesn't hold the key), drop it and start fresh —
    // the user then has no PIN and can only use "Forgot PIN? Log in again".
    private SharedPreferences securePrefs() throws Exception {
        Context ctx = getContext();
        try {
            return openSecurePrefs(ctx);
        } catch (Exception first) {
            Logger.error("FinTrackNative", "Encrypted prefs unreadable, resetting", first);
            ctx.deleteSharedPreferences(SECURE_PREFS_NAME);
            return openSecurePrefs(ctx);
        }
    }

    @SuppressWarnings("deprecation")
    private static SharedPreferences openSecurePrefs(Context ctx) throws Exception {
        MasterKey key = new MasterKey.Builder(ctx)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build();
        return EncryptedSharedPreferences.create(
            ctx,
            SECURE_PREFS_NAME,
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }

    @PluginMethod
    public void setPinHash(PluginCall call) {
        String hash = call.getString("hash");
        if (hash == null || hash.isEmpty()) {
            call.reject("hash is required");
            return;
        }
        try {
            // commit(), not apply(): the caller treats a resolved call as "saved".
            boolean ok = securePrefs().edit().putString(KEY_PIN_HASH, hash).commit();
            if (ok) call.resolve();
            else call.reject("Could not save PIN");
        } catch (Exception e) {
            call.reject("Could not save PIN", e);
        }
    }

    @PluginMethod
    public void getPinHash(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            String hash = securePrefs().getString(KEY_PIN_HASH, null);
            ret.put("hash", hash != null ? hash : JSObject.NULL);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read PIN", e);
        }
    }

    @PluginMethod
    public void clearLock(PluginCall call) {
        deleteKeyQuietly();
        try {
            securePrefs().edit().remove(KEY_PIN_HASH).commit();
        } catch (Exception e) {
            Logger.error("FinTrackNative", "Could not clear PIN hash", e);
            getContext().deleteSharedPreferences(SECURE_PREFS_NAME);
        }
        getContext()
            .getSharedPreferences(LOCK_PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_HIDE_RECENTS)
            .apply();
        applySecureFlag(false, call);
    }
}
