'use client';

import { useMemo } from 'react';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

interface Props { transactions: any[] }
interface SNode { id: string; label: string; amount: number; y: number; h: number; color: string }

const INC_COLORS = ['#059669', '#10b981', '#34d399', '#6ee7b7'];
const EXP_COLORS = ['#e11d48', '#f97316', '#d97706', '#8b5cf6', '#0ea5e9', '#ec4899'];

export function SankeyFlow({ transactions }: Props) {
    const { incNodes, expNodes, bands, svgH } = useMemo(() => {
        // Last 3 months
        const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 3);
        const recent = transactions.filter(t => {
            const d = new Date((t.date ?? '').split('T')[0] + 'T00:00:00');
            return d >= cutoff;
        });

        const incMap: Record<string, number> = {};
        const expMap: Record<string, number> = {};
        recent.forEach(t => {
            const k = t.category_name ?? t.category ?? (t.type === 'income' ? 'Income' : 'Expenses');
            const amt = parseFloat(t.amount ?? 0);
            if (t.type === 'income') incMap[k] = (incMap[k] ?? 0) + amt;
            else expMap[k] = (expMap[k] ?? 0) + amt;
        });

        const incEntries = Object.entries(incMap).sort((a, b) => b[1] - a[1]);
        const expEntries = Object.entries(expMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
        if (!incEntries.length || !expEntries.length) return { incNodes: [], expNodes: [], bands: [], svgH: 200 };

        const totalInc = incEntries.reduce((s, [, v]) => s + v, 0);
        const totalExp = expEntries.reduce((s, [, v]) => s + v, 0);

        const H = 280, GAP = 6, PAD = 12;
        let yInc = PAD;
        const incNodes: SNode[] = incEntries.map(([id, amount], i) => {
            const h = Math.max(24, (amount / totalInc) * (H - PAD * 2) - GAP);
            const n: SNode = { id, label: id, amount, y: yInc, h, color: INC_COLORS[i % INC_COLORS.length] };
            yInc += h + GAP;
            return n;
        });

        let yExp = PAD;
        const expNodes: SNode[] = expEntries.map(([id, amount], i) => {
            const h = Math.max(24, (amount / totalExp) * (H - PAD * 2) - GAP);
            const n: SNode = { id, label: id, amount, y: yExp, h, color: EXP_COLORS[i % EXP_COLORS.length] };
            yExp += h + GAP;
            return n;
        });

        // Bezier bands: for each income node, flow proportionally to each expense node
        const W = 380, NW = 14, x1 = NW, x2 = W - NW, cx = W / 2;
        const bands: { path: string; color: string }[] = [];
        const incConsumed: Record<string, number> = {};
        const expConsumed: Record<string, number> = {};
        incNodes.forEach(n => { incConsumed[n.id] = 0; });
        expNodes.forEach(n => { expConsumed[n.id] = 0; });

        for (const inc of incNodes) {
            for (const exp of expNodes) {
                const flow = inc.amount * (exp.amount / totalExp);
                const bwI = (flow / inc.amount) * inc.h;
                const bwE = Math.max((flow / exp.amount) * exp.h, 0.5);
                const y1t = inc.y + incConsumed[inc.id];
                const y1b = y1t + bwI;
                const y2t = exp.y + expConsumed[exp.id];
                const y2b = y2t + bwE;
                incConsumed[inc.id] += bwI;
                expConsumed[exp.id] += bwE;
                const path = `M ${x1} ${y1t} C ${cx} ${y1t} ${cx} ${y2t} ${x2} ${y2t} L ${x2} ${y2b} C ${cx} ${y2b} ${cx} ${y1b} ${x1} ${y1b} Z`;
                bands.push({ path, color: exp.color });
            }
        }

        const svgH = Math.max(yInc, yExp) + PAD;
        return { incNodes, expNodes, bands, svgH };
    }, [transactions]);

    if (!incNodes.length || !expNodes.length) {
        return <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontFamily: 'var(--font-body)' }}>Add income and expense transactions to see money flow.</p>;
    }

    const W = 380, NW = 14;

    const truncate = (s: string, n = 14) => s.length > n ? s.slice(0, n - 1) + '…' : s;

    return (
        <div style={{ overflowX: 'auto' }}>
            <svg width="100%" viewBox={`0 0 ${W} ${svgH}`} style={{ maxWidth: W, display: 'block', margin: '0 auto' }}>
                {/* Column headers */}
                <text x={NW + 5} y={9} fontSize={9} fontWeight={700} style={{ fill: '#059669' }} fontFamily="var(--font-body)">INCOME</text>
                <text x={W - NW - 5} y={9} fontSize={9} fontWeight={700} textAnchor="end" style={{ fill: '#e11d48' }} fontFamily="var(--font-body)">EXPENSES</text>

                {/* Bands */}
                {bands.map((b, i) => (
                    <path key={i} d={b.path} fill={b.color} opacity={0.35} />
                ))}

                {/* Income nodes */}
                {incNodes.map(n => (
                    <g key={n.id}>
                        <rect x={0} y={n.y} width={NW} height={n.h} rx={3} fill={n.color} />
                        {n.h >= 18 && (
                            <>
                                <text x={NW + 5} y={n.y + Math.min(n.h / 2, 12)} fontSize={9} style={{ fill: 'var(--text-secondary)' }} fontFamily="var(--font-body)">{truncate(n.label)}</text>
                                {n.h >= 28 && <text x={NW + 5} y={n.y + Math.min(n.h / 2, 12) + 11} fontSize={8} style={{ fill: 'var(--text-muted)' }} fontFamily="var(--font-mono)">{fmt(n.amount)}</text>}
                            </>
                        )}
                    </g>
                ))}

                {/* Expense nodes */}
                {expNodes.map(n => (
                    <g key={n.id}>
                        <rect x={W - NW} y={n.y} width={NW} height={n.h} rx={3} fill={n.color} />
                        {n.h >= 18 && (
                            <>
                                <text x={W - NW - 5} y={n.y + Math.min(n.h / 2, 12)} fontSize={9} textAnchor="end" style={{ fill: 'var(--text-secondary)' }} fontFamily="var(--font-body)">{truncate(n.label)}</text>
                                {n.h >= 28 && <text x={W - NW - 5} y={n.y + Math.min(n.h / 2, 12) + 11} fontSize={8} textAnchor="end" style={{ fill: 'var(--text-muted)' }} fontFamily="var(--font-mono)">{fmt(n.amount)}</text>}
                            </>
                        )}
                    </g>
                ))}
            </svg>

            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: '6px 0 0', fontFamily: 'var(--font-body)' }}>Based on last 3 months · Top 6 expense categories</p>
        </div>
    );
}
