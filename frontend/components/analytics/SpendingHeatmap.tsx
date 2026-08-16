'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { isNonSavingsExpense } from '@/lib/utils';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

interface Props { transactions: any[] }

export function SpendingHeatmap({ transactions }: Props) {
    const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const { grid, monthMarks, maxVal } = useMemo(() => {
        const map: Record<string, { total: number; count: number }> = {};
        transactions.filter(isNonSavingsExpense).forEach(t => {
            const d = (t.date ?? '').split('T')[0];
            if (!d) return;
            if (!map[d]) map[d] = { total: 0, count: 0 };
            map[d].total += parseFloat(t.amount ?? 0);
            map[d].count++;
        });

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const s = new Date(today);
        s.setDate(s.getDate() - 363 - s.getDay()); // align to Sunday 52 weeks ago

        const weeks: { date: Date; key: string }[][] = [];
        const cur = new Date(s); let week: { date: Date; key: string }[] = [];
        while (cur <= today) {
            week.push({ date: new Date(cur), key: cur.toISOString().split('T')[0] });
            cur.setDate(cur.getDate() + 1);
            if (cur.getDay() === 0) { weeks.push(week); week = []; }
        }
        if (week.length) weeks.push(week);

        const marks: { wk: number; label: string }[] = [];
        let lastM = -1;
        weeks.forEach((w, wi) => {
            const m = w[0]?.date.getMonth();
            if (m !== undefined && m !== lastM) { marks.push({ wk: wi, label: MONTHS[m] }); lastM = m; }
        });

        const maxVal = Math.max(...Object.values(map).map(v => v.total), 1);
        const enriched = weeks.map(w =>
            [0,1,2,3,4,5,6].map(dow => {
                const cell = w[dow];
                if (!cell) return null;
                return { ...cell, ...(map[cell.key] ?? { total: 0, count: 0 }) };
            })
        );
        return { grid: enriched, monthMarks: marks, maxVal };
    }, [transactions]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
    }, [grid]);

    const cellColor = (total: number) => {
        if (!total) return 'var(--bg-surface-2)';
        const t = Math.pow(Math.min(total / maxVal, 1), 0.5);
        return `color-mix(in srgb, var(--color-exp) ${Math.round(15 + t * 70)}%, var(--bg-surface-2))`;
    };

    const CELL = 11, GAP = 2, COL_W = CELL + GAP;

    return (
        <div ref={scrollRef} onMouseLeave={() => setTooltip(null)} style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
            {/* Month labels */}
            <div style={{ position: 'relative', height: 16, marginLeft: 22, marginBottom: 2 }}>
                {monthMarks.map((m, i) => (
                    <span key={i} style={{ position: 'absolute', left: m.wk * COL_W, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {m.label}
                    </span>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
                {/* Day labels */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                    {['','M','','W','','F',''].map((d, i) => (
                        <div key={i} style={{ height: CELL, width: 14, fontSize: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{d}</div>
                    ))}
                </div>

                {/* Week columns */}
                <div style={{ display: 'flex', gap: GAP }}>
                    {grid.map((week, wi) => (
                        <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                            {week.map((cell, dow) => {
                                if (!cell) return <div key={dow} style={{ width: CELL, height: CELL }} />;
                                const isFuture = cell.date > new Date();
                                const total = cell.total;
                                return (
                                    <div key={dow}
                                        style={{ width: CELL, height: CELL, borderRadius: 2, flexShrink: 0, background: isFuture ? 'transparent' : cellColor(total), cursor: total > 0 ? 'pointer' : 'default' }}
                                        onMouseEnter={e => {
                                            if (total > 0) {
                                                const r = (e.target as HTMLElement).getBoundingClientRect();
                                                const dtStr = cell.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
                                                setTooltip({ x: r.left + r.width / 2, y: r.top, label: `${dtStr} — ${fmt(total)} across ${cell.count} txn${cell.count !== 1 ? 's' : ''}` });
                                            }
                                        }}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Less</span>
                {[0, 0.2, 0.45, 0.7, 1].map(p => (
                    <div key={p} style={{ width: CELL, height: CELL, borderRadius: 2, background: p === 0 ? 'var(--bg-surface-2)' : `color-mix(in srgb, var(--color-exp) ${Math.round(15 + p * 70)}%, var(--bg-surface-2))` }} />
                ))}
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>More</span>
            </div>

            {tooltip && (
                <div style={{ position: 'fixed', left: tooltip.x, top: tooltip.y - 8, transform: 'translate(-50%, -100%)', background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '7px 12px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', pointerEvents: 'none', zIndex: 999, boxShadow: 'var(--shadow-card)', whiteSpace: 'nowrap' }}>
                    {tooltip.label}
                </div>
            )}
        </div>
    );
}
