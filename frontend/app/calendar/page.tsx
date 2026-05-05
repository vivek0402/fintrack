'use client';

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, TrendingUp, TrendingDown, X, CalendarDays } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonTitle, SkeletonCard } from '@/components/ui/Skeleton';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { formatCurrency } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useWindowSize';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();
    const today = new Date();

    const [currentMonth, setCurrentMonth] = useState(today.getMonth());
    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTx, setEditingTx] = useState<any>(null);
    const [defaultDate, setDefaultDate] = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchTransactions = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await transactionsAPI.getAll({ month: currentMonth + 1, year: currentYear });
            setTransactions(res.data.transactions);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { if (user) fetchTransactions(); }, [user, currentMonth, currentYear]);

    const dayMap: Record<string, any> = {};
    transactions.forEach(tx => {
        const key = tx.date.split('T')[0];
        if (!dayMap[key]) dayMap[key] = { income: 0, expenses: 0, transactions: [] };
        if (tx.type === 'income') dayMap[key].income += parseFloat(tx.amount);
        else dayMap[key].expenses += parseFloat(tx.amount);
        dayMap[key].transactions.push(tx);
    });

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const monthIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
    const monthExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
    const selectedData = selectedDate ? dayMap[selectedDate] : null;

    const prevMonth = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); setSelectedDate(null); };
    const nextMonth = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); setSelectedDate(null); };

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

    return (
        <AppLayout>
            <PageShell
                title="Calendar"
                subtitle="Transaction timeline"
                headerRight={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Summary chips — desktop only */}
                        {!isMobile && [
                            { label: 'Income', value: monthIncome, color: 'var(--accent-green)', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.15)' },
                            { label: 'Expenses', value: monthExpenses, color: 'var(--accent-red)', bg: 'rgba(244,63,94,0.08)', border: 'rgba(244,63,94,0.15)' },
                        ].map(chip => (
                            <div key={chip.label} style={{ background: chip.bg, border: `1px solid ${chip.border}`, borderRadius: '10px', padding: '6px 12px', textAlign: 'center' }}>
                                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0 0 2px 0', fontFamily: "'Satoshi','DM Sans',sans-serif" }}>{chip.label}</p>
                                <p style={{ fontFamily: "'DM Mono','Fira Mono',monospace", fontSize: '0.85rem', fontWeight: 600, color: chip.color, margin: 0 }}>{formatCurrency(chip.value, user.currency)}</p>
                            </div>
                        ))}
                        {/* Month nav */}
                        <button onClick={prevMonth} style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--bg-border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={16} /></button>
                        <span style={{ fontFamily: "'Cabinet Grotesk','Sora',sans-serif", fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', minWidth: isMobile ? '90px' : '120px', textAlign: 'center' }}>{isMobile ? MONTHS[currentMonth].slice(0, 3) : MONTHS[currentMonth]} {currentYear}</span>
                        <button onClick={nextMonth} style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--bg-border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={16} /></button>
                    </div>
                }
            >

            {/* Mobile-only: income/expense summary chips */}
            {isMobile && (
                <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                        { label: 'Income', value: monthIncome, color: 'var(--accent-green)', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.15)' },
                        { label: 'Expenses', value: monthExpenses, color: 'var(--accent-red)', bg: 'rgba(244,63,94,0.08)', border: 'rgba(244,63,94,0.15)' },
                    ].map(chip => (
                        <div key={chip.label} style={{ flex: 1, background: chip.bg, border: `1px solid ${chip.border}`, borderRadius: 'var(--radius-md)', padding: '8px 12px', textAlign: 'center' }}>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0 0 2px 0', fontFamily: "'Satoshi','DM Sans',sans-serif" }}>{chip.label}</p>
                            <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '0.85rem', fontWeight: 600, color: chip.color, margin: 0 }}>{formatCurrency(chip.value, user.currency)}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Calendar */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '20px', overflow: 'hidden' }}>
                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--bg-border)' }}>
                    {DAYS.map(d => <div key={d} style={{ padding: '10px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{d}</div>)}
                </div>

                {/* Grid */}
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', fontFamily: "'Satoshi','DM Sans',sans-serif" }}>Loading transactions…</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                        {cells.map((day, idx) => {
                            if (!day) return <div key={`e-${idx}`} style={{ minHeight: '80px', borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--bg-border)' : 'none', borderBottom: '1px solid var(--bg-border)', background: 'var(--bg-primary)' }} />;

                            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const data = dayMap[dateStr];
                            const isToday = dateStr === todayStr;
                            const isSelected = dateStr === selectedDate;

                            return (
                                <div key={dateStr} onClick={() => setSelectedDate(prev => prev === dateStr ? null : dateStr)}
                                    style={{ minHeight: '80px', borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--bg-border)' : 'none', borderBottom: '1px solid var(--bg-border)', padding: '6px', cursor: 'pointer', background: isSelected ? 'rgba(16,185,129,0.05)' : 'transparent', transition: 'background 0.15s' }}
                                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: isToday ? '#10b981' : 'transparent', border: isSelected && !isToday ? '1px solid rgba(16,185,129,0.4)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: isToday ? 700 : 400, color: isToday ? '#fff' : 'var(--text-primary)' }}>{day}</span>
                                        {data && (
                                            <div style={{ display: 'flex', gap: '2px' }}>
                                                {data.income > 0 && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }} />}
                                                {data.expenses > 0 && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f43f5e' }} />}
                                            </div>
                                        )}
                                    </div>
                                    {data && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                            {data.income > 0 && <p style={{ fontSize: '0.62rem', color: '#10b981', margin: 0, fontWeight: 500 }}>+₹{data.income.toLocaleString('en-IN')}</p>}
                                            {data.expenses > 0 && <p style={{ fontSize: '0.62rem', color: '#f43f5e', margin: 0, fontWeight: 500 }}>-₹{data.expenses.toLocaleString('en-IN')}</p>}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Selected day panel */}
            {selectedDate && (
                <div style={{ marginTop: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </h3>
                            {selectedData && <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '3px 0 0 0' }}>{selectedData.transactions.length} transaction{selectedData.transactions.length !== 1 ? 's' : ''}</p>}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => { setDefaultDate(selectedDate); setEditingTx(null); setModalOpen(true); }}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}>
                                <Plus size={14} />Add
                            </button>
                            <button onClick={() => setSelectedDate(null)} style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'transparent', border: '1px solid var(--bg-border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    {!selectedData || selectedData.transactions.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            No transactions. <button onClick={() => { setDefaultDate(selectedDate); setEditingTx(null); setModalOpen(true); }} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '0.875rem' }}>Add one?</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {selectedData.transactions.map((tx: any) => {
                                const isIncome = tx.type === 'income';
                                return (
                                    <div key={tx.id} onClick={() => { setEditingTx(tx); setModalOpen(true); }}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: isIncome ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {isIncome ? <TrendingUp size={14} color="#10b981" /> : <TrendingDown size={14} color="#f43f5e" />}
                                            </div>
                                            <div>
                                                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>{tx.description}</p>
                                                {tx.category_name && <span style={{ fontSize: '0.68rem', color: tx.category_color || 'var(--text-muted)', background: `${tx.category_color}20`, padding: '1px 6px', borderRadius: '4px' }}>{tx.category_name}</span>}
                                            </div>
                                        </div>
                                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: isIncome ? '#10b981' : '#f43f5e', margin: 0 }}>
                                            {isIncome ? '+' : '-'}{formatCurrency(parseFloat(tx.amount), user.currency)}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {!loading && transactions.length === 0 && !selectedDate && (
                <EmptyState
                    icon={CalendarDays}
                    title="No transactions this month"
                    subtitle="Add transactions to see them plotted on the calendar"
                    action={
                        <button
                            type="button"
                            onClick={() => { setDefaultDate(todayStr); setEditingTx(null); setModalOpen(true); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Satoshi','DM Sans',sans-serif" }}
                        >
                            <Plus size={14} /> Add Transaction
                        </button>
                    }
                />
            )}

            <TransactionModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingTx(null); }} onSuccess={fetchTransactions} transaction={editingTx} defaultDate={defaultDate} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </PageShell>
        </AppLayout>
    );
}