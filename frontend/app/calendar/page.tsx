'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, TrendingUp, TrendingDown, X, CalendarDays } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { SkeletonCard, Skeleton } from '@/components/ui/Skeleton';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { formatCurrency } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useWindowSize';

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function CalendarPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();
    const today = new Date();

    const [currentMonth, setCurrentMonth]   = useState(today.getMonth());
    const [currentYear, setCurrentYear]     = useState(today.getFullYear());
    const [transactions, setTransactions]   = useState<any[]>([]);
    const [loading, setLoading]             = useState(true);
    const [selectedDate, setSelectedDate]   = useState<string | null>(null);
    const [modalOpen, setModalOpen]         = useState(false);
    const [editingTx, setEditingTx]         = useState<any>(null);
    const [defaultDate, setDefaultDate]     = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchTransactions = async () => {
        if (!user) return; setLoading(true);
        try { const res = await transactionsAPI.getAll({ month: currentMonth + 1, year: currentYear }); setTransactions(res.data.transactions); }
        catch (err) { console.error(err); }
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

    const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);

    const todayStr    = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const monthIncome  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
    const monthExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
    const selectedData  = selectedDate ? dayMap[selectedDate] : null;

    const prevMonth = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y-1); } else setCurrentMonth(m => m-1); setSelectedDate(null); };
    const nextMonth = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y+1); } else setCurrentMonth(m => m+1); setSelectedDate(null); };

    // Swipe to change month
    const touchStartX = useRef(0);
    const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
    const handleTouchEnd   = (e: React.TouchEvent) => {
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) < 40) return; // ignore small swipes
        if (dx < 0) nextMonth(); else prevMonth();
    };

    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={400} />
        </AppLayout>
    );

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* Header */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Calendar</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Transaction timeline</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {!isMobile && (
                                <>
                                    <GCard style={{ padding: '8px 12px', textAlign: 'center' }}>
                                        <p style={{ fontSize: '10px', color: 'var(--color-inc)', margin: '0 0 2px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Income</p>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-inc)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(monthIncome, user.currency)}</p>
                                    </GCard>
                                    <GCard style={{ padding: '8px 12px', textAlign: 'center' }}>
                                        <p style={{ fontSize: '10px', color: 'var(--color-exp)', margin: '0 0 2px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Expenses</p>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(monthExpenses, user.currency)}</p>
                                    </GCard>
                                </>
                            )}
                            <button type="button" onClick={prevMonth} style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', background: 'var(--bg-alt)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={16} /></button>
                            <span style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', minWidth: isMobile ? '90px' : '120px', textAlign: 'center' }}>{isMobile ? MONTHS[currentMonth].slice(0,3) : MONTHS[currentMonth]} {currentYear}</span>
                            <button type="button" onClick={nextMonth} style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', background: 'var(--bg-alt)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={16} /></button>
                        </div>
                    </div>
                </div>

                {/* Mobile summary chips */}
                {isMobile && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <GCard style={{ flex: 1, textAlign: 'center', padding: '10px 12px' }}>
                            <p style={{ fontSize: '10px', color: 'var(--color-inc)', margin: '0 0 3px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Income</p>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-inc)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(monthIncome, user.currency)}</p>
                        </GCard>
                        <GCard style={{ flex: 1, textAlign: 'center', padding: '10px 12px' }}>
                            <p style={{ fontSize: '10px', color: 'var(--color-exp)', margin: '0 0 3px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Expenses</p>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(monthExpenses, user.currency)}</p>
                        </GCard>
                    </div>
                )}

                {/* Calendar grid — swipe left/right to change month on mobile */}
                <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                    {/* Day headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--border)' }}>
                        {DAYS.map(d => <div key={d} style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{d}</div>)}
                    </div>
                    {loading ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-body)' }}>Loading transactions…</div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                            {cells.map((day, idx) => {
                                if (!day) return <div key={`e-${idx}`} style={{ minHeight: '80px', borderRight: (idx+1)%7!==0?'1px solid var(--border)':'none', borderBottom: '1px solid var(--border)', background: 'var(--bg-alt)' }} />;
                                const dateStr   = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                                const data      = dayMap[dateStr];
                                const isToday   = dateStr === todayStr;
                                const isSelected = dateStr === selectedDate;
                                return (
                                    <div key={dateStr} onClick={() => setSelectedDate(prev => prev===dateStr ? null : dateStr)}
                                        style={{ minHeight: '80px', borderRight: (idx+1)%7!==0?'1px solid var(--border)':'none', borderBottom: '1px solid var(--border)', padding: '6px', cursor: 'pointer', background: isSelected ? 'color-mix(in srgb, var(--accent-light) 50%, transparent)' : 'transparent', transition: 'background 0.15s' }}
                                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: isToday ? 'var(--accent)' : 'transparent', border: isSelected && !isToday ? '1px solid var(--accent-border)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: isToday ? 700 : 400, color: isToday ? 'white' : 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{day}</span>
                                            {data && (
                                                <div style={{ display: 'flex', gap: '2px' }}>
                                                    {data.income > 0   && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--color-inc)' }} />}
                                                    {data.expenses > 0 && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--color-exp)' }} />}
                                                </div>
                                            )}
                                        </div>
                                        {data && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                {data.income   > 0 && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-inc)',  margin: 0, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>+₹{Math.round(data.income).toLocaleString('en-IN')}</p>}
                                                {data.expenses > 0 && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-exp)', margin: 0, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>-₹{Math.round(data.expenses).toLocaleString('en-IN')}</p>}
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
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                    {new Date(selectedDate+'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </h3>
                                {selectedData && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '3px 0 0', fontFamily: 'var(--font-body)' }}>{selectedData.transactions.length} transaction{selectedData.transactions.length!==1?'s':''}</p>}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button type="button" onClick={() => { setDefaultDate(selectedDate); setEditingTx(null); setModalOpen(true); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: 'var(--radius-md)', background: 'var(--accent-light)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                    <Plus size={14} />Add
                                </button>
                                <button type="button" onClick={() => setSelectedDate(null)} style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        {!selectedData || selectedData.transactions.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-body)' }}>
                                No transactions.{' '}
                                <button type="button" onClick={() => { setDefaultDate(selectedDate); setEditingTx(null); setModalOpen(true); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '13px', fontFamily: 'var(--font-body)' }}>Add one?</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {selectedData.transactions.map((tx: any) => {
                                    const isIncome = tx.type === 'income';
                                    return (
                                        <div key={tx.id} onClick={() => { setEditingTx(tx); setModalOpen(true); }}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'background var(--transition-fast)' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: isIncome ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {isIncome ? <TrendingUp size={14} color="var(--color-inc)" /> : <TrendingDown size={14} color="var(--color-exp)" />}
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>{tx.description}</p>
                                                    {tx.category_name && <span style={{ fontSize: '11px', color: tx.category_color || 'var(--text-muted)', background: `${tx.category_color || 'var(--bg-alt)'}20`, padding: '1px 6px', borderRadius: '4px', fontFamily: 'var(--font-body)' }}>{tx.category_name}</span>}
                                                </div>
                                            </div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: isIncome ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                                {isIncome ? '+' : '−'}{formatCurrency(parseFloat(tx.amount), user.currency)}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Empty state */}
                {!loading && transactions.length === 0 && !selectedDate && (
                    <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                        <p style={{ fontSize: '40px', marginBottom: '10px' }}>📅</p>
                        <p style={{ fontFamily: 'var(--font-head)', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>No transactions this month</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 18px', fontFamily: 'var(--font-body)' }}>Add transactions to see them plotted on the calendar</p>
                        <button type="button" onClick={() => { setDefaultDate(todayStr); setEditingTx(null); setModalOpen(true); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            <Plus size={14} /> Add Transaction
                        </button>
                    </div>
                )}

                <TransactionModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingTx(null); }} onSuccess={fetchTransactions} transaction={editingTx} defaultDate={defaultDate} />
            </div>
        </AppLayout>
    );
}
