'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

export function InstallPWA() {
    const [prompt, setPrompt] = useState<Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        // Already running as standalone (installed) — never show
        if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) {
            setHidden(true);
            return;
        }

        const handler = (e: Event) => {
            e.preventDefault();
            setPrompt(e as any);
        };

        window.addEventListener('beforeinstallprompt', handler);
        window.addEventListener('appinstalled', () => { setHidden(true); setPrompt(null); });

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    if (!prompt || hidden) return null;

    const handleInstall = async () => {
        prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === 'accepted') { setHidden(true); setPrompt(null); }
    };

    return (
        <button
            type="button"
            onClick={handleInstall}
            style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                padding: '8px var(--space-3)', width: '100%',
                borderRadius: 'var(--radius-md)',
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)',
                cursor: 'pointer', transition: 'all var(--transition-fast)',
                marginBottom: 4,
            }}
            onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = 'var(--bg-surface-2)';
                el.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = 'transparent';
                el.style.color = 'var(--text-secondary)';
            }}
        >
            <Download size={17} color="currentColor" />
            Install App
        </button>
    );
}
