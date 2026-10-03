import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHideOnScrollDown } from './useHideOnScrollDown';

function scrollTo(y: number) {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    act(() => { window.dispatchEvent(new Event('scroll')); });
}

beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    // Runs the frame synchronously; returns 0 so the hook doesn't think one is still pending.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('useHideOnScrollDown', () => {
    it('hides on scroll down past the top, shows again on scroll up', () => {
        const { result } = renderHook(() => useHideOnScrollDown());
        expect(result.current).toBe(false);
        scrollTo(400);
        expect(result.current).toBe(true);
        scrollTo(380);
        expect(result.current).toBe(false);
    });

    it('ignores tiny jitter, and always shows near the top', () => {
        const { result } = renderHook(() => useHideOnScrollDown());
        scrollTo(400);
        scrollTo(396);                 // under the slop: stays hidden
        expect(result.current).toBe(true);
        scrollTo(60);                  // top zone
        expect(result.current).toBe(false);
        scrollTo(100);                 // still in the top zone, scrolling down
        expect(result.current).toBe(false);
    });
});
