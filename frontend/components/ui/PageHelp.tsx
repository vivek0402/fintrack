'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Section {
    icon: string;
    heading: string;
    body: string;
}

interface PageHelpProps {
    title: string;
    sections: Section[];
}

export default function PageHelp({ title, sections }: PageHelpProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const close = () => setIsOpen(false);

    const sheetContent = (
        <div
            onClick={close}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
            }}
        >
            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to   { transform: translateY(0); }
                }
            `}</style>

            {/* Sheet panel — stopPropagation so clicks inside don't close */}
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--glass-fill-1)',
                    borderRadius: '20px 20px 0 0',
                    maxHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    paddingBottom: 'env(safe-area-inset-bottom)',
                    animation: 'slideUp 0.3s ease',
                }}
            >
                {/* Sticky header */}
                <div style={{
                    padding: '16px 20px 12px',
                    borderBottom: '1px solid var(--glass-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                }}>
                    <div>
                        <div style={{
                            width: '40px',
                            height: '4px',
                            background: 'var(--glass-border)',
                            borderRadius: '2px',
                            margin: '0 auto 12px',
                        }} />
                        <div style={{
                            fontSize: '17px',
                            fontWeight: 700,
                            fontFamily: 'var(--font-display)',
                            color: 'var(--text-primary)',
                        }}>
                            How to use {title}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        style={{
                            color: 'var(--text-muted)',
                            fontSize: '20px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            lineHeight: 1,
                            padding: 0,
                            flexShrink: 0,
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Scrollable body */}
                <div style={{
                    overflowY: 'auto',
                    padding: '16px 20px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                }}>
                    {sections.map((section, i) => (
                        <div
                            key={i}
                            style={{
                                background: 'var(--glass-sheet-surface)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: '14px',
                                padding: '16px',
                                display: 'flex',
                                gap: '14px',
                                alignItems: 'flex-start',
                            }}
                        >
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '10px',
                                background: 'var(--glass-fill-1)',
                                fontSize: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                {section.icon}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                    marginBottom: '4px',
                                }}>
                                    {section.heading}
                                </div>
                                <div style={{
                                    fontSize: '13px',
                                    lineHeight: 1.6,
                                    color: 'var(--text-secondary)',
                                }}>
                                    {section.body}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'var(--glass-sheet-surface)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-secondary)',
                    fontSize: '16px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}
            >
                ?
            </button>

            {isOpen && mounted && createPortal(sheetContent, document.body)}
        </>
    );
}
