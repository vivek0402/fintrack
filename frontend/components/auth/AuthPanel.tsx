'use client';

import { useIsMobile } from '@/hooks/useWindowSize';

const SPARK = [22, 38, 30, 52, 44, 68, 55, 78, 62, 74, 82, 90];

export function AuthPanel({ children }: { children: React.ReactNode }) {
    const isMobile = useIsMobile();

    if (isMobile) {
        return (
            <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '28px 24px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                        Fin<span style={{ fontWeight: 500, color: 'var(--accent)' }}>Track</span>
                    </span>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '36px 24px 48px' }}>
                    {children}
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-base)' }}>
            {/* ── Left brand panel ── */}
            <div style={{
                width: '44%', minHeight: '100vh', position: 'sticky', top: 0, height: '100vh',
                background: 'var(--bg-surface-1)', borderRight: '1px solid var(--border-subtle)',
                display: 'flex', flexDirection: 'column', padding: '48px 52px', overflow: 'hidden',
            }}>
                {/* Subtle grid */}
                <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    backgroundImage: 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)',
                    backgroundSize: '48px 48px', opacity: 0.5,
                }} />

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {/* Wordmark */}
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                        Fin<span style={{ fontWeight: 500, color: 'var(--accent)' }}>Track</span>
                    </div>

                    {/* Central content */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '32px', paddingBottom: '32px' }}>
                        <p style={{
                            fontFamily: 'var(--font-display)', fontSize: '38px', fontWeight: 800,
                            color: 'var(--text-primary)', lineHeight: 1.08, letterSpacing: '-0.03em',
                            margin: '0 0 14px',
                        }}>
                            Your money,<br />your story.
                        </p>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 36px', lineHeight: 1.65, fontFamily: 'var(--font-body)' }}>
                            Personal finance built for people<br />who take money seriously.
                        </p>

                        {/* Mini financial preview */}
                        <div style={{
                            background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
                            borderRadius: '12px', padding: '20px 22px',
                        }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: 'var(--font-body)', marginBottom: '6px' }}>
                                Net Position · June
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: 700, color: 'var(--color-inc)', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: '3px', fontVariantNumeric: 'tabular-nums' }}>
                                ₹2,45,000
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '16px', fontVariantNumeric: 'tabular-nums' }}>
                                +₹18,400 this month
                            </div>
                            {/* Sparkline */}
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '32px' }}>
                                {SPARK.map((h, i) => (
                                    <div key={i} style={{
                                        flex: 1, borderRadius: '2px',
                                        background: i === SPARK.length - 1 ? 'var(--color-inc)' : 'var(--border-subtle)',
                                        height: `${h}%`,
                                    }} />
                                ))}
                            </div>
                        </div>

                        {/* Feature list */}
                        <div style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {[
                                'AI-powered monthly financial insights',
                                'Track income, expenses & net worth',
                                'Smart budgets and savings goals',
                            ].map(f => (
                                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>{f}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                        © 2026 FinTrack. All rights reserved.
                    </div>
                </div>
            </div>

            {/* ── Right form panel ── */}
            <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '48px 52px', minHeight: '100vh',
            }}>
                <div style={{ width: '100%', maxWidth: '400px' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
