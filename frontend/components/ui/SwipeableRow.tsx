'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

interface SwipeableRowProps {
    children: React.ReactNode;
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    isRegretted?: boolean;
}

export function SwipeableRow({ children, onSwipeLeft, onSwipeRight }: SwipeableRowProps) {
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
        setDragX(Math.max(-100, Math.min(100, raw)));
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
        } else if (dragX > 80) {
            // Swipe right → regret: snap then bounce back
            setDragX(72);
            setTimeout(() => {
                onSwipeRight?.();
                setDragX(0);
                setIsDragging(false);
            }, 350);
        } else {
            // Cancelled — snap back immediately
            setDragX(0);
            setIsDragging(false);
        }
    };

    // Reveal opacity scales with drag distance (0→100%)
    const absRatio = Math.min(Math.abs(dragX) / 80, 1);
    const deleteOpacity = dragX < 0 ? 0.15 + 0.85 * absRatio : 0.15;
    const regretOpacity = dragX > 0 ? 0.15 + 0.85 * absRatio : 0.15;

    return (
        <div ref={rowRef} style={{ position: 'relative', overflow: 'hidden' }}>
            {/* Left reveal — regret (yellow): only visible during active drag */}
            {isDragging && (
                <div style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0, width: '80px',
                    background: `rgba(245, 158, 11, ${regretOpacity})`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
                    pointerEvents: 'none',
                }}>
                    <span style={{ fontSize: '18px', lineHeight: 1 }}>🤦</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-warn)', letterSpacing: '0.02em' }}>Regret</span>
                </div>
            )}

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
