'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { type } from '@/lib/typography';
import { Button } from './Button';
import { Rows } from './CardParts';
import { Tabs } from './Tabs';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';

const STORAGE_KEY = 'fintrack-v4-seen';

const NEW_LOOK = [
    { title: 'Plainer pages', desc: 'The most important figure and action come first on every page' },
    { title: 'The same parts everywhere', desc: 'Dialogs, lists and fields now look and behave alike' },
];

export function RedesignAnnouncement() {
    const { user } = useAuthStore();
    const { theme, setTheme } = useThemeStore();
    const [show, setShow]       = useState(false);
    const [mounted, setMounted] = useState(false);
    // Tracks the user value we've already reacted to, so the localStorage check
    // below runs during render (once per user change) instead of in an effect —
    // avoids the extra render pass a useEffect-based check would cause. `user`
    // starts (and stays) null until auth/persist rehydration completes, so this
    // never touches localStorage during the initial (prerendered) render.
    const [prevUser, setPrevUser] = useState(user);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mount flag to defer the createPortal render past hydration; standard SSR guard idiom.
        setMounted(true);
    }, []);

    if (user !== prevUser) {
        setPrevUser(user);
        if (user) {
            // Only show to users who have already onboarded (existing users)
            // AND haven't seen the v4 notice yet
            const hasOnboarded = !!localStorage.getItem(`onboarded-${user.id}`);
            const hasSeen      = !!localStorage.getItem(STORAGE_KEY);
            if (hasOnboarded && !hasSeen) setShow(true);
        }
    }

    const handleDone = () => {
        localStorage.setItem(STORAGE_KEY, '1');
        setShow(false);
    };

    if (!show || !mounted) return null;

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
            <div role="dialog" aria-modal="true" aria-label="FinTrack has a new look" className="glass-surface glass-sheet" style={{ borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', padding: 'var(--space-6)', animation: 'springIn 380ms cubic-bezier(0.34,1.56,0.64,1) both', boxShadow: 'var(--shadow-modal)' }}>
                <h2 style={{ ...type.heading, margin: 0 }}>FinTrack has a new look</h2>
                <p style={{ ...type.meta, margin: 'var(--space-1) 0 var(--space-4)' }}>
                    One type scale, one card style, and a calmer highlight everywhere.
                </p>

                <Rows>
                    {NEW_LOOK.map(item => (
                        <div key={item.title}>
                            <p style={{ ...type.bodyStrong, margin: 0 }}>{item.title}</p>
                            <p style={{ ...type.meta, margin: '2px 0 0' }}>{item.desc}</p>
                        </div>
                    ))}
                </Rows>

                <div style={{ marginTop: 'var(--space-5)' }}>
                    <p style={{ ...type.label, margin: '0 0 var(--space-2)' }}>Mode</p>
                    <Tabs
                        tabs={[{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]}
                        active={theme}
                        onChange={key => setTheme(key as 'light' | 'dark')}
                    />
                    <p style={{ ...type.meta, margin: 'var(--space-2) 0 0' }}>Applied as you choose</p>
                </div>

                <Button variant="primary" onClick={handleDone} style={{ width: '100%', marginTop: 'var(--space-5)' }}>
                    Got it
                </Button>
            </div>
        </div>,
        document.body
    );
}
