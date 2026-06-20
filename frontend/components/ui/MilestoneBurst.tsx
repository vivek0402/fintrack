'use client';

import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

const BURST_COLORS = ['var(--color-inc)', 'var(--accent)', 'var(--cat-2)', 'var(--cat-4)', 'var(--color-warn)'];

/** Brief, restrained particle burst for milestone moments (goal reached, debt paid off). Auto-unmounts via onDone. */
export function MilestoneBurst({ onDone }: { onDone: () => void }) {
    useEffect(() => {
        const t = setTimeout(onDone, 760);
        return () => clearTimeout(t);
    }, [onDone]);

    const particles = useMemo(() => Array.from({ length: 14 }, (_, i) => {
        const angle = (360 / 14) * i + (Math.random() * 18 - 9);
        const distance = 64 + Math.random() * 48;
        const rad = (angle * Math.PI) / 180;
        return {
            id: i,
            bx: Math.cos(rad) * distance,
            by: Math.sin(rad) * distance,
            color: BURST_COLORS[i % BURST_COLORS.length],
            delay: Math.random() * 70,
            size: 5 + Math.random() * 3,
        };
    }), []);

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {particles.map(p => (
                <span
                    key={p.id}
                    style={{
                        position: 'absolute',
                        width: p.size, height: p.size,
                        borderRadius: '50%',
                        background: p.color,
                        animation: `milestoneBurst 620ms cubic-bezier(0.16,1,0.3,1) ${p.delay}ms both`,
                        ['--bx' as any]: `${p.bx}px`,
                        ['--by' as any]: `${p.by}px`,
                    }}
                />
            ))}
        </div>,
        document.body
    );
}
