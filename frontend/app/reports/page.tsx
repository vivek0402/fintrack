'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Download, TrendingUp, TrendingDown, Search, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { formatCurrency, formatDate, exportToCSV } from '@/lib/utils';

const QUICK_RANGES = [
    { label: 'This Month',   getDates: () => { const n = new Date(); return { from: `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`, to: new Date().toISOString().split('T')[0] }; } },
    { label: 'Last Month',   getDates: () => { const d = new Date(); d.setMonth(d.getMonth()-1); const y=d.getFullYear(),m=d.getMonth()+1,l=new Date(y,m,0).getDate(); return { from:`${y}-${String(m).padStart(2,'0')}-01`, to:`${y}-${String(m).padStart(2,'0')}-${l}` }; } },
    { label: 'Last 3 Months', getDates: () => { const to=new Date().toISOString().split('T')[0]; const from=new Date(new Date().setMonth(new Date().getMonth()-3)).toISOString().split('T')[0]; return {from,to}; } },
    { label: 'Last 6 Months', getDates: () => { const to=new Date().toISOString().split('T')[0]; const from=new Date(new Date().setMonth(new Date().getMonth()-6)).toISOString().split('T')[0]; return {from,to}; } },
    { label: 'This Year',    getDates: () => { const y=new Date().getFullYear(); return { from:`${y}-01-01`, to:new Date().toISOString().split('T')[0] }; } },
];

const card: React.CSSProperties = { background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '16px' };
const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export default function ReportsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`;

    const [from, setFrom]                 = useState(firstOfMonth);
    const [to, setTo]                     = useState(today);
    const [data, setData]                 = useState<any>(null);
    const [loading, setLoading]           = useState(false);
    const [searched, setSearched]         = useState(false);
    const [activeTab, setActiveTab]       = useState<'range' | 'health'>('range');
    const [healthReport, setHealthReport] = useState<any>(null);
    const [healthLoading, setHealthLoading] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchReport = async () => {
        if (!from || !to) return;
        setLoading(true);
        try { const res = await analyticsAPI.report(from, to); setData(res.data); setSearched(true); }
        catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const totalExpenses = data?.categories?.reduce((s: number, c: any) => s + parseFloat(c.total), 0) || 0;

    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={200} />
        </AppLayout>
    );

    const gradeColor = (grade: string) => {
        if (['A+','A'].includes(grade)) return 'var(--color-inc)';
        if (grade === 'B') return 'var(--accent)';
        if (grade === 'C') return 'var(--color-warn)';
        return 'var(--color-exp)';
    };

    const tabStyle = (active: boolean): React.CSSProperties => ({ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: active ? 'var(--bg-surface-1)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '13px', fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s' });

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* Header */}
                <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Reports</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Custom date range analytics</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {activeTab === 'range' && data && (
                                <Button variant="secondary" size="md" onClick={() => void exportToCSV(data.transactions, `fintrack-report-${from}-to-${to}.csv`)}>
                                    <Download size={16} />Export CSV
                                </Button>
                            )}
                            {activeTab === 'health' && healthReport && (
                                <Button variant="secondary" size="md" onClick={() => window.print()}><Download size={16} />Print / Save PDF</Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '4px', width: 'fit-content' }}>
                    {([{ key: 'range', label: '📊 Date Range Report' }, { key: 'health', label: '🏆 Health Report Card' }] as const).map(tab => (
                        <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} style={tabStyle(activeTab === tab.key)}>{tab.label}</button>
                    ))}
                </div>

                {activeTab === 'range' && (
                    <>
                        <div style={card}>
                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Select Date Range</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                                {QUICK_RANGES.map(range => (
                                    <button key={range.label} type="button" onClick={() => { const { from: f, to: t } = range.getDates(); setFrom(f); setTo(t); }}
                                        style={{ padding: '6px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-body)' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-subtle)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }}>
                                        {range.label}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                                <DatePicker label="From" value={from} onChange={setFrom} />
                                <DatePicker label="To" value={to} onChange={setTo} minDate={from} />
                                <Button onClick={fetchReport} isLoading={loading} size="md"><Search size={15} />Generate</Button>
                            </div>
                        </div>

                        {searched && data && (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                                    {[
                                        { label: 'Income',       value: fmt(data.summary.income),    color: 'var(--color-inc)' },
                                        { label: 'Expenses',     value: fmt(data.summary.expenses),  color: 'var(--color-exp)' },
                                        { label: 'Balance',      value: fmt(data.summary.balance),   color: data.summary.balance >= 0 ? 'var(--color-inc)' : 'var(--color-exp)' },
                                        { label: 'Savings Rate', value: `${data.summary.savings_rate}%`, color: 'var(--accent)' },
                                        { label: 'Transactions', value: data.summary.transaction_count, color: 'var(--color-warn)' },
                                    ].map(c => (
                                        <GCard key={c.label}>
                                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>{c.label}</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: c.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{c.value}</p>
                                        </GCard>
                                    ))}
                                </div>

                                {data.categories.length > 0 && (
                                    <div style={card}>
                                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Spending by Category</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {data.categories.map((cat: any) => {
                                                const pct = totalExpenses > 0 ? (parseFloat(cat.total) / totalExpenses) * 100 : 0;
                                                return (
                                                    <div key={cat.name}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
                                                                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{cat.name}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{pct.toFixed(1)}%</span>
                                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>{fmt(parseFloat(cat.total))}</span>
                                                            </div>
                                                        </div>
                                                        <ProgressBar pct={pct} color={cat.color} height={4} />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div style={{ ...card, padding: 0 }}>
                                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Transactions ({data.transactions.length})</h3>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{from} → {to}</span>
                                    </div>
                                    {data.transactions.length === 0 ? (
                                        <div style={{ padding: '40px', textAlign: 'center' }}>
                                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>No transactions in this range</p>
                                        </div>
                                    ) : (
                                        data.transactions.map((tx: any) => {
                                            const isIncome = tx.type === 'income';
                                            return (
                                                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', gap: '12px', transition: 'background var(--transition-fast)' }}
                                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-3)'}
                                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                                        <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: isIncome ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            {isIncome ? <TrendingUp size={14} color="var(--color-inc)" /> : <TrendingDown size={14} color="var(--color-exp)" />}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-body)' }}>{tx.description}</p>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                                {tx.category_name && <span style={{ fontSize: '11px', color: tx.category_color || 'var(--text-muted)', background: `${tx.category_color || 'var(--bg-surface-2)'}20`, padding: '1px 6px', borderRadius: '4px', fontFamily: 'var(--font-body)' }}>{tx.category_name}</span>}
                                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{formatDate(tx.date)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: isIncome ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                                        {isIncome ? '+' : '−'}{fmt(parseFloat(tx.amount))}
                                                    </p>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </>
                        )}

                        {!searched && (
                            <div style={{ ...card, padding: '60px', textAlign: 'center' }}>
                                <FileText size={32} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, fontFamily: 'var(--font-body)' }}>Select a date range and click Generate</p>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'health' && (
                    <>
                        {!healthReport && (
                            <div style={{ ...card, padding: '60px 40px', textAlign: 'center' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🏆</div>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>Financial Health Report Card</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 24px', maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>AI analyses your current month's transactions, budgets, and goals to give you an overall financial health score.</p>
                                <Button onClick={async () => { setHealthLoading(true); try { const res = await aiAPI.healthReport(); setHealthReport(res.data); } catch (e) { console.error(e); } finally { setHealthLoading(false); } }} isLoading={healthLoading} size="md">
                                    <Sparkles size={15} />Generate Health Report
                                </Button>
                            </div>
                        )}

                        {healthReport && (
                            <div id="health-report-printable">
                                {/* Score hero */}
                                <div style={{ ...card, textAlign: 'center' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', background: `color-mix(in srgb, ${gradeColor(healthReport.grade)} 12%, transparent)`, border: `3px solid ${gradeColor(healthReport.grade)}`, marginBottom: '12px' }}>
                                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: gradeColor(healthReport.grade) }}>{healthReport.grade}</span>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.2rem', fontWeight: 700, color: gradeColor(healthReport.grade), lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                                        {healthReport.health_score}<span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400, fontFamily: 'var(--font-body)' }}>/100</span>
                                    </div>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '8px auto 0', maxWidth: '480px', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{healthReport.narrative}</p>
                                    <Button variant="secondary" size="sm" onClick={async () => { setHealthLoading(true); try { const res = await aiAPI.healthReport(); setHealthReport(res.data); } catch (e) { console.error(e); } finally { setHealthLoading(false); } }} isLoading={healthLoading} style={{ marginTop: '16px' }}>
                                        <Sparkles size={13} />Regenerate
                                    </Button>
                                </div>

                                {/* Scores */}
                                {healthReport.scores && (
                                    <div style={card}>
                                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>Score Breakdown</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                            {Object.entries(healthReport.scores).map(([key, val]: [string, any]) => {
                                                const colors: Record<string, string> = { spending: 'var(--color-exp)', savings: 'var(--color-inc)', budget: 'var(--accent)', goals: 'var(--color-warn)', consistency: 'var(--accent)' };
                                                const color = colors[key] || 'var(--color-inc)';
                                                return (
                                                    <div key={key}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, textTransform: 'capitalize', fontFamily: 'var(--font-body)' }}>{key.replace(/_/g, ' ')}</span>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{val}/100</span>
                                                        </div>
                                                        <ProgressBar pct={val} color={color} height={6} />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Strengths + Improvements */}
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                                    {healthReport.strengths?.length > 0 && (
                                        <div style={card}>
                                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--color-inc)', margin: '0 0 14px' }}>✅ Strengths</h3>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {healthReport.strengths.map((s: string, i: number) => (
                                                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                        <span style={{ color: 'var(--color-inc)', fontSize: '13px', flexShrink: 0, marginTop: '1px' }}>•</span>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>{s}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {healthReport.improvements?.length > 0 && (
                                        <div style={card}>
                                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--color-warn)', margin: '0 0 14px' }}>⚡ Areas to Improve</h3>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {healthReport.improvements.map((s: string, i: number) => (
                                                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                        <span style={{ color: 'var(--color-warn)', fontSize: '13px', flexShrink: 0, marginTop: '1px' }}>•</span>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>{s}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Budget performance */}
                                {healthReport.budget_performance?.length > 0 && (
                                    <div style={card}>
                                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Budget Performance</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {healthReport.budget_performance.map((b: any, i: number) => {
                                                const used = Math.min(b.percentage_used, 100);
                                                const over = b.percentage_used > 100;
                                                return (
                                                    <div key={i}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{b.category}</span>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: over ? 'var(--color-exp)' : 'var(--color-inc)', fontWeight: 600 }}>{b.percentage_used?.toFixed(0)}%{over ? ' over' : ''}</span>
                                                        </div>
                                                        <ProgressBar pct={used} color={over ? 'var(--color-exp)' : 'var(--color-inc)'} height={5} />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Goals progress */}
                                {healthReport.goals_progress?.length > 0 && (
                                    <div style={card}>
                                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Goals Progress</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {healthReport.goals_progress.map((g: any, i: number) => (
                                                <div key={i}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{g.name}</span>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{g.percentage?.toFixed(0)}%</span>
                                                    </div>
                                                    <ProgressBar pct={Math.min(g.percentage, 100)} height={5} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
            <style>{`
                @media print {
                    body > * { display: none !important; }
                    #health-report-printable, #health-report-printable * { display: revert !important; }
                    #health-report-printable { position: fixed; top: 0; left: 0; width: 100%; background: white; color: black; padding: 20px; }
                }
            `}</style>
        </AppLayout>
    );
}
