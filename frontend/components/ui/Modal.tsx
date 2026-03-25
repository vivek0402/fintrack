'use client';

import { X } from 'lucide-react';
import { useIsMobile } from '@/hooks/useWindowSize';
import { BottomSheet } from './BottomSheet';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, children, maxWidth = '480px' }: ModalProps) {
    const isMobile = useIsMobile();

    if (!isOpen) return null;

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
                {children}
            </BottomSheet>
        );
    }

    return (
        <>
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(6px)',
                    zIndex: 1000,
                }}
            />
            <div style={{
                position: 'fixed',
                top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)',
                width: '100%', maxWidth,
                maxHeight: '85vh', overflowY: 'auto',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--bg-border)',
                borderRadius: '20px',
                padding: '24px',
                boxShadow: 'var(--shadow-modal)',
                zIndex: 1001,
            }}>
                {title && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Sora, sans-serif' }}>{title}</span>
                        <button
                            onClick={onClose}
                            style={{ background: 'var(--bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '6px', borderRadius: '8px' }}
                        >
                            <X size={18} />
                        </button>
                    </div>
                )}
                {children}
            </div>
        </>
    );
}
