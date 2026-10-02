'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// Tab/page switches crossfade through the browser's View Transitions API
// (CSS in globals.css: ::view-transition-old/new(root)). Android's WebView and
// Chrome support it; elsewhere, and under prefers-reduced-motion, navigation
// is a plain instant swap exactly as before.
//
// How it works: startViewTransition snapshots the current screen, then waits
// on the promise we hand it. We navigate, and AppLayout resolves the promise
// from a layout effect once the new route has committed (resolveViewTransition
// below), so the crossfade runs between the real old and new pages.

// Never hold the old frame longer than this, even if the new route is slow
// (e.g. its chunk is still downloading) -- the page then just swaps in.
const MAX_WAIT_MS = 400;

type StartViewTransition = (update: () => Promise<void>) => unknown;

let pendingResolve: (() => void) | null = null;

/** Called by AppLayout after every route commit. */
export function resolveViewTransition() {
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve?.();
}

function pathOf(href: string) {
    return href.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}

export function useTransitionNavigate() {
    const router = useRouter();
    const pathname = usePathname();

    return useCallback((href: string) => {
        const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        // Same page (only the query changes): no route commit would resolve
        // the transition, so don't start one.
        const samePage = pathOf(href) === pathOf(pathname || '/');
        if (!start || reduced || samePage) {
            router.push(href);
            return;
        }
        resolveViewTransition();  // settle any transition still in flight
        try {
            start.call(document, () => new Promise<void>(resolve => {
                pendingResolve = resolve;
                router.push(href);
                setTimeout(resolveViewTransition, MAX_WAIT_MS);
            }));
        } catch {
            resolveViewTransition();
            router.push(href);
        }
    }, [router, pathname]);
}
