import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadErrorMessage } from './loadErrorMessage';

afterEach(() => vi.restoreAllMocks());

describe('loadErrorMessage', () => {
    it('says why: rate limit, timeout and server error each read differently', () => {
        expect(loadErrorMessage({ response: { status: 429 } }, 'Dashboard data')).toMatch(/Too many requests/);
        expect(loadErrorMessage({ code: 'ECONNABORTED' }, 'Dashboard data')).toMatch(/took too long/);
        expect(loadErrorMessage({ response: { status: 503 } }, 'Dashboard data')).toMatch(/Server error .*\(503\)/);
    });

    it('reports offline before anything else', () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        expect(loadErrorMessage({ response: { status: 429 } }, 'Dashboard data')).toMatch(/offline/);
    });

    it('keeps the plain message for anything else', () => {
        expect(loadErrorMessage(new Error('x'), 'Dashboard data')).toBe('Failed to load dashboard data');
    });
});
