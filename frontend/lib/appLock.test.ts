import { describe, expect, it } from 'vitest';
import {
    DEFAULT_LOCK_SETTINGS, LockSettings, NO_ATTEMPTS, PBKDF2_ITERATIONS,
    attemptsLeft, constantTimeEqual, cooldownRemainingMs, hashPin, isUsablePinHash, parseAttempts, parseSettings,
    QUICK_ADD_UA_MARKER, isLockExemptRoute, registerFailure, shouldLockOnColdStart, shouldLockOnPageLoad, shouldLockOnResume, verifyPin,
} from './appLock';

const on: LockSettings = { ...DEFAULT_LOCK_SETTINGS, enabled: true };
const ctx = { settings: on, loggedIn: true, isNative: true };

describe('parseSettings', () => {
    it('defaults to off with a 1 min grace', () => {
        expect(parseSettings(null)).toEqual({ enabled: false, biometric: false, graceMs: 60_000, hideRecents: false });
    });
    it('rejects junk and unknown grace values', () => {
        expect(parseSettings('{not json')).toEqual(DEFAULT_LOCK_SETTINGS);
        expect(parseSettings(JSON.stringify({ enabled: true, graceMs: 12345 })).graceMs).toBe(60_000);
        expect(parseSettings(JSON.stringify({ enabled: true, graceMs: 0 })).graceMs).toBe(0);
    });
});

describe('cold start', () => {
    it('locks only when native, enabled and logged in', () => {
        expect(shouldLockOnColdStart(ctx)).toBe(true);
        expect(shouldLockOnColdStart({ ...ctx, isNative: false })).toBe(false);
        expect(shouldLockOnColdStart({ ...ctx, loggedIn: false })).toBe(false);
        expect(shouldLockOnColdStart({ ...ctx, settings: DEFAULT_LOCK_SETTINGS })).toBe(false);
    });

    it('treats a page load as a cold start unless it is an in-session reload', () => {
        expect(shouldLockOnPageLoad({ ...ctx, sessionUnlocked: false, backgroundedAt: null })).toBe(true);
        // Reload while unlocked and in the foreground (PWA reloadOnOnline) — no prompt.
        expect(shouldLockOnPageLoad({ ...ctx, sessionUnlocked: true, backgroundedAt: null })).toBe(false);
        // We left the app before this load — always lock.
        expect(shouldLockOnPageLoad({ ...ctx, sessionUnlocked: true, backgroundedAt: 1000 })).toBe(true);
        expect(shouldLockOnPageLoad({ ...ctx, loggedIn: false, sessionUnlocked: false, backgroundedAt: null })).toBe(false);
    });
});

describe('resume grace', () => {
    const t0 = 1_000_000;
    it('1 min grace locks at exactly 60s, not before', () => {
        expect(shouldLockOnResume({ ...ctx, backgroundedAt: t0, now: t0 + 59_999 })).toBe(false);
        expect(shouldLockOnResume({ ...ctx, backgroundedAt: t0, now: t0 + 60_000 })).toBe(true);
    });
    it('5 min grace', () => {
        const s = { ...on, graceMs: 300_000 as const };
        expect(shouldLockOnResume({ ...ctx, settings: s, backgroundedAt: t0, now: t0 + 299_000 })).toBe(false);
        expect(shouldLockOnResume({ ...ctx, settings: s, backgroundedAt: t0, now: t0 + 300_000 })).toBe(true);
    });
    it('"Immediately" locks on any return from the background', () => {
        const s = { ...on, graceMs: 0 as const };
        expect(shouldLockOnResume({ ...ctx, settings: s, backgroundedAt: t0, now: t0 })).toBe(true);
    });
    it('a resume with no recorded background (e.g. after the fingerprint dialog) never locks', () => {
        const s = { ...on, graceMs: 0 as const };
        expect(shouldLockOnResume({ ...ctx, settings: s, backgroundedAt: null, now: t0 })).toBe(false);
    });
    it('setting the clock back locks instead of extending the grace', () => {
        expect(shouldLockOnResume({ ...ctx, backgroundedAt: t0, now: t0 - 1 })).toBe(true);
        expect(shouldLockOnResume({ ...ctx, backgroundedAt: t0, now: t0 - 3_600_000 })).toBe(true);
    });
    it('the monotonic clock wins when the wall clock under-reports time away', () => {
        // Away 5 min, but the wall clock was set back so it reads 10s.
        expect(shouldLockOnResume({ ...ctx, backgroundedAt: t0, now: t0 + 10_000, bgElapsed: 50_000, nowElapsed: 350_000 })).toBe(true);
        // Genuinely 10s away on both clocks.
        expect(shouldLockOnResume({ ...ctx, backgroundedAt: t0, now: t0 + 10_000, bgElapsed: 50_000, nowElapsed: 60_000 })).toBe(false);
        // elapsedRealtime went backwards (reboot) — lock.
        expect(shouldLockOnResume({ ...ctx, backgroundedAt: t0, now: t0 + 10_000, bgElapsed: 50_000, nowElapsed: 1_000 })).toBe(true);
        // No monotonic reading — wall clock alone decides.
        expect(shouldLockOnResume({ ...ctx, backgroundedAt: t0, now: t0 + 10_000, bgElapsed: null, nowElapsed: 60_000 })).toBe(false);
    });
    it('never locks when lock is off or on web', () => {
        expect(shouldLockOnResume({ ...ctx, settings: DEFAULT_LOCK_SETTINGS, backgroundedAt: t0, now: t0 + 1e9 })).toBe(false);
        expect(shouldLockOnResume({ ...ctx, isNative: false, backgroundedAt: t0, now: t0 + 1e9 })).toBe(false);
    });
});

describe('wrong-PIN attempts', () => {
    it('cools down for 30s after 5 wrong PINs', () => {
        let s = NO_ATTEMPTS;
        for (let i = 0; i < 4; i++) {
            const r = registerFailure(s, 0);
            expect(r.outcome).toBe('retry');
            s = r.state;
        }
        expect(attemptsLeft(s)).toBe(1);
        const r = registerFailure(s, 10_000);
        expect(r.outcome).toBe('cooldown');
        expect(cooldownRemainingMs(r.state, 10_000)).toBe(30_000);
        expect(cooldownRemainingMs(r.state, 25_000)).toBe(15_000);
        expect(cooldownRemainingMs(r.state, 40_000)).toBe(0);
        expect(attemptsLeft(r.state)).toBe(5);
    });

    it('locks out on the 10th wrong PIN', () => {
        let s = NO_ATTEMPTS;
        const outcomes: string[] = [];
        for (let i = 0; i < 10; i++) {
            const r = registerFailure(s, i * 60_000);
            outcomes.push(r.outcome);
            s = r.state;
        }
        expect(outcomes.slice(0, 4)).toEqual(['retry', 'retry', 'retry', 'retry']);
        expect(outcomes[4]).toBe('cooldown');
        expect(outcomes.slice(5, 9)).toEqual(['retry', 'retry', 'retry', 'retry']);
        expect(outcomes[9]).toBe('lockout');
    });

    it('survives a round trip through storage (restart does not reset it)', () => {
        const { state } = registerFailure({ failures: 4, cooldownUntil: null }, 5000);
        expect(parseAttempts(JSON.stringify(state))).toEqual(state);
        expect(parseAttempts('garbage')).toEqual(NO_ATTEMPTS);
    });
});

describe('PIN hashing', () => {
    const fast = { iterations: 1000 };

    it('uses at least 100k iterations by default and never contains the PIN', async () => {
        expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100_000);
        const h = await hashPin('4821');
        expect(h.startsWith(`pbkdf2-sha256$${PBKDF2_ITERATIONS}$`)).toBe(true);
        expect(h).not.toContain('4821');
        expect(await verifyPin('4821', h)).toBe(true);
    });

    it('rejects a wrong PIN', async () => {
        const h = await hashPin('1234');
        expect(await verifyPin('1234', h)).toBe(true);
        expect(await verifyPin('1235', h)).toBe(false);
        expect(await verifyPin('1234', null)).toBe(false);
        expect(await verifyPin('1234', 'nonsense')).toBe(false);
    });

    it('produces a different hash per salt for the same PIN', async () => {
        const a = await hashPin('0000', fast);
        const b = await hashPin('0000', fast);
        expect(a).not.toEqual(b);
        const salt = new Uint8Array(16).fill(7);
        expect(await hashPin('0000', { ...fast, salt })).toEqual(await hashPin('0000', { ...fast, salt }));
    });

    it('refuses stored hashes below 100k iterations (treated as no PIN)', async () => {
        const weak = await hashPin('1234', { iterations: 99_999 });
        expect(isUsablePinHash(weak)).toBe(false);
        expect(await verifyPin('1234', weak)).toBe(false);
        expect(isUsablePinHash(await hashPin('1234', { iterations: 100_000 }))).toBe(true);
        expect(isUsablePinHash(null)).toBe(false);
        expect(isUsablePinHash('pbkdf2-sha256$150000$$')).toBe(false);
    });

    it('constant-time compare handles length mismatch', () => {
        expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
        expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
        expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    });
});

describe('lock-exempt routes', () => {
    const ctx = { settings: { ...DEFAULT_LOCK_SETTINGS, enabled: true }, loggedIn: true, isNative: true };
    const SHEET_UA = `Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile ${QUICK_ADD_UA_MARKER}`;
    const APP_UA = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile';

    it('only exactly /widget-add, and only in QuickAddActivity (UA marker)', () => {
        expect(isLockExemptRoute('/widget-add', SHEET_UA)).toBe(true);
        expect(isLockExemptRoute('/widget-add/', SHEET_UA)).toBe(true);
        expect(isLockExemptRoute('/widget-add', APP_UA)).toBe(false);
        expect(isLockExemptRoute('/widget-add/', undefined)).toBe(false);
        expect(isLockExemptRoute('/widget-add/x', SHEET_UA)).toBe(false);
        expect(isLockExemptRoute('/widget-addx', SHEET_UA)).toBe(false);
        expect(isLockExemptRoute('/dashboard', SHEET_UA)).toBe(false);
        expect(isLockExemptRoute('/', SHEET_UA)).toBe(false);
        expect(isLockExemptRoute(undefined, SHEET_UA)).toBe(false);
    });

    it('a page load there never locks; MainActivity on the same path, or anywhere else, still does', () => {
        const load = { ...ctx, sessionUnlocked: false, backgroundedAt: 1000 };
        expect(shouldLockOnPageLoad({ ...load, pathname: '/widget-add/', userAgent: SHEET_UA })).toBe(false);
        expect(shouldLockOnPageLoad({ ...load, pathname: '/widget-add/', userAgent: APP_UA })).toBe(true);
        expect(shouldLockOnPageLoad({ ...load, pathname: '/dashboard/', userAgent: SHEET_UA })).toBe(true);
    });
});
