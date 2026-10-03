import { describe, it, expect } from 'vitest';
import { createTestQueryClient } from '@/lib/test-utils';
import { upsertTransactionInCache, removeTransactionsFromCache, transactionMatchesParams } from './queries';import type { Transaction } from '@/types/finance';


const aug = { month: 8, year: 2026 };
const sep = { month: 9, year: 2026 };
const coffee: Transaction = { id: 'a', description: 'Coffee', amount: '250', date: '2026-08-10', type: 'expense', category_id: null };

function seed() {
    const qc = createTestQueryClient();
    qc.setQueryData(['transactions', 'u1', aug], [coffee]);
    qc.setQueryData(['transactions', 'u1', sep], []);
    qc.setQueryData(['transactions', 'u1', {}], [coffee]);  // all time
    return qc;
}
const list = (qc: ReturnType<typeof seed>, params: object) => qc.getQueryData<any[]>(['transactions', 'u1', params]);

describe('transactionMatchesParams', () => {
    it('matches by month, by from/to range, and by card', () => {
        expect(transactionMatchesParams(coffee, aug)).toBe(true);
        expect(transactionMatchesParams(coffee, sep)).toBe(false);
        expect(transactionMatchesParams(coffee, {})).toBe(true);
        expect(transactionMatchesParams(coffee, { from: '2026-08-01', to: '2026-08-09' })).toBe(false);
        expect(transactionMatchesParams(coffee, { from: '2026-08-10' })).toBe(true);
        expect(transactionMatchesParams({ ...coffee, credit_card_id: 3 }, { credit_card_id: 4 })).toBe(false);
    });
});

describe('upsertTransactionInCache', () => {
    it('adds a new row to the lists it belongs to, with category display fields filled in', () => {
        const qc = seed();
        const saved: Transaction = { id: 'b', description: 'Lunch', amount: '400', date: '2026-08-12T00:00:00.000Z', type: 'expense', category_id: 'c1' };
        upsertTransactionInCache(qc, saved, [{ id: 'c1', name: 'Food', icon: '🍔', color: '#f00' }]);
        expect(list(qc, aug)!.map(t => t.id)).toEqual(['b', 'a']);
        expect(list(qc, aug)![0]).toMatchObject({ category_name: 'Food', category_icon: '🍔', category_color: '#f00' });
        expect(list(qc, {})!.map(t => t.id)).toEqual(['b', 'a']);
        expect(list(qc, sep)).toEqual([]);
    });

    it('edits in place, and moves a row whose date changed to another month', () => {
        const qc = seed();
        upsertTransactionInCache(qc, { ...coffee, amount: '300' });
        expect(list(qc, aug)).toEqual([{ ...coffee, amount: '300' }]);

        upsertTransactionInCache(qc, { ...coffee, date: '2026-09-02' });
        expect(list(qc, aug)).toEqual([]);
        expect(list(qc, sep)!.map(t => t.id)).toEqual(['a']);
    });
});

describe('removeTransactionsFromCache', () => {
    it('drops the rows from every cached list', () => {
        const qc = seed();
        removeTransactionsFromCache(qc, ['a']);
        expect(list(qc, aug)).toEqual([]);
        expect(list(qc, {})).toEqual([]);
    });
});
