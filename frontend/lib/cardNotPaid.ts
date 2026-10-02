// Older card statements the user says really weren't paid (they carried the
// balance over), so the app stops suggesting they were paid outside it.
// Remembered per card on this device, keyed by statement close date --
// same per-device approach as the budget suggestion dismissals.

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
    try { localStorage.setItem(key(cardId), JSON.stringify([...set])); } catch { /* storage unavailable */ }
    return set;
}
