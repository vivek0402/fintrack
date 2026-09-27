'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, ChevronRight } from 'lucide-react';
import { calculateHealthScore, monthlySeriesFromTrends, HealthScoreResult } from '@/lib/healthScore';
import { useCountUp } from '@/hooks/useCountUp';
import { ScoreRing } from '@/components/analytics/health/ScoreRing';

interface Props {
  summary: { total_income: number | string; total_expenses: number | string } | null;
  budgets: any[];
  goals: any[];
  trends: any[];
  loading: boolean;
  investmentRatio: { invested_this_month: number; income_this_month: number; ratio_pct: number } | null;
  dti: { dti_ratio: number } | null;
  creditUtilization: { aggregate: { overall_utilization_pct: number } } | null;
}

export function HealthScoreWidget({ summary, budgets, goals, trends, loading, investmentRatio, dti, creditUtilization }: Props) {
  const router = useRouter();
  const [result, setResult] = useState<HealthScoreResult | null>(null);

  const income   = Number(summary?.total_income   ?? 0);
  const expenses = Number(summary?.total_expenses ?? 0);

  const hasData = income > 0 || expenses > 0 || budgets.length > 0 || goals.length > 0 || trends.length > 0;

  useEffect(() => {
    if (loading || !summary || !hasData) return;

    setResult(calculateHealthScore({
      income,
      expenses,
      budgets,
      goals,
      ...monthlySeriesFromTrends(trends),
      investedThisMonth:  investmentRatio?.invested_this_month ?? 0,
      dtiRatio:           dti?.dti_ratio ?? 0,
      ccUtilizationPct:   creditUtilization?.aggregate?.overall_utilization_pct ?? 0,
    }));
  }, [loading, summary, hasData, budgets, goals, trends, investmentRatio, dti, creditUtilization]);

  const displayScore = useCountUp(result?.score ?? 0, 1000, !!result);

  const weakest = result
    ? [...result.breakdown].sort((a, b) => (a.score / a.max) - (b.score / b.max)).slice(0, 3)
    : [];

  const handleClick = () => router.push('/analytics?tab=health');

  if (loading) {
    return (
      <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: '18px 20px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Calculating health score…</span>
      </div>
    );
  }

  if (!hasData || !result) {
    return (
      <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: '18px 20px', height: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <Heart size={20} color="var(--text-muted)" />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', textAlign: 'center' }}>Add transactions to see your financial health score</span>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className="glass-surface"
      style={{ borderRadius: 'var(--radius-lg)', padding: '16px 18px', cursor: 'pointer', transition: 'border-color var(--transition-fast)', display: 'flex', gap: '16px', alignItems: 'center' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--glass-border)'; }}
    >
      {/* Gauge + score */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <ScoreRing score={result.score} color={result.color} />
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
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Financial Health</span>
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
                <div style={{ height: '3px', borderRadius: '2px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
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
