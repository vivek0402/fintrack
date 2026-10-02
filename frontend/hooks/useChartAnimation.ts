'use client';

import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

// Charts this session has already drawn with their grow-in animation.
const played = new Set<string>();

/**
 * Recharts animation props for one chart: animate the first time the chart
 * appears in a session, then draw instantly. Pages now render from cached
 * data, so replaying a 600-1500ms grow-in on every visit would make them feel
 * slower than they are. Never animates under prefers-reduced-motion.
 *
 * Spread onto each series: <Area {...useChartAnimation('dashboard-trend')} />
 */
export function useChartAnimation(chartId: string, duration = 600) {
    const reducedMotion = usePrefersReducedMotion();
    const [firstTime] = useState(() => !played.has(chartId));
    useEffect(() => { played.add(chartId); }, [chartId]);
    const active = firstTime && !reducedMotion;
    return { isAnimationActive: active, animationDuration: active ? duration : 0 };
}

/** Test hook: forget which charts have played. */
export function resetChartAnimations() {
    played.clear();
}
