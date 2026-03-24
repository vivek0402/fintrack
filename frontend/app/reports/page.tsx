'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Download, TrendingUp, TrendingDown, Search } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate, exportToCSV } from '@/lib/utils';

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
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '24px', height: '24px', border: '2px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    return (
        <AppLayout>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Reports</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>Custom date range analysis</p>
                </div>
                {data && <Button variant="secondary" size="md" onClick={() => exportToCSV(data.transactions, `fintrack-report-${from}-to-${to}.csv`)}><Download size={16} />Export CSV</Button>}
            </div>

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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>From</label>
                        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '10px 14px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>To</label>
                        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '10px 14px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none' }} />
                    </div>
                    <Button onClick={fetchReport} isLoading={loading} size="md"><Search size={15} />Generate</Button>
                </div>
            </div>

            {searched && data && (
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
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No transactions in this range</div>
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
            )}

            {!searched && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '60px', textAlign: 'center' }}>
                    <FileText size={32} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>Select a date range and click Generate</p>
                </div>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}