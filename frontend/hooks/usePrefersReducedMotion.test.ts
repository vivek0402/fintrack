import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

// jsdom does not implement matchMedia, so the hook itself has to guard against
// it being undefined -- these tests stub it per-case to exercise both branches.
function mockMatchMedia(matches: boolean) {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('usePrefersReducedMotion', () => {
    it('returns true when prefers-reduced-motion is set', async () => {
        mockMatchMedia(true);

        const { result } = renderHook(() => usePrefersReducedMotion());

        await waitFor(() => expect(result.current).toBe(true));
    });

    it('returns false when prefers-reduced-motion is not set', async () => {
        mockMatchMedia(false);

        const { result } = renderHook(() => usePrefersReducedMotion());

        await waitFor(() => expect(result.current).toBe(false));
    });

    it('does not throw and defaults to false when matchMedia is unavailable (e.g. some SSR/test environments)', async () => {
        vi.stubGlobal('matchMedia', undefined);

        const { result } = renderHook(() => usePrefersReducedMotion());

        await waitFor(() => expect(result.current).toBe(false));
    });
});
