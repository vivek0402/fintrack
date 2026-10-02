import { QueryClient, type Query } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

// Shared server-data cache. Pages read cached data first and refresh it in the
// background, so revisiting a page (or reopening the app while Render is still
// waking up) shows the last numbers immediately instead of a skeleton.

export const QUERY_CACHE_STORAGE_KEY = 'fintrack-query-cache';

// Bump when a cached response shape changes, so an old persisted cache is
// discarded instead of being fed to code that expects the new shape.
export const QUERY_CACHE_BUSTER = 'v1';

const DAY = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60 * 1000,
            gcTime: DAY,
            retry: 1,
            refetchOnWindowFocus: true,
        },
    },
});

/** Queries opt out of localStorage persistence with `meta: { persist: false }`
 *  (unbounded lists like "all time" transactions would blow the quota). */
export function shouldPersistQuery(query: Query): boolean {
    return query.state.status === 'success' && query.meta?.persist !== false;
}

export const queryPersister = typeof window !== 'undefined'
    ? createSyncStoragePersister({ storage: window.localStorage, key: QUERY_CACHE_STORAGE_KEY })
    : undefined;

export const PERSIST_MAX_AGE = DAY;

/** Drop every cached response, in memory and on disk. Called on every logout
 *  path, so one user's finances are never shown to the next. */
export function clearQueryCache(): void {
    queryClient.clear();
    try { localStorage.removeItem(QUERY_CACHE_STORAGE_KEY); } catch { /* storage unavailable */ }
}

/** A transaction write can move almost every number in the app (totals,
 *  budgets, goals, balances, net worth, debt ratios), so mark every cached
 *  query stale. Only the queries on screen refetch now, in the background --
 *  pages keep showing their current data (no skeleton) until it lands; the
 *  rest refresh the next time their page opens. Also called from the API
 *  client after every transaction write, so writers that don't touch the
 *  cache themselves (SMS/bank import, offline queue sync) refresh too. */
export function invalidateAfterTransactionWrite(qc: QueryClient = queryClient) {
    qc.invalidateQueries();
}
