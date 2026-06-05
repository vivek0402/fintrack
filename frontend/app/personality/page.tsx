'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import {
    Brain, Sparkles, TrendingUp, AlertCircle, Lightbulb, Loader2, AlertTriangle,
} from 'lucide-react';

const DIMENSION_META: Record<string, { color: string; icon: string }> = {
    consistency:   { color: 'var(--color-inc)',  icon: '📊' },
    discipline:    { color: 'var(--accent)',      icon: '🎯' },
    goal_focus:    { color: 'var(--color-warn)',  icon: '🏆' },
    risk_appetite: { color: 'var(--color-exp)',   icon: '⚡' },
    savings_habit: { color: 'var(--accent-2)',    icon: '💰' },
};

const DIMENSION_LABELS: Record<string, string> = {
    consistency:   'Consistency',
    discipline:    'Discipline',
    goal_focus:    'Goal Focus',
    risk_appetite: 'Risk Appetite',
    savings_habit: 'Savings Habit',
};

function scoreColor(score: number) {
    if (score >= 70) return 'var(--color-inc)';
    if (score >= 40) return 'var(--color-warn)';
    return 'var(--color-exp)';
}
function scoreLabel(score: number) {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Average';
    return 'Needs Work';
}

const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
};

export default function PersonalityPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const [data, setData]         = useState<any>(null);
    const [loading, setLoading]   = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const generate = async () => {
        setLoading(true); setError('');
        try {
            const res = await aiAPI.personality();
            setData(res.data); setGenerated(true);
        } catch (err: any) {
            setError(err?.response?.data?.message || err?.response?.data?.error || 'Failed to generate profile. Please try again.');
            setData(null);
        } finally { setLoading(false); }
    };

    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={300} />
        </AppLayout>
    );

    const dims = data?.dimensions ? Object.entries(data.dimensions) : [];
    const strengths = dims.filter(([, d]: [string, any]) => d.score >= 65);
    const watchOuts = dims.filter(([, d]: [string, any]) => d.score < 50);

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* Header */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Personality</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>AI spending profile</p>
                        </div>
                        {generated && !loading && (
                            <Button variant="secondary" size="md" onClick={generate}>Refresh</Button>
                        )}
                    </div>
                </div>

                {/* Empty state */}
                {!generated && !loading && !error && (
                    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                        <p style={{ fontSize: '48px', marginBottom: '12px' }}>🧠</p>
                        <p style={{ fontFamily: 'var(--font-head)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>No analysis yet</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>Add some transactions first, then generate your personality report</p>
                        <Button variant="primary" size="md" onClick={generate}><Brain size={15} /> Analyse My Personality</Button>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px' }}>
                        <Loader2 size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>Building your financial profile…</p>
                    </div>
                )}

                {/* Error */}
                {error && !loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '40px' }}>
                        <AlertTriangle size={28} color="var(--color-exp)" />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-body)' }}>{error}</p>
                        <button type="button" onClick={generate} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 20px', color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Try again</button>
                    </div>
                )}

                {/* Result */}
                {generated && data && !loading && (
                    <>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {/* LEFT: Hero card */}
                            <div style={{ flex: '1.2 1 300px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ background: 'color-mix(in srgb, var(--accent-3) 8%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--accent-3) 25%, transparent)', borderRadius: 'var(--radius-lg)', padding: '28px 24px' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                        <Badge color="var(--accent-3)" bg="color-mix(in srgb, var(--accent-3) 15%, transparent)">✦ FINANCIAL PROFILE</Badge>
                                        {data.from_cache && <Badge>Cached</Badge>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '16px' }}>
                                        <div style={{ fontSize: '40px', lineHeight: 1 }}>{data.personality_emoji || '🧠'}</div>
                                        <p style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.1 }}>
                                            {data.personality_type}
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
                                        <div style={{ background: `color-mix(in srgb, ${scoreColor(data.overall_score)} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${scoreColor(data.overall_score)} 30%, transparent)`, borderRadius: '20px', padding: '5px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: scoreColor(data.overall_score), fontVariantNumeric: 'tabular-nums' }}>{data.overall_score}</span>
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>/100</span>
                                        </div>
                                        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{scoreLabel(data.overall_score)}</span>
                                    </div>
                                    <div style={{ height: '1px', background: 'var(--border)', margin: '20px 0' }} />
                                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, fontFamily: 'var(--font-body)' }}>{data.summary}</p>
                                </div>

                                {/* Dimension scores */}
                                <div style={card}>
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 14px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>Dimension scores</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {dims.map(([key, dim]: [string, any]) => {
                                            const meta = DIMENSION_META[key] || { color: 'var(--text-muted)', icon: '•' };
                                            return (
                                                <div key={key}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontSize: '13px' }}>{meta.icon}</span>
                                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{DIMENSION_LABELS[key] || key}</span>
                                                            <Badge color={meta.color} bg={`color-mix(in srgb, ${meta.color} 12%, transparent)`}>{dim.label}</Badge>
                                                        </div>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: scoreColor(dim.score), fontVariantNumeric: 'tabular-nums' }}>{dim.score}</span>
                                                    </div>
                                                    <div style={{ height: '6px', background: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${dim.score}%`, background: meta.color, borderRadius: '3px', transition: 'width 0.8s ease' }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <button type="button" onClick={() => { setGenerated(false); setData(null); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', padding: '0', fontFamily: 'var(--font-body)' }}>
                                    ↻ Regenerate profile
                                </button>
                            </div>

                            {/* RIGHT */}
                            <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={card}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                        <Sparkles size={16} color="var(--accent-2)" />
                                        <span style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Traits</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {dims.map(([key, dim]: [string, any]) => (
                                            <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                <div style={{ width: '6px', height: '6px', borderRadius: '3px', background: 'var(--accent-2)', flexShrink: 0, marginTop: '5px' }} />
                                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>{dim.description}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {strengths.length > 0 && (
                                    <div style={card}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                            <TrendingUp size={16} color="var(--color-inc)" />
                                            <span style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Strengths</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {strengths.map(([key, dim]: [string, any]) => (
                                                <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                    <div style={{ width: '6px', height: '6px', borderRadius: '3px', background: 'var(--color-inc)', flexShrink: 0, marginTop: '5px' }} />
                                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                                                        Strong {DIMENSION_LABELS[key] || key} ({dim.score}/100) — {dim.label}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {watchOuts.length > 0 && (
                                    <div style={card}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                            <AlertCircle size={16} color="var(--color-warn)" />
                                            <span style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Watch Outs</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {watchOuts.map(([key, dim]: [string, any]) => (
                                                <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                    <div style={{ width: '6px', height: '6px', borderRadius: '3px', background: 'var(--color-warn)', flexShrink: 0, marginTop: '5px' }} />
                                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                                                        {DIMENSION_LABELS[key] || key} needs attention ({dim.score}/100) — {dim.label}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tips */}
                        <GCard style={{ background: 'color-mix(in srgb, var(--accent) 4%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <Lightbulb size={16} color="var(--accent)" />
                                <span style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>What to focus on</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {dims.map(([key, dim]: [string, any], i: number) => (
                                    <div key={key} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <div style={{ width: '24px', height: '24px', flexShrink: 0, borderRadius: '12px', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
                                            {i + 1}
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'var(--font-head)' }}>{DIMENSION_LABELS[key] || key}</p>
                                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
                                                {dim.score >= 70 ? `You're doing well here. Maintain your ${dim.label.toLowerCase()} habits.` : dim.score >= 50 ? `Good foundation — push to improve ${DIMENSION_LABELS[key]?.toLowerCase()} toward 70+.` : `Focus area: ${dim.description}`}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </GCard>

                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
                            AI-generated analysis based on your last 90 days of transactions. Results update every 24 hours.
                        </p>
                    </>
                )}
            </div>
        </AppLayout>
    );
}
