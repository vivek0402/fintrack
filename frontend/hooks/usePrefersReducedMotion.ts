'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true when the user has requested reduced motion via OS/browser
 * settings (prefers-reduced-motion: reduce). Defaults to false -- motion
 * allowed -- when the preference can't be determined (SSR, or an
 * environment without matchMedia).
 */
export function usePrefersReducedMotion(): boolean {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    useEffect(() => {
        const prefersReduced =
            typeof window !== 'undefined' &&
            !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        // eslint-disable-next-line react-hooks/set-state-in-effect -- window.matchMedia doesn't exist during the build's prerender pass (output: 'export'); the initial false must match on server and client, then this effect updates it post-hydration to avoid a hydration mismatch. A lazy useState initializer would read matchMedia during the client's first render, which can differ from the prerendered value.
        setPrefersReducedMotion(prefersReduced);
    }, []);

    return prefersReducedMotion;
}
