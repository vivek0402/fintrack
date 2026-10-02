'use client';

import { useLayoutEffect, useRef } from 'react';

interface CountUpProps {
    value: number;
    /** Tween length in ms. */
    duration?: number;
    /** Gate on data-loaded: while false, the number holds where it is. */
    enabled?: boolean;
    /** Turns the (rounded) in-flight number into display text. */
    format?: (n: number) => string;
}

const plain = (n: number) => String(n);

/**
 * Animates a number toward `value` with an ease-out cubic tween.
 *
 * Each frame writes straight to the span's text through a ref, so the tween
 * never re-renders the component that owns it. (The old useCountUp hook set
 * state every frame, re-rendering the whole dashboard -- charts included --
 * for ~900ms.) The span has no React-managed children, so React never
 * overwrites the text the tween wrote.
 */
export function CountUp({ value, duration = 900, enabled = true, format = plain }: CountUpProps) {
    const ref = useRef<HTMLSpanElement>(null);
    const shown = useRef(0);
    const formatRef = useRef(format);
    useLayoutEffect(() => { formatRef.current = format; });

    // Restart (or just rewrite) when the target, or how it is displayed,
    // changes. A new `format` identity that renders the same text does not.
    const finalText = format(Math.round(value));

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const write = (n: number) => {
            shown.current = n;
            el.textContent = formatRef.current(Math.round(n));
        };
        if (!enabled) { write(shown.current); return; }

        const from = shown.current;
        const reduced = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduced || from === value) { write(value); return; }

        let frame = 0;
        const start = performance.now();
        const tick = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            // Ease-out cubic -- decelerates into the final value
            const eased = 1 - Math.pow(1 - progress, 3);
            write(from + (value - from) * eased);
            if (progress < 1) frame = requestAnimationFrame(tick);
        };
        write(from);
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [value, duration, enabled, finalText]);

    return <span ref={ref} />;
}
