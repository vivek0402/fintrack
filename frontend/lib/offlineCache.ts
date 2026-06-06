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

export async function cacheTransactions(txs: any[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try { await idbPutBatch('transactions', txs.map(t => ({ id: t.id, data: t, syncedAt: Date.now() }))); }
    catch { /* silent */ }
}

export async function getCachedTransactions(): Promise<any[]> {
    if (typeof window === 'undefined') return [];
    try {
        const rows = await idbGetAll<{ id: any; data: any }>('transactions');
        return rows.map(r => r.data);
    } catch { return []; }
}

// ─── Analytics summary ────────────────────────────────────────────────────────

export async function cacheAnalytics(key: string, data: any, ttlMs = 3_600_000): Promise<void> {
    if (typeof window === 'undefined') return;
    try { await idbPut('analytics_summary', { key, data, cachedAt: Date.now(), expiresAt: Date.now() + ttlMs }); }
    catch { /* silent */ }
}

export async function getCachedAnalytics(key: string): Promise<any | null> {
    if (typeof window === 'undefined') return null;
    try {
        const row = await idbGet<{ key: string; data: any; expiresAt: number }>('analytics_summary', key);
        if (!row || Date.now() > row.expiresAt) return null;
        return row.data;
    } catch { return null; }
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export async function cacheBudgets(budgets: any[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try { await idbPutBatch('budgets', budgets.map(b => ({ id: b.id, data: b, cachedAt: Date.now() }))); }
    catch { /* silent */ }
}

export async function getCachedBudgets(): Promise<any[]> {
    if (typeof window === 'undefined') return [];
    try {
        const rows = await idbGetAll<{ id: any; data: any }>('budgets');
        return rows.map(r => r.data);
    } catch { return []; }
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export async function cacheGoals(goals: any[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try { await idbPutBatch('goals', goals.map(g => ({ id: g.id, data: g, cachedAt: Date.now() }))); }
    catch { /* silent */ }
}

export async function getCachedGoals(): Promise<any[]> {
    if (typeof window === 'undefined') return [];
    try {
        const rows = await idbGetAll<{ id: any; data: any }>('goals');
        return rows.map(r => r.data);
    } catch { return []; }
}
