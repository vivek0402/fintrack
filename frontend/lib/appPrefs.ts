// Small app choices that follow the user across devices (stored on the server
// in users.app_prefs, migration 078), with this device's localStorage as the
// working copy:
//   cc_not_paid     statements marked "not paid" (lib/cardNotPaid.ts)
//   account_memory  which bank account was used per description / method
//                   (lib/accountMemory.ts)
// On app start syncAppPrefs pulls the server copy over the local one (server
// wins, so "Ask me again" on one device reaches the others); a key the server
// doesn't have yet is pushed up from this device, which carries over what was
// saved before syncing existed. Every local change is pushed shortly after.

import { profileAPI } from '@/lib/api';

export type AppPrefKey = 'cc_not_paid' | 'account_memory';

const NOT_PAID_PREFIX = 'fintrack-cc-not-paid-';
const memoryKey = (userId: string) => `fintrack-account-memory-${userId}`;

function localKeys(prefix: string): string[] {
    try {
        const out: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix)) out.push(k);
        }
        return out;
    } catch {
        return [];
    }
}

/** This device's "not paid" lists, as { cardId: [closeDate, ...] }. */
export function collectLocalNotPaid(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const k of localKeys(NOT_PAID_PREFIX)) {
        try {
            const list = JSON.parse(localStorage.getItem(k) || '[]');
            if (Array.isArray(list) && list.length) out[k.slice(NOT_PAID_PREFIX.length)] = list;
        } catch { /* skip a corrupt entry */ }
    }
    return out;
}

function writeLocalNotPaid(byCard: Record<string, unknown>) {
    for (const k of localKeys(NOT_PAID_PREFIX)) localStorage.removeItem(k);
    for (const [cardId, list] of Object.entries(byCard)) {
        if (Array.isArray(list) && list.length) localStorage.setItem(NOT_PAID_PREFIX + cardId, JSON.stringify(list));
    }
}

const timers: Partial<Record<AppPrefKey, ReturnType<typeof setTimeout>>> = {};

/** Push one preference to the server shortly after a local change (coalesced). */
export function pushAppPref(key: AppPrefKey, value: object) {
    if (timers[key]) clearTimeout(timers[key]);
    timers[key] = setTimeout(() => {
        // Best effort, never throws: if offline, the next start's sync carries it.
        try { profileAPI.patchAppPref(key, value).catch(() => {}); } catch { /* no API available */ }
    }, 800);
}

/** Pull server prefs into this device (server wins); push up what the server lacks. */
export async function syncAppPrefs(userId: string): Promise<void> {
    let prefs: Record<string, unknown> = {};
    try {
        prefs = (await profileAPI.getAppPrefs()).data?.prefs ?? {};
    } catch {
        return; // offline or older server: keep using the local copy
    }
    try {
        if (prefs.cc_not_paid && typeof prefs.cc_not_paid === 'object') {
            writeLocalNotPaid(prefs.cc_not_paid as Record<string, unknown>);
        } else {
            const local = collectLocalNotPaid();
            if (Object.keys(local).length) await profileAPI.patchAppPref('cc_not_paid', local);
        }
        if (prefs.account_memory && typeof prefs.account_memory === 'object') {
            localStorage.setItem(memoryKey(userId), JSON.stringify(prefs.account_memory));
        } else {
            const raw = localStorage.getItem(memoryKey(userId));
            if (raw) await profileAPI.patchAppPref('account_memory', JSON.parse(raw));
        }
    } catch { /* storage blocked or push failed: try again next start */ }
}
