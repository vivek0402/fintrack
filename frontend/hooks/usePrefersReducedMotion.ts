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

        setPrefersReducedMotion(prefersReduced);
    }, []);

    return prefersReducedMotion;
}
