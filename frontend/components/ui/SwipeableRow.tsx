'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

interface SwipeableRowProps {
    children: React.ReactNode;
    onSwipeLeft?: () => void;
}

export function SwipeableRow({ children, onSwipeLeft }: SwipeableRowProps) {
    const [dragX, setDragX] = useState(0);
    const [transitioning, setTransitioning] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const startX = useRef(0);
    const draggingRef = useRef(false);
    const didSwipeRef = useRef(false);
    const rowRef = useRef<HTMLDivElement>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        startX.current = e.touches[0].clientX;
        draggingRef.current = true;
        didSwipeRef.current = false;
        setIsDragging(true);
        setTransitioning(false);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!draggingRef.current) return;
        const raw = e.touches[0].clientX - startX.current;
        if (Math.abs(raw) > 8) didSwipeRef.current = true;
        setDragX(Math.max(-100, Math.min(0, raw)));
    };

    const handleTouchEnd = () => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        setTransitioning(true);

        if (dragX < -80) {
            // Swipe left → delete: snap then collapse
            setDragX(-72);
            if (rowRef.current) rowRef.current.classList.add('swipe-row-exit');
            setTimeout(() => {
                onSwipeLeft?.();
                setDragX(0);
                setIsDragging(false);
            }, 300);
        } else {
            // Cancelled — snap back immediately
            setDragX(0);
            setIsDragging(false);
        }
    };

    // Reveal opacity scales with drag distance (0→100%)
    const absRatio = Math.min(Math.abs(dragX) / 80, 1);
    const deleteOpacity = dragX < 0 ? 0.15 + 0.85 * absRatio : 0.15;

    return (
        <div ref={rowRef} style={{ position: 'relative', overflow: 'hidden' }}>
            {/* Right reveal — delete (red): only visible during active drag */}
            {isDragging && (
                <div style={{
                    position: 'absolute', top: 0, bottom: 0, right: 0, width: '80px',
                    background: `rgba(244, 63, 94, ${deleteOpacity})`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
                    pointerEvents: 'none',
                }}>
                    <Trash2 size={18} color="var(--color-exp)" />
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-exp)', letterSpacing: '0.02em' }}>Delete</span>
                </div>
            )}

            {/* Resting affordance — a thin always-visible edge so swipe-to-delete
                is discoverable without first dragging; the drag reveal above
                takes over once a drag actually starts. */}
            {!isDragging && (
                <div style={{
                    position: 'absolute', top: 0, bottom: 0, right: 0, width: '4px',
                    background: 'color-mix(in srgb, var(--color-exp) 35%, transparent)',
                    pointerEvents: 'none',
                }} />
            )}

            {/* Content layer — moves with finger, solid background to block reveal bleed */}
            <div
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={(e) => { if (didSwipeRef.current) { e.stopPropagation(); didSwipeRef.current = false; } }}
                style={{
                    position: 'relative',
                    transform: `translateX(${dragX}px)`,
                    transition: transitioning ? 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
                    willChange: 'transform',
                    zIndex: 1,
                    background: 'var(--bg-surface-1)',
                }}
            >
                {children}
            </div>
        </div>
    );
}
