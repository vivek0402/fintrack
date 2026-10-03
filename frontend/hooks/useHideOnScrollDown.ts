'use client';

import { useEffect, useState } from 'react';

// Ignore jitter smaller than this (px) before changing direction.
const DIRECTION_SLOP = 8;
// Always shown near the top of the page.
const TOP_ZONE = 120;

/**
 * True while the page is being scrolled down (past the top zone), false once
 * it scrolls back up or reaches the top. For floating buttons that would
 * otherwise sit over the content being read. Reads at most once per frame.
 */
export function useHideOnScrollDown(): boolean {
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        let lastY = window.scrollY;
        let frame = 0;
        const onScroll = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                const y = window.scrollY;
                if (y < TOP_ZONE) { setHidden(false); lastY = y; return; }
                const dy = y - lastY;
                if (Math.abs(dy) < DIRECTION_SLOP) return;
                setHidden(dy > 0);
                lastY = y;
            });
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', onScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    return hidden;
}
