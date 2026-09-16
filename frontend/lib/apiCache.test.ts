import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCached, setCached } from './apiCache';

beforeEach(() => localStorage.clear());

describe('getCached / setCached', () => {
    it('returns null when nothing is cached', () => {
        expect(getCached('missing-key', 60000)).toBeNull();
    });

    it('round-trips data written by setCached within the TTL', () => {
        setCached('k1', { foo: 'bar' });
        expect(getCached('k1', 60000)).toEqual({ foo: 'bar' });
    });

    it('returns null once the TTL has elapsed', () => {
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now);
        setCached('k2', { foo: 'bar' });
        vi.spyOn(Date, 'now').mockReturnValue(now + 61000);
        expect(getCached('k2', 60000)).toBeNull();
        vi.restoreAllMocks();
    });

    it('returns null for malformed JSON instead of throwing', () => {
        localStorage.setItem('k3', 'not json');
        expect(getCached('k3', 60000)).toBeNull();
    });

    it('does not throw when localStorage.setItem throws (e.g. quota exceeded)', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
        expect(() => setCached('k4', { x: 1 })).not.toThrow();
        spy.mockRestore();
    });
});
