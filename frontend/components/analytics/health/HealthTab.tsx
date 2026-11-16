'use client';

import { useAuthStore } from '@/store/authStore';
import { Card } from '@/components/ui/Card';
import { CardHeader, Rows, StatusDot, type Tone } from '@/components/ui/CardParts';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { type } from '@/lib/typography';
import { sortFactorsWeakestFirst, weakestFactor } from '@/lib/analytics';
import type { HealthScoreResult, ScoreFactor } from '@/lib/healthScore';
import { ScoreRing } from './ScoreRing';
import { HealthReportPanel } from './HealthReportPanel';
import { useHealthScore } from './useHealthScore';

// The one place the app shows the health score in full. The number comes
// from calculateHealthScore (lib/healthScore.ts), the same engine as the
// dashboard teaser; the AI report beside the factors only explains it.

/** Semantic band for a factor: good / middling / poor. Same thresholds the old breakdown bars used. */
export function factorTone(f: Pick<ScoreFactor, 'pct'>): 'good' | 'warn' | 'poor' {
    return f.pct >= 70 ? 'good' : f.pct >= 40 ? 'warn' : 'poor';
}
const DOT_TONE: Record<'good' | 'warn' | 'poor', Tone> = { good: 'good', warn: 'caution', poor: 'bad' };

export function HealthScoreCard({ result, change }: {
    result: HealthScoreResult;
    change: { delta: number; monthLabel: string } | null;
}) {
    const changeText = !change ? null
        : change.delta > 0 ? `Up ${change.delta} since ${change.monthLabel}`
        : change.delta < 0 ? `Down ${Math.abs(change.delta)} since ${change.monthLabel}`
        : `Same as ${change.monthLabel}`;
    const weakest = weakestFactor(result.breakdown);

    return (
        <Card>
            <CardHeader title="Financial health" sub="Your score out of 100" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <ScoreRing score={result.score} color={result.color} size={120} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '6px' }}>
                        <span data-testid="health-score-value" style={type.figure}>{result.score}</span>
                        <span style={{ ...type.micro, marginTop: '4px' }}>/ 100</span>
                    </div>
                </div>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <p style={{ ...type.heading, margin: 0 }}>{result.label}</p>
                    {changeText && <span data-testid="health-change-pill" style={type.meta}>{changeText}</span>}
                    {weakest && <p style={{ ...type.meta, margin: 0 }}>{`Work on ${weakest.name.toLowerCase()} first.`}</p>}
                </div>
            </div>
        </Card>
    );
}

export function HealthFactorList({ factors }: { factors: ScoreFactor[] }) {
    const sorted = sortFactorsWeakestFirst(factors);
    return (
        <Card>
            <CardHeader title="What makes up your score" sub="Weakest first, so the top row is what to fix" />
            <Rows>
                {sorted.map(f => {
                    const tone = factorTone(f);
                    return (
                        <div key={f.id} data-testid={`health-factor-${f.id}`} style={{ alignItems: 'flex-start' }}>
                            <span style={{ paddingTop: '6px', display: 'flex' }}><StatusDot tone={DOT_TONE[tone]} /></span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ ...type.bodyStrong, margin: 0 }}>{f.name}</p>
                                <p style={{ ...type.meta, margin: '2px 0 0' }}>{f.tip}</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                                <span data-tone={tone} style={type.num}>{f.value ?? `${f.score}/${f.max}`}</span>
                                {f.value && <span style={type.meta}>{f.score}/{f.max} pts</span>}
                            </div>
                        </div>
                    );
                })}
            </Rows>
        </Card>
    );
}

export function HealthTab() {
    const { user } = useAuthStore();
    const { result, change, loading, error } = useHealthScore(!!user);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <SkeletonCard height={190} />
                <div className="fin-two">
                    <SkeletonCard height={360} />
                    <SkeletonCard height={120} />
                </div>
            </div>
        );
    }

    if (error || !result) {
        return (
            <Card>
                <p style={{ ...type.meta, margin: 0, textAlign: 'center' }}>Couldn&apos;t load your health score. Try again shortly.</p>
            </Card>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <HealthScoreCard result={result} change={change} />
            <div className="fin-two">
                <HealthFactorList factors={result.breakdown} />
                <HealthReportPanel result={result} />
            </div>
        </div>
    );
}
