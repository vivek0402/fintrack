import { notificationsAPI } from './api';

// The profile page's notification toggles. The server copy (users.notification_prefs)
// is the source of truth and gates server pushes; localStorage stays as a cache so
// notificationTrigger.ts and offline use keep working.
export const NOTIF_PREFS_KEY = 'fintrack-notif-prefs';

export interface NotificationPrefs {
    budgetAlerts: boolean;
    billReminders: boolean;
    goalAlerts: boolean;
    weeklySummary: boolean;
}

export const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
    budgetAlerts: true,
    billReminders: true,
    goalAlerts: true,
    weeklySummary: true,
};

const PREF_KEYS = Object.keys(DEFAULT_NOTIF_PREFS) as (keyof NotificationPrefs)[];

// Stored object -> full prefs (missing / non-false = on), or null when nothing is cached.
function normalize(stored: unknown): NotificationPrefs | null {
    if (!stored || typeof stored !== 'object') return null;
    const src = stored as Record<string, unknown>;
    return Object.fromEntries(PREF_KEYS.map(k => [k, src[k] !== false])) as unknown as NotificationPrefs;
}

export function readCachedNotifPrefs(): NotificationPrefs | null {
    try {
        const raw = localStorage.getItem(NOTIF_PREFS_KEY);
        return raw ? normalize(JSON.parse(raw)) : null;
    } catch { return null; }
}

export function cacheNotifPrefs(prefs: NotificationPrefs): void {
    try { localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}
const writeCache = cacheNotifPrefs;

/**
 * Loads prefs from the server and refreshes the cache. When the server has
 * never stored any but this device has a localStorage copy (set before prefs
 * were synced), uploads that copy so existing choices carry over. Falls back
 * to the cache (or defaults) when offline.
 */
export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
    const cached = readCachedNotifPrefs();
    try {
        const res = await notificationsAPI.getPrefs();
        const { prefs, stored } = res.data as { prefs: NotificationPrefs; stored: boolean };
        if (!stored && cached) {
            await notificationsAPI.updatePrefs(cached).catch(() => {});
            return cached;
        }
        const server = normalize(prefs) ?? DEFAULT_NOTIF_PREFS;
        writeCache(server);
        return server;
    } catch {
        return cached ?? DEFAULT_NOTIF_PREFS;
    }
}

/** Caches locally first (so rule checks see it immediately), then saves to the server. */
export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
    writeCache(prefs);
    await notificationsAPI.updatePrefs(prefs);
}

/**
 * Saves one toggle: caches the caller's full state, then PUTs only that key
 * (the server merges it atomically, so concurrent toggles can't overwrite
 * each other's keys).
 */
export async function saveNotificationPref(
    key: keyof NotificationPrefs, value: boolean, full: NotificationPrefs,
): Promise<void> {
    writeCache(full);
    await notificationsAPI.updatePrefs({ [key]: value });
}

/**
 * After a failed save of key=attempted: flip it back, but only if it still
 * holds the value that failed (a newer toggle of the same key wins).
 * Returns `current` unchanged when there is nothing to revert.
 */
export function revertPref(
    current: NotificationPrefs, key: keyof NotificationPrefs, attempted: boolean,
): NotificationPrefs {
    return current[key] === attempted ? { ...current, [key]: !attempted } : current;
}

/** Server-loaded prefs, except keys the user toggled while the load was in flight. */
export function mergeLoadedPrefs(
    loaded: NotificationPrefs, current: NotificationPrefs, touched: ReadonlySet<keyof NotificationPrefs>,
): NotificationPrefs {
    const merged = { ...loaded };
    touched.forEach(k => { merged[k] = current[k]; });
    return merged;
}
