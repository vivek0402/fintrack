'use client';

import { useEffect, useState } from 'react';

// 270° gauge used by the Health tab and the dashboard teaser. `color` is the
// band token from calculateHealthScore (e.g. var(--color-inc)).
const VIEW = 100;
const STROKE = 8;
const R = 42;
const CIRC = 2 * Math.PI * R;
const GAUGE = CIRC * 0.75;

export function ScoreRing({ score, color, size = 110 }: { score: number; color: string; size?: number }) {
    const [animPct, setAnimPct] = useState(0);

    useEffect(() => {
        const t = setTimeout(() => setAnimPct(score), 120);
        return () => clearTimeout(t);
    }, [score]);

    const fill = GAUGE * (animPct / 100);
    const c = VIEW / 2;

    return (
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width={size} height={size} style={{ display: 'block' }} aria-hidden="true">
            <circle cx={c} cy={c} r={R}
                fill="none" stroke="var(--border-subtle)" strokeWidth={STROKE} strokeLinecap="round"
                strokeDasharray={`${GAUGE} ${CIRC - GAUGE}`}
                transform={`rotate(135 ${c} ${c})`}
            />
            <circle cx={c} cy={c} r={R}
                fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round"
                strokeDasharray={`${fill} ${CIRC - fill}`}
                transform={`rotate(135 ${c} ${c})`}
                style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
        </svg>
    );
}
