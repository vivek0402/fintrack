'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Back/forward returns you to where you were on that page, like a native
// app. Pages render from the query cache now, so the content is there at
// once and the old position is reachable. New navigations still start at the
// top.

// Give up restoring after this long (e.g. the content never grew tall enough).
const RESTORE_TIMEOUT_MS = 1000;

const positions = new Map<string, number>();

export function useScrollRestoration() {
    const pathname = usePathname();
    const currentPath = useRef(pathname);
    const cameFromHistory = useRef(false);

    useEffect(() => {
        // We decide where the page scrolls; the browser's own restoration
        // fires before the new page has rendered and lands in the wrong place.
        const prev = history.scrollRestoration;
        history.scrollRestoration = 'manual';

        let frame = 0;
        const onScroll = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                positions.set(currentPath.current, window.scrollY);
            });
        };
        const onPopState = () => { cameFromHistory.current = true; };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('popstate', onPopState);
        return () => {
            history.scrollRestoration = prev;
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('popstate', onPopState);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    useLayoutEffect(() => {
        if (currentPath.current === pathname) return;
        currentPath.current = pathname;
        const fromHistory = cameFromHistory.current;
        cameFromHistory.current = false;
        const target = fromHistory ? positions.get(pathname) ?? 0 : 0;
        if (target <= 0) return;

        // The page may still be growing (images, a lazy chart): keep trying
        // until the position fits, the user scrolls, or the timeout passes.
        let frame = 0;
        let cancelled = false;
        const started = performance.now();
        const stop = () => { cancelled = true; };
        window.addEventListener('touchstart', stop, { passive: true, once: true });
        window.addEventListener('wheel', stop, { passive: true, once: true });
        const attempt = () => {
            if (cancelled) return;
            window.scrollTo(0, target);
            if (Math.abs(window.scrollY - target) <= 1 || performance.now() - started > RESTORE_TIMEOUT_MS) return;
            frame = requestAnimationFrame(attempt);
        };
        attempt();
        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
            window.removeEventListener('touchstart', stop);
            window.removeEventListener('wheel', stop);
        };
    }, [pathname]);
}

/** Test hook. */
export function resetScrollPositions() {
    positions.clear();
}
