import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from './useWindowSize';

// Minimal controllable MediaQueryList: jsdom has no matchMedia.
function installMatchMedia(initial: boolean) {
    const listeners = new Set<() => void>();
    const mql = {
        matches: initial,
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
    window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
    return {
        flip(matches: boolean) {
            mql.matches = matches;
            listeners.forEach(fn => fn());
        },
    };
}

afterEach(() => {
    // @ts-expect-error -- restore jsdom's original (absent) matchMedia
    delete window.matchMedia;
});

describe('useIsMobile', () => {
    it('re-renders only when the breakpoint flips, not on every resize', () => {
        const media = installMatchMedia(false);
        let renders = 0;
        const { result } = renderHook(() => { renders++; return useIsMobile(); });
        expect(result.current).toBe(false);
        const settled = renders;

        act(() => { for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('resize')); });
        expect(renders).toBe(settled);

        act(() => media.flip(true));
        expect(result.current).toBe(true);
        expect(renders).toBe(settled + 1);
    });
});
