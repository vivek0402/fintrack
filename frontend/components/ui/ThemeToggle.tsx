'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';

export function ThemeToggle() {
    const { theme, setTheme, loadTheme } = useThemeStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        loadTheme();
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

    return (
        <div style={{ padding: '4px 0' }}>
            <p style={{
                fontSize: '0.68rem',
                color: 'var(--text-muted)',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                margin: '0 0 8px 0',
                padding: '0 12px',
                fontFamily: "'Satoshi', 'DM Sans', sans-serif",
            }}>
                Theme
            </p>
            <div style={{
                display: 'inline-flex',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-xl)',
                padding: '3px',
                border: '1px solid var(--bg-border)',
                margin: '0 8px',
            }}>
                {([
                    { value: 'dark' as const, label: 'Dark', icon: <Moon size={14} /> },
                    { value: 'light' as const, label: 'Light', icon: <Sun size={14} /> },
                ]).map(t => {
                    const isActive = theme === t.value;
                    return (
                        <button
                            key={t.value}
                            onClick={() => setTheme(t.value)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 14px',
                                borderRadius: 'var(--radius-lg)',
                                fontSize: '13px',
                                fontFamily: "'Satoshi', 'DM Sans', sans-serif",
                                fontWeight: 500,
                                cursor: 'pointer',
                                border: 'none',
                                transition: 'var(--transition-fast)',
                                background: isActive ? 'var(--surface-1)' : 'transparent',
                                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                boxShadow: isActive ? 'var(--shadow-card)' : 'none',
                            }}
                        >
                            {t.icon}
                            {t.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
