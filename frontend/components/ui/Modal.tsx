'use client';

import { useEffect, useState } from 'react';
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

export function Modal({ isOpen, onClose, title, children, footer, maxWidth = '480px' }: ModalProps) {
    const isMobile = useIsMobile();
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

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
                backgroundColor: 'rgba(0,0,0,0.55)',
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
                onClick={e => e.stopPropagation()}
                style={{
                    position: 'relative',
                    width: '90%',
                    maxWidth,
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-xl)',
                    overflow: 'hidden',
                    zIndex: 10000,
                    animation: 'springIn 380ms cubic-bezier(0.34,1.56,0.64,1) both',
                }}
            >
                {/* Header */}
                {title && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '20px 24px',
                        borderBottom: '1px solid var(--border)',
                        flexShrink: 0,
                    }}>
                        <span style={{
                            fontSize: '1rem',
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
                                background: 'var(--bg-alt)',
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
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                    {children}
                </div>

                {/* Sticky footer */}
                {footer && (
                    <div style={{
                        flexShrink: 0,
                        padding: '16px 24px',
                        borderTop: '1px solid var(--border)',
                    }}>
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
