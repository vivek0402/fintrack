// Older card statements the user says really weren't paid (they carried the
// balance over), so the app stops suggesting they were paid outside it.
// Kept per card in localStorage, keyed by statement close date, and synced
// across the user's devices (lib/appPrefs.ts).

import { pushAppPref, collectLocalNotPaid } from '@/lib/appPrefs';

const key = (cardId: number | string) => `fintrack-cc-not-paid-${cardId}`;

export function getNotPaid(cardId: number | string): Set<string> {
    try {
        const raw = localStorage.getItem(key(cardId));
        const list = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(list) ? list.filter((x: unknown) => typeof x === 'string') : []);
    } catch {
        return new Set();
    }
}

export function setNotPaid(cardId: number | string, closeDate: string, notPaid: boolean): Set<string> {
    const set = getNotPaid(cardId);
    if (notPaid) set.add(closeDate); else set.delete(closeDate);
    try {
        if (set.size) localStorage.setItem(key(cardId), JSON.stringify([...set]));
        else localStorage.removeItem(key(cardId));
    } catch { /* storage unavailable */ }
    pushAppPref('cc_not_paid', collectLocalNotPaid());
    return set;
}
