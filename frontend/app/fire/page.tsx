'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    ReferenceLine, ReferenceDot, CartesianGrid, Legend,
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { planningAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Flame, TrendingUp, Calculator, Info } from 'lucide-react';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

const fmtAbbrev = (n: number) => {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(1)}Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
    return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
};

const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)' };
const inputSt: React.CSSProperties = { width: '100%', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-mono)' };
const sectionTitleSt: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' };
const sectionSubSt: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px', fontFamily: 'var(--font-body)' };

interface YearsToFire {
    years: number | null;
    months: number | null;
    total_months: number | null;
}

interface FireResult {
    corpus_needed_real: number;
    corpus_needed_nominal: number | null;
    current_net_worth: number;
    monthly_expenses: number;
    monthly_savings: number;
    real_annual_return_pct: number;
    years_to_fire: { base: YearsToFire; step_up_10pct: YearsToFire; extra_10k: YearsToFire };
    fire_date: string | null;
    savings_targets: { target_10yr: number; target_15yr: number; target_20yr: number };
    portfolio_projection: { year: number; portfolio_value: number | null }[];
}

interface SipResult {
    mode: 'goal_based' | 'growth_based';
    sip_amount?: number;
    lumpsum_alternative?: number;
    step_up_sip?: number;
    corpus?: number;
    total_invested: number;
    total_returns: number;
    wealth_ratio: number;
    projection: { year: number; portfolio_value: number }[];
}

// ── Slider ──
function Slider({ label, value, min, max, step, unit = '%', onChange, info }: {
    label: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void; info?: string;
}) {
    return (
        <div>
            <label style={labelSt}>
                {label}
                {info && (
                    <span title={info} style={{ display: 'inline-flex', cursor: 'help' }}>
                        <Info size={12} />
                    </span>
                )}
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 700, textTransform: 'none', letterSpacing: 0 }}>
                    {value}{unit}
                </span>
            </label>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
        </div>
    );
}

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--bg-border-strong)', borderRadius: 8, padding: '8px 12px' }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 4px', fontSize: 12, fontFamily: 'var(--font-body)' }}>Year {label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} style={{ color: p.color, margin: 0, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>
                    {p.name}: {fmtAbbrev(p.value)}
                </p>
            ))}
        </div>
    );
}

export default function FirePage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [tab, setTab] = useState<'fire' | 'sip'>('fire');

    // ── FIRE state ──
    const [fireLoading, setFireLoading] = useState(true);
    const [fireResult, setFireResult] = useState<FireResult | null>(null);
    const [monthlyExpenses, setMonthlyExpenses] = useState('');
    const [expectedReturn, setExpectedReturn] = useState(12);
    const [inflation, setInflation] = useState(6);
    const [swr, setSwr] = useState(4);
    const [extraSavings, setExtraSavings] = useState('0');
    const [recalcLoading, setRecalcLoading] = useState(false);

    // ── SIP state ──
    const [sipMode, setSipMode] = useState<'goal_based' | 'growth_based'>('goal_based');
    const [goalAmount, setGoalAmount] = useState('5000000');
    const [monthlySip, setMonthlySip] = useState('10000');
    const [targetYears, setTargetYears] = useState(15);
    const [sipReturn, setSipReturn] = useState(12);
    const [sipResult, setSipResult] = useState<SipResult | null>(null);
    const [sipLoading, setSipLoading] = useState(false);
    const sipDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const runFire = (overrides: Record<string, any> = {}) => {
        const params = {
            monthly_expenses: monthlyExpenses ? parseFloat(monthlyExpenses) : undefined,
            expected_annual_return_pct: expectedReturn,
            inflation_pct: inflation,
            swr_pct: swr,
            extra_monthly_savings: extraSavings ? parseFloat(extraSavings) : 0,
            ...overrides,
        };
        return planningAPI.computeFire(params)
            .then(res => {
                setFireResult(res.data);
                if (!monthlyExpenses) setMonthlyExpenses(String(res.data.monthly_expenses));
            })
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); });
    };

    useEffect(() => {
        if (!user) return;
        setFireLoading(true);
        planningAPI.computeFire({})
            .then(res => {
                setFireResult(res.data);
                setMonthlyExpenses(String(res.data.monthly_expenses));
            })
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => setFireLoading(false));
    }, [user]);

    const recalculateFire = () => {
        setRecalcLoading(true);
        runFire().finally(() => setRecalcLoading(false));
    };

    // ── SIP debounced calc ──
    useEffect(() => {
        if (!user) return;
        if (sipDebounceRef.current) clearTimeout(sipDebounceRef.current);
        sipDebounceRef.current = setTimeout(() => {
            const base = { mode: sipMode, target_years: targetYears, expected_annual_return_pct: sipReturn };
            const goal = goalAmount ? parseFloat(goalAmount) : 0;
            const sip = monthlySip ? parseFloat(monthlySip) : 0;

            if (sipMode === 'goal_based' && (!goal || goal <= 0)) return;
            if (sipMode === 'growth_based' && (!sip || sip <= 0)) return;

            const params = sipMode === 'goal_based'
                ? { ...base, goal_amount: goal }
                : { ...base, monthly_sip: sip };

            setSipLoading(true);
            planningAPI.computeSip(params)
                .then(res => setSipResult(res.data))
                .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
                .finally(() => setSipLoading(false));
        }, 400);
        return () => { if (sipDebounceRef.current) clearTimeout(sipDebounceRef.current); };
    }, [user, sipMode, goalAmount, monthlySip, targetYears, sipReturn]);

    if (isLoading || !user) {
        return (
            <AppLayout>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {[1, 2, 3].map(i => <SkeletonCard key={i} height={140} />)}
                </div>
            </AppLayout>
        );
    }

    // ── derived FIRE values ──
    const progressPct = fireResult && fireResult.corpus_needed_real > 0
        ? Math.min(100, (fireResult.current_net_worth / fireResult.corpus_needed_real) * 100)
        : 0;

    const scenarioTiles = fireResult ? [
        { key: 'base', label: 'Base scenario', data: fireResult.years_to_fire.base },
        { key: 'step_up_10pct', label: 'Step-up SIP (+10%/yr)', data: fireResult.years_to_fire.step_up_10pct },
        { key: 'extra_10k', label: 'Extra ₹10,000/month', data: fireResult.years_to_fire.extra_10k },
    ] : [];

    const earliestMonths = scenarioTiles.length > 0
        ? Math.min(...scenarioTiles.map(t => t.data.total_months ?? Infinity))
        : Infinity;

    // chart crossing point
    let crossingYear: number | null = null;
    if (fireResult) {
        const proj = fireResult.portfolio_projection;
        for (let i = 0; i < proj.length; i++) {
            if (proj[i].portfolio_value !== null && proj[i].portfolio_value! >= fireResult.corpus_needed_real) {
                crossingYear = proj[i].year;
                break;
            }
        }
    }

    // ── SIP wealth chart data ──
    let sipChartData: { year: number; invested: number; returns: number }[] = [];
    if (sipResult) {
        const monthlyAmount = sipResult.mode === 'goal_based' ? (sipResult.sip_amount ?? 0) : (monthlySip ? parseFloat(monthlySip) : 0);
        sipChartData = sipResult.projection.map(p => {
            const invested = monthlyAmount * p.year * 12;
            return {
                year: p.year,
                invested: parseFloat(invested.toFixed(2)),
                returns: parseFloat(Math.max(0, p.portfolio_value - invested).toFixed(2)),
            };
        });
    }

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        FIRE & SIP Planning
                    </h1>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                        Plan your path to financial independence and optimize your investment contributions
                    </p>
                </div>

                {/* ── TAB TOGGLE ── */}
                <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', padding: '4px', width: 'fit-content' }}>
                    <button
                        onClick={() => setTab('fire')}
                        style={{
                            padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
                            background: tab === 'fire' ? 'var(--accent)' : 'transparent',
                            color: tab === 'fire' ? '#fff' : 'var(--text-secondary)',
                            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 150ms ease',
                        }}
                    >
                        <Flame size={14} /> FIRE Calculator
                    </button>
                    <button
                        onClick={() => setTab('sip')}
                        style={{
                            padding: '8px 18px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
                            background: tab === 'sip' ? 'var(--accent)' : 'transparent',
                            color: tab === 'sip' ? '#fff' : 'var(--text-secondary)',
                            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 150ms ease',
                        }}
                    >
                        <TrendingUp size={14} /> SIP Optimizer
                    </button>
                </div>

                {/* ══════════════ FIRE CALCULATOR ══════════════ */}
                {tab === 'fire' && (
                    fireLoading || !fireResult ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {[1, 2, 3].map(i => <SkeletonCard key={i} height={140} />)}
                        </div>
                    ) : (
                        <>
                            {/* ── INPUTS ── */}
                            <Card>
                                <p style={sectionTitleSt}><Calculator size={16} /> Assumptions</p>
                                <p style={sectionSubSt}>Tune your assumptions and recalculate your FIRE plan</p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                                    <div>
                                        <label style={labelSt}>Monthly expenses (₹)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1000"
                                            value={monthlyExpenses}
                                            onChange={e => setMonthlyExpenses(e.target.value)}
                                            style={inputSt}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelSt}>Additional savings beyond your current average (₹/mo)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="500"
                                            value={extraSavings}
                                            onChange={e => setExtraSavings(e.target.value)}
                                            style={inputSt}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '16px' }}>
                                    <Slider label="Expected annual return" value={expectedReturn} min={8} max={18} step={0.5} onChange={setExpectedReturn} />
                                    <Slider label="Annual inflation" value={inflation} min={3} max={9} step={0.5} onChange={setInflation} />
                                    <Slider
                                        label="Safe withdrawal rate"
                                        value={swr}
                                        min={3} max={5} step={0.25}
                                        onChange={setSwr}
                                        info="The % of your corpus you withdraw each year in retirement. Lower SWR = larger corpus needed but safer."
                                    />
                                </div>
                                <Button onClick={recalculateFire} isLoading={recalcLoading}>
                                    <Calculator size={14} /> Recalculate
                                </Button>
                            </Card>

                            {/* ── HERO RESULT ── */}
                            <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px' }}>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                                    Corpus needed to retire
                                </p>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '52px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                                    {fmt(fireResult.corpus_needed_real)}
                                </p>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px', fontFamily: 'var(--font-body)' }}>
                                    at {fmt(fireResult.monthly_expenses)}/month expenses with {swr}% SWR
                                </p>
                                <ProgressBar pct={progressPct} />
                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '8px 0 0', fontFamily: 'var(--font-body)' }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(fireResult.current_net_worth)}</span> of <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(fireResult.corpus_needed_real)}</span> saved ({progressPct.toFixed(1)}%)
                                </p>
                            </div>

                            {/* ── SCENARIO TILES ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                                {scenarioTiles.map(tile => {
                                    const isEarliest = tile.data.total_months !== null && tile.data.total_months === earliestMonths && earliestMonths !== Infinity;
                                    return (
                                        <div
                                            key={tile.key}
                                            style={{
                                                background: 'var(--bg-surface-1)',
                                                border: isEarliest ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                                                borderRadius: 'var(--radius-lg)',
                                                padding: '16px',
                                            }}
                                        >
                                            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>
                                                {tile.label}
                                            </p>
                                            {tile.data.total_months !== null ? (
                                                <>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', fontVariantNumeric: 'tabular-nums' }}>
                                                        {tile.data.years}y {tile.data.months}m
                                                    </p>
                                                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                                        FIRE date: {new Date(new Date().setMonth(new Date().getMonth() + tile.data.total_months)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                                    </p>
                                                </>
                                            ) : (
                                                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Not reachable within 100 years</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ── SAVINGS TARGETS ── */}
                            <Card>
                                <p style={sectionTitleSt}>Monthly Savings Targets</p>
                                <p style={sectionSubSt}>How much you'd need to save monthly to FIRE within a fixed horizon</p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                                    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '14px', background: 'var(--bg-surface-2)' }}>
                                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Retire in 10 years</p>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(fireResult.savings_targets.target_10yr)}/mo</p>
                                    </div>
                                    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '14px', background: 'var(--bg-surface-2)' }}>
                                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Retire in 15 years</p>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(fireResult.savings_targets.target_15yr)}/mo</p>
                                    </div>
                                    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '14px', background: 'var(--bg-surface-2)' }}>
                                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Retire in 20 years</p>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(fireResult.savings_targets.target_20yr)}/mo</p>
                                    </div>
                                </div>
                            </Card>

                            {/* ── PORTFOLIO GROWTH CHART ── */}
                            <Card>
                                <p style={sectionTitleSt}><TrendingUp size={16} /> Portfolio Growth Projection</p>
                                <p style={sectionSubSt}>
                                    {crossingYear !== null
                                        ? `Your portfolio crosses your FIRE number around year ${crossingYear}.`
                                        : 'Projected portfolio value vs. the corpus you need to retire.'}
                                </p>
                                <div style={{ width: '100%', height: 280 }}>
                                    <ResponsiveContainer>
                                        <AreaChart data={fireResult.portfolio_projection}>
                                            <defs>
                                                <linearGradient id="fireGrowth" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="var(--accent-mint, #00e5a0)" stopOpacity={0.2} />
                                                    <stop offset="100%" stopColor="var(--accent-mint, #00e5a0)" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid vertical={false} stroke="var(--bg-border)" />
                                            <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} label={{ value: 'Years from today', position: 'insideBottom', offset: -2, fontSize: 11, fill: 'var(--text-muted)' }} />
                                            <YAxis tickFormatter={fmtAbbrev} tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={70} />
                                            <Tooltip content={<ChartTooltip />} />
                                            <Area type="monotone" dataKey="portfolio_value" name="Portfolio" stroke="var(--color-inc)" strokeWidth={1.5} fill="url(#fireGrowth)" animationDuration={600} />
                                            <ReferenceLine y={fireResult.corpus_needed_real} stroke="var(--accent-amber, #f59e0b)" strokeDasharray="4 4" label={{ value: 'FIRE number', position: 'insideTopRight', fontSize: 11, fill: 'var(--accent-amber, #f59e0b)' }} />
                                            {crossingYear !== null && (
                                                <ReferenceDot x={crossingYear} y={fireResult.corpus_needed_real} r={5} fill="var(--accent-amber, #f59e0b)" stroke="var(--bg-surface-1)" strokeWidth={2} />
                                            )}
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </Card>
                        </>
                    )
                )}

                {/* ══════════════ SIP OPTIMIZER ══════════════ */}
                {tab === 'sip' && (
                    <>
                        {/* ── MODE TOGGLE + INPUTS ── */}
                        <Card>
                            <p style={sectionTitleSt}><TrendingUp size={16} /> SIP Optimizer</p>
                            <p style={sectionSubSt}>Find the SIP that gets you to your goal, or project where your current SIP lands</p>

                            <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', padding: '4px', width: 'fit-content', marginBottom: '16px' }}>
                                <button
                                    onClick={() => setSipMode('goal_based')}
                                    style={{
                                        padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                                        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12,
                                        background: sipMode === 'goal_based' ? 'var(--accent)' : 'transparent',
                                        color: sipMode === 'goal_based' ? '#fff' : 'var(--text-secondary)', transition: 'all 150ms ease',
                                    }}
                                >
                                    Goal Based
                                </button>
                                <button
                                    onClick={() => setSipMode('growth_based')}
                                    style={{
                                        padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                                        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12,
                                        background: sipMode === 'growth_based' ? 'var(--accent)' : 'transparent',
                                        color: sipMode === 'growth_based' ? '#fff' : 'var(--text-secondary)', transition: 'all 150ms ease',
                                    }}
                                >
                                    Growth Based
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                                {sipMode === 'goal_based' ? (
                                    <div>
                                        <label style={labelSt}>Goal amount (₹)</label>
                                        <input type="number" min="0" step="10000" value={goalAmount} onChange={e => setGoalAmount(e.target.value)} style={inputSt} />
                                    </div>
                                ) : (
                                    <div>
                                        <label style={labelSt}>Monthly SIP amount (₹)</label>
                                        <input type="number" min="0" step="500" value={monthlySip} onChange={e => setMonthlySip(e.target.value)} style={inputSt} />
                                    </div>
                                )}
                                <Slider label={sipMode === 'goal_based' ? 'Target years' : 'Investment years'} value={targetYears} min={1} max={40} step={1} unit="y" onChange={setTargetYears} />
                                <Slider label="Expected return" value={sipReturn} min={8} max={18} step={0.5} onChange={setSipReturn} />
                            </div>
                        </Card>

                        {sipLoading && !sipResult ? (
                            <SkeletonCard height={200} />
                        ) : sipResult ? (
                            <>
                                {/* ── HERO RESULT ── */}
                                <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px' }}>
                                    {sipResult.mode === 'goal_based' ? (
                                        <>
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                                                Monthly SIP needed
                                            </p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '52px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                                                {fmt(sipResult.sip_amount ?? 0)}<span style={{ fontSize: 20, color: 'var(--text-secondary)' }}>/mo</span>
                                            </p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                                <p style={{ margin: 0 }}>
                                                    Step-up alternative: start at <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(sipResult.step_up_sip ?? 0)}</strong>/month, increase 10% yearly
                                                </p>
                                                <p style={{ margin: 0 }}>
                                                    Or invest <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(sipResult.lumpsum_alternative ?? 0)}</strong> as a lumpsum today
                                                </p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                                                Corpus at end of {targetYears} years
                                            </p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '52px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                                                {fmt(sipResult.corpus ?? 0)}
                                            </p>
                                        </>
                                    )}
                                </div>

                                {/* ── INVESTED / RETURNS / WEALTH RATIO ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                                    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '14px', background: 'var(--bg-surface-2)' }}>
                                        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Total Invested</p>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(sipResult.total_invested)}</p>
                                    </div>
                                    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '14px', background: 'var(--bg-surface-2)' }}>
                                        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Total Returns</p>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--color-inc)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(sipResult.total_returns)}</p>
                                    </div>
                                    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '14px', background: 'var(--bg-surface-2)' }}>
                                        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Wealth Ratio</p>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{sipResult.wealth_ratio}x</p>
                                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>Your money multiplies {sipResult.wealth_ratio} times</p>
                                    </div>
                                </div>

                                {/* ── WEALTH BUILD CHART ── */}
                                <Card>
                                    <p style={sectionTitleSt}><TrendingUp size={16} /> Wealth Build-Up</p>
                                    <p style={sectionSubSt}>Invested principal vs. returns generated, year by year</p>
                                    <div style={{ width: '100%', height: 280 }}>
                                        <ResponsiveContainer>
                                            <BarChart data={sipChartData}>
                                                <CartesianGrid vertical={false} stroke="var(--bg-border)" />
                                                <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                                                <YAxis tickFormatter={fmtAbbrev} tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={70} />
                                                <Tooltip content={<ChartTooltip />} />
                                                <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'var(--font-body)' }} />
                                                <Bar dataKey="invested" name="Invested" stackId="a" fill="var(--text-muted)" animationDuration={600} />
                                                <Bar dataKey="returns" name="Returns" stackId="a" fill="var(--color-inc)" radius={[4, 4, 0, 0]} animationDuration={600} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Card>
                            </>
                        ) : null}
                    </>
                )}
            </div>
        </AppLayout>
    );
}
