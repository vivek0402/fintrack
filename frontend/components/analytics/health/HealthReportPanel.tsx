'use client';

import { useEffect, useState } from 'react';
import { aiAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { Skeleton } from '@/components/ui/Skeleton';
import { type } from '@/lib/typography';
import type { HealthScoreResult } from '@/lib/healthScore';

export interface HealthReport {
    score: number;
    narrative: string;
    strengths: string[];
    weak_spots: string[];
    next_steps: string[];
    generated_at: string;
}

export function timeAgo(iso: string, now: number = Date.now()): string {
    const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

const factorPayload = (r: HealthScoreResult) => r.breakdown.map(f => ({ id: f.id, score: f.score, max: f.max }));

function ReportList({ title, items }: { title: string; items: string[] }) {
    if (!items.length) return null;
    return (
        <div>
            <p style={{ ...type.label, margin: '0 0 var(--space-2)' }}>{title}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {items.map((s, i) => (
                    <li key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: 'var(--text-muted)', flexShrink: 0, marginTop: '8px' }} />
                        <span style={{ ...type.body, minWidth: 0 }}>{s}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/**
 * "AI report card". The AI explains the calculateHealthScore result it is
 * given -- it never scores on its own. On mount it only peeks at the cache
 * (no AI call); the report is generated on first open.
 */
export function HealthReportPanel({ result }: { result: HealthScoreResult }) {
    const [open, setOpen] = useState(false);
    const [report, setReport] = useState<HealthReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        aiAPI.healthReport({ score: result.score, factors: factorPayload(result), peek: true })
            .then(res => { if (!cancelled) setReport(res.data?.report ?? null); })
            .catch(() => { /* peek is best-effort; expanding generates */ });
        return () => { cancelled = true; };
    }, [result]);

    const generate = async (force = false) => {
        setLoading(true);
        setError(false);
        try {
            const res = await aiAPI.healthReport({ score: result.score, factors: factorPayload(result), force });
            setReport(res.data?.report ?? null);
        } catch (e) {
            console.error('[HealthReport]', e);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next && !report && !loading) void generate();
    };

    const subtitle = report
        ? `Explains this score · ${timeAgo(report.generated_at)}`
        : loading ? 'Explains this score · Writing' : 'Explains this score · Not generated yet';

    return (
        <Card>
            <CardHeader
                title="AI report card"
                sub={subtitle}
                flush={!open}
                action={
                    <TextAction onClick={toggle} aria-expanded={open} aria-controls="health-ai-report" aria-label={`${open ? 'Hide' : 'Show'} AI report card`}>
                        {open ? 'Hide' : 'Show'}
                    </TextAction>
                }
            />

            {open && (
                <div id="health-ai-report" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    {loading && !report && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <Skeleton width="100%" height={12} borderRadius={4} />
                            <Skeleton width="92%" height={12} borderRadius={4} />
                            <Skeleton width="70%" height={12} borderRadius={4} />
                        </div>
                    )}
                    {error && !loading && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                            <span style={{ ...type.meta, color: TONE_TEXT.bad }}>Couldn&apos;t write the report. Try again.</span>
                            <TextAction onClick={() => void generate(!!report)}>Try again</TextAction>
                        </div>
                    )}
                    {report && (
                        <>
                            {report.narrative && <p style={{ ...type.body, margin: 0 }}>{report.narrative}</p>}
                            <ReportList title="Strengths" items={report.strengths} />
                            <ReportList title="Weak spots" items={report.weak_spots} />
                            <ReportList title="What to do next" items={report.next_steps} />
                            <div>
                                <TextAction onClick={() => void generate(true)} disabled={loading}>{loading ? 'Writing' : 'Regenerate'}</TextAction>
                            </div>
                        </>
                    )}
                </div>
            )}
        </Card>
    );
}
