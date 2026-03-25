'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Plus, Sparkles } from 'lucide-react';

export function FAB() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    if (!mounted) return null;

    const fabGroup = (
        <div style={{
            position: 'fixed',
            bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
            right: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '8px',
            zIndex: 100,
        }}>
            {/* Ask AI row */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{
                    background: 'var(--bg-card)',
                    border: '0.5px solid var(--bg-border)',
                    borderRadius: '20px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    marginRight: '8px',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}>Ask AI</span>
                <button
                    className="fab-btn"
                    onClick={() => router.push('/ai-chat')}
                    style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--bg-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                        flexShrink: 0,
                    }}
                >
                    <Sparkles size={20} color="var(--accent-blue)" />
                </button>
            </div>

            {/* Add Transaction row */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{
                    background: 'var(--bg-card)',
                    border: '0.5px solid var(--bg-border)',
                    borderRadius: '20px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    marginRight: '8px',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}>Add</span>
                <button
                    className="fab-btn"
                    onClick={() => router.push('/transactions?add=true')}
                    style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: 'var(--accent-blue)',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(59,130,246,0.4)',
                        flexShrink: 0,
                    }}
                >
                    <Plus size={24} color="white" />
                </button>
            </div>
        </div>
    );

    return createPortal(fabGroup, document.body);
}
