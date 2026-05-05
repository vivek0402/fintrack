'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from 0 to `target` over `duration` ms.
 * Only fires when `enabled` is true (use to gate on data-loaded).
 */
export function useCountUp(target: number, duration = 900, enabled = true): number {
    const [value, setValue] = useState(0);
    const frameRef = useRef<number | null>(null);
    const prevTarget = useRef<number>(0);

    useEffect(() => {
        if (!enabled) return;

        if (target === 0) {
            setValue(0);
            return;
        }

        const startVal = prevTarget.current;
        prevTarget.current = target;
        const startTime = performance.now();

        const tick = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic — decelerates into final value
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(startVal + (target - startVal) * eased));
            if (progress < 1) {
                frameRef.current = requestAnimationFrame(tick);
            }
        };

        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(tick);

        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [target, duration, enabled]);

    return value;
}
