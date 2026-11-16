'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { analyticsAPI } from '@/lib/api';
import { useUserQuery } from '@/hooks/queries';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { CardHeader, Rows, Stat, TONE_TEXT } from '@/components/ui/CardParts';
import { fmt } from '@/lib/utils';
import { type, truncate } from '@/lib/typography';
import { netWorthChange, sortByAmountDesc, furthestFromTarget, deviationLabel, trendPhrase } from '@/lib/netWorth';

function chartSkeleton(height: number) {
    const ChartSkeleton = () => <SkeletonCard height={height} />;
    return ChartSkeleton;
}

const NetWorthAreaChart = dynamic(() => import('@/components/net-worth/NetWorthAreaChart').then(m => m.NetWorthAreaChart), { ssr: false, loading: chartSkeleton(220) });
const VelocityBarChart = dynamic(() => import('@/components/net-worth/VelocityBarChart').then(m => m.VelocityBarChart), { ssr: false, loading: chartSkeleton(140) });


const fmtSigned = (n: number) => (n >= 0 ? '+' : '\u2212') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
const fmtPctSigned = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(Number(n)).toFixed(1) + '%';

const CHART_COLORS = [
    'var(--accent)', 'var(--color-inc)', 'var(--color-info)', 'var(--accent)',
    'var(--color-warn)', 'var(--accent-3)', 'var(--color-exp)', 'var(--text-muted)',
];

const TABS = [
    { key: 'overview',   label: 'Overview' },
    { key: 'velocity',   label: 'Velocity' },
    { key: 'allocation', label: 'Allocation' },
];

interface NetWorthCurrent {
    total_bank_balance: number;
    total_investments: number;
    total_assets: number;
    total_credit_outstanding: number;
    total_loans_outstanding: number;
    total_liabilities: number;
    net_worth: number;
}

interface NetWorthSnapshot {
    snapshot_date: string;
    net_worth: number;
    total_assets: number;
    total_liabilities: number;
}

type Trend = 'accelerating' | 'decelerating' | 'steady' | 'insufficient_data';

interface MomChange {
    from_date: string;
    to_date: string;
    absolute_change: number;
    pct_change: number;
}

interface WealthVelocityData {
    snapshots: { snapshot_date: string; net_worth: number }[];
    mom_changes: MomChange[];
    avg_monthly_growth: number;
    avg_monthly_growth_pct: number;
    trend: Trend;
    message?: string;
}

interface Allocation {
    category: string;
    label: string;
    amount: number;
    actual_pct: number;
    recommended_pct: number;
    deviation: number;
}

interface AssetAllocationData {
    allocations: Allocation[];
    total_assets: number;
    deviation_score: number;
    recommendation_note: string;
}

const NO_SNAPSHOTS: NetWorthSnapshot[] = [];

function NetWorthPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const initialTab = searchParams.get('tab');
    const [tab, setTab] = useState(TABS.some(t => t.key === initialTab) ? initialTab! : 'overview');

    // Cached: revisits show net worth at once and refresh in the background.
    const netWorthQuery = useUserQuery('net-worth', [], async () => {
        const [nwRes, velRes, allocRes] = await Promise.all([
            analyticsAPI.getNetWorth(),
            analyticsAPI.getWealthVelocity(),
            analyticsAPI.getAssetAllocation(),
        ]);
        return {
            current: nwRes.data.current as NetWorthCurrent,
            history: (nwRes.data.history || []) as NetWorthSnapshot[],
            velocity: velRes.data as WealthVelocityData,
            allocation: allocRes.data as AssetAllocationData,
        };
    });
    const current = netWorthQuery.data?.current ?? null;
    const history: NetWorthSnapshot[] = netWorthQuery.data?.history ?? NO_SNAPSHOTS;
    const velocity = netWorthQuery.data?.velocity ?? null;
    const allocation = netWorthQuery.data?.allocation ?? null;
    const loading = netWorthQuery.isPending;

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (netWorthQuery.isError && !netWorthQuery.data) toast.error('Failed to load net worth data');
    }, [netWorthQuery.isError, netWorthQuery.data]);

    if (isLoading || !user || loading || !current) {
        return (
            <>
                <SkeletonCard height={150} />
                <div className="fin-two">
                    <SkeletonCard height={160} />
                    <SkeletonCard height={160} />
                </div>
                <SkeletonCard height={260} />
            </>
        );
    }

    const nwChange = netWorthChange(history);
    const chartData = history.map(h => ({ date: h.snapshot_date, value: h.net_worth }));
    const allMomChanges = velocity?.mom_changes || [];

    // Colours follow the original (unsorted) position so they never change with the sort.
    const allocations = (allocation?.allocations || []).filter(a => a.amount > 0);
    const allocationRows = allocations
        .map((a, i) => ({ a, color: CHART_COLORS[i % CHART_COLORS.length] }))
        .sort((x, y) => Math.abs(y.a.deviation) - Math.abs(x.a.deviation));
    const furthest = furthestFromTarget(allocations);

    const assetRows = sortByAmountDesc([
        { name: 'Investment portfolio', amount: current.total_investments },
        { name: 'Bank balances', amount: current.total_bank_balance },
    ]);
    const liabilityRows = sortByAmountDesc([
        { name: 'Loans outstanding', amount: current.total_loans_outstanding },
        { name: 'Credit cards outstanding', amount: current.total_credit_outstanding },
    ]);

    // Label and display figure at the top of a tab's lead card.
    const leadHead = (label: string, figure: string) => (
        <>
            <p style={{ ...type.label, margin: 0 }}>{label}</p>
            <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{figure}</p>
        </>
    );

    const amountRows = (rows: { name: string; amount: number }[]) => (
        <Rows>
            {rows.map(r => (
                <div key={r.name} style={{ justifyContent: 'space-between' }}>
                    <span style={{ ...type.bodyStrong, ...truncate, minWidth: 0 }}>{r.name}</span>
                    <span style={type.num}>{fmt(r.amount)}</span>
                </div>
            ))}
        </Rows>
    );

    let changeLine: string | null = null;
    if (nwChange) {
        const month = new Date(nwChange.prevLabelDate).toLocaleDateString('en-IN', { month: 'long' });
        const amt = fmt(Math.abs(nwChange.change));
        const pct = Math.abs(nwChange.pct).toFixed(1);
        changeLine = Math.round(nwChange.change) === 0
            ? `No change since ${month}`
            : `${nwChange.change > 0 ? 'Up' : 'Down'} ${amt} (${pct}%) since ${month}`;
    }

    return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                <div className="fin-page-head">
                    <div style={{ minWidth: 0 }}>
                        <p style={{ ...type.meta, margin: 0 }}>Where you stand, how fast it grows, how it is split</p>
                        <h1 style={{ ...type.heading, margin: 0 }}>Net worth</h1>
                    </div>
                </div>

                <Tabs tabs={TABS} active={tab} onChange={setTab} />

                {/* ══ OVERVIEW ══ */}
                {tab === 'overview' && (
                    <>
                        <Card>
                            {leadHead('Net worth', fmt(current.net_worth))}
                            {changeLine && <p style={{ ...type.meta, margin: '6px 0 0' }}>{changeLine}</p>}
                            <div className="dash-stats">
                                <Stat className="dash-stat" label="Assets" value={fmt(current.total_assets)} sub="Bank and investments" />
                                <Stat className="dash-stat" label="Liabilities" value={fmt(current.total_liabilities)} sub="Cards and loans" />
                            </div>
                        </Card>

                        <div className="fin-two">
                            <Card>
                                <CardHeader title="Assets" sub="What you own" action={<span style={type.num}>{fmt(current.total_assets)}</span>} />
                                {amountRows(assetRows)}
                            </Card>
                            <Card>
                                <CardHeader title="Liabilities" sub="What you owe" action={<span style={type.num}>{fmt(current.total_liabilities)}</span>} />
                                {amountRows(liabilityRows)}
                            </Card>
                        </div>

                        <Card>
                            <CardHeader title="History" sub="Updated each time you open the app. Includes every tracked bank account, investment and card." />
                            {chartData.length < 2 ? (
                                <p style={{ ...type.meta, margin: 0 }}>Your net worth history will appear here as data builds up over time.</p>
                            ) : (
                                <NetWorthAreaChart chartData={chartData} />
                            )}
                        </Card>
                    </>
                )}

                {/* ══ VELOCITY ══ */}
                {tab === 'velocity' && (
                    !velocity || velocity.trend === 'insufficient_data' ? (
                        <Card>
                            <p style={{ ...type.meta, margin: 0 }}>
                                {velocity?.message || 'Track your finances for at least 2 months to see wealth velocity.'}
                            </p>
                        </Card>
                    ) : (
                        <>
                            <Card>
                                {leadHead('Average growth a month', fmtSigned(velocity.avg_monthly_growth))}
                                <p style={{ ...type.meta, margin: '6px 0 0' }}>
                                    {fmtPctSigned(velocity.avg_monthly_growth_pct)} a month, and growth is {trendPhrase(velocity.trend)}
                                </p>
                            </Card>

                            <div className="fin-two">
                                <Card>
                                    <CardHeader title="Month by month" sub="Change in net worth by month" />
                                    {allMomChanges.length >= 2 ? (
                                        <div style={{ height: 140 }}>
                                            <VelocityBarChart allMomChanges={allMomChanges} />
                                        </div>
                                    ) : (
                                        <p style={{ ...type.meta, margin: 0 }}>Not enough months yet.</p>
                                    )}
                                </Card>

                                <Card>
                                    <CardHeader title="Net worth history" sub="Newest first" />
                                    <Rows>
                                        {[...velocity.snapshots].reverse().map(s => {
                                            const mom = allMomChanges.find(m => m.to_date === s.snapshot_date);
                                            return (
                                                <div key={s.snapshot_date} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <span style={type.bodyStrong}>
                                                        {new Date(s.snapshot_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                                    </span>
                                                    <div style={{ textAlign: 'right', minWidth: 0 }}>
                                                        <p style={{ ...type.num, margin: 0 }}>{fmt(s.net_worth)}</p>
                                                        <p style={{ ...type.meta, margin: '2px 0 0' }}>
                                                            {mom ? `${fmtSigned(mom.absolute_change)} · ${fmtPctSigned(mom.pct_change)}` : 'First month tracked'}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </Rows>
                                </Card>
                            </div>
                        </>
                    )
                )}

                {/* ══ ALLOCATION ══ */}
                {tab === 'allocation' && (
                    !allocation || allocation.total_assets === 0 ? (
                        <Card>
                            <p style={{ ...type.meta, margin: 0 }}>Add accounts or investments to see your asset allocation.</p>
                        </Card>
                    ) : (
                        <>
                            <Card>
                                {leadHead('Total assets', fmt(allocation.total_assets))}
                                {furthest && (
                                    <p style={{ ...type.meta, margin: '6px 0 0' }}>
                                        {furthest.label} is furthest from target, {Math.round(Math.abs(furthest.deviation))} points {furthest.deviation > 0 ? 'over' : 'under'}.
                                    </p>
                                )}
                                {allocation.recommendation_note && (
                                    <p style={{ ...type.body, margin: '12px 0 0' }}>{allocation.recommendation_note}</p>
                                )}
                            </Card>

                            <Card>
                                <CardHeader title="Where your assets sit" sub="Furthest from target first" />
                                <Rows>
                                    {allocationRows.map(({ a, color }) => {
                                        const dev = deviationLabel(a.deviation);
                                        return (
                                            <div key={a.category} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                                                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, alignSelf: 'center', background: color }} />
                                                    <span style={{ ...type.bodyStrong, ...truncate, flex: 1, minWidth: 0 }}>{a.label}</span>
                                                    <span style={type.numSmall}>{Math.round(a.actual_pct)}%</span>
                                                    <span style={type.num}>{fmt(a.amount)}</span>
                                                </div>
                                                <ProgressBar pct={a.actual_pct} height={4} color="var(--text-secondary)" />
                                                <p style={{ ...type.meta, margin: 0, color: dev.flagged ? TONE_TEXT.caution : undefined }}>
                                                    Target {Math.round(a.recommended_pct)}% · {dev.text}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </Rows>
                            </Card>
                        </>
                    )
                )}
            </div>
    );
}

export default function NetWorthPage() {
    return <Suspense><NetWorthPageInner /></Suspense>;
}
