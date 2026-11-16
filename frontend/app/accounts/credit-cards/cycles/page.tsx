'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { creditCardsAPI } from '@/lib/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction, Rows, TONE_TEXT } from '@/components/ui/CardParts';
import { type } from '@/lib/typography';
import { splitCycles } from '@/lib/billingCycles';
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

    const renderRow = (cycle: Cycle) => {
        const i = cycles.indexOf(cycle);
        const { amount, caption } = cycleHeadline(cycle);
        const looksUnpaid = (unpaidShares[i] ?? 0) > 0 && !notPaid.has(closeDateOf(cycle));
        return (
            <div key={cycle.start} className="fin-row-link pressable" role="button" tabIndex={0}
                onClick={() => openCycle(cycle)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCycle(cycle); } }}
                style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <p style={{ ...type.bodyStrong, margin: 0 }}>
                        {cycle.label}
                        {cycle.is_current && <span style={{ ...type.meta, color: TONE_TEXT.info }}>{' · Current cycle'}</span>}
                    </p>
                    {looksUnpaid && (
                        <p style={{ ...type.meta, margin: 0, color: TONE_TEXT.caution }}>Looks unpaid. Paid outside the app?</p>
                    )}
                    {cycle.charges != null && cycle.payments != null && (
                        <p style={{ ...type.numSmall, margin: 0 }}>Spent {signed(cycle.charges)} · Paid {fmt(cycle.payments)}</p>
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                    <span style={type.num}>
                        {caption ? signed(amount) : `${amount >= 0 ? '+' : '−'}${fmt(amount)}`}
                    </span>
                    {caption && <span style={type.meta}>{caption}</span>}
                </div>
            </div>
        );
    };

    const { current, past } = splitCycles(cycles);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-6)', animation: 'fadeUp 200ms ease forwards' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <div><TextAction quiet onClick={() => router.push('/accounts')}>Accounts</TextAction></div>
                <div className="fin-page-head">
                    <div style={{ minWidth: 0 }}>
                        <p style={{ ...type.meta, margin: 0 }}>Tap a cycle to see its transactions</p>
                        <h1 style={{ ...type.heading, margin: 0 }}>Billing cycles</h1>
                    </div>
                </div>
            </div>

            {/* Old statements that look unpaid (a bill paid outside the app and
                never recorded): send the user to Pay Bill to record them. */}
            {unpaidCount > 0 && (
                <div data-testid="cycles-unpaid-note">
                    <Card>
                        <CardHeader flush
                            title={`${unpaidCount} older statement${unpaidCount > 1 ? 's look' : ' looks'} unpaid`}
                            sub={`Paid outside the app? Record ${unpaidCount > 1 ? 'them' : 'it'} so this card's balance is right.`}
                            action={<TextAction onClick={() => router.push(`/accounts?review=${cardId}`)}>Review</TextAction>} />
                    </Card>
                </div>
            )}

            {loading ? (
                <Card>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Skeleton width="120px" height={14} borderRadius={4} />
                                <Skeleton width={70} height={14} borderRadius={4} />
                            </div>
                        ))}
                    </div>
                </Card>
            ) : error ? (
                <Card><FetchErrorCard onRetry={fetchCycles} message="Couldn't load billing cycles" /></Card>
            ) : cycles.length === 0 ? (
                <Card>
                    <CardHeader flush title="No billing cycles yet" sub="This card has no billing date set, or no cycles have closed yet." />
                </Card>
            ) : (
                <>
                    {current.length > 0 && (
                        <Card>
                            <CardHeader title="Current cycle" sub="Open now" />
                            <Rows>{current.map(renderRow)}</Rows>
                        </Card>
                    )}
                    {past.length > 0 && (
                        <Card>
                            <CardHeader title="Past statements" sub="Newest first" />
                            <Rows>{past.map(renderRow)}</Rows>
                        </Card>
                    )}
                </>
            )}
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
