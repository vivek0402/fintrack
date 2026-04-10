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
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
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
                backgroundColor: 'rgba(0,0,0,0.6)',
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
                    background: 'var(--surface-1)',
                    border: '1px solid var(--bg-border)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    zIndex: 10000,
                    animation: 'scaleIn 200ms ease forwards',
                }}
            >
                {/* Header */}
                {title && (
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '20px 24px',
                        borderBottom: '1px solid var(--bg-border)',
                        flexShrink: 0,
                    }}>
                        <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif" }}>{title}</span>
                        <button
                            onClick={onClose}
                            style={{ background: 'var(--bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '6px', borderRadius: '8px' }}
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
                        borderTop: '1px solid var(--bg-border)',
                    }}>
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
