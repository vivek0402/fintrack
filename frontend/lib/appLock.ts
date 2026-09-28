// App lock (Android app only) — the pure half.
//
// Everything here is deterministic given its inputs (storage, timestamps,
// WebCrypto), so the lock rules can be tested without a device: when to lock
// on cold start / page load / resume, the wrong-PIN cooldown and lockout, and
// PIN hashing. The React/native half lives in store/lockStore.ts and
// components/lock/.

export type GraceMs = 0 | 60_000 | 300_000;

export const GRACE_OPTIONS: { ms: GraceMs; label: string }[] = [
    { ms: 0, label: 'Immediately' },
    { ms: 60_000, label: '1 min' },
    { ms: 300_000, label: '5 min' },
];

export interface LockSettings {
    enabled: boolean;
    biometric: boolean;
    graceMs: GraceMs;
    hideRecents: boolean;
}

export const DEFAULT_LOCK_SETTINGS: LockSettings = {
    enabled: false,
    biometric: false,
    graceMs: 60_000,
    hideRecents: false,
};

// Storage keys. LOCK_SETTINGS_KEY, LOCK_BG_AT_KEY and LOCK_SESSION_KEY are
// also read by the pre-hydration script in app/layout.tsx — keep in sync.
export const LOCK_SETTINGS_KEY = 'fintrack-lock';
export const LOCK_ATTEMPTS_KEY = 'fintrack-lock-attempts';
export const LOCK_BG_AT_KEY = 'fintrack-lock-bg-at';
export const LOCK_SESSION_KEY = 'fintrack-lock-session';
// SystemClock.elapsedRealtime() at the moment we went to the background.
// Unlike Date.now() the user can't set it back, and it keeps counting while
// the phone sleeps.
export const LOCK_BG_ELAPSED_KEY = 'fintrack-lock-bg-elapsed';
// Set on <html> while app content must not be visible (globals.css hides it).
export const LOCKED_ATTR = 'data-app-locked';
export const COVER_ATTR = 'data-lock-cover';

// Routes the app lock never covers. /widget-add is the Android widgets' add
// sheet (QuickAddActivity): by the user's choice it opens straight to the
// form. It is its own WebView, never counts as unlocking the app, and never
// touches the app's lock timestamps; anything that leaves it hands over to
// MainActivity, which makes its own lock decision. The pre-hydration script
// (lib/lockHeadScript.ts) inlines this list.
export const LOCK_EXEMPT_ROUTES: readonly string[] = ['/widget-add'];

export function isLockExemptRoute(pathname: string | null | undefined): boolean {
    const path = (pathname ?? '').replace(/\/+$/, '');
    return LOCK_EXEMPT_ROUTES.some(r => path === r || path.startsWith(r + '/'));
}

type ReadStore = Pick<Storage, 'getItem'>;
type RWStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const isGrace = (v: unknown): v is GraceMs => v === 0 || v === 60_000 || v === 300_000;

export function parseSettings(raw: string | null): LockSettings {
    if (!raw) return { ...DEFAULT_LOCK_SETTINGS };
    try {
        const p = JSON.parse(raw) as Partial<LockSettings>;
        return {
            enabled: p.enabled === true,
            biometric: p.biometric === true,
            graceMs: isGrace(p.graceMs) ? p.graceMs : DEFAULT_LOCK_SETTINGS.graceMs,
            hideRecents: p.hideRecents === true,
        };
    } catch {
        return { ...DEFAULT_LOCK_SETTINGS };
    }
}

export function readSettings(storage: ReadStore | null): LockSettings {
    try { return parseSettings(storage?.getItem(LOCK_SETTINGS_KEY) ?? null); }
    catch { return { ...DEFAULT_LOCK_SETTINGS }; }
}

export function writeSettings(storage: RWStore | null, s: LockSettings): void {
    try { storage?.setItem(LOCK_SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function clearLockStorage(storage: RWStore | null, session?: RWStore | null): void {
    try {
        storage?.removeItem(LOCK_SETTINGS_KEY);
        storage?.removeItem(LOCK_ATTEMPTS_KEY);
        storage?.removeItem(LOCK_BG_AT_KEY);
        storage?.removeItem(LOCK_BG_ELAPSED_KEY);
        session?.removeItem(LOCK_SESSION_KEY);
    } catch { /* storage unavailable */ }
}

export function readTimestamp(storage: ReadStore | null, key: string): number | null {
    try {
        const n = Number(storage?.getItem(key));
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

// ── When to lock ─────────────────────────────────────────────────────────────

interface LockContext {
    settings: LockSettings;
    loggedIn: boolean;
    isNative: boolean;
}

/** A true cold start (new process / new WebView): lock whenever lock is on. */
export function shouldLockOnColdStart({ settings, loggedIn, isNative }: LockContext): boolean {
    return isNative && settings.enabled && loggedIn;
}

/**
 * Any full page load. It is a cold start unless this WebView session was
 * already unlocked and the app never went to the background since — i.e. an
 * in-app reload (the PWA layer reloads on reconnect), which shouldn't re-prompt.
 * A pending background timestamp means we left the app, so it always locks.
 */
export function shouldLockOnPageLoad(ctx: LockContext & { sessionUnlocked: boolean; backgroundedAt: number | null; pathname?: string | null }): boolean {
    if (isLockExemptRoute(ctx.pathname)) return false;
    if (!shouldLockOnColdStart(ctx)) return false;
    return !(ctx.sessionUnlocked && ctx.backgroundedAt === null);
}

/**
 * Returning from the background: lock once the chosen grace has elapsed.
 * Time away is judged on the wall clock AND, when the native side reported
 * it, the monotonic elapsedRealtime clock — either one saying "long enough"
 * locks. Any clock running backwards (the user set the time back; a reboot
 * reset elapsedRealtime) locks too, so a clock trick can only ever lock
 * sooner, never later.
 */
export function shouldLockOnResume(ctx: LockContext & {
    backgroundedAt: number | null;
    now: number;
    bgElapsed?: number | null;
    nowElapsed?: number | null;
}): boolean {
    if (!shouldLockOnColdStart(ctx) || ctx.backgroundedAt === null) return false;
    const grace = ctx.settings.graceMs;
    const wall = ctx.now - ctx.backgroundedAt;
    if (wall < 0 || wall >= grace) return true;
    if (ctx.bgElapsed != null && ctx.nowElapsed != null) {
        const mono = ctx.nowElapsed - ctx.bgElapsed;
        if (mono < 0 || mono >= grace) return true;
    }
    return false;
}

// ── Wrong-PIN attempts ───────────────────────────────────────────────────────

export const ATTEMPTS_BEFORE_COOLDOWN = 5;
export const COOLDOWN_MS = 30_000;
export const MAX_ATTEMPTS = 10;

export interface AttemptState {
    failures: number;
    cooldownUntil: number | null;
}

export const NO_ATTEMPTS: AttemptState = { failures: 0, cooldownUntil: null };

export type FailureOutcome = 'retry' | 'cooldown' | 'lockout';

export function registerFailure(state: AttemptState, now: number): { state: AttemptState; outcome: FailureOutcome } {
    const failures = state.failures + 1;
    if (failures >= MAX_ATTEMPTS) return { state: { failures, cooldownUntil: null }, outcome: 'lockout' };
    if (failures === ATTEMPTS_BEFORE_COOLDOWN) {
        return { state: { failures, cooldownUntil: now + COOLDOWN_MS }, outcome: 'cooldown' };
    }
    return { state: { failures, cooldownUntil: state.cooldownUntil }, outcome: 'retry' };
}

export function cooldownRemainingMs(state: AttemptState, now: number): number {
    return state.cooldownUntil === null ? 0 : Math.max(0, state.cooldownUntil - now);
}

/** Wrong PINs left before the next consequence (cooldown, then logout). */
export function attemptsLeft(state: AttemptState): number {
    return state.failures < ATTEMPTS_BEFORE_COOLDOWN
        ? ATTEMPTS_BEFORE_COOLDOWN - state.failures
        : MAX_ATTEMPTS - state.failures;
}

export function parseAttempts(raw: string | null): AttemptState {
    if (!raw) return { ...NO_ATTEMPTS };
    try {
        const p = JSON.parse(raw) as Partial<AttemptState>;
        const failures = typeof p.failures === 'number' && p.failures >= 0 ? Math.floor(p.failures) : 0;
        const cooldownUntil = typeof p.cooldownUntil === 'number' ? p.cooldownUntil : null;
        return { failures, cooldownUntil };
    } catch {
        return { ...NO_ATTEMPTS };
    }
}

export function readAttempts(storage: ReadStore | null): AttemptState {
    try { return parseAttempts(storage?.getItem(LOCK_ATTEMPTS_KEY) ?? null); }
    catch { return { ...NO_ATTEMPTS }; }
}

export function writeAttempts(storage: RWStore | null, state: AttemptState): void {
    try {
        if (state.failures === 0 && state.cooldownUntil === null) storage?.removeItem(LOCK_ATTEMPTS_KEY);
        else storage?.setItem(LOCK_ATTEMPTS_KEY, JSON.stringify(state));
    } catch { /* storage unavailable */ }
}

// ── PIN hashing (PBKDF2-SHA256 via WebCrypto) ────────────────────────────────

export const PIN_LENGTH = 4;
export const PBKDF2_ITERATIONS = 150_000;
// Stored hashes weaker than this are treated as no PIN at all.
export const MIN_PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const SCHEME = 'pbkdf2-sha256';

function subtle(): SubtleCrypto {
    const s = globalThis.crypto?.subtle;
    if (!s) throw new Error('WebCrypto is unavailable');
    return s;
}

function toB64(bytes: Uint8Array): string {
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    const key = await subtle().importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle().deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
        key,
        HASH_BITS,
    );
    return new Uint8Array(bits);
}

export function isValidPin(pin: string): boolean {
    return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/** Returns `pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>`. The PIN itself is never stored. */
export async function hashPin(pin: string, opts: { salt?: Uint8Array; iterations?: number } = {}): Promise<string> {
    const salt = opts.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iterations = opts.iterations ?? PBKDF2_ITERATIONS;
    const hash = await derive(pin, salt, iterations);
    return [SCHEME, String(iterations), toB64(salt), toB64(hash)].join('$');
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    let diff = a.length ^ b.length;
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return diff === 0;
}

function parseStoredHash(stored: string | null | undefined): { iterations: number; salt: string; hash: string } | null {
    if (!stored) return null;
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== SCHEME) return null;
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < MIN_PBKDF2_ITERATIONS) return null;
    if (!parts[2] || !parts[3]) return null;
    return { iterations, salt: parts[2], hash: parts[3] };
}

/**
 * False when there is nothing a PIN could be checked against: no hash (the
 * encrypted store was reset, or a backup was restored onto a new phone),
 * a malformed one, or one below MIN_PBKDF2_ITERATIONS.
 */
export function isUsablePinHash(stored: string | null | undefined): boolean {
    return parseStoredHash(stored) !== null;
}

export async function verifyPin(pin: string, stored: string | null | undefined): Promise<boolean> {
    const parsed = parseStoredHash(stored);
    if (!parsed) return false;
    try {
        const expected = fromB64(parsed.hash);
        const actual = await derive(pin, fromB64(parsed.salt), parsed.iterations);
        return constantTimeEqual(actual, expected);
    } catch {
        return false;
    }
}
