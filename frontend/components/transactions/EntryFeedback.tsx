'use client';

import Link from 'next/link';

export interface EntrySignal {
    kind: string;
    level: 'warn' | 'info';
    text: string;
    action?: 'split';
}

// One warning and one info line at most: the modal is tuned to four fields,
// and a stack of alerts taller than the form would just get skipped.
export function EntryFeedback({ signals }: { signals: EntrySignal[] }) {
    const warn = signals.find(s => s.level === 'warn');
    const info = signals.find(s => s.level === 'info');
    const shown = [warn, info].filter((s): s is EntrySignal => !!s);
    if (!shown.length) return null;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '-6px' }}>
            {shown.map(s => {
                const color = s.level === 'warn' ? 'var(--color-warn)' : 'var(--text-muted)';
                return (
                    <div key={`${s.level}-${s.kind}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', lineHeight: 1.5, fontFamily: 'var(--font-body)', color }}>
                        <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', marginTop: '6px', flexShrink: 0, background: color }} />
                        <span>
                            {s.text}
                            {s.action === 'split' && (
                                <>
                                    {' '}
                                    <Link href="/groups" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Open groups →</Link>
                                </>
                            )}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
