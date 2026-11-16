'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { calculateHealthScore, monthlySeriesFromTrends, HealthScoreResult } from '@/lib/healthScore';
import { CountUp } from '@/components/ui/CountUp';
import { Card } from '@/components/ui/Card';
import { CardHeader, Rows, TextAction } from '@/components/ui/CardParts';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScoreRing } from '@/components/analytics/health/ScoreRing';
import { type, truncate } from '@/lib/typography';

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

  const weakest = result
    ? [...result.breakdown].sort((a, b) => (a.score / a.max) - (b.score / b.max)).slice(0, 3)
    : [];

  if (loading) {
    return (
      <Card>
        <p style={{ ...type.meta, margin: 0, textAlign: 'center' }}>Calculating your health score</p>
      </Card>
    );
  }

  if (!hasData || !result) {
    return (
      <Card>
        <p style={{ ...type.meta, margin: 0, textAlign: 'center' }}>Add transactions to see your financial health score</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Financial health"
        sub="Your three weakest areas"
        action={<TextAction onClick={() => router.push('/analytics?tab=health')}>See details</TextAction>}
      />
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <ScoreRing score={result.score} color={result.color} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '6px' }}>
            <span style={type.figure}>
              <CountUp value={result.score} duration={1000} />
            </span>
            <span style={{ ...type.meta, marginTop: '2px' }}>/ 100</span>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ ...type.heading, margin: '0 0 var(--space-3)' }}>{result.label}</p>
          <Rows>
            {weakest.map(f => (
              <div key={f.id} style={{ gap: 'var(--space-3)' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <span style={{ ...type.bodyStrong, ...truncate }}>{f.name}</span>
                  <ProgressBar pct={f.pct} height={4} color="var(--text-secondary)" />
                </div>
                <span style={{ ...type.numSmall, flexShrink: 0 }}>{f.score}/{f.max}</span>
              </div>
            ))}
          </Rows>
        </div>
      </div>
    </Card>
  );
}
