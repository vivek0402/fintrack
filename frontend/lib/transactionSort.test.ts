import { describe, it, expect } from 'vitest';
import {
    sortTransactions, countActiveFilters, applyAdvancedFilters, DEFAULT_PANEL, DEFAULT_SORT,
} from './transactionFilters';

// transactionFilters.test.ts already covers pruneSelectedIds. These are the
// other five exports, none of which had coverage -- sortTransactions in
// particular was added during the Transactions redesign and shipped untested.

const tx = (id: string, date: string, amount: number, over: Record<string, unknown> = {}) =>
    ({ id, date, amount: String(amount), type: 'expense', ...over });

const rows = [
    tx('a', '2026-08-10', 500),
    tx('b', '2026-08-26', 120),
    tx('c', '2026-08-01', 9000),
];

const ids = (list: { id: string }[]) => list.map(t => t.id).join('');

describe('sortTransactions', () => {
    it('sorts newest first by default', () => {
        expect(ids(sortTransactions(rows, 'newest'))).toBe('bac');
        expect(ids(sortTransactions(rows, DEFAULT_SORT))).toBe('bac');
    });

    it('sorts oldest, largest and smallest', () => {
        expect(ids(sortTransactions(rows, 'oldest'))).toBe('cab');
        expect(ids(sortTransactions(rows, 'largest'))).toBe('cab');
        expect(ids(sortTransactions(rows, 'smallest'))).toBe('bac');
    });

    it('compares amounts numerically, not as the strings they arrive as', () => {
        // Amounts come off the API as strings; a lexicographic sort would put
        // '9' before '120' and silently mis-rank the list.
        const numeric = [tx('x', '2026-08-01', 9), tx('y', '2026-08-02', 120)];
        expect(ids(sortTransactions(numeric, 'largest'))).toBe('yx');
    });

    it('does not mutate the array it is given', () => {
        const original = [...rows];
        sortTransactions(rows, 'largest');
        expect(rows).toEqual(original);
    });

    it('falls back to newest for an unknown key', () => {
        expect(ids(sortTransactions(rows, 'nonsense' as never))).toBe('bac');
    });
});

describe('countActiveFilters', () => {
    it('counts nothing for a pristine panel', () => {
        expect(countActiveFilters('', DEFAULT_PANEL)).toBe(0);
        expect(countActiveFilters('   ', DEFAULT_PANEL)).toBe(0);
    });

    it('counts free text and each active facet once', () => {
        expect(countActiveFilters('coffee', DEFAULT_PANEL)).toBe(1);
        expect(countActiveFilters('', { ...DEFAULT_PANEL, type: 'income' })).toBe(1);
        expect(countActiveFilters('', { ...DEFAULT_PANEL, categories: ['a', 'b'] })).toBe(1);
        expect(countActiveFilters('', { ...DEFAULT_PANEL, dateMode: 'all' })).toBe(1);
    });

    it('treats an amount range as a single filter regardless of which end is set', () => {
        expect(countActiveFilters('', { ...DEFAULT_PANEL, amountMin: '100' })).toBe(1);
        expect(countActiveFilters('', { ...DEFAULT_PANEL, amountMin: '100', amountMax: '900' })).toBe(1);
    });

    it('adds up across facets', () => {
        expect(countActiveFilters('coffee', {
            ...DEFAULT_PANEL, type: 'expense', categories: ['food'], tags: ['work'],
        })).toBe(4);
    });
});

describe('applyAdvancedFilters', () => {
    const catRows = [
        tx('a', '2026-08-10', 500, { description: 'Coffee', category_name: 'Food' }),
        tx('b', '2026-08-26', 120, { description: 'Bus fare', category_name: 'Transport' }),
        tx('c', '2026-08-01', 9000, { description: 'Rent', category_name: 'Housing', type: 'expense' }),
        tx('d', '2026-08-05', 50000, { description: 'Salary', category_name: 'Income', type: 'income' }),
    ];

    it('returns everything when no filter is set', () => {
        expect(applyAdvancedFilters(catRows, '', DEFAULT_PANEL)).toHaveLength(4);
    });

    it('matches free text case-insensitively against the description', () => {
        expect(ids(applyAdvancedFilters(catRows, 'coffee', DEFAULT_PANEL))).toBe('a');
        expect(ids(applyAdvancedFilters(catRows, 'COFFEE', DEFAULT_PANEL))).toBe('a');
    });

    it('filters by type and by amount range', () => {
        expect(ids(applyAdvancedFilters(catRows, '', { ...DEFAULT_PANEL, type: 'income' }))).toBe('d');
        expect(ids(applyAdvancedFilters(catRows, '', { ...DEFAULT_PANEL, amountMin: '1000' }))).toBe('cd');
        expect(ids(applyAdvancedFilters(catRows, '', { ...DEFAULT_PANEL, amountMax: '600' }))).toBe('ab');
    });

    it('combines free text with panel facets rather than replacing them', () => {
        const out = applyAdvancedFilters(catRows, 'a', { ...DEFAULT_PANEL, type: 'income' });
        expect(ids(out)).toBe('d');
    });
});
