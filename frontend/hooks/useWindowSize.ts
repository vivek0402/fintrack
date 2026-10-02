'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';

const MOBILE_QUERY = '(max-width: 767.98px)';

export function useWindowSize() {
    const [windowSize, setWindowSize] = useState({
        width: typeof window !== 'undefined' ? window.innerWidth : 1200,
        height: typeof window !== 'undefined' ? window.innerHeight : 800,
    });

    useEffect(() => {
        // At most one state update per frame, and none when nothing changed --
        // the Android keyboard and browser chrome fire resize in bursts.
        let frame = 0;
        function handleResize() {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                const width = window.innerWidth;
                const height = window.innerHeight;
                setWindowSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
            });
        }
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => {
            window.removeEventListener('resize', handleResize);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    return windowSize;
}

function subscribeMobile(onChange: () => void) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const mql = window.matchMedia(MOBILE_QUERY);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
}

function mobileSnapshot(): boolean {
    if (typeof window.matchMedia === 'function') return window.matchMedia(MOBILE_QUERY).matches;
    return window.innerWidth < 768;
}

// The static export's HTML is built as desktop, so hydration must start from
// the same answer or React throws the HTML away (error #418).
const serverSnapshot = () => false;

/**
 * True below the 768px breakpoint. Re-renders only when the breakpoint flips
 * (a media query, not resize events). While hydrating the pre-built HTML it
 * reports desktop to match that HTML, then switches straight after; on later
 * client-side navigations it is right from the first render. The app shell's
 * own layout doesn't depend on this -- it switches by CSS (globals.css).
 */
export function useIsMobile() {
    return useSyncExternalStore(subscribeMobile, mobileSnapshot, serverSnapshot);
}
