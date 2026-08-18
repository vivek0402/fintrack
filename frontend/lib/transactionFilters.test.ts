import { describe, it, expect } from 'vitest';
import { pruneSelectedIds } from './transactionFilters';

describe('pruneSelectedIds', () => {
    it('is a no-op when nothing is selected', () => {
        const prev = new Set<string>();
        expect(pruneSelectedIds(prev, [{ id: 'a' }])).toBe(prev);
    });

    it('drops ids that fell out of the filtered list', () => {
        const prev = new Set(['a', 'b', 'c']);
        const result = pruneSelectedIds(prev, [{ id: 'a' }, { id: 'c' }]);
        expect(result).toEqual(new Set(['a', 'c']));
    });

    it('returns the same reference when nothing changed', () => {
        const prev = new Set(['a', 'b']);
        const result = pruneSelectedIds(prev, [{ id: 'a' }, { id: 'b' }, { id: 'z' }]);
        expect(result).toBe(prev);
    });

    it('can prune down to an empty set', () => {
        const prev = new Set(['a', 'b']);
        const result = pruneSelectedIds(prev, [{ id: 'z' }]);
        expect(result).toEqual(new Set());
    });
});
