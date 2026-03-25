'use client';

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

    if (!isOpen) return null;

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose} title={title} footer={footer}>
                {children}
            </BottomSheet>
        );
    }

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0, left: 0,
                width: '100vw', height: '100vh',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(6px)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth,
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--bg-border)',
                    borderRadius: '20px',
                    boxShadow: 'var(--shadow-modal)',
                    zIndex: 1001,
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                {title && (
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '20px 24px 16px',
                        borderBottom: '1px solid var(--bg-border)',
                        flexShrink: 0,
                    }}>
                        <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Sora, sans-serif' }}>{title}</span>
                        <button
                            onClick={onClose}
                            style={{ background: 'var(--bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '6px', borderRadius: '8px' }}
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
                        borderTop: '1px solid var(--bg-border)',
                        background: 'var(--bg-secondary)',
                    }}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
