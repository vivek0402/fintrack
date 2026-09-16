// Lightweight per-key localStorage cache with a TTL, used for dashboard data
// that doesn't need to be fresh on every single page open. Never throws --
// a private window, cleared storage, or a blocked accessor should degrade to
// "always fetch", never break the page. Mirrors the inline cache pattern the
// dashboard's main summary/trends/transactions/budgets/goals fetch already
// used before this helper existed.
export function getCached<T>(key: string, ttlMs: number): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { data, ts } = JSON.parse(raw);
        if (typeof ts !== 'number' || Date.now() - ts > ttlMs) return null;
        return data as T;
    } catch {
        return null;
    }
}

export function setCached(key: string, data: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch {
        // Storage full or blocked -- caching is a nice-to-have, never fatal.
    }
}
