'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Download, TrendingUp, TrendingDown, Search, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonTitle, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { formatCurrency, formatDate, exportToCSV } from '@/lib/utils';
import PageHelp from '@/components/ui/PageHelp';
import { FadeIn } from '@/components/ui/FadeIn';

const QUICK_RANGES = [
    { label: 'This Month', getDates: () => { const n = new Date(); return { from: `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`, to: new Date().toISOString().split('T')[0] }; } },
    { label: 'Last Month', getDates: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); const y = d.getFullYear(), m = d.getMonth() + 1, l = new Date(y, m, 0).getDate(); return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: `${y}-${String(m).padStart(2, '0')}-${l}` }; } },
    { label: 'Last 3 Months', getDates: () => { const to = new Date().toISOString().split('T')[0]; const from = new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().split('T')[0]; return { from, to }; } },
    { label: 'Last 6 Months', getDates: () => { const to = new Date().toISOString().split('T')[0]; const from = new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().split('T')[0]; return { from, to }; } },
    { label: 'This Year', getDates: () => { const y = new Date().getFullYear(); return { from: `${y}-01-01`, to: new Date().toISOString().split('T')[0] }; } },
];

export default function ReportsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [activeTab, setActiveTab] = useState<'range' | 'health'>('range');
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
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={120} />
        </AppLayout>
    );

    const gradeColor = (grade: string) => {
        if (['A+', 'A'].includes(grade)) return '#10b981';
        if (grade === 'B') return '#3b82f6';
        if (grade === 'C') return '#f59e0b';
        return '#f43f5e';
    };

    const scoreBar = (score: number, color: string) => (
        <div style={{ height: '6px', background: 'var(--bg-border)', borderRadius: '3px', overflow: 'hidden', flex: 1 }}>
            <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
        </div>
    );

    return (
        <AppLayout>
        <PageShell
            title="Reports"
            subtitle="Custom date range analytics"
            headerRight={
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {activeTab === 'range' && data && <Button variant="secondary" size="md" onClick={() => void exportToCSV(data.transactions, `fintrack-report-${from}-to-${to}.csv`)}><Download size={16} />Export CSV</Button>}
                    {activeTab === 'health' && healthReport && <Button variant="secondary" size="md" onClick={() => window.print()}><Download size={16} />Print / Save PDF</Button>}
                    <PageHelp title="Reports" sections={[
                        { icon: '📋', heading: 'What is this page?', body: 'Generate detailed monthly financial reports using AI. Each report analyses your income, expenses, savings, and spending patterns.' },
                        { icon: '📤', heading: 'Generating a report', body: "Select a month and tap 'Generate Report'. The AI writes a personalised summary with insights and recommendations." },
                        { icon: '💾', heading: 'Saving reports', body: 'Generated reports are saved so you can reference them later. Use them to track your financial progress month over month.' },
                    ]} />
                </div>
            }
        >

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '12px', padding: '4px', width: 'fit-content' }}>
                {([
                    { key: 'range', label: '📊 Date Range Report' },
                    { key: 'health', label: '🏆 Health Report Card' },
                ] as const).map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        style={{ padding: '8px 16px', borderRadius: '9px', border: 'none', background: activeTab === tab.key ? 'var(--bg-card)' : 'transparent', color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: activeTab === tab.key ? 600 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s' }}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'range' && (
                <>
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                        <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Select Date Range</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                            {QUICK_RANGES.map(range => (
                                <button key={range.label} onClick={() => { const { from: f, to: t } = range.getDates(); setFrom(f); setTo(t); }}
                                    style={{ padding: '6px 14px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.1)'; (e.currentTarget as HTMLElement).style.color = '#10b981'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(16,185,129,0.3)'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)'; }}>
                                    {range.label}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                            <DatePicker
                                label="From"
                                value={from}
                                onChange={setFrom}
                            />
                            <DatePicker
                                label="To"
                                value={to}
                                onChange={setTo}
                                minDate={from}
                            />
                            <Button onClick={fetchReport} isLoading={loading} size="md"><Search size={15} />Generate</Button>
                        </div>
                    </div>

                    {searched && data && (
                        <FadeIn>
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                                {[
                                    { label: 'Income', value: formatCurrency(data.summary.income, user.currency), color: '#10b981' },
                                    { label: 'Expenses', value: formatCurrency(data.summary.expenses, user.currency), color: '#f43f5e' },
                                    { label: 'Balance', value: formatCurrency(data.summary.balance, user.currency), color: data.summary.balance >= 0 ? '#10b981' : '#f43f5e' },
                                    { label: 'Savings Rate', value: `${data.summary.savings_rate}%`, color: '#3b82f6' },
                                    { label: 'Transactions', value: data.summary.transaction_count, color: '#f59e0b' },
                                ].map(card => (
                                    <div key={card.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '14px', padding: '14px 16px' }}>
                                        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>{card.label}</p>
                                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1rem', fontWeight: 700, color: card.color, margin: 0 }}>{card.value}</p>
                                    </div>
                                ))}
                            </div>

                            {data.categories.length > 0 && (
                                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Spending by Category</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {data.categories.map((cat: any) => {
                                            const pct = totalExpenses > 0 ? (parseFloat(cat.total) / totalExpenses) * 100 : 0;
                                            return (
                                                <div key={cat.name}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: cat.color }} />
                                                            <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>{cat.name}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{pct.toFixed(1)}%</span>
                                                            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.875rem', fontWeight: 600, color: '#f43f5e' }}>{formatCurrency(parseFloat(cat.total), user.currency)}</span>
                                                        </div>
                                                    </div>
                                                    <div style={{ height: '4px', background: 'var(--bg-border)', borderRadius: '2px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${pct}%`, background: cat.color, borderRadius: '2px', transition: 'width 0.5s ease' }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', overflow: 'hidden' }}>
                                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Transactions ({data.transactions.length})</h3>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{from} → {to}</span>
                                </div>
                                {data.transactions.length === 0 ? (
                                    <EmptyState
                                        icon={FileText}
                                        title="No transactions in this range"
                                        subtitle="Try a different date range"
                                    />
                                ) : (
                                    <div>
                                        {data.transactions.map((tx: any) => {
                                            const isIncome = tx.type === 'income';
                                            return (
                                                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--bg-border)', gap: '12px' }}
                                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                                        <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: isIncome ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            {isIncome ? <TrendingUp size={14} color="#10b981" /> : <TrendingDown size={14} color="#f43f5e" />}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.description}</p>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                                {tx.category_name && <span style={{ fontSize: '0.68rem', color: tx.category_color || 'var(--text-muted)', background: `${tx.category_color}20`, padding: '1px 6px', borderRadius: '4px' }}>{tx.category_name}</span>}
                                                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{formatDate(tx.date)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: isIncome ? '#10b981' : '#f43f5e', margin: 0, flexShrink: 0 }}>
                                                        {isIncome ? '+' : '-'}{formatCurrency(parseFloat(tx.amount), user.currency)}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                        </FadeIn>
                    )}

                    {!searched && (
                        <FadeIn>
                        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '60px', textAlign: 'center' }}>
                            <FileText size={32} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>Select a date range and click Generate</p>
                        </div>
                        </FadeIn>
                    )}
                </>
            )}

            {activeTab === 'health' && (
                <>
                    {!healthReport && (
                        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '60px 40px', textAlign: 'center' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🏆</div>
                            <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>Financial Health Report Card</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0 0 24px 0', maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto' }}>AI analyses your current month's transactions, budgets, and goals to give you an overall financial health score.</p>
                            <Button onClick={async () => { setHealthLoading(true); try { const res = await aiAPI.healthReport(); setHealthReport(res.data); } catch (e) { console.error(e); } finally { setHealthLoading(false); } }} isLoading={healthLoading} size="md">
                                <Sparkles size={15} />Generate Health Report
                            </Button>
                        </div>
                    )}

                    {healthReport && (
                        <FadeIn>
                        <div id="health-report-printable">
                            {/* Score Hero */}
                            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '28px', marginBottom: '16px', textAlign: 'center' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', background: `${gradeColor(healthReport.grade)}20`, border: `3px solid ${gradeColor(healthReport.grade)}`, marginBottom: '12px' }}>
                                    <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '2rem', fontWeight: 700, color: gradeColor(healthReport.grade) }}>{healthReport.grade}</span>
                                </div>
                                <div style={{ fontFamily: 'Sora, sans-serif', fontSize: '2.2rem', fontWeight: 700, color: gradeColor(healthReport.grade), lineHeight: 1 }}>{healthReport.health_score}<span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 400 }}>/100</span></div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '8px auto 0', maxWidth: '480px', lineHeight: 1.6 }}>{healthReport.narrative}</p>
                                <Button variant="secondary" size="sm" onClick={async () => { setHealthLoading(true); try { const res = await aiAPI.healthReport(); setHealthReport(res.data); } catch (e) { console.error(e); } finally { setHealthLoading(false); } }} isLoading={healthLoading} style={{ marginTop: '16px' }}>
                                    <Sparkles size={13} />Regenerate
                                </Button>
                            </div>

                            {/* Sub-scores */}
                            {healthReport.scores && (
                                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Score Breakdown</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        {Object.entries(healthReport.scores).map(([key, val]: [string, any]) => {
                                            const colors: Record<string, string> = { spending: '#f43f5e', savings: '#10b981', budget: '#3b82f6', goals: '#f59e0b', consistency: '#8b5cf6' };
                                            const color = colors[key] || '#10b981';
                                            return (
                                                <div key={key}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                        <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500, textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                                                        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.82rem', fontWeight: 600, color }}>{val}/100</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        {scoreBar(val, color)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Strengths & Improvements */}
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                {healthReport.strengths?.length > 0 && (
                                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px' }}>
                                        <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: '#10b981', margin: '0 0 14px 0' }}>✅ Strengths</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {healthReport.strengths.map((s: string, i: number) => (
                                                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                    <span style={{ color: '#10b981', fontSize: '0.9rem', flexShrink: 0, marginTop: '1px' }}>•</span>
                                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {healthReport.improvements?.length > 0 && (
                                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px' }}>
                                        <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: '#f59e0b', margin: '0 0 14px 0' }}>⚡ Areas to Improve</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {healthReport.improvements.map((s: string, i: number) => (
                                                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                    <span style={{ color: '#f59e0b', fontSize: '0.9rem', flexShrink: 0, marginTop: '1px' }}>•</span>
                                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Budget Performance */}
                            {healthReport.budget_performance?.length > 0 && (
                                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px 0' }}>Budget Performance</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {healthReport.budget_performance.map((b: any, i: number) => {
                                            const used = Math.min(b.percentage_used, 100);
                                            const over = b.percentage_used > 100;
                                            return (
                                                <div key={i}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                        <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>{b.category}</span>
                                                        <span style={{ fontSize: '0.78rem', color: over ? '#f43f5e' : '#10b981', fontWeight: 600 }}>{b.percentage_used?.toFixed(0)}%{over ? ' over' : ''}</span>
                                                    </div>
                                                    {scoreBar(used, over ? '#f43f5e' : '#10b981')}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Goals Progress */}
                            {healthReport.goals_progress?.length > 0 && (
                                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px 0' }}>Goals Progress</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {healthReport.goals_progress.map((g: any, i: number) => (
                                            <div key={i}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>{g.name}</span>
                                                    <span style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: 600 }}>{g.percentage?.toFixed(0)}%</span>
                                                </div>
                                                {scoreBar(Math.min(g.percentage, 100), '#3b82f6')}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        </FadeIn>
                    )}
                </>
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @media print {
                    body > * { display: none !important; }
                    #health-report-printable, #health-report-printable * { display: revert !important; }
                    #health-report-printable { position: fixed; top: 0; left: 0; width: 100%; background: white; color: black; padding: 20px; }
                }
            `}</style>
        </PageShell>
        </AppLayout>
    );
}