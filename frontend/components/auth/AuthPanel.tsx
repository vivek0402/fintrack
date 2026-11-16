'use client';

import { useIsMobile } from '@/hooks/useWindowSize';
import { type } from '@/lib/typography';

const FEATURES = [
    'AI-powered monthly financial insights',
    'Track income, expenses and net worth',
    'Smart budgets and savings goals',
];

function Wordmark({ style }: { style: React.CSSProperties }) {
    return (
        <span style={style}>
            Fin<span style={{ fontWeight: 500, color: 'var(--accent-text)' }}>Track</span>
        </span>
    );
}

export function AuthPanel({ children }: { children: React.ReactNode }) {
    const isMobile = useIsMobile();

    if (isMobile) {
        // body already pads the safe-area insets; subtract them so the panel fits the screen exactly
        return (
            <div style={{ height: 'calc(100dvh - var(--sa-top) - var(--sa-bottom))', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Fixed header: never scrolls away */}
                <div style={{ flexShrink: 0, padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <Wordmark style={{ ...type.title }} />
                </div>
                {/* Scrollable form area: centred when space allows, scrollable when the keyboard opens */}
                <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ margin: 'auto', width: '100%', padding: '28px 24px 48px' }}>
                        {children}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-base)' }}>
            {/* Left brand panel */}
            <div style={{
                width: '44%', position: 'sticky', top: 0, height: '100vh', boxSizing: 'border-box',
                background: 'var(--bg-base)', borderRight: '1px solid var(--glass-border)',
                display: 'flex', flexDirection: 'column', padding: '48px 52px', overflow: 'hidden',
            }}>
                <Wordmark style={{ ...type.heading }} />

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '32px', paddingBottom: '32px' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-display)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1, margin: '0 0 12px' }}>
                        Your money, your story.
                    </p>
                    <p style={{ ...type.meta, maxWidth: '320px', margin: '0 0 32px' }}>
                        Personal finance for people who take money seriously.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {FEATURES.map(f => (
                            <p key={f} style={{ ...type.body, margin: 0 }}>{f}</p>
                        ))}
                    </div>
                </div>

                <p style={{ ...type.meta, margin: 0 }}>© 2026 FinTrack. All rights reserved.</p>
            </div>

            {/* Right form panel */}
            <div style={{
                flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                padding: '0 52px', minHeight: '100vh',
            }}>
                <div style={{ width: '100%', maxWidth: '400px', paddingTop: '72px', paddingBottom: '72px' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
