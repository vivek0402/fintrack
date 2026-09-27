import { registerPlugin } from '@capacitor/core';

export type BiometricAvailability = 'available' | 'not_enrolled' | 'no_hardware';

// 'use_pin' = the prompt's "Use PIN" button; 'cancel' = dismissed (back,
// tap outside, app backgrounded); 'invalidated' = the Keystore key the
// prompt is bound to is gone (fingerprints were added/removed, or it was
// never created) — fingerprint must be turned off until re-enabled;
// 'error' = anything else, e.g. too many failed fingerprints (the sensor
// locks out) — callers fall back to the PIN.
export type BiometricResult = 'success' | 'use_pin' | 'cancel' | 'invalidated' | 'error';

export interface FinTrackNativePlugin {
  saveToken(options: { token: string }): Promise<void>;
  clearToken(): Promise<void>;
  getFCMToken(): Promise<{ token: string }>;

  // ── Home-screen widgets ──
  /** Whether any FinTrack widget is placed on the home screen. */
  hasWidgets(): Promise<{ present: boolean }>;
  /** Whether a widget-scoped token (POST /api/widget/token) is stored natively. */
  hasWidgetToken(): Promise<{ present: boolean }>;
  /** Stores the widget token in EncryptedSharedPreferences and refreshes the widgets. */
  saveWidgetToken(options: { token: string }): Promise<void>;
  /** Sign-out: forgets the widget token + cached numbers; widgets show "Open FinTrack to set up". */
  clearWidgetToken(): Promise<void>;
  /** Asks the widgets to fetch fresh numbers now (no-op when none are placed). */
  refreshWidgets(): Promise<void>;

  // ── App lock ──
  biometricStatus(): Promise<{ status: BiometricAvailability }>;
  /** BiometricPrompt bound to a Keystore CryptoObject; success requires the authenticated cipher. */
  authenticate(options: { title: string; subtitle?: string; negativeText?: string }): Promise<{ result: BiometricResult; code?: number; message?: string }>;
  /** (Re)creates the biometric-bound Keystore key (invalidated by new enrolments). */
  enableBiometricKey(): Promise<{ ok: boolean; message?: string }>;
  deleteBiometricKey(): Promise<void>;
  /** SystemClock.elapsedRealtime(): monotonic, counts deep sleep, can't be set back. */
  elapsedRealtime(): Promise<{ ms: number }>;
  /** Adds/clears FLAG_SECURE now, and remembers it so MainActivity applies it on the next cold start. */
  setSecureFlag(options: { enabled: boolean }): Promise<void>;
  /** Stores the PBKDF2 hash string (never the PIN) in EncryptedSharedPreferences. */
  setPinHash(options: { hash: string }): Promise<void>;
  getPinHash(): Promise<{ hash: string | null }>;
  /** Removes the PIN hash, the biometric key and the secure-flag setting, and clears FLAG_SECURE. */
  clearLock(): Promise<void>;
}

// Web implementation is a no-op — plugin only runs on Android. App lock is
// never offered on web, so these are only reached by accident.
export const FinTrackNative = registerPlugin<FinTrackNativePlugin>('FinTrackNative', {
  web: {
    saveToken: async () => {},
    clearToken: async () => {},
    getFCMToken: async () => ({ token: '' }),
    hasWidgets: async () => ({ present: false }),
    hasWidgetToken: async () => ({ present: false }),
    saveWidgetToken: async () => {},
    clearWidgetToken: async () => {},
    refreshWidgets: async () => {},
    biometricStatus: async () => ({ status: 'no_hardware' as const }),
    authenticate: async () => ({ result: 'error' as const }),
    enableBiometricKey: async () => ({ ok: false }),
    deleteBiometricKey: async () => {},
    elapsedRealtime: async () => { throw new Error('elapsedRealtime is native-only'); },
    setSecureFlag: async () => {},
    setPinHash: async () => {},
    getPinHash: async () => ({ hash: null }),
    clearLock: async () => {},
  },
});
