import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCountUp } from './useCountUp';

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

describe('useCountUp', () => {
    it('jumps straight to target when prefers-reduced-motion is set, without tweening', async () => {
        mockMatchMedia(true);

        const { result } = renderHook(() => useCountUp(500, 900));

        // No animation frames needed -- the value should already be final.
        await waitFor(() => expect(result.current).toBe(500));
    });

    it('still tweens (does not jump straight to target) when reduced motion is not requested', () => {
        mockMatchMedia(false);

        const { result } = renderHook(() => useCountUp(500, 900));

        // requestAnimationFrame hasn't fired yet at this point, so the value
        // should still be at its initial state rather than already at target
        // -- proving the animation branch was taken, not the instant-set one.
        // (The tween's own frame-by-frame correctness is pre-existing
        // behavior, not something this change touches.)
        expect(result.current).toBe(0);
    });

    it('does not throw when matchMedia is unavailable (e.g. some SSR/test environments), and still tweens', () => {
        vi.stubGlobal('matchMedia', undefined);

        const { result } = renderHook(() => useCountUp(500, 900));

        expect(result.current).toBe(0);
    });
});
