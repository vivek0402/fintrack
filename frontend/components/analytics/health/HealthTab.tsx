'use client';

import type { CSSProperties } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Skeleton } from '@/components/ui/Skeleton';
import type { HealthScoreResult, ScoreFactor } from '@/lib/healthScore';
import { ScoreRing } from './ScoreRing';
import { HealthReportPanel } from './HealthReportPanel';
import { useHealthScore } from './useHealthScore';

// The one place the app shows the health score in full. The number comes
// from calculateHealthScore (lib/healthScore.ts), the same engine as the
// dashboard teaser; the AI report below only explains it.

const sectionLabel: CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase',
    letterSpacing: '0.5px', margin: 0, fontFamily: 'var(--font-body)',
};

const pill = (color: string, bg: string): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 'var(--radius-full)',
    background: bg, color, fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500,
    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
});

/** Semantic band for a factor: good / middling / poor. Same thresholds the old breakdown bars used. */
export function factorTone(f: Pick<ScoreFactor, 'pct'>): 'good' | 'warn' | 'poor' {
    return f.pct >= 70 ? 'good' : f.pct >= 40 ? 'warn' : 'poor';
}
const TONE = {
    good: { color: 'var(--color-inc)',  bg: 'var(--color-inc-subtle)'  },
    warn: { color: 'var(--color-warn)', bg: 'var(--color-warn-subtle)' },
    poor: { color: 'var(--color-exp)',  bg: 'var(--color-exp-subtle)'  },
};

export function HealthScoreCard({ result, change }: {
    result: HealthScoreResult;
    change: { delta: number; monthLabel: string } | null;
}) {
    const up = change && change.delta > 0;
    const down = change && change.delta < 0;
    const changeTone = up ? TONE.good : down ? TONE.poor : { color: 'var(--text-secondary)', bg: 'var(--glass-fill-2)' };
    const changeText = !change ? null
        : up ? `Up ${change.delta} since ${change.monthLabel}`
        : down ? `Down ${Math.abs(change.delta)} since ${change.monthLabel}`
        : `Same as ${change.monthLabel}`;

    return (
        <div className="glass-surface" style={{ borderRadius: 'var(--radius-xl)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
                <ScoreRing score={result.score} color={result.color} size={120} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '6px' }}>
                    <span data-testid="health-score-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '34px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                        {result.score}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>/ 100</span>
                </div>
            </div>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={sectionLabel}>Financial health</p>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700, color: result.color, margin: 0, lineHeight: 1.1 }}>{result.label}</p>
                {change && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span data-testid="health-change-pill" style={pill(changeTone.color, changeTone.bg)}>
                            {change.delta > 0 ? `+${change.delta}` : change.delta < 0 ? `−${Math.abs(change.delta)}` : '0'}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{changeText}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export function HealthFactorList({ factors }: { factors: ScoreFactor[] }) {
    return (
        <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--glass-border)' }}>
                <p style={sectionLabel}>What makes up your score</p>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {factors.map((f, i) => {
                    const tone = TONE[factorTone(f)];
                    return (
                        <li key={f.id} data-testid={`health-factor-${f.id}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', minHeight: 60, borderBottom: i < factors.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{f.name}</p>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.5 }}>{f.tip}</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                                <span data-tone={factorTone(f)} style={pill(tone.color, tone.bg)}>{f.value ?? `${f.score}/${f.max}`}</span>
                                {f.value && (
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{f.score}/{f.max} pts</span>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export function HealthTab() {
    const { user } = useAuthStore();
    const { result, change, loading, error } = useHealthScore(!!user);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Skeleton width="100%" height={160} borderRadius={24} />
                <Skeleton width="100%" height={360} borderRadius={16} />
                <Skeleton width="100%" height={60} borderRadius={16} />
            </div>
        );
    }

    if (error || !result) {
        return (
            <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: '32px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Couldn&apos;t load your health score. Try again shortly.</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <HealthScoreCard result={result} change={change} />
            <HealthFactorList factors={result.breakdown} />
            <HealthReportPanel result={result} />
        </div>
    );
}
