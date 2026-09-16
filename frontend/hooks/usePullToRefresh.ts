'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

// ── Pure helpers (exported for direct unit testing) ─────────────────────────

/** Elastic resistance: linear-with-cap dampening, matches the approved demo. */
export function computePullDistance(deltaY: number): number {
    return Math.min(deltaY * 0.5, 76);
}

/** Release threshold: pull far enough and refresh fires. */
export function shouldTriggerRefresh(pullDistance: number): boolean {
    return pullDistance >= 50;
}

interface UsePullToRefreshResult {
    containerRef: RefObject<HTMLElement | null>;
    pullDistance: number;
    refreshing: boolean;
}

/**
 * Pull-to-refresh gesture for a page's scroll container. Tracks a downward
 * pointer drag that starts at the top of the scroll position, applies
 * elastic resistance while dragging, and calls `onRefresh` on release past
 * the threshold.
 *
 * Note: this app's mobile pages scroll at the document/window level (the
 * layout's <main> has no overflow of its own), not inside the wrapped
 * container -- so "at the top" is checked against window scroll position as
 * well as the container's own scrollTop, covering both this app's actual
 * scroll structure and any container that does scroll internally.
 *
 * `enabled` (default true) gates whether listeners are attached at all --
 * callers pass `isMobile` here so desktop never attaches drag listeners to
 * the same container ref, without needing a separate desktop/mobile render
 * branch for the whole page.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void, enabled = true): UsePullToRefreshResult {
    const containerRef = useRef<HTMLElement | null>(null);
    const [pullDistance, setPullDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    // Latest-callback ref so the pointer-event effect doesn't need to
    // re-attach listeners every time the caller's onRefresh identity changes
    // (e.g. an unmemoized function redefined on every render).
    const onRefreshRef = useRef(onRefresh);
    useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

    // Mirrors `refreshing` state into a ref so the pointerdown handler (a
    // stable closure registered once) always sees the current value instead
    // of a stale one from when the listener was attached.
    const refreshingRef = useRef(refreshing);
    useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

    useEffect(() => {
        if (!enabled) return;
        const el = containerRef.current;
        if (!el) return;

        let dragging = false;
        let startY = 0;
        let pointerId: number | null = null;

        // <= rather than === 0: iOS Safari/Chrome rubber-band overscroll and
        // dynamic-toolbar-hide behavior can leave scrollTop/scrollY at a
        // small non-zero (or transiently negative, then clamped) value right
        // at the top, which would make a strict === check false-negative on
        // exactly the browsers this gesture targets.
        const AT_TOP_EPSILON = 1;
        const isAtTop = () =>
            el.scrollTop <= AT_TOP_EPSILON &&
            (typeof window === 'undefined' || window.scrollY <= AT_TOP_EPSILON);

        const onPointerDown = (e: PointerEvent) => {
            if (refreshingRef.current) return; // ignore new drags mid-refresh
            if (!isAtTop()) return; // don't intercept a drag starting mid-scroll
            dragging = true;
            startY = e.clientY;
            pointerId = e.pointerId;
            try { el.setPointerCapture(e.pointerId); } catch { /* not supported in this environment */ }
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!dragging || e.pointerId !== pointerId) return;
            const deltaY = e.clientY - startY;
            if (deltaY <= 0) {
                // Upward drag (or no movement) -- don't activate the gesture.
                setPullDistance(0);
                return;
            }
            // Actively pulling down from the top -- suppress the native
            // scroll/overscroll so it doesn't fight the elastic indicator.
            e.preventDefault();
            setPullDistance(computePullDistance(deltaY));
        };

        const endDrag = (e: PointerEvent) => {
            if (!dragging || e.pointerId !== pointerId) return;
            dragging = false;
            pointerId = null;

            setPullDistance(current => {
                if (shouldTriggerRefresh(current)) {
                    setRefreshing(true);
                    Promise.resolve(onRefreshRef.current())
                        .catch(() => { /* swallow -- caller's own fetch reports its own errors */ })
                        .finally(() => {
                            setRefreshing(false);
                            setPullDistance(0);
                        });
                    return current; // keep the indicator visible while refreshing
                }
                return 0; // spring back immediately, no refresh call
            });
        };

        el.addEventListener('pointerdown', onPointerDown);
        el.addEventListener('pointermove', onPointerMove);
        el.addEventListener('pointerup', endDrag);
        el.addEventListener('pointercancel', endDrag);

        return () => {
            el.removeEventListener('pointerdown', onPointerDown);
            el.removeEventListener('pointermove', onPointerMove);
            el.removeEventListener('pointerup', endDrag);
            el.removeEventListener('pointercancel', endDrag);
        };
    }, [enabled]);

    return { containerRef, pullDistance, refreshing };
}
