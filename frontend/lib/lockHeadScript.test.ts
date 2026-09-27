import { beforeEach, describe, expect, it } from 'vitest';
import {
    LOCKED_ATTR, LOCK_BG_AT_KEY, LOCK_SESSION_KEY, LOCK_SETTINGS_KEY, readSettings, readTimestamp, shouldLockOnPageLoad,
} from './appLock';
import { LOCK_HEAD_SCRIPT } from './lockHeadScript';

// The pre-hydration script and shouldLockOnPageLoad() must never disagree:
// if the script says "don't hide" where the gate says "lock", balances paint
// before the lock appears. Run the exact inlined string over every
// combination of stored state and compare.

const settingsCases: (string | null)[] = [
    null,
    JSON.stringify({ enabled: true, biometric: true, graceMs: 60_000, hideRecents: true }),
    JSON.stringify({ enabled: false }),
    JSON.stringify({ enabled: 'true' }),
    '{broken',
];
const authCases: (string | null)[] = [
    null,
    JSON.stringify({ state: { token: 'jwt', user: { id: 'u' } }, version: 0 }),
    JSON.stringify({ state: { token: null }, version: 0 }),
    '{broken',
];
const sessionCases: (string | null)[] = [null, '1', '0'];
const bgCases: (string | null)[] = [null, '1700000000000', 'garbage', '0'];

function runHeadScript(): boolean {
    document.documentElement.removeAttribute(LOCKED_ATTR);
    new Function(LOCK_HEAD_SCRIPT)();
    return document.documentElement.hasAttribute(LOCKED_ATTR);
}

function gateDecision(auth: string | null): boolean {
    let token: unknown = null;
    try { token = JSON.parse(auth ?? 'null')?.state?.token; } catch { token = null; }
    return shouldLockOnPageLoad({
        settings: readSettings(localStorage),
        loggedIn: !!token,
        isNative: true,
        sessionUnlocked: sessionStorage.getItem(LOCK_SESSION_KEY) === '1',
        backgroundedAt: readTimestamp(localStorage, LOCK_BG_AT_KEY),
    });
}

const set = (store: Storage, key: string, v: string | null) => (v === null ? store.removeItem(key) : store.setItem(key, v));

describe('pre-hydration lock script', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('agrees with shouldLockOnPageLoad for every stored state', () => {
        let checked = 0;
        let locks = 0;
        for (const s of settingsCases) for (const a of authCases) for (const ss of sessionCases) for (const bg of bgCases) {
            set(localStorage, LOCK_SETTINGS_KEY, s);
            set(localStorage, 'fintrack-auth', a);
            set(sessionStorage, LOCK_SESSION_KEY, ss);
            set(localStorage, LOCK_BG_AT_KEY, bg);
            const expected = gateDecision(a);
            expect(runHeadScript(), JSON.stringify({ s, a, ss, bg })).toBe(expected);
            checked++;
            if (expected) locks++;
        }
        expect(checked).toBe(settingsCases.length * authCases.length * sessionCases.length * bgCases.length);
        expect(locks).toBeGreaterThan(0);
    });

    it('never throws when storage is unavailable', () => {
        const orig = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
        try {
            expect(runHeadScript()).toBe(false);
        } finally {
            Object.defineProperty(window, 'localStorage', orig);
        }
    });
});
