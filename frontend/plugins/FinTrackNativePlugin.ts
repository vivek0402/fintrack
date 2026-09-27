import { registerPlugin } from '@capacitor/core';

export type BiometricAvailability = 'available' | 'not_enrolled' | 'no_hardware';

// 'use_pin' = the prompt's "Use PIN" button; 'cancel' = dismissed (back,
// tap outside, app backgrounded); 'error' = anything else, e.g. too many
// failed fingerprints (the sensor locks out) — callers fall back to the PIN.
export type BiometricResult = 'success' | 'use_pin' | 'cancel' | 'error';

export interface FinTrackNativePlugin {
  saveToken(options: { token: string }): Promise<void>;
  clearToken(): Promise<void>;
  getFCMToken(): Promise<{ token: string }>;

  // ── App lock ──
  biometricStatus(): Promise<{ status: BiometricAvailability }>;
  authenticate(options: { title: string; subtitle?: string; negativeText?: string }): Promise<{ result: BiometricResult; code?: number; message?: string }>;
  /** Adds/clears FLAG_SECURE now, and remembers it so MainActivity applies it on the next cold start. */
  setSecureFlag(options: { enabled: boolean }): Promise<void>;
  /** Stores the PBKDF2 hash string (never the PIN) in EncryptedSharedPreferences. */
  setPinHash(options: { hash: string }): Promise<void>;
  getPinHash(): Promise<{ hash: string | null }>;
  /** Removes the PIN hash and the secure-flag setting, and clears FLAG_SECURE. */
  clearLock(): Promise<void>;
}

// Web implementation is a no-op — plugin only runs on Android. App lock is
// never offered on web, so these are only reached by accident.
export const FinTrackNative = registerPlugin<FinTrackNativePlugin>('FinTrackNative', {
  web: {
    saveToken: async () => {},
    clearToken: async () => {},
    getFCMToken: async () => ({ token: '' }),
    biometricStatus: async () => ({ status: 'no_hardware' as const }),
    authenticate: async () => ({ result: 'error' as const }),
    setSecureFlag: async () => {},
    setPinHash: async () => {},
    getPinHash: async () => ({ hash: null }),
    clearLock: async () => {},
  },
});
