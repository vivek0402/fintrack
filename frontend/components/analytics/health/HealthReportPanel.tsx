'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { aiAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
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

function ReportList({ title, items, color }: { title: string; items: string[]; color: string }) {
    if (!items.length) return null;
    return (
        <div>
            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>{title}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {items.map((s, i) => (
                    <li key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: color, flexShrink: 0, marginTop: '7px' }} />
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55, fontFamily: 'var(--font-body)' }}>{s}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/**
 * "AI report card" row. The AI explains the calculateHealthScore result it is
 * given -- it never scores on its own. On mount it only peeks at the cache
 * (no AI call); the report is generated on first expand.
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
        : loading ? 'Explains this score · Writing…' : 'Explains this score · Not generated yet';

    return (
        <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-controls="health-ai-report"
                style={{ width: '100%', minHeight: 60, display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'inherit' }}
            >
                <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Sparkles size={16} color="var(--accent)" />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>AI report card</span>
                    <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{subtitle}</span>
                </span>
                <ChevronDown size={18} color="var(--text-muted)" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
            </button>

            {open && (
                <div id="health-ai-report" style={{ padding: '4px 20px 20px', borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {loading && !report && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '14px' }}>
                            <Skeleton width="100%" height={12} borderRadius={4} />
                            <Skeleton width="92%" height={12} borderRadius={4} />
                            <Skeleton width="70%" height={12} borderRadius={4} />
                        </div>
                    )}
                    {error && !loading && (
                        <div style={{ paddingTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', color: 'var(--color-exp)', fontFamily: 'var(--font-body)' }}>Couldn&apos;t write the report. Try again.</span>
                            <Button variant="secondary" size="sm" onClick={() => void generate(!!report)}>Retry</Button>
                        </div>
                    )}
                    {report && (
                        <>
                            {report.narrative && (
                                <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6, margin: '14px 0 0', fontFamily: 'var(--font-body)' }}>{report.narrative}</p>
                            )}
                            <ReportList title="Strengths" items={report.strengths} color="var(--color-inc)" />
                            <ReportList title="Weak spots" items={report.weak_spots} color="var(--color-warn)" />
                            <ReportList title="What to do next" items={report.next_steps} color="var(--accent)" />
                            <div>
                                <Button variant="secondary" size="sm" onClick={() => void generate(true)} isLoading={loading}>
                                    <Sparkles size={13} />Regenerate
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
