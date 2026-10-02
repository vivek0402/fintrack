'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarClock, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { creditCardsAPI } from '@/lib/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FetchErrorCard } from '@/components/ui/FetchErrorCard';
import { fmt as fmtBase } from '@/lib/utils';
import { cycleHeadline, olderUnpaidShares, unpaidStatementIdxs, closeDateOf, type PayCycle } from '@/lib/cardStatement';
import { getNotPaid } from '@/lib/cardNotPaid';

type Cycle = PayCycle;

function fmt(n: number) { return fmtBase(Math.abs(n)); }
function signed(n: number) { return `${n < 0 ? '−' : ''}${fmt(n)}`; }

function CreditCardCyclesPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const cardId = Number(searchParams.get('id'));
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [cycles, setCycles]   = useState<Cycle[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchCycles = () => {
        if (!Number.isFinite(cardId)) { setError(true); setLoading(false); return; }
        setLoading(true);
        setError(false);
        creditCardsAPI.getCycles(cardId)
            .then(res => setCycles(res.data?.cycles ?? []))
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    };

    useEffect(() => { if (user) fetchCycles(); }, [user, cardId]);

    const openCycle = (cycle: Cycle) => {
        const q = new URLSearchParams({ credit_card_id: String(cardId), from: cycle.start });
        if (!cycle.is_current && cycle.end) q.set('to', cycle.end);
        router.push(`/transactions?${q.toString()}`);
    };

    if (isLoading || !user) return <Skeleton width="100%" height={300} borderRadius={12} />;

    const unpaidShares = olderUnpaidShares(cycles);
    const notPaid = cardId ? getNotPaid(cardId) : new Set<string>();
    const unpaidCount = unpaidStatementIdxs(cycles, notPaid).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '32px', animation: 'fadeUp 200ms ease forwards' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button type="button" onClick={() => router.push('/accounts')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '4px', borderRadius: '8px' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--glass-fill-2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Billing Cycles</h1>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>Tap a cycle to see its transactions</p>
                </div>
            </div>

            {/* Old statements that look unpaid (a bill paid outside the app and
                never recorded): send the user to Pay Bill to record them. */}
            {unpaidCount > 0 && (
                <button type="button" data-testid="cycles-unpaid-note" onClick={() => router.push(`/accounts?review=${cardId}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-md)', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-body)',
                        background: 'color-mix(in srgb, var(--color-warn) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warn) 30%, transparent)' }}>
                    <AlertTriangle size={16} color="var(--color-warn)" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{unpaidCount} older statement{unpaidCount > 1 ? 's look' : ' looks'} unpaid</span>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>Paid outside the app? Record {unpaidCount > 1 ? 'them' : 'it'} so this card&apos;s balance is right.</span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-warn)', whiteSpace: 'nowrap' }}>Review ›</span>
                </button>
            )}

            {/* List */}
            <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Skeleton width="120px" height={14} borderRadius={4} />
                                <Skeleton width={70} height={14} borderRadius={4} />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <FetchErrorCard onRetry={fetchCycles} message="Couldn't load billing cycles" />
                ) : cycles.length === 0 ? (
                    <EmptyState
                        icon={CalendarClock}
                        title="No billing cycles yet"
                        subtitle="This card has no billing date set, or no cycles have closed yet."
                    />
                ) : (
                    cycles.map((cycle, i) => {
                        const { amount, caption } = cycleHeadline(cycle);
                        const looksUnpaid = (unpaidShares[i] ?? 0) > 0 && !notPaid.has(closeDateOf(cycle));
                        return (
                        <button
                            key={cycle.start}
                            type="button"
                            onClick={() => openCycle(cycle)}
                            style={{
                                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                                padding: '14px 16px', background: cycle.is_current ? 'var(--accent-subtle)' : 'transparent',
                                border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--glass-border)',
                                cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)',
                            }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{cycle.label}</span>
                                    {cycle.is_current && (
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '999px',
                                            fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                                            background: 'var(--accent)', color: 'white',
                                        }}>
                                            Current
                                        </span>
                                    )}
                                </div>
                                {looksUnpaid && (
                                    <span style={{ fontSize: '11px', color: 'var(--color-warn)', fontWeight: 600 }}>Looks unpaid · paid outside the app?</span>
                                )}
                                {cycle.charges != null && cycle.payments != null && (
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                        Spent {signed(cycle.charges)} · Paid {fmt(cycle.payments)}
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: !caption && amount > 0 ? 'var(--color-warn)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                    {caption ? signed(amount) : `${amount >= 0 ? '+' : '−'}${fmt(amount)}`}
                                </span>
                                {caption && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{caption}</span>}
                            </div>
                        </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default function CreditCardCyclesPage() {
    return (
        <Suspense fallback={<Skeleton width="100%" height={300} borderRadius={12} />}>
            <CreditCardCyclesPageInner />
        </Suspense>
    );
}
