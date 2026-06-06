import { getOfflineDB, idbDelete } from './offlineCache';
import { transactionsAPI } from '@/lib/api';

export type QueueOperation = 'create' | 'update' | 'delete';

export interface QueuedTx {
    tempId: string;
    operation: QueueOperation;
    data: Record<string, any>;
    queuedAt: number;
}

export async function addToQueue(operation: QueueOperation, data: Record<string, any>): Promise<string> {
    const tempId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const item: QueuedTx = { tempId, operation, data, queuedAt: Date.now() };
    const db = await getOfflineDB();
    await new Promise<void>((resolve, reject) => {
        const req = db.transaction('tx_queue', 'readwrite').objectStore('tx_queue').put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
    return tempId;
}

export async function getQueue(): Promise<QueuedTx[]> {
    try {
        const db = await getOfflineDB();
        return await new Promise<QueuedTx[]>((resolve, reject) => {
            const req = db.transaction('tx_queue', 'readonly').objectStore('tx_queue').getAll();
            req.onsuccess = () => resolve(req.result as QueuedTx[]);
            req.onerror = () => reject(req.error);
        });
    } catch { return []; }
}

export async function processQueue(): Promise<number> {
    if (typeof window === 'undefined') return 0;
    const items = await getQueue();
    if (!items.length) return 0;

    let synced = 0;
    for (const item of items) {
        try {
            if (item.operation === 'create') {
                await transactionsAPI.create(item.data);
            } else if (item.operation === 'update' && item.data.id) {
                await transactionsAPI.update(String(item.data.id), item.data);
            } else if (item.operation === 'delete' && item.data.id) {
                await transactionsAPI.delete(String(item.data.id));
            }
            await idbDelete('tx_queue', item.tempId);
            synced++;
        } catch {
            // Leave in queue for next attempt
        }
    }

    if (synced > 0) {
        window.dispatchEvent(new CustomEvent('fintrack:queue-synced', { detail: { count: synced } }));
    }
    return synced;
}
