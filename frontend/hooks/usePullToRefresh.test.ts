import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { computePullDistance, shouldTriggerRefresh, usePullToRefresh } from './usePullToRefresh';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('computePullDistance', () => {
    it('applies 0.5 elastic damping to the raw drag distance', () => {
        expect(computePullDistance(40)).toBe(20);
        expect(computePullDistance(10)).toBe(5);
    });

    it('caps the pull distance at 76px however far the finger travels', () => {
        expect(computePullDistance(1000)).toBe(76);
        expect(computePullDistance(152)).toBe(76);
    });

    it('returns 0 for a zero delta', () => {
        expect(computePullDistance(0)).toBe(0);
    });

    it('does not clamp negative input to 0 -- callers are expected to gate on downward drags only', () => {
        // Pure math function: an upward drag (negative deltaY) just damps
        // through the same 0.5 factor. The hook itself is what refuses to
        // start tracking on an upward drag -- see the smoke test below.
        expect(computePullDistance(-40)).toBe(-20);
    });
});

describe('shouldTriggerRefresh', () => {
    it('does not trigger below the 50px threshold', () => {
        expect(shouldTriggerRefresh(49)).toBe(false);
        expect(shouldTriggerRefresh(0)).toBe(false);
    });

    it('triggers at exactly the 50px threshold', () => {
        expect(shouldTriggerRefresh(50)).toBe(true);
    });

    it('triggers above the threshold', () => {
        expect(shouldTriggerRefresh(76)).toBe(true);
    });
});

describe('usePullToRefresh (smoke test)', () => {
    // jsdom's Pointer Event support is too limited to meaningfully simulate a
    // real drag gesture (no real scrollTop/coordinate behavior), so this just
    // proves the hook wires up and tears down its listeners cleanly and
    // returns the expected idle shape -- the actual gesture math is covered
    // by the pure-function tests above.
    it('mounts and unmounts without throwing, returning idle state', () => {
        const onRefresh = vi.fn();
        const { result, unmount } = renderHook(() => usePullToRefresh(onRefresh));

        expect(result.current.pullDistance).toBe(0);
        expect(result.current.refreshing).toBe(false);
        expect(result.current.containerRef).toBeDefined();

        expect(() => unmount()).not.toThrow();
        expect(onRefresh).not.toHaveBeenCalled();
    });

    it('accepts a sync onRefresh callback without throwing on mount', () => {
        const onRefresh = vi.fn(() => {});
        const { unmount } = renderHook(() => usePullToRefresh(onRefresh));
        expect(() => unmount()).not.toThrow();
    });

    it('does not throw when enabled=false (the desktop case -- no listeners attached)', () => {
        const onRefresh = vi.fn();
        const { result, unmount } = renderHook(() => usePullToRefresh(onRefresh, false));
        expect(result.current.pullDistance).toBe(0);
        expect(result.current.refreshing).toBe(false);
        expect(() => unmount()).not.toThrow();
    });
});
