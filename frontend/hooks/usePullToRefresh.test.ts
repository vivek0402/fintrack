import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement, useEffect } from 'react';
import { renderHook, render, act } from '@testing-library/react';
import { computePullDistance, shouldTriggerRefresh, usePullToRefresh } from './usePullToRefresh';

afterEach(() => {
    vi.unstubAllGlobals();
});

// ── Gesture harness ──────────────────────────────────────────────────────────
// jsdom supports dispatching real PointerEvent objects with clientY, and lets
// us set el.scrollTop before dispatching -- enough to drive the hook's actual
// state machine (onPointerDown/onPointerMove/endDrag) without simulating real
// touch hardware. (jsdom's window.scrollTo() is an unimplemented no-op --
// window.scrollY stays 0 throughout, so the "not at top" case below is
// exercised via el.scrollTop instead, which jsdom does track as a plain
// settable property.) `renderHook` alone doesn't work
// here because containerRef needs to be attached to a real DOM node via JSX
// *before* the hook's effect runs (it reads containerRef.current once on
// mount), so this renders a tiny host component instead.
interface PtrState { pullDistance: number; refreshing: boolean }

function PullToRefreshHarness({ onRefresh, enabled = true, onState }: {
    onRefresh: () => Promise<void> | void;
    enabled?: boolean;
    onState: (s: PtrState) => void;
}) {
    const { containerRef, pullDistance, refreshing } = usePullToRefresh(onRefresh, enabled);
    useEffect(() => { onState({ pullDistance, refreshing }); });
    return createElement('div', { ref: containerRef, 'data-testid': 'ptr-container' });
}

function renderHarness(onRefresh: () => Promise<void> | void, enabled = true) {
    let state: PtrState = { pullDistance: 0, refreshing: false };
    const { getByTestId, unmount } = render(
        createElement(PullToRefreshHarness, { onRefresh, enabled, onState: (s: PtrState) => { state = s; } })
    );
    const el = getByTestId('ptr-container');
    return { el, unmount, getState: () => state };
}

function down(el: Element, clientY: number, pointerId = 1) {
    act(() => { el.dispatchEvent(new PointerEvent('pointerdown', { pointerId, clientY, bubbles: true, cancelable: true })); });
}
function move(el: Element, clientY: number, pointerId = 1) {
    act(() => { el.dispatchEvent(new PointerEvent('pointermove', { pointerId, clientY, bubbles: true, cancelable: true })); });
}
function up(el: Element, pointerId = 1) {
    act(() => { el.dispatchEvent(new PointerEvent('pointerup', { pointerId, bubbles: true, cancelable: true })); });
}

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

describe('usePullToRefresh (gesture state machine)', () => {
    it('fires onRefresh and shows refreshing when release is past the threshold', async () => {
        let resolveRefresh: () => void = () => {};
        const onRefresh = vi.fn(() => new Promise<void>(resolve => { resolveRefresh = resolve; }));
        const { el, getState, unmount } = renderHarness(onRefresh);

        // At top of scroll -- required for the gesture to arm.
        Object.defineProperty(el, 'scrollTop', { value: 0, configurable: true });

        down(el, 0);
        move(el, 120); // deltaY 120 -> computePullDistance = 60 >= 50 threshold
        expect(getState().pullDistance).toBe(60);

        up(el);
        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(getState().refreshing).toBe(true);
        expect(getState().pullDistance).toBe(60); // held visible while refreshing

        await act(async () => { resolveRefresh(); await Promise.resolve(); });
        expect(getState().refreshing).toBe(false);
        expect(getState().pullDistance).toBe(0);

        unmount();
    });

    it('does not fire onRefresh and springs back to 0 when release is below the threshold', () => {
        const onRefresh = vi.fn();
        const { el, getState, unmount } = renderHarness(onRefresh);

        Object.defineProperty(el, 'scrollTop', { value: 0, configurable: true });

        down(el, 0);
        move(el, 40); // deltaY 40 -> computePullDistance = 20, below 50 threshold
        expect(getState().pullDistance).toBe(20);

        up(el);
        expect(onRefresh).not.toHaveBeenCalled();
        expect(getState().pullDistance).toBe(0);
        expect(getState().refreshing).toBe(false);

        unmount();
    });

    it('still resets refreshing/pullDistance to idle when onRefresh rejects', async () => {
        const onRefresh = vi.fn(() => Promise.reject(new Error('network down')));
        const { el, getState, unmount } = renderHarness(onRefresh);

        Object.defineProperty(el, 'scrollTop', { value: 0, configurable: true });

        down(el, 0);
        move(el, 120); // past threshold
        up(el);
        expect(getState().refreshing).toBe(true);

        // Let the rejected promise's .catch/.finally chain flush.
        await act(async () => { await Promise.resolve().then(() => Promise.resolve()); });
        expect(getState().refreshing).toBe(false);
        expect(getState().pullDistance).toBe(0);

        unmount();
    });

    it('ignores the gesture entirely when the drag starts mid-scroll (not at top)', () => {
        const onRefresh = vi.fn();
        const { el, getState, unmount } = renderHarness(onRefresh);

        // Simulate the page already being scrolled down when the drag starts
        // (jsdom's window.scrollTo() is a no-op, so scrollTop is the
        // reliable way to exercise the isAtTop() gate here).
        Object.defineProperty(el, 'scrollTop', { value: 200, configurable: true });

        down(el, 0);
        move(el, 120);
        up(el);

        expect(onRefresh).not.toHaveBeenCalled();
        expect(getState().pullDistance).toBe(0);

        unmount();
    });
});

describe('usePullToRefresh (smoke test)', () => {
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
