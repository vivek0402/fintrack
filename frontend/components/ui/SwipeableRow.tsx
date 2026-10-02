'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { haptics } from '@/lib/haptics';

interface SwipeableRowProps {
    children: React.ReactNode;
    onSwipeLeft?: () => void;
}

export function SwipeableRow({ children, onSwipeLeft }: SwipeableRowProps) {
    const [dragX, setDragX] = useState(0);
    const [transitioning, setTransitioning] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const startX = useRef(0);
    const startY = useRef(0);
    // Which way this gesture is going, decided once movement clears the noise
    // threshold. A vertical gesture is a scroll: the row ignores it entirely
    // instead of drifting sideways (and re-rendering) on every touchmove.
    const axisRef = useRef<'x' | 'y' | null>(null);
    const draggingRef = useRef(false);
    const didSwipeRef = useRef(false);
    // Buzz once when the drag passes the delete threshold, not every frame.
    const pastThresholdRef = useRef(false);
    const rowRef = useRef<HTMLDivElement>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
        axisRef.current = null;
        pastThresholdRef.current = false;
        draggingRef.current = true;
        didSwipeRef.current = false;
        setTransitioning(false);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!draggingRef.current) return;
        const raw = e.touches[0].clientX - startX.current;
        const dy = e.touches[0].clientY - startY.current;
        if (axisRef.current === null) {
            if (Math.abs(raw) <= 8 && Math.abs(dy) <= 8) return;
            axisRef.current = Math.abs(raw) > Math.abs(dy) ? 'x' : 'y';
            if (axisRef.current === 'y') { draggingRef.current = false; return; }
            // Only now is this an actual swipe -- switch the row into its
            // dragging visual.
            didSwipeRef.current = true;
            setIsDragging(true);
        }
        setDragX(Math.max(-100, Math.min(0, raw)));
        const past = raw < -80;
        if (past && !pastThresholdRef.current) haptics.threshold();
        pastThresholdRef.current = past;
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

            {/* Content layer — moves with finger. Always transparent so the row
                shows the glass container behind it, same as every other idle
                row, including while dragging. */}
            <div
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={(e) => { if (didSwipeRef.current) { e.stopPropagation(); didSwipeRef.current = false; } }}
                style={{
                    position: 'relative',
                    transform: `translateX(${dragX}px)`,
                    transition: transitioning ? 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
                    // A layer per row only while it is actually being dragged.
                    willChange: isDragging ? 'transform' : undefined,
                    // Vertical panning stays with the browser (smooth native
                    // scroll); only horizontal movement reaches the handlers.
                    touchAction: 'pan-y',
                    zIndex: 1,
                    background: 'transparent',
                }}
            >
                {children}
            </div>
        </div>
    );
}
