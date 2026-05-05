'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import {
    Brain, Sparkles, TrendingUp, AlertCircle, Lightbulb, Loader2, AlertTriangle,
} from 'lucide-react';
import { FadeIn } from '@/components/ui/FadeIn';

const DIMENSION_META: Record<string, { color: string; icon: string }> = {
    consistency: { color: '#10b981', icon: '📊' },
    discipline:  { color: '#3b82f6', icon: '🎯' },
    goal_focus:  { color: '#f59e0b', icon: '🏆' },
    risk_appetite: { color: '#f43f5e', icon: '⚡' },
    savings_habit: { color: '#8b5cf6', icon: '💰' },
};

const DIMENSION_LABELS: Record<string, string> = {
    consistency:   'Consistency',
    discipline:    'Discipline',
    goal_focus:    'Goal Focus',
    risk_appetite: 'Risk Appetite',
    savings_habit: 'Savings Habit',
};

function scoreColor(score: number) {
    if (score >= 70) return 'var(--accent-green)';
    if (score >= 40) return 'var(--accent-yellow)';
    return 'var(--accent-red)';
}

function scoreLabel(score: number) {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Average';
    return 'Needs Work';
}

const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--bg-border)',
    borderRadius: '16px',
    padding: '20px 24px',
};

const generateBtn: React.CSSProperties = {
    background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'DM Sans, sans-serif',
};

export default function PersonalityPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const generate = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await aiAPI.personality();
            setData(res.data);
            setGenerated(true);
        } catch (err: any) {
            setError(err?.response?.data?.message || err?.response?.data?.error || 'Failed to generate profile. Please try again.');
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={24} color="var(--accent-blue)" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );

    const dims = data?.dimensions ? Object.entries(data.dimensions) : [];
    const strengths = dims.filter(([, d]: [string, any]) => d.score >= 65);
    const watchOuts = dims.filter(([, d]: [string, any]) => d.score < 50);

    return (
        <AppLayout>
            <PageShell
                title="Personality"
                subtitle="AI spending profile"
                headerRight={
                    generated && !loading ? (
                        <Button variant="secondary" size="md" onClick={generate}>Refresh</Button>
                    ) : undefined
                }
            >
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>

                {/* State 1 — Initial / Empty */}
                {!generated && !loading && !error && (
                    <EmptyState
                        icon={Brain}
                        title="No analysis yet"
                        subtitle="Add some transactions first, then generate your personality report"
                        action={
                            <Button variant="primary" size="md" onClick={generate}>
                                <Brain size={15} /> Analyse My Personality
                            </Button>
                        }
                    />
                )}

                {/* State 2 — Loading */}
                {loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px' }}>
                        <Loader2 size={28} color="var(--accent-purple)" style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                            Building your financial profile…
                        </p>
                    </div>
                )}

                {/* State 3 — Error */}
                {error && !loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '40px' }}>
                        <AlertTriangle size={28} color="var(--accent-red)" />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center' }}>{error}</p>
                        <button type="button" onClick={generate} style={{
                            background: 'none', border: '1px solid var(--bg-border)',
                            borderRadius: '8px', padding: '8px 20px', color: 'var(--text-primary)',
                            fontSize: '14px', cursor: 'pointer',
                        }}>
                            Try again
                        </button>
                    </div>
                )}

                {/* State 4 — Result */}
                {generated && data && !loading && (
                    <FadeIn>
                    <>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {/* LEFT: Hero card */}
                            <div style={{ flex: '1.2 1 300px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(59,130,246,0.08))',
                                    border: '1px solid rgba(168,85,247,0.3)',
                                    borderRadius: '16px',
                                    padding: '28px 24px',
                                }}>
                                    {/* Badge */}
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{
                                            background: 'rgba(168,85,247,0.2)',
                                            color: 'var(--accent-purple)',
                                            borderRadius: '20px',
                                            padding: '4px 16px',
                                            fontFamily: 'Sora, sans-serif',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                        }}>
                                            ✦ FINANCIAL PROFILE
                                        </div>
                                        {data.from_cache && (
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '6px', padding: '2px 8px' }}>
                                                Cached
                                            </span>
                                        )}
                                    </div>

                                    {/* Emoji + Score row */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '16px' }}>
                                        <div style={{ fontSize: '40px', lineHeight: 1 }}>{data.personality_emoji || '🧠'}</div>
                                        <div>
                                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.1 }}>
                                                {data.personality_type}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Score */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
                                        <div style={{
                                            background: `${scoreColor(data.overall_score)}18`,
                                            border: `1px solid ${scoreColor(data.overall_score)}40`,
                                            borderRadius: '20px', padding: '5px 14px',
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                        }}>
                                            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '22px', fontWeight: 700, color: scoreColor(data.overall_score) }}>
                                                {data.overall_score}
                                            </span>
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/100</span>
                                        </div>
                                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                            {scoreLabel(data.overall_score)}
                                        </span>
                                    </div>

                                    {/* Divider */}
                                    <div style={{ height: '1px', background: 'var(--bg-border)', margin: '20px 0' }} />

                                    {/* Summary */}
                                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                                        {data.summary}
                                    </p>
                                </div>

                                {/* Score overview card */}
                                <div style={card}>
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 14px', fontWeight: 600 }}>
                                        Dimension scores
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {dims.map(([key, dim]: [string, any]) => {
                                            const meta = DIMENSION_META[key] || { color: '#6b7280', icon: '•' };
                                            return (
                                                <div key={key}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontSize: '13px' }}>{meta.icon}</span>
                                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                                {DIMENSION_LABELS[key] || key}
                                                            </span>
                                                            <span style={{
                                                                fontSize: '11px', color: meta.color,
                                                                background: `${meta.color}18`,
                                                                borderRadius: '4px', padding: '1px 6px',
                                                            }}>
                                                                {dim.label}
                                                            </span>
                                                        </div>
                                                        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 700, color: scoreColor(dim.score) }}>
                                                            {dim.score}
                                                        </span>
                                                    </div>
                                                    <div style={{ height: '6px', background: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%',
                                                            width: `${dim.score}%`,
                                                            background: meta.color,
                                                            borderRadius: '3px',
                                                            transition: 'width 0.8s ease',
                                                        }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Regenerate */}
                                <button type="button" onClick={() => { setGenerated(false); setData(null); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', padding: '0' }}>
                                    ↻ Regenerate profile
                                </button>
                            </div>

                            {/* RIGHT: Traits / Strengths / Watch outs */}
                            <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {/* Traits — all dimension descriptions */}
                                <div style={card}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                        <Sparkles size={16} color="var(--accent-purple)" />
                                        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            Traits
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {dims.map(([key, dim]: [string, any]) => (
                                            <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                <div style={{
                                                    width: '6px', height: '6px', borderRadius: '3px',
                                                    background: 'var(--accent-purple)',
                                                    flexShrink: 0, marginTop: '5px',
                                                }} />
                                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                                    {dim.description}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Strengths */}
                                {strengths.length > 0 && (
                                    <div style={card}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                            <TrendingUp size={16} color="var(--accent-green)" />
                                            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                Strengths
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {strengths.map(([key, dim]: [string, any]) => (
                                                <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                    <div style={{ width: '6px', height: '6px', borderRadius: '3px', background: 'var(--accent-green)', flexShrink: 0, marginTop: '5px' }} />
                                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                                        Strong {DIMENSION_LABELS[key] || key} ({dim.score}/100) — {dim.label}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Watch outs */}
                                {watchOuts.length > 0 && (
                                    <div style={card}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                            <AlertCircle size={16} color="var(--accent-yellow)" />
                                            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                Watch Outs
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {watchOuts.map(([key, dim]: [string, any]) => (
                                                <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                    <div style={{ width: '6px', height: '6px', borderRadius: '3px', background: 'var(--accent-yellow)', flexShrink: 0, marginTop: '5px' }} />
                                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                                        {DIMENSION_LABELS[key] || key} needs attention ({dim.score}/100) — {dim.label}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tips — full width */}
                        <div style={{ ...card, marginTop: '16px', background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.18)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <Lightbulb size={16} color="var(--accent-blue)" />
                                <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    What to focus on
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {dims.map(([key, dim]: [string, any], i: number) => (
                                    <div key={key} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <div style={{
                                            width: '24px', height: '24px', flexShrink: 0,
                                            borderRadius: '12px',
                                            background: 'rgba(59,130,246,0.15)',
                                            color: 'var(--accent-blue)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: '13px',
                                        }}>
                                            {i + 1}
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                                                {DIMENSION_LABELS[key] || key}
                                            </p>
                                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                                                {dim.score >= 70
                                                    ? `You're doing well here. Maintain your ${dim.label.toLowerCase()} habits.`
                                                    : dim.score >= 50
                                                    ? `Good foundation — push to improve ${DIMENSION_LABELS[key]?.toLowerCase()} toward 70+.`
                                                    : `Focus area: ${dim.description}`}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>
                            AI-generated analysis based on your last 90 days of transactions. Results update every 24 hours.
                        </p>
                    </>
                    </FadeIn>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </PageShell>
        </AppLayout>
    );
}
