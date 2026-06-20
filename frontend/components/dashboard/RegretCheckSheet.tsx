'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { transactionsAPI } from '@/lib/api';

const STORAGE_KEY = 'fintrack-last-regret-check';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isDue(): boolean {
    if (typeof window === 'undefined') return false;
    const last = localStorage.getItem(STORAGE_KEY);
    if (!last) return true;
    return Date.now() - parseInt(last, 10) > WEEK_MS;
}

function markDone() {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
}

const fmtAmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtDate = (s: string) =>
    new Date(s.split('T')[0] + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function RegretCheckSheet() {
    const [mounted, setMounted] = useState(false);
    const [show, setShow] = useState(false);
    const [exiting, setExiting] = useState(false);
    const [txs, setTxs] = useState<any[]>([]);
    const [marks, setMarks] = useState<Record<string, 'keep' | 'regret' | null>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (!isDue()) return;

        transactionsAPI.getAll().then((res: any) => {
            const all: any[] = res.data.transactions ?? [];
            const cutoff = Date.now() - WEEK_MS;
            const recent = all.filter(tx =>
                tx.type === 'expense' &&
                parseFloat(tx.amount) > 200 &&
                new Date((tx.date || '').split('T')[0] + 'T00:00:00').getTime() >= cutoff
            );
            if (recent.length >= 3) {
                setTxs(recent);
                setMarks(Object.fromEntries(recent.map((tx: any) => [tx.id, null])));
                setShow(true);
            } else {
                markDone();
            }
        }).catch(() => {});
    }, []);

    const dismiss = () => {
        setExiting(true);
        setTimeout(() => { setShow(false); setExiting(false); markDone(); }, 320);
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        const toToggle = Object.entries(marks)
            .filter(([, v]) => v === 'regret')
            .map(([id]) => id);
        try {
            await Promise.all(toToggle.map(id => transactionsAPI.toggleRegret(id)));
        } catch { /* silent */ }
        setSubmitting(false);
        dismiss();
    };

    const toggle = (id: string, val: 'keep' | 'regret') => {
        setMarks(prev => ({ ...prev, [id]: prev[id] === val ? null : val }));
    };

    if (!mounted || !show) return null;

    return createPortal(
        <>
            <div
                onClick={dismiss}
                style={{
                    position: 'fixed', inset: 0, zIndex: 1100,
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    animation: `${exiting ? 'rsBackdropOut' : 'rsBackdropIn'} 280ms ease forwards`,
                }}
            />
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1101,
                background: 'var(--bg-surface-1)',
                borderRadius: '20px 20px 0 0',
                borderTop: '1px solid var(--border-subtle)',
                maxHeight: '82vh',
                overflowY: 'auto',
                paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
                animation: `${exiting ? 'rsSheetOut' : 'rsSheetIn'} 320ms cubic-bezier(0.32, 0.72, 0, 1) forwards`,
            }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border-subtle)', margin: '12px auto 0' }} />

                <div style={{ padding: '16px 20px 0' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        Weekly Regret Check 😬
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                        How do you feel about these purchases from the last 7 days?
                    </p>
                </div>

                <div style={{ padding: '0 16px' }}>
                    {txs.map(tx => {
                        const mark = marks[tx.id];
                        const borderColor = mark === 'regret'
                            ? 'color-mix(in srgb, var(--color-exp) 40%, transparent)'
                            : mark === 'keep'
                            ? 'color-mix(in srgb, var(--color-inc) 40%, transparent)'
                            : 'var(--border-subtle)';
                        return (
                            <div key={tx.id} style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '12px 14px', marginBottom: '8px',
                                background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)',
                                border: `1px solid ${borderColor}`,
                                transition: 'border-color 0.15s',
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {tx.description}
                                    </p>
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                                        {tx.category_name || 'Uncategorized'} · {fmtDate(tx.date)}
                                    </p>
                                </div>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--color-exp)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                    {fmtAmt(parseFloat(tx.amount))}
                                </span>
                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                    {(['keep', 'regret'] as const).map(v => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => toggle(tx.id, v)}
                                            style={{
                                                width: 34, height: 34, borderRadius: 10, fontSize: '15px',
                                                background: mark === v
                                                    ? v === 'keep'
                                                        ? 'color-mix(in srgb, var(--color-inc) 15%, transparent)'
                                                        : 'color-mix(in srgb, var(--color-exp) 15%, transparent)'
                                                    : 'transparent',
                                                border: mark === v
                                                    ? v === 'keep'
                                                        ? '1.5px solid color-mix(in srgb, var(--color-inc) 40%, transparent)'
                                                        : '1.5px solid color-mix(in srgb, var(--color-exp) 40%, transparent)'
                                                    : '1.5px solid var(--border-subtle)',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.15s',
                                            }}
                                        >{v === 'keep' ? '👍' : '😬'}</button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div style={{ padding: '16px 20px 0', display: 'flex', gap: '10px' }}>
                    <button
                        type="button"
                        onClick={dismiss}
                        style={{
                            flex: 1, padding: '12px', borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500,
                            cursor: 'pointer', fontFamily: 'var(--font-body)',
                        }}
                    >Skip for now</button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting}
                        style={{
                            flex: 2, padding: '12px', borderRadius: 'var(--radius-md)',
                            background: 'var(--accent)', border: 'none',
                            color: 'white', fontSize: '14px', fontWeight: 600,
                            cursor: submitting ? 'wait' : 'pointer', fontFamily: 'var(--font-body)',
                            opacity: submitting ? 0.7 : 1,
                        }}
                    >{submitting ? 'Saving…' : 'Submit'}</button>
                </div>
            </div>
            <style>{`
                @keyframes rsBackdropIn  { from { opacity:0 } to { opacity:1 } }
                @keyframes rsBackdropOut { from { opacity:1 } to { opacity:0 } }
                @keyframes rsSheetIn  { from { transform:translateY(100%) } to { transform:translateY(0) } }
                @keyframes rsSheetOut { from { transform:translateY(0) } to { transform:translateY(100%) } }
            `}</style>
        </>,
        document.body
    );
}
