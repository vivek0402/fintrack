// Minimal shape shared by every entity this module caches keyed by id
// (transactions, budgets, goals) -- callers supply the real shape via the
// generic parameter, this is just enough structure for the cache layer
// itself to key the IndexedDB row.
export interface WithId {
    id: string | number;
}

const DB_NAME = 'fintrack-offline';
const DB_VERSION = 1;

let _dbPromise: Promise<IDBDatabase> | null = null;

export function getOfflineDB(): Promise<IDBDatabase> {
    if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            for (const [name, key] of [
                ['transactions', 'id'], ['budgets', 'id'], ['goals', 'id'], ['tx_queue', 'tempId'],
            ] as [string, string][]) {
                if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: key });
            }
            if (!db.objectStoreNames.contains('analytics_summary'))
                db.createObjectStore('analytics_summary', { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { _dbPromise = null; reject(req.error); };
    });
    return _dbPromise;
}

function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    return getOfflineDB().then(db => new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
    }));
}

function idbGetAll<T>(store: string): Promise<T[]> {
    return getOfflineDB().then(db => new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
    }));
}

function idbPut(store: string, value: object): Promise<void> {
    return getOfflineDB().then(db => new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readwrite').objectStore(store).put(value);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    }));
}

function idbPutBatch(store: string, values: object[]): Promise<void> {
    return getOfflineDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const s = tx.objectStore(store);
        values.forEach(v => s.put(v));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}

export function idbDelete(store: string, key: IDBValidKey): Promise<void> {
    return getOfflineDB().then(db => new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    }));
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function cacheTransactions<T extends WithId>(txs: T[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try { await idbPutBatch('transactions', txs.map(t => ({ id: t.id, data: t, syncedAt: Date.now() }))); }
    catch { /* silent */ }
}

export async function getCachedTransactions<T = unknown>(): Promise<T[]> {
    if (typeof window === 'undefined') return [];
    try {
        const rows = await idbGetAll<{ id: string | number; data: T }>('transactions');
        return rows.map(r => r.data);
    } catch { return []; }
}

// ─── Analytics summary ────────────────────────────────────────────────────────

export async function cacheAnalytics<T>(key: string, data: T, ttlMs = 3_600_000): Promise<void> {
    if (typeof window === 'undefined') return;
    try { await idbPut('analytics_summary', { key, data, cachedAt: Date.now(), expiresAt: Date.now() + ttlMs }); }
    catch { /* silent */ }
}

export async function getCachedAnalytics<T = unknown>(key: string): Promise<T | null> {
    if (typeof window === 'undefined') return null;
    try {
        const row = await idbGet<{ key: string; data: T; expiresAt: number }>('analytics_summary', key);
        if (!row || Date.now() > row.expiresAt) return null;
        return row.data;
    } catch { return null; }
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export async function cacheBudgets<T extends WithId>(budgets: T[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try { await idbPutBatch('budgets', budgets.map(b => ({ id: b.id, data: b, cachedAt: Date.now() }))); }
    catch { /* silent */ }
}

export async function getCachedBudgets<T = unknown>(): Promise<T[]> {
    if (typeof window === 'undefined') return [];
    try {
        const rows = await idbGetAll<{ id: string | number; data: T }>('budgets');
        return rows.map(r => r.data);
    } catch { return []; }
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export async function cacheGoals<T extends WithId>(goals: T[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try { await idbPutBatch('goals', goals.map(g => ({ id: g.id, data: g, cachedAt: Date.now() }))); }
    catch { /* silent */ }
}

export async function getCachedGoals<T = unknown>(): Promise<T[]> {
    if (typeof window === 'undefined') return [];
    try {
        const rows = await idbGetAll<{ id: string | number; data: T }>('goals');
        return rows.map(r => r.data);
    } catch { return []; }
}
