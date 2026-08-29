'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Heart, ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, budgetsAPI, goalsAPI, debtAPI } from '@/lib/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { calculateHealthScore, HealthScoreResult } from '@/lib/healthScore';
import { getCurrentMonthYear } from '@/lib/utils';

const LS_KEY = 'fintrack-health-history';

interface HistoryEntry { date: string; score: number; }

const R_LG = 54;
const CIRC_LG = 2 * Math.PI * R_LG;
const GAUGE_LG = CIRC_LG * 0.75;

function ScoreArc({ score, color, size = 140 }: { score: number; color: string; size?: number }) {
  const [animPct, setAnimPct] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimPct(score), 150);
    return () => clearTimeout(t);
  }, [score]);
  const fill = GAUGE_LG * (animPct / 100);
  return (
    <svg viewBox="0 0 130 130" width={size} height={size} style={{ display: 'block' }}>
      <circle cx="65" cy="65" r={R_LG}
        fill="none" stroke="var(--border-subtle)" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${GAUGE_LG} ${CIRC_LG - GAUGE_LG}`}
        transform="rotate(135 65 65)"
      />
      <circle cx="65" cy="65" r={R_LG}
        fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${fill} ${CIRC_LG - fill}`}
        transform="rotate(135 65 65)"
        style={{ transition: 'stroke-dasharray 1.4s ease' }}
      />
    </svg>
  );
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  if (delta === 0) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 10px', borderRadius: '20px', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
      <Minus size={11} /> No change
    </span>
  );
  const up = delta > 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 10px', borderRadius: '20px', background: up ? 'color-mix(in srgb, var(--color-inc) 12%, transparent)' : 'color-mix(in srgb, var(--color-exp) 12%, transparent)', fontSize: '12px', fontWeight: 600, color: up ? 'var(--color-inc)' : 'var(--color-exp)', fontFamily: 'var(--font-mono)' }}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? '+' : ''}{delta} vs last
    </span>
  );
}

export default function HealthScorePage() {
  const router = useRouter();
  const { user, isLoading, loadFromStorage } = useAuthStore();
  const { month, year } = getCurrentMonthYear();

  const [result, setResult]   = useState<HealthScoreResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoreColor, setScoreColor] = useState('var(--accent)');

  useEffect(() => { loadFromStorage(); }, []);
  useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      analyticsAPI.summary({ month, year }),
      analyticsAPI.trends(),
      budgetsAPI.getAll({ month, year }),
      goalsAPI.getAll(),
      analyticsAPI.getInvestmentRatio().catch(() => ({ data: null })),
      debtAPI.getDti().catch(() => ({ data: null })),
      debtAPI.getCreditUtilization().catch(() => ({ data: null })),
    ]).then(([summaryRes, trendsRes, budgetsRes, goalsRes, investRes, dtiRes, cuRes]) => {
      const summary           = summaryRes.data.summary;
      const trends            = trendsRes.data.trends ?? [];
      const budgets           = budgetsRes.data.budgets ?? [];
      const goals             = goalsRes.data.goals ?? [];
      const investmentRatio   = investRes.data;
      const dti               = dtiRes.data;
      const creditUtilization = cuRes.data;

      // Build paired monthly income/expense arrays from trends
      const monthMap: Record<string, { income: number; expenses: number }> = {};
      trends.forEach((row: any) => {
        const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
        if (!monthMap[key]) monthMap[key] = { income: 0, expenses: 0 };
        if (row.type === 'income')  monthMap[key].income   = parseFloat(row.total);
        if (row.type === 'expense') monthMap[key].expenses = parseFloat(row.total);
      });
      const sorted = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6);
      const monthlyIncome   = sorted.map(([, v]) => v.income);
      const monthlyExpenses = sorted.map(([, v]) => v.expenses);

      const calc = calculateHealthScore({
        income:   Number(summary?.total_income   ?? 0),
        expenses: Number(summary?.total_expenses ?? 0),
        budgets,
        goals,
        monthlyIncome,
        monthlyExpenses,
        investedThisMonth:  investmentRatio?.invested_this_month ?? 0,
        dtiRatio:           dti?.dti_ratio ?? 0,
        ccUtilizationPct:   creditUtilization?.aggregate?.overall_utilization_pct ?? 0,
      });

      setResult(calc);
      setScoreColor(calc.color);

      // Persist history
      const today = new Date().toISOString().split('T')[0];
      let stored: HistoryEntry[] = [];
      try { stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); } catch {}
      const last = stored[stored.length - 1];
      if (!last || last.date !== today) {
        stored = [...stored, { date: today, score: calc.score }].slice(-20);
        try { localStorage.setItem(LS_KEY, JSON.stringify(stored)); } catch {}
      }
      setHistory(stored);
    }).catch(err => {
      console.error('[HealthScore]', err);
    }).finally(() => setLoading(false));
  }, [user]);

  const sparkData = useMemo(() => history.slice(-8).map(h => ({
    date: new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    score: h.score,
  })), [history]);

  const delta = useMemo(() => {
    if (history.length < 2 || !result) return null;
    return result.score - history[history.length - 2].score;
  }, [history, result]);

  if (isLoading || !user) return <Skeleton width="100%" height={300} borderRadius={12} />;

  return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '32px', animation: 'fadeUp 200ms ease forwards' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button type="button" onClick={() => router.push('/dashboard')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '4px', borderRadius: '8px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--text-primary) 8%, transparent)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Financial Health</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>Score breakdown &amp; trend</p>
          </div>
        </div>

        {/* Score hero */}
        <div className="glass-surface" style={{ borderRadius: 'var(--radius-xl)', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          {loading ? (
            <Skeleton width={140} height={140} borderRadius={999} />
          ) : result ? (
            <>
              <div style={{ position: 'relative' }}>
                <ScoreArc score={result.score} color={result.color} size={150} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '36px', fontWeight: 800, color: result.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {result.score}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--text-muted)' }}>/100</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Heart size={16} color={result.color} fill={result.color} />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: result.color }}>{result.label}</span>
                </div>
                <DeltaChip delta={delta} />
              </div>
            </>
          ) : null}
        </div>

        {/* Sparkline */}
        {sparkData.length >= 2 && (
          <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 14px', fontFamily: 'var(--font-body)' }}>Score history</p>
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={sparkData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'var(--font-body)', fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const val = payload[0].value as number;
                    return (
                      <div style={{ background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '6px 10px', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--text-primary)' }}>
                        <p style={{ margin: '0 0 2px', color: 'var(--text-muted)' }}>{label}</p>
                        <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontWeight: 700, color: scoreColor }}>{val}/100</p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={80} strokeDasharray="3 3" stroke="var(--color-inc)" strokeOpacity={0.3} />
                <Line type="monotone" dataKey="score" stroke={scoreColor} strokeWidth={2} dot={{ fill: scoreColor, r: 3 }} activeDot={{ r: 5, fill: scoreColor }} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
              <div style={{ width: 24, height: 1, background: 'var(--color-inc)', opacity: 0.5 }} />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>80+ = Excellent</span>
            </div>
          </div>
        )}

        {/* Factor breakdown */}
        <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--glass-border)' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0, fontFamily: 'var(--font-body)' }}>Factor breakdown</p>
          </div>

          {loading
            ? [1,2,3,4,5,6,7,8].map(i => (
                <div key={i} style={{ padding: '14px 20px', borderBottom: i < 8 ? '1px solid var(--glass-border)' : 'none' }}>
                  <Skeleton width="50%" height={12} borderRadius={4} style={{ marginBottom: '8px' }} />
                  <Skeleton width="100%" height={5} borderRadius={99} />
                </div>
              ))
            : result?.breakdown.map((f, i, arr) => {
                const barColor = f.pct >= 70 ? 'var(--color-inc)' : f.pct >= 40 ? 'var(--color-warn)' : 'var(--color-exp)';
                return (
                  <div key={f.id} style={{ padding: '14px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{f.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: barColor }}>{f.score}<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/{f.max}</span></span>
                    </div>
                    <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border-subtle)', overflow: 'hidden', marginBottom: '6px' }}>
                      <div style={{ height: '100%', width: `${f.pct}%`, borderRadius: '3px', background: barColor, transition: 'width 1.2s ease' }} />
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>{f.tip}</p>
                  </div>
                );
              })
          }
        </div>

      </div>
  );
}
