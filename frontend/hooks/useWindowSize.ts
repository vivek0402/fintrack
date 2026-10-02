'use client';

import { useState, useEffect } from 'react';

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

/**
 * True below the 768px breakpoint. Listens to a media query rather than
 * resize, so components re-render only when the breakpoint actually flips --
 * not on every keyboard open/close or address-bar show/hide.
 */
export function useIsMobile() {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    );

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const mql = window.matchMedia(MOBILE_QUERY);
        const update = () => setIsMobile(mql.matches);
        update();
        mql.addEventListener('change', update);
        return () => mql.removeEventListener('change', update);
    }, []);

    return isMobile;
}
