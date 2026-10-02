import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let pathname = '/transactions';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

import { useScrollRestoration, resetScrollPositions } from './useScrollRestoration';

const scrollTo = vi.fn((_x: number, y: number) => { Object.defineProperty(window, 'scrollY', { value: y, configurable: true }); });

beforeEach(() => {
    resetScrollPositions();
    pathname = '/transactions';
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    scrollTo.mockClear();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

function scrollPageTo(y: number) {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    window.dispatchEvent(new Event('scroll'));
}

describe('useScrollRestoration', () => {
    it('returns to the saved position when coming back through history', () => {
        const { rerender } = renderHook(() => useScrollRestoration());
        scrollPageTo(1200);

        pathname = '/dashboard';          // tap another tab (push)
        rerender();
        expect(scrollTo).not.toHaveBeenCalled();
        scrollPageTo(0);

        act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
        pathname = '/transactions';       // back
        rerender();
        expect(scrollTo).toHaveBeenLastCalledWith(0, 1200);
    });

    it('does not restore on a fresh (non-history) visit', () => {
        const { rerender } = renderHook(() => useScrollRestoration());
        scrollPageTo(800);
        pathname = '/dashboard'; rerender();
        pathname = '/transactions'; rerender();   // pushed again, not back
        expect(scrollTo).not.toHaveBeenCalled();
    });
});
