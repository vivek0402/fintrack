'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';

const STORAGE_KEY = 'fintrack-v3-seen';

const WHATS_NEW = [
    { icon: '🌗', title: 'AMOLED dark mode',       desc: 'True black surfaces, easy on OLED screens' },
    { icon: '📊', title: 'Rebuilt analytics',       desc: 'Live Recharts with theme-reactive colours' },
    { icon: '💬', title: 'AI chat redesigned',      desc: 'Chat bubbles, quick prompts, timestamps' },
    { icon: '🎯', title: 'Goals & budgets',         desc: 'Progress bars, over-budget alerts, mood card' },
    { icon: '📱', title: 'Consistent design system', desc: 'Inline styles, CSS vars, DM Mono for ₹ figures' },
];

export function RedesignAnnouncement() {
    const { user } = useAuthStore();
    const { theme, setTheme } = useThemeStore();
    const [show, setShow]       = useState(false);
    const [mounted, setMounted] = useState(false);
    const [localTheme, setLocalTheme] = useState<typeof theme>(theme);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!user) return;
        // Only show to users who have already onboarded (existing users)
        // AND haven't seen the v3 announcement yet
        const hasOnboarded = !!localStorage.getItem(`onboarded-${user.id}`);
        const hasSeen      = !!localStorage.getItem(STORAGE_KEY);
        if (hasOnboarded && !hasSeen) setShow(true);
    }, [user]);

    // Apply changes live as user picks
    useEffect(() => { setTheme(localTheme); }, [localTheme]);

    const handleDone = () => {
        localStorage.setItem(STORAGE_KEY, '1');
        setShow(false);
    };

    if (!show || !mounted) return null;

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
            <div className="glass-surface glass-sheet" style={{ borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto', animation: 'springIn 380ms cubic-bezier(0.34,1.56,0.64,1) both', boxShadow: 'var(--shadow-modal)' }}>

                {/* Hero */}
                <div style={{ padding: '28px 28px 20px', textAlign: 'center', borderBottom: '1px solid var(--glass-border)' }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-info) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-info) 25%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                        <Sparkles size={24} color="var(--color-info)" />
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                        FinTrack has been redesigned ✨
                    </h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
                        We've rebuilt the whole app with a new design system. Here's what's new.
                    </p>
                </div>

                <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* What's new list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {WHATS_NEW.map(item => (
                            <div key={item.title} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <span style={{ fontSize: '18px', lineHeight: 1, flexShrink: 0, marginTop: '1px' }}>{item.icon}</span>
                                <div>
                                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1px', fontFamily: 'var(--font-display)' }}>{item.title}</p>
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Divider */}
                    <div style={{ height: '1px', background: 'var(--glass-border)' }} />

                    {/* Mode toggle */}
                    <div>
                        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>
                            Mode
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', padding: '4px', background: 'var(--glass-fill-1)', borderRadius: 'var(--radius-md)' }}>
                            {([{ key: 'light' as const, label: '☀️ Light' }, { key: 'dark' as const, label: '🌙 Dark' }]).map(m => (
                                <button key={m.key} type="button" onClick={() => setLocalTheme(m.key)}
                                    style={{ padding: '9px 8px', borderRadius: 'var(--radius-sm)', background: localTheme === m.key ? 'var(--glass-fill-3)' : 'transparent', boxShadow: localTheme === m.key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontWeight: localTheme === m.key ? 600 : 400, transition: 'all 0.15s' }}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0', fontFamily: 'var(--font-body)' }}>
                            Live preview — changes are applied instantly
                        </p>
                    </div>

                    {/* CTA */}
                    <button type="button" onClick={handleDone}
                        style={{ width: '100%', padding: '13px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-display)', transition: 'opacity 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                        Explore the new FinTrack →
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
