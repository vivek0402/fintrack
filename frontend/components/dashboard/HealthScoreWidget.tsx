'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, ChevronRight } from 'lucide-react';
import { creditCardsAPI } from '@/lib/api';
import { calculateHealthScore, HealthScoreResult } from '@/lib/healthScore';
import { useCountUp } from '@/hooks/useCountUp';

const R = 42;
const CIRC = 2 * Math.PI * R;
const GAUGE = CIRC * 0.75;

interface Props {
  summary: { total_income: number | string; total_expenses: number | string } | null;
  budgets: any[];
  goals: any[];
  trends: any[];
  loading: boolean;
}

function ScoreArc({ score, color }: { score: number; color: string }) {
  const [animPct, setAnimPct] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setAnimPct(score), 120);
    return () => clearTimeout(t);
  }, [score]);

  const fill = GAUGE * (animPct / 100);

  return (
    <svg viewBox="0 0 100 100" width="110" height="110" style={{ display: 'block' }}>
      <circle cx="50" cy="50" r={R}
        fill="none" stroke="var(--border)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${GAUGE} ${CIRC - GAUGE}`}
        transform="rotate(135 50 50)"
      />
      <circle cx="50" cy="50" r={R}
        fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${fill} ${CIRC - fill}`}
        transform="rotate(135 50 50)"
        style={{ transition: 'stroke-dasharray 1.2s ease' }}
      />
    </svg>
  );
}

export function HealthScoreWidget({ summary, budgets, goals, trends, loading }: Props) {
  const router = useRouter();
  const [result, setResult] = useState<HealthScoreResult | null>(null);

  const income   = Number(summary?.total_income   ?? 0);
  const expenses = Number(summary?.total_expenses ?? 0);

  const hasData = income > 0 || expenses > 0 || budgets.length > 0 || goals.length > 0 || trends.length > 0;

  useEffect(() => {
    if (loading || !summary || !hasData) return;
    creditCardsAPI.getAll()
      .then(res => {
        const cards: any[] = res.data?.credit_cards ?? [];
        const totalCCDebt  = cards.reduce((s: number, c: any) => s + Number(c.outstanding_balance ?? 0), 0);

        const expenseByMonth: Record<string, number> = {};
        trends.forEach((row: any) => {
          if (row.type === 'expense') {
            const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
            expenseByMonth[key] = parseFloat(row.total);
          }
        });
        const monthlyExpenses = Object.entries(expenseByMonth)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-3)
          .map(([, v]) => v);

        setResult(calculateHealthScore({ income, expenses, budgets, goals, monthlyExpenses, totalCCDebt }));
      })
      .catch(() => {
        setResult(calculateHealthScore({ income, expenses, budgets, goals, monthlyExpenses: [], totalCCDebt: 0 }));
      });
  }, [loading, summary, hasData, budgets, goals, trends]);

  const displayScore = useCountUp(result?.score ?? 0, 1000, !!result);

  const weakest = result
    ? [...result.breakdown].sort((a, b) => (a.score / a.max) - (b.score / b.max)).slice(0, 3)
    : [];

  const handleClick = () => router.push('/health-score');

  if (loading) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Calculating health score…</span>
      </div>
    );
  }

  if (!hasData || !result) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', height: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <Heart size={20} color="var(--text-muted)" />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', textAlign: 'center' }}>Add transactions to see your financial health score</span>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', cursor: 'pointer', transition: 'border-color var(--transition-fast)', display: 'flex', gap: '16px', alignItems: 'center' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; }}
    >
      {/* Gauge + score */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <ScoreArc score={result.score} color={result.color} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '6px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 800, color: result.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {displayScore}
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>/ 100</span>
        </div>
      </div>

      {/* Right content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Heart size={13} color={result.color} fill={result.color} />
            <span style={{ fontFamily: 'var(--font-head)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Financial Health</span>
          </div>
          <ChevronRight size={14} color="var(--text-muted)" />
        </div>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: result.color, margin: '0 0 8px' }}>
          {result.label}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {weakest.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '6px' }}>{f.score}/{f.max}</span>
                </div>
                <div style={{ height: '3px', borderRadius: '2px', background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${f.pct}%`, borderRadius: '2px', background: f.pct >= 70 ? 'var(--color-inc)' : f.pct >= 40 ? 'var(--color-warn)' : 'var(--color-exp)', transition: 'width 1s ease' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
