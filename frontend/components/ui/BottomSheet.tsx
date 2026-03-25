'use client';

import { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';

interface BottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
    maxHeight?: string;
}

export function BottomSheet({ isOpen, onClose, children, title, maxHeight = '90vh' }: BottomSheetProps) {
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
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.5)',
                    zIndex: 999,
                }}
            />
            <div
                className={closing ? 'sheet-exit' : 'sheet-enter'}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                    position: 'fixed',
                    bottom: 0, left: 0, right: 0,
                    maxHeight,
                    background: 'var(--bg-secondary)',
                    borderRadius: '20px 20px 0 0',
                    overflowY: 'auto',
                    zIndex: 1000,
                    padding: `0 20px calc(20px + env(safe-area-inset-bottom, 0px))`,
                    transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
                    transition: dragY > 0 ? 'none' : 'transform 200ms ease-out',
                }}
            >
                {/* Drag handle */}
                <div style={{
                    width: '36px', height: '4px',
                    background: 'var(--bg-border)',
                    borderRadius: '2px',
                    margin: '12px auto 16px',
                    flexShrink: 0,
                }} />

                {title && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'Sora, sans-serif' }}>{title}</span>
                        <button
                            onClick={handleClose}
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

    return ReactDOM.createPortal(sheet, document.body);
}
