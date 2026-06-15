'use client';

import { useEffect, useState } from 'react';
import {
    Brain, RefreshCw, CheckCircle2, AlertTriangle,
    Utensils, Home, Car, Tv, ShoppingBag, HeartPulse, GraduationCap, PiggyBank,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { insightsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/Skeleton';

const GROUP_ICONS: Record<string, any> = {
    food_dining: Utensils,
    housing_rent: Home,
    transport: Car,
    entertainment_subscriptions: Tv,
    shopping_clothing: ShoppingBag,
    health_wellness: HeartPulse,
    education: GraduationCap,
    savings_investments: PiggyBank,
};

const PATTERN_LABELS: Record<string, string> = {
    budget_anchoring: 'Budget Anchoring',
    present_bias: 'Present Bias (Early-Month Spending)',
    subscription_bloat: 'Subscription Bloat',
    category_regret_concentration: 'Regret Concentration',
    idle_savings_despite_debt: 'Idle Savings Despite Debt',
};

const INCOME_BRACKET_LABELS: Record<string, string> = {
    under_5L: 'Under ₹5L/year',
    five_to_10L: '₹5L–10L/year',
    ten_to_20L: '₹10L–20L/year',
    above_20L: 'Above ₹20L/year',
};

function statusBadge(status: string, isSavings: boolean) {
    if (status === 'below_benchmark') {
        return isSavings
            ? { label: 'Below', color: 'var(--color-exp)', bg: 'color-mix(in srgb, var(--color-exp) 10%, transparent)' }
            : { label: 'Below', color: 'var(--color-inc)', bg: 'color-mix(in srgb, var(--color-inc) 10%, transparent)' };
    }
    if (status === 'above_benchmark') {
        return isSavings
            ? { label: 'Above', color: 'var(--color-inc)', bg: 'color-mix(in srgb, var(--color-inc) 10%, transparent)' }
            : { label: 'Above', color: 'var(--color-warn)', bg: 'color-mix(in srgb, var(--color-warn) 10%, transparent)' };
    }
    return { label: 'Within', color: 'var(--color-info)', bg: 'color-mix(in srgb, var(--color-info) 10%, transparent)' };
}

// ── Benchmark range bar with user position marker ───────────────────────────
function BenchmarkBar({ userPct, min, max }: { userPct: number; min: number; max: number }) {
    const scaleMax = Math.max(max * 1.4, userPct * 1.15, 10);
    const minPos = (min / scaleMax) * 100;
    const maxPos = (max / scaleMax) * 100;
    const userPos = Math.min(100, (userPct / scaleMax) * 100);

    return (
        <div style={{ position: 'relative', height: '8px', background: 'var(--bg-alt)', borderRadius: '999px', marginTop: '6px' }}>
            <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${minPos}%`, width: `${Math.max(maxPos - minPos, 1)}%`,
                background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius: '999px',
            }} />
            <div style={{
                position: 'absolute', top: '-3px', left: `calc(${userPos}% - 2px)`,
                width: '4px', height: '14px', borderRadius: '2px', background: 'var(--accent)',
            }} />
        </div>
    );
}

export default function InsightsPage() {
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const [tab, setTab] = useState<'benchmarks' | 'behavioral'>('benchmarks');

    const [benchmarks, setBenchmarks] = useState<any>(null);
    const [benchmarksLoading, setBenchmarksLoading] = useState(true);

    const [patterns, setPatterns] = useState<any>(null);
    const [patternsLoading, setPatternsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);

    useEffect(() => {
        if (!user) return;
        insightsAPI.getPeerBenchmarks().then(res => setBenchmarks(res.data)).catch(() => {}).finally(() => setBenchmarksLoading(false));
        insightsAPI.getBehavioralPatterns().then(res => setPatterns(res.data)).catch(() => {}).finally(() => setPatternsLoading(false));
    }, [user]);

    const refreshPatterns = async () => {
        setRefreshing(true);
        try {
            const res = await insightsAPI.getBehavioralPatterns();
            setPatterns(res.data);
        } catch {} finally { setRefreshing(false); }
    };

    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={60} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={300} />
        </AppLayout>
    );

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px' }}>
                <div>
                    <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        Insights
                    </h1>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                        How you compare to peers, and patterns in your spending behavior.
                    </p>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border)' }}>
                    {[
                        { key: 'benchmarks', label: 'Peer Benchmarks' },
                        { key: 'behavioral', label: 'Behavioral Patterns' },
                    ].map(t => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key as any)}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: '10px 4px', marginRight: '16px',
                                fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-body)',
                                color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
                                borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                                marginBottom: '-1px',
                            }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ── TAB 1: PEER BENCHMARKS ── */}
                {tab === 'benchmarks' && (
                    benchmarksLoading ? (
                        <SkeletonCard height={400} />
                    ) : !benchmarks ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Could not load peer benchmarks.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', padding: '5px 14px', borderRadius: '20px', background: 'var(--accent-light)', border: '1px solid var(--accent-border)' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-body)' }}>
                                    Based on your income bracket: {INCOME_BRACKET_LABELS[benchmarks.income_bracket] || benchmarks.income_bracket}
                                </span>
                            </div>

                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 18px' }}>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{benchmarks.summary}</p>
                            </div>

                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                {benchmarks.benchmark_groups.map((g: any, idx: number) => {
                                    const Icon = GROUP_ICONS[g.group] || PiggyBank;
                                    const badge = statusBadge(g.status, false);
                                    return (
                                        <div key={g.group} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderBottom: idx < benchmarks.benchmark_groups.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--bg-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <Icon size={16} color="var(--text-secondary)" />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{g.label}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{g.user_pct}%</span>
                                                </div>
                                                <BenchmarkBar userPct={g.user_pct} min={g.benchmark_min} max={g.benchmark_max} />
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                                    Benchmark: {g.benchmark_min}% – {g.benchmark_max}%
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '11px', fontWeight: 700, color: badge.color, background: badge.bg, padding: '3px 10px', borderRadius: '20px', flexShrink: 0, fontFamily: 'var(--font-body)' }}>
                                                {badge.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Savings rate comparison */}
                            {benchmarks.savings_rate_comparison && (() => {
                                const s = benchmarks.savings_rate_comparison;
                                const badge = statusBadge(s.status, true);
                                return (
                                    <div>
                                        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Savings Rate</h2>
                                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 18px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--bg-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <PiggyBank size={16} color="var(--text-secondary)" />
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>Your savings rate</span>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{s.user_pct}%</span>
                                                    </div>
                                                    <BenchmarkBar userPct={s.user_pct} min={s.benchmark_min} max={s.benchmark_max} />
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                                        Benchmark: {s.benchmark_min}% – {s.benchmark_max}%
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '11px', fontWeight: 700, color: badge.color, background: badge.bg, padding: '3px 10px', borderRadius: '20px', flexShrink: 0, fontFamily: 'var(--font-body)' }}>
                                                    {badge.label}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )
                )}

                {/* ── TAB 2: BEHAVIORAL PATTERNS ── */}
                {tab === 'behavioral' && (
                    patternsLoading ? (
                        <SkeletonCard height={400} />
                    ) : !patterns ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Could not load behavioral patterns.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* AI insight card */}
                            <div style={{ background: 'var(--accent-light)', border: '1.5px solid var(--accent-border)', borderRadius: 'var(--radius-xl)', padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Brain size={18} color="white" />
                                </div>
                                <div>
                                    <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>
                                        AI Insight
                                    </p>
                                    <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0, fontFamily: 'var(--font-body)' }}>
                                        {patterns.ai_insight}
                                    </p>
                                </div>
                            </div>

                            <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', padding: '5px 14px', borderRadius: '20px', background: 'var(--bg-alt)', border: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                    {patterns.detected_count} of 5 patterns detected in your spending
                                </span>
                            </div>

                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                {patterns.patterns.map((p: any, idx: number) => (
                                    <div key={p.pattern_name} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 18px', borderBottom: idx < patterns.patterns.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.detected ? 'color-mix(in srgb, var(--color-warn) 12%, transparent)' : 'color-mix(in srgb, var(--color-inc) 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            {p.detected
                                                ? <AlertTriangle size={15} color="var(--color-warn)" />
                                                : <CheckCircle2 size={15} color="var(--color-inc)" />}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>
                                                {PATTERN_LABELS[p.pattern_name] || p.pattern_name}
                                            </p>
                                            {p.detected ? (
                                                <>
                                                    <p style={{ fontSize: '12px', color: 'var(--color-warn)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>
                                                        {patternContext(p)}
                                                    </p>
                                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                                                        {p.description}
                                                    </p>
                                                </>
                                            ) : (
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                                    No signs of this pattern in your recent data.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <Button onClick={refreshPatterns} isLoading={refreshing} variant="secondary" style={{ alignSelf: 'flex-start' }}>
                                <RefreshCw size={14} /> Refresh
                            </Button>
                        </div>
                    )
                )}
            </div>
        </AppLayout>
    );
}

// ── Human-readable context for detected patterns ─────────────────────────────
function patternContext(p: any): string {
    const d = p.supporting_data || {};
    switch (p.pattern_name) {
        case 'budget_anchoring': {
            const cats = (d.categories || []).filter((c: any) => c.near_limit_months >= 2);
            if (cats.length === 0) return '';
            const total = d.categories?.[0]?.total_months ?? cats[0].near_limit_months;
            return `You spent 85-100% of budget in ${cats[0].near_limit_months} out of ${total} months in ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}.`;
        }
        case 'present_bias':
            return `You spend ₹${Math.round(d.first_half_avg_daily || 0)}/day in the first half of the month vs ₹${Math.round(d.second_half_avg_daily || 0)}/day in the second half.`;
        case 'subscription_bloat':
            return `${d.recurring_subscription_count} recurring subscriptions detected over the last 3 months.`;
        case 'category_regret_concentration':
            return `${d.top_category_pct}% of your regretted purchases (${d.total_regretted} total) were in ${d.top_category}.`;
        case 'idle_savings_despite_debt':
            return `₹${Math.round(d.bank_balance || 0).toLocaleString('en-IN')} in savings vs ₹${Math.round(d.credit_card_outstanding || 0).toLocaleString('en-IN')} in credit card debt.`;
        default:
            return '';
    }
}
