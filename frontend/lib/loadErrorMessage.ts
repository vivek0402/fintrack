/**
 * A user-facing reason for a failed load, so "it didn't load" says why:
 * offline, rate-limited, slow server or server error read very differently
 * and each needs a different next step.
 */
export function loadErrorMessage(err: unknown, what: string): string {
    const e = err as { code?: string; response?: { status?: number } } | null;
    const status = e?.response?.status;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return `You're offline. ${what} will load when you reconnect.`;
    if (status === 429) return `Too many requests. ${what} will load again in a few minutes.`;
    if (e?.code === 'ECONNABORTED') return `The server took too long. Pull down to retry ${what.toLowerCase()}.`;
    if (status && status >= 500) return `Server error loading ${what.toLowerCase()} (${status}). Pull down to retry.`;
    return `Failed to load ${what.toLowerCase()}`;
}
