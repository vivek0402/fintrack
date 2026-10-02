'use client';

import { useEffect, useState } from 'react';

/**
 * Keeps an overlay mounted for `exitMs` after `open` turns false, so it can
 * play an exit animation instead of vanishing. `closing` is true during that
 * window. Re-opening mid-exit cancels the exit.
 *
 * `generation` goes up on every open: key the overlay's content on it so each
 * open starts with fresh state, even when it re-opens before the exit ends.
 */
export function usePresence(open: boolean, exitMs: number) {
    const [rendered, setRendered] = useState(open);
    const [closing, setClosing] = useState(false);
    const [prevOpen, setPrevOpen] = useState(open);
    const [generation, setGeneration] = useState(0);

    // Adjust state while rendering when `open` flips (React's documented
    // pattern for reacting to a prop change), so the exit starts in the same
    // render that sees the close -- no frame where the overlay is gone.
    if (open !== prevOpen) {
        setPrevOpen(open);
        if (open) { setRendered(true); setClosing(false); setGeneration(g => g + 1); }
        else if (rendered) setClosing(true);
    }

    useEffect(() => {
        if (!closing) return;
        const t = setTimeout(() => { setRendered(false); setClosing(false); }, exitMs);
        return () => clearTimeout(t);
    }, [closing, exitMs]);

    return { rendered: rendered || open, closing, generation };
}
