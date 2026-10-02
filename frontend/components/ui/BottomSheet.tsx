'use client';

import { Fragment, useEffect, useState, useRef } from 'react';
import { usePresence } from '@/hooks/usePresence';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';

interface BottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
    footer?: React.ReactNode;
    maxHeight?: string;
    // See the matching prop on Modal -- lets a sheet whose own first child is
    // the header render its rows full-bleed.
    bodyPadding?: string;
    // false: no dimming layer (the tap-to-close area stays). For a sheet
    // whose window already dims what's behind it (the Android widget add
    // sheet over the home screen).
    scrim?: boolean;
}

// Matches .sheet-exit in globals.css.
const SHEET_EXIT_MS = 240;

export function BottomSheet({ isOpen, onClose, children, title, footer, maxHeight = '90vh', bodyPadding = '20px 20px 0', scrim = true }: BottomSheetProps) {
    const [mounted, setMounted] = useState(false);
    const [dragY, setDragY] = useState(0);
    const touchStartY = useRef(0);
    const isDragging = useRef(false);
    // Stays mounted for the exit animation however the sheet is closed: by
    // its own scrim/X/drag, or by the page flipping isOpen (e.g. after Save).
    const { rendered, closing, generation } = usePresence(isOpen, SHEET_EXIT_MS);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount flag to defer the createPortal render past hydration; standard SSR guard idiom.
    useEffect(() => { setMounted(true); }, []);

    // A fresh open starts from the resting position.
    const [prevOpen, setPrevOpen] = useState(isOpen);
    if (isOpen !== prevOpen) {
        setPrevOpen(isOpen);
        if (isOpen) setDragY(0);
    }

    const handleClose = () => {
        if (!closing) onClose();
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
        isDragging.current = true;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging.current) return;
        const dy = e.touches[0].clientY - touchStartY.current;
        if (dy > 0) setDragY(dy);
    };

    const handleTouchEnd = () => {
        isDragging.current = false;
        if (dragY > 80) {
            handleClose();
        } else {
            setDragY(0);
        }
    };

    if (!mounted || !rendered) return null;

    const sheet = (
        <>
            <div
                onClick={handleClose}
                data-testid="sheet-scrim"
                className={closing ? 'scrim-exit' : 'scrim-enter'}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: scrim ? 'rgba(0,0,0,0.55)' : 'transparent',
                    backdropFilter: scrim ? 'blur(2px)' : undefined,
                    WebkitBackdropFilter: scrim ? 'blur(2px)' : undefined,
                    zIndex: 9999,
                }}
            />
            <div
                className={`glass-surface glass-sheet ${closing ? 'sheet-exit' : 'sheet-enter'}`}
                style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    maxHeight,
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                    borderBottom: 'none',
                    zIndex: 10000,
                    transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
                    transition: dragY > 0 ? 'none' : 'transform 200ms ease-out',
                    overflow: 'hidden',
                    // The exit keyframe starts here, so a drag-to-close keeps going down.
                    ['--sheet-from' as string]: `${dragY}px`,
                    pointerEvents: closing ? 'none' : undefined,
                }}
            >
                {/* Sticky header: drag handle + title */}
                <div
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    style={{ flexShrink: 0 }}
                >
                    <div style={{
                        width: '40px',
                        height: '4px',
                        background: 'var(--border-visible)',
                        borderRadius: '2px',
                        margin: '12px auto 0',
                    }} />
                    {title && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '14px 20px 12px',
                            borderBottom: '1px solid var(--border-subtle)',
                        }}>
                            <span style={{
                                fontSize: '16px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                fontFamily: 'var(--font-display)',
                            }}>
                                {title}
                            </span>
                            <button
                                type="button"
                                onClick={handleClose}
                                style={{
                                    background: 'var(--glass-fill-2)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    display: 'flex',
                                    padding: '6px',
                                    borderRadius: '50%',
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Scrollable body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: bodyPadding, minHeight: 0 }}>
                    <Fragment key={generation}>{children}</Fragment>
                </div>

                {/* Sticky footer */}
                {footer && (
                    <div style={{
                        flexShrink: 0,
                        padding: '16px 20px calc(16px + var(--sa-bottom))',
                        borderTop: '1px solid var(--border-subtle)',
                    }}>
                        {footer}
                    </div>
                )}
                {!footer && (
                    <div style={{ flexShrink: 0, height: 'calc(16px + var(--sa-bottom))' }} />
                )}
            </div>
        </>
    );

    return ReactDOM.createPortal(sheet, document.body);
}
