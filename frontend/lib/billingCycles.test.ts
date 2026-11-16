import { describe, it, expect } from 'vitest';
import { splitCycles } from './billingCycles';

describe('splitCycles', () => {
    it('separates current from past and keeps order', () => {
        const list = [{ id: 1, is_current: false }, { id: 2, is_current: true }, { id: 3, is_current: false }];
        const { current, past } = splitCycles(list);
        expect(current.map(c => c.id)).toEqual([2]);
        expect(past.map(c => c.id)).toEqual([1, 3]);
    });
    it('handles empty', () => {
        expect(splitCycles([])).toEqual({ current: [], past: [] });
    });
});
