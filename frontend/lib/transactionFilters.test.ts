import { describe, it, expect } from 'vitest';
import { pruneSelectedIds, periodDelta } from './transactionFilters';

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

describe('periodDelta', () => {
    it('is the percent change against a meaningful previous figure', () => {
        expect(periodDelta(12000, 10000)).toBe(20);
        expect(periodDelta(-500, -1000)).toBe(50);       // net: smaller deficit is +50%
    });

    it('is hidden (null) without a previous figure or when it is under ₹1,000', () => {
        expect(periodDelta(44504, 3471.5 - 3000)).toBeNull();   // the "1183%" case
        expect(periodDelta(500, 0)).toBeNull();
        expect(periodDelta(500, null)).toBeNull();
        expect(periodDelta(500, undefined)).toBeNull();
    });
});

