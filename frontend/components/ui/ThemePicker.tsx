'use client';

import { useState, useEffect, useRef } from 'react';
import { Palette } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useThemeStore } from '@/store/themeStore';
import type { PaletteName } from '@/store/themeStore';

// Palette preview colours — these are the --accent hex values for each palette.
// Hardcoded as data (palette definitions), not styling tokens.
const PALETTE_DEFS: { name: PaletteName; color: string; label: string }[] = [
    { name: 'ember',  color: '#ea580c', label: 'Ember'  },
    { name: 'ocean',  color: '#0284c7', label: 'Ocean'  },
    { name: 'violet', color: '#7c3aed', label: 'Violet' },
    { name: 'forest', color: '#059669', label: 'Forest' },
    { name: 'rose',   color: '#e11d48', label: 'Rose'   },
];

const HIDE_ON = ['/login', '/register', '/onboarding'];

export function ThemePicker() {
    const { theme, palette, setTheme, setPalette } = useThemeStore();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    if (HIDE_ON.some(p => pathname?.startsWith(p))) return null;

    return (
        <div ref={ref} style={{ position: 'fixed', bottom: '90px', left: '16px', zIndex: 400 }}>

            {/* Upward panel */}
            {open && (
                <div style={{
                    position: 'absolute',
                    bottom: '52px',
                    left: 0,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '14px 16px',
                    width: '228px',
                    boxShadow: 'var(--shadow-elevated)',
                    animation: 'fadeUp 150ms ease forwards',
                }}>
                    {/* Colour section */}
                    <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px', fontFamily: 'var(--font-body)' }}>
                        Colour
                    </p>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                        {PALETTE_DEFS.map(p => (
                            <div key={p.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                <button
                                    type="button"
                                    onClick={() => setPalette(p.name)}
                                    title={p.label}
                                    style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: '50%',
                                        background: p.color,
                                        border: 'none',
                                        cursor: 'pointer',
                                        outline: palette === p.name ? '3px solid var(--text-primary)' : '3px solid transparent',
                                        outlineOffset: palette === p.name ? '2px' : '0',
                                        transition: 'outline-offset 0.12s, outline-color 0.12s',
                                    }}
                                />
                                <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', textTransform: 'capitalize', lineHeight: 1 }}>
                                    {p.name}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Mode section */}
                    <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>
                        Mode
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', padding: '4px', background: 'var(--bg-alt)', borderRadius: 'var(--radius-md)' }}>
                        {([
                            { key: 'light' as const, label: '☀️ Light' },
                            { key: 'dark'  as const, label: '🌙 Dark'  },
                        ]).map(m => (
                            <button
                                key={m.key}
                                type="button"
                                onClick={() => setTheme(m.key)}
                                style={{
                                    padding: '7px 4px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: theme === m.key ? 'var(--bg-card)' : 'transparent',
                                    boxShadow: theme === m.key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    color: 'var(--text-primary)',
                                    fontFamily: 'var(--font-body)',
                                    fontWeight: theme === m.key ? 600 : 400,
                                    transition: 'all 0.15s',
                                }}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Trigger button */}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                title="Theme & palette"
                style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--shadow-elevated)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = 'scale(1.1)';
                    el.style.boxShadow = 'var(--shadow-modal)';
                }}
                onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = 'scale(1)';
                    el.style.boxShadow = 'var(--shadow-elevated)';
                }}
            >
                <Palette size={18} color="var(--accent)" />
            </button>
        </div>
    );
}
