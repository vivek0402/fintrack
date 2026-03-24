'use client';

import { useEffect } from 'react';
import { Sun, Moon, Eclipse } from 'lucide-react';
import { useThemeStore, type Theme } from '@/store/themeStore';

const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'dark', label: 'Dark', icon: <Moon size={15} /> },
    { value: 'pitch', label: 'Pitch', icon: <Eclipse size={15} /> },
    { value: 'light', label: 'Light', icon: <Sun size={15} /> },
];

export function ThemeToggle() {
    const { theme, setTheme, loadTheme } = useThemeStore();

    useEffect(() => { loadTheme(); }, []);

    return (
        <div style={{ padding: '4px 0' }}>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px 0', padding: '0 12px' }}>
                Theme
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', padding: '0 8px' }}>
                {THEMES.map(t => (
                    <button
                        key={t.value}
                        onClick={() => setTheme(t.value)}
                        style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            gap: '4px', padding: '8px 4px', borderRadius: '10px',
                            background: theme === t.value ? 'rgba(16,185,129,0.12)' : 'var(--bg-card)',
                            border: theme === t.value ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--bg-border)',
                            color: theme === t.value ? '#10b981' : 'var(--text-secondary)',
                            fontSize: '0.68rem', fontWeight: theme === t.value ? 600 : 400,
                            cursor: 'pointer', transition: 'all 0.2s',
                        }}
                    >
                        {t.icon}
                        {t.label}
                    </button>
                ))}
            </div>
        </div>
    );
}