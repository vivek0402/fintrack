'use client';

import { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';

interface BottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
    footer?: React.ReactNode;
    maxHeight?: string;
}

export function BottomSheet({ isOpen, onClose, children, title, footer, maxHeight = '90vh' }: BottomSheetProps) {
    const [mounted, setMounted] = useState(false);
    const [closing, setClosing] = useState(false);
    const [dragY, setDragY] = useState(0);
    const touchStartY = useRef(0);
    const isDragging = useRef(false);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (isOpen) setClosing(false);
    }, [isOpen]);

    const handleClose = () => {
        setClosing(true);
        setTimeout(() => {
            setClosing(false);
            setDragY(0);
            onClose();
        }, 220);
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

    if (!mounted || !isOpen) return null;

    const sheet = (
        <>
            <div
                onClick={handleClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(2px)',
                    WebkitBackdropFilter: 'blur(2px)',
                    zIndex: 9999,
                }}
            />
            <div
                className={`glass-surface ${closing ? 'sheet-exit' : 'sheet-enter'}`}
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
                                    background: 'var(--bg-surface-2)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    display: 'flex',
                                    padding: '6px',
                                    borderRadius: '8px',
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Scrollable body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>
                    {children}
                </div>

                {/* Sticky footer */}
                {footer && (
                    <div style={{
                        flexShrink: 0,
                        padding: 'calc(16px + env(safe-area-inset-bottom, 0px)) 20px 16px',
                        borderTop: '1px solid var(--border-subtle)',
                    }}>
                        {footer}
                    </div>
                )}
                {!footer && (
                    <div style={{ flexShrink: 0, height: 'calc(16px + env(safe-area-inset-bottom, 0px))' }} />
                )}
            </div>
        </>
    );

    return ReactDOM.createPortal(sheet, document.body);
}
