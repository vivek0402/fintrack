'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';

const DIMENSION_COLORS: Record<string, string> = {
    consistency: '#10b981',
    discipline: '#3b82f6',
    goal_focus: '#f59e0b',
    risk_appetite: '#f43f5e',
    savings_habit: '#8b5cf6',
};

const DIMENSION_LABELS: Record<string, string> = {
    consistency: 'Consistency',
    discipline: 'Discipline',
    goal_focus: 'Goal Focus',
    risk_appetite: 'Risk Appetite',
    savings_habit: 'Savings Habit',
};

export default function PersonalityPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const generate = async () => {
        setLoading(true);
        try {
            const res = await aiAPI.personality();
            setData(res.data);
            setGenerated(true);
        } catch {
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={120} />
        </AppLayout>
    );

    const radarData = data?.dimensions
        ? Object.entries(data.dimensions).map(([key, val]: [string, any]) => ({
            dimension: DIMENSION_LABELS[key] || key,
            score: val.score,
            fullMark: 100,
        }))
        : [];

    const scoreColor = (score: number) => score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#f43f5e';

    return (
        <AppLayout>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Financial Personality</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>AI analysis of your last 90 days</p>
                </div>
                <Button onClick={generate} isLoading={loading} size="md">
                    {generated ? '🔄 Regenerate' : '✨ Analyse My Personality'}
                </Button>
            </div>

            {!generated && !loading && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '20px', padding: '60px', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🧠</div>
                    <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 10px 0' }}>Discover Your Financial DNA</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0 0 24px 0', lineHeight: 1.6, maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
                        AI will analyse your last 90 days of transactions, budgets, and goals to score you across 5 dimensions and assign your financial personality type.
                    </p>
                    <Button onClick={generate} isLoading={loading} size="lg">✨ Generate My Profile</Button>
                </div>
            )}

            {data && (
                <div>
                    {/* Personality type badge */}
                    <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.08))', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '20px', padding: '24px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                        <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', flexShrink: 0 }}>
                            {data.personality_emoji || '🧠'}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{data.personality_type}</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', background: `${scoreColor(data.overall_score)}18`, border: `1px solid ${scoreColor(data.overall_score)}40` }}>
                                    <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '1rem', fontWeight: 700, color: scoreColor(data.overall_score) }}>{data.overall_score}</span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>/100</span>
                                </div>
                            </div>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{data.summary}</p>
                        </div>
                    </div>

                    {/* Radar chart + dimension cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '340px 1fr', gap: '16px', marginBottom: '16px' }}>
                        {/* Radar chart */}
                        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '24px' }}>
                            <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Score Overview</h3>
                            <ResponsiveContainer width="100%" height={260}>
                                <RadarChart data={radarData}>
                                    <PolarGrid stroke="var(--bg-border)" />
                                    <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                                    <Radar name="Score" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} strokeWidth={2} />
                                    <Tooltip
                                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.8rem' }}
                                        formatter={(v: any) => [`${v}/100`, 'Score']}
                                    />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Dimension breakdown */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {data.dimensions && Object.entries(data.dimensions).map(([key, dim]: [string, any]) => (
                                <div key={key} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '14px', padding: '16px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: DIMENSION_COLORS[key] || '#6b7280' }} />
                                            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{DIMENSION_LABELS[key] || key}</span>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: '6px' }}>{dim.label}</span>
                                        </div>
                                        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '1rem', fontWeight: 700, color: scoreColor(dim.score) }}>{dim.score}</span>
                                    </div>
                                    <div style={{ height: '4px', background: 'var(--bg-border)', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
                                        <div style={{ height: '100%', width: `${dim.score}%`, background: DIMENSION_COLORS[key] || '#6b7280', borderRadius: '2px', transition: 'width 0.6s ease' }} />
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{dim.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
