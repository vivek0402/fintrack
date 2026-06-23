'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useIsMobile } from '@/hooks/useWindowSize';
import { BottomSheet } from './BottomSheet';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: string;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ isOpen, onClose, title, children, footer, maxWidth = '480px' }: ModalProps) {
    const isMobile = useIsMobile();
    const [mounted, setMounted] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key !== 'Tab' || !dialogRef.current) return;
            // Best-effort focus trap: wrap Tab/Shift+Tab at the dialog's edges.
            const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    // Move focus into the dialog on open, and back to the trigger element on close.
    useEffect(() => {
        if (!isOpen) return;
        previouslyFocusedRef.current = document.activeElement as HTMLElement;
        const focusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        (focusable ?? dialogRef.current)?.focus();
        return () => { previouslyFocusedRef.current?.focus?.(); };
    }, [isOpen]);

    useEffect(() => {
        document.body.style.overflow = isOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    if (!isOpen || !mounted) return null;

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose} title={title} footer={footer}>
                {children}
            </BottomSheet>
        );
    }

    return createPortal(
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(2px)',
                WebkitBackdropFilter: 'blur(2px)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflowY: 'auto',
            }}
        >
            <div
                ref={dialogRef}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                style={{
                    position: 'relative',
                    width: '90%',
                    maxWidth,
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bg-surface-1)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-modal)',
                    overflow: 'hidden',
                    zIndex: 10000,
                    animation: 'scaleIn 150ms ease both',
                }}
            >
                {/* Header */}
                {title && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '20px 24px',
                        borderBottom: '1px solid var(--border-subtle)',
                        flexShrink: 0,
                    }}>
                        <span style={{
                            fontSize: 'var(--text-h2)',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-display)',
                        }}>
                            {title}
                        </span>
                        <button
                            type="button"
                            onClick={onClose}
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

                {/* Scrollable body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                    {children}
                </div>

                {/* Sticky footer */}
                {footer && (
                    <div style={{
                        flexShrink: 0,
                        padding: '16px 24px',
                        borderTop: '1px solid var(--border-subtle)',
                    }}>
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
