import { describe, it, expect } from 'vitest';
import { ctaLabel, canSubmit, topChoices, dateChoice, yesterdayOf } from './addTx';

const format = (n: number) => `₹${n}`;

describe('ctaLabel', () => {
    it('says Save changes when editing, whatever the amount', () => {
        expect(ctaLabel({ editing: true, type: 'expense', amount: '450', format })).toBe('Save changes');
        expect(ctaLabel({ editing: true, type: 'transfer', amount: '', format })).toBe('Save changes');
    });
    it('names the amount and the kind for an expense and an income', () => {
        expect(ctaLabel({ editing: false, type: 'expense', amount: '450', format })).toBe('Add ₹450 expense');
        expect(ctaLabel({ editing: false, type: 'income', amount: 50000, format })).toBe('Add ₹50000 income');
    });
    it('names the amount for a transfer', () => {
        expect(ctaLabel({ editing: false, type: 'transfer', amount: '5000', format })).toBe('Move ₹5000');
    });
    it('falls back to the plain label without a valid amount', () => {
        for (const amount of ['', '0', '-5', 'abc']) {
            expect(ctaLabel({ editing: false, type: 'expense', amount, format })).toBe('Add expense');
            expect(ctaLabel({ editing: false, type: 'income', amount, format })).toBe('Add income');
            expect(ctaLabel({ editing: false, type: 'transfer', amount, format })).toBe('Move money');
        }
    });
});

describe('canSubmit', () => {
    it('needs a positive amount and a description', () => {
        expect(canSubmit({ amount: '250', description: 'Coffee', editing: false })).toBe(true);
        expect(canSubmit({ amount: '', description: 'Coffee', editing: false })).toBe(false);
        expect(canSubmit({ amount: '0', description: 'Coffee', editing: false })).toBe(false);
        expect(canSubmit({ amount: '-3', description: 'Coffee', editing: false })).toBe(false);
        expect(canSubmit({ amount: '250', description: '', editing: false })).toBe(false);
    });
    it('treats a blank description as missing', () => {
        expect(canSubmit({ amount: '250', description: '   ', editing: false })).toBe(false);
    });
    it('stays enabled for an existing transaction that has both, and disables when one is cleared', () => {
        expect(canSubmit({ amount: '1000', description: 'Laptop', editing: true })).toBe(true);
        expect(canSubmit({ amount: '1000', description: '', editing: true })).toBe(false);
    });
});

describe('topChoices', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map(key => ({ key }));
    const keys = (xs: { key: string }[]) => xs.map(x => x.key);

    it('takes the most used first, ties keeping their original order', () => {
        expect(keys(topChoices(items, { c: 9, e: 4, b: 4 }, 3, null))).toEqual(['c', 'b', 'e']);
    });
    it('falls back to the original order with no usage', () => {
        expect(keys(topChoices(items, {}, 3, null))).toEqual(['a', 'b', 'c']);
    });
    it('adds the chosen item as an extra when it is not in the top n', () => {
        expect(keys(topChoices(items, {}, 3, 'e'))).toEqual(['a', 'b', 'c', 'e']);
    });
    it('does not repeat the chosen item when it is already in the top n', () => {
        expect(keys(topChoices(items, {}, 3, 'b'))).toEqual(['a', 'b', 'c']);
    });
    it('ignores a chosen key that is not in the list', () => {
        expect(keys(topChoices(items, {}, 3, 'zzz'))).toEqual(['a', 'b', 'c']);
    });
    it('drops duplicate items and copes with fewer items than n', () => {
        expect(keys(topChoices([{ key: 'a' }, { key: 'a' }, { key: 'b' }], {}, 4, null))).toEqual(['a', 'b']);
        expect(topChoices([], {}, 3, 'a')).toEqual([]);
    });
    it('does not mutate the input', () => {
        const copy = [...items];
        topChoices(items, { e: 5 }, 2, null);
        expect(items).toEqual(copy);
    });
});

describe('dateChoice', () => {
    it('recognises today, yesterday and anything else', () => {
        expect(dateChoice('2026-11-17', '2026-11-17')).toBe('today');
        expect(dateChoice('2026-11-16', '2026-11-17')).toBe('yesterday');
        expect(dateChoice('2026-11-15', '2026-11-17')).toBe('other');
        expect(dateChoice('2026-11-18', '2026-11-17')).toBe('other');
        expect(dateChoice('', '2026-11-17')).toBe('other');
    });
    it('finds yesterday across month and year boundaries', () => {
        expect(dateChoice('2026-10-31', '2026-11-01')).toBe('yesterday');
        expect(dateChoice('2025-12-31', '2026-01-01')).toBe('yesterday');
        expect(yesterdayOf('2024-03-01')).toBe('2024-02-29');
    });
});
