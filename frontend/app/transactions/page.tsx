'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Plus, Search, Download, Sparkles, X, CalendarDays, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCircle, SkeletonText, SkeletonButton } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { TransactionList } from '@/components/transactions/TransactionList';
import { exportToCSV } from '@/lib/utils';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW_YEAR = new Date().getFullYear();
const NOW_MONTH = new Date().getMonth() + 1;
const YEARS = Array.from({ length: NOW_YEAR - 2021 }, (_, i) => 2022 + i);

function TransactionsPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const [transactions, setTransactions] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTx, setEditingTx] = useState<any>(null);
    const [prefillData, setPrefillData] = useState<any>(null);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [selectedMonth, setSelectedMonth] = useState<number | null>(NOW_MONTH);
    const [selectedYear, setSelectedYear] = useState(NOW_YEAR);
    const [pendingMonth, setPendingMonth] = useState<number | null>(NOW_MONTH);
    const [pendingYear, setPendingYear] = useState(NOW_YEAR);
    const [showMonthSheet, setShowMonthSheet] = useState(false);
    const [tagFilter, setTagFilter] = useState('');
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [quickAddText, setQuickAddText] = useState('');
    const [quickAddLoading, setQuickAddLoading] = useState(false);
    const [quickAddError, setQuickAddError] = useState('');
    const [placeholderIdx, setPlaceholderIdx] = useState(0);

    const QUICK_ADD_PLACEHOLDERS = [
        'paid 450 for lunch at cafe',
        'received salary 85000',
        'uber 180 to airport',
        'netflix subscription 649',
        'grocery shopping 2300 at dmart',
    ];

    const filterLabel = selectedMonth
        ? `${MONTHS_SHORT[selectedMonth - 1]} ${selectedYear}`
        : 'All time';

    useEffect(() => {
        if (!quickAddOpen) return;
        const t = setInterval(() => setPlaceholderIdx(i => (i + 1) % QUICK_ADD_PLACEHOLDERS.length), 2500);
        return () => clearInterval(t);
    }, [quickAddOpen]);

    const handleQuickAdd = async (e?: React.MouseEvent) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (!quickAddText.trim()) return;
        setQuickAddLoading(true);
        setQuickAddError('');
        try {
            const res = await aiAPI.parseSMS(quickAddText.trim());
            const parsed = res.data.parsed;
            if (!parsed) throw new Error('No parsed result');
            setQuickAddOpen(false);
            setQuickAddText('');
            setEditingTx(null);
            setPrefillData(parsed);
            setModalOpen(true);
        } catch (e: any) {
            setQuickAddError('Could not parse — try rephrasing');
        } finally {
            setQuickAddLoading(false);
        }
    };

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);
    useEffect(() => {
        if (searchParams.get('add') === 'true') {
            setModalOpen(true);
            router.replace('/transactions');
        }
    }, [searchParams]);

    const fetchTransactions = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const params = selectedMonth ? { month: selectedMonth, year: selectedYear } : {};
            const res = await transactionsAPI.getAll(params);
            setTransactions(res.data.transactions);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { if (user) fetchTransactions(); }, [user, selectedMonth, selectedYear]);

    useEffect(() => {
        let result = [...transactions];
        if (typeFilter !== 'all') result = result.filter(tx => tx.type === typeFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(tx => tx.description.toLowerCase().includes(q) || tx.category_name?.toLowerCase().includes(q));
        }
        if (tagFilter.trim()) {
            const tag = tagFilter.toLowerCase().replace('#', '');
            result = result.filter(tx => tx.tags && tx.tags.some((t: string) => t.toLowerCase().includes(tag)));
        }
        setFiltered(result);
    }, [transactions, typeFilter, search, tagFilter]);

    const totalIncome = filtered.filter(tx => tx.type === 'income').reduce((s, tx) => s + parseFloat(tx.amount), 0);
    const totalExpense = filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + parseFloat(tx.amount), 0);

    const handleModalClose = () => {
        setModalOpen(false);
        setEditingTx(null);
        setPrefillData(null);
    };

    const openMonthSheet = () => {
        setPendingMonth(selectedMonth);
        setPendingYear(selectedYear);
        setShowMonthSheet(true);
    };

    const applyMonthFilter = () => {
        setSelectedMonth(pendingMonth);
        setSelectedYear(pendingYear);
        setShowMonthSheet(false);
    };

    const clearMonthFilter = () => {
        setSelectedMonth(null);
        setSelectedYear(NOW_YEAR);
        setShowMonthSheet(false);
    };

    // Month filter chip shared style helper
    const monthChipStyle = (active: boolean): React.CSSProperties => ({
        height: '32px', padding: '0 12px', borderRadius: '999px', border: active ? '1px solid var(--accent-blue-border, var(--bg-border))' : '1px solid var(--bg-border)',
        background: active ? 'var(--accent-blue-bg)' : 'var(--bg-secondary)', color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
        fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'DM Sans, sans-serif',
        transition: 'all var(--transition-fast)',
    });

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <SkeletonButton />
                <SkeletonButton />
                <Skeleton width="100%" height={36} borderRadius={8} />
            </div>
            {[1,2,3].map(group => (
                <div key={group} style={{ marginBottom: '16px' }}>
                    <Skeleton width="120px" height={14} borderRadius={4} style={{ marginBottom: '10px' }} />
                    {[1,2,3].map(i => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--bg-border)' }}>
                            <SkeletonCircle size={40} />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <SkeletonText />
                                <Skeleton width="50%" height={12} borderRadius={4} />
                            </div>
                            <Skeleton width={72} height={16} borderRadius={4} />
                        </div>
                    ))}
                </div>
            ))}
        </AppLayout>
    );

    return (
        <AppLayout>
            {/* Header */}
            {isMobile ? (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                            <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Transactions</h1>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '2px 0 0 0' }}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button variant="secondary" size="md" onClick={() => { setQuickAddOpen(true); setQuickAddText(''); setQuickAddError(''); }}>
                                <Sparkles size={15} />AI
                            </Button>
                            <Button onClick={() => { setEditingTx(null); setPrefillData(null); setModalOpen(true); }} size="md">
                                <Plus size={15} />Add
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Transactions</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <Button variant="secondary" size="md" onClick={() => exportToCSV(filtered, `fintrack-${selectedYear}-${String(selectedMonth ?? new Date().getMonth() + 1).padStart(2, '0')}.csv`)}>
                            <Download size={16} />Export CSV
                        </Button>
                        <Button variant="secondary" size="md" onClick={() => { setQuickAddOpen(true); setQuickAddText(''); setQuickAddError(''); }}>
                            <Sparkles size={16} />Quick Add ✨
                        </Button>
                        <Button onClick={() => { setEditingTx(null); setPrefillData(null); setModalOpen(true); }} size="md">
                            <Plus size={16} />Add Transaction
                        </Button>
                    </div>
                </div>
            )}

            {/* Summary */}
            {isMobile ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                    {[
                        { label: 'Income', value: totalIncome, color: 'var(--accent-green)' },
                        { label: 'Expenses', value: totalExpense, color: 'var(--accent-red)' },
                    ].map(card => (
                        <div key={card.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '12px', padding: '10px 12px', textAlign: 'center' }}>
                            <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', margin: '0 0 3px 0' }}>{card.label}</p>
                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1rem', fontWeight: 600, color: card.color, margin: 0 }}>₹{Math.abs(card.value).toLocaleString('en-IN')}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
                    {[
                        { label: 'Income', value: totalIncome, color: 'var(--accent-green)' },
                        { label: 'Expenses', value: totalExpense, color: 'var(--accent-red)' },
                        { label: 'Net', value: totalIncome - totalExpense, color: totalIncome - totalExpense >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
                    ].map(card => (
                        <div key={card.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '14px', padding: '14px 16px' }}>
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>{card.label}</p>
                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: card.color, margin: 0 }}>₹{Math.abs(card.value).toLocaleString('en-IN')}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters */}
            {isMobile ? (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ marginBottom: '10px' }}>
                        <Input type="text" placeholder="Search transactions..." icon={<Search size={15} />} value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', paddingBottom: '2px' }}>
                        {['all', 'income', 'expense'].map(t => (
                            <button key={t} onClick={() => setTypeFilter(t)}
                                style={{ height: '32px', padding: '0 12px', borderRadius: '999px', border: typeFilter === t ? '1px solid var(--accent-green-border)' : '1px solid var(--bg-border)', background: typeFilter === t ? 'var(--accent-green-bg)' : 'var(--bg-secondary)', color: typeFilter === t ? 'var(--accent-green)' : 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'capitalize', transition: 'all var(--transition-fast)' }}>
                                {t === 'all' ? 'All' : t}
                            </button>
                        ))}
                        <button onClick={openMonthSheet} style={monthChipStyle(!!selectedMonth)}>
                            <CalendarDays size={12} />
                            {filterLabel}
                            <ChevronDown size={11} />
                        </button>
                        <input type="text" placeholder="#tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)}
                            style={{ height: '32px', padding: '0 12px', background: tagFilter ? 'rgba(139,92,246,0.1)' : 'var(--bg-secondary)', color: tagFilter ? '#8b5cf6' : 'var(--text-primary)', border: tagFilter ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--bg-border)', borderRadius: '999px', fontSize: '0.75rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', width: '72px', flexShrink: 0, transition: 'all 0.2s' }} />
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: '150px' }}>
                        <Input type="text" placeholder="Search transactions..." icon={<Search size={15} />} value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {['all', 'income', 'expense'].map(t => (
                            <button key={t} onClick={() => setTypeFilter(t)}
                                style={{ padding: '8px 10px', borderRadius: '10px', border: typeFilter === t ? '1px solid var(--accent-green-border)' : '1px solid var(--bg-border)', background: typeFilter === t ? 'var(--accent-green-bg)' : 'var(--bg-secondary)', color: typeFilter === t ? 'var(--accent-green)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize', transition: 'all var(--transition-fast)' }}>
                                {t === 'all' ? 'All' : t}
                            </button>
                        ))}
                    </div>
                    <button onClick={openMonthSheet} style={{ padding: '8px 12px', borderRadius: '10px', border: selectedMonth ? '1px solid var(--accent-blue-border, var(--bg-border))' : '1px solid var(--bg-border)', background: selectedMonth ? 'var(--accent-blue-bg)' : 'var(--bg-secondary)', color: selectedMonth ? 'var(--accent-blue)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'DM Sans, sans-serif', transition: 'all var(--transition-fast)' }}>
                        <CalendarDays size={14} />
                        {filterLabel}
                        <ChevronDown size={13} />
                    </button>
                    <input type="text" placeholder="#tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)}
                        style={{ padding: '8px 12px', background: tagFilter ? 'rgba(139,92,246,0.1)' : 'var(--bg-secondary)', color: tagFilter ? '#8b5cf6' : 'var(--text-primary)', border: tagFilter ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.78rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', width: '80px', transition: 'all 0.2s' }} />
                </div>
            )}

            {/* List */}
            <div className="fintrack-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
                ) : (
                    <TransactionList transactions={filtered} currency={user.currency} onEdit={tx => { setEditingTx(tx); setPrefillData(null); setModalOpen(true); }} onRefresh={fetchTransactions} />
                )}
            </div>

            <TransactionModal isOpen={modalOpen} onClose={handleModalClose} onSuccess={fetchTransactions} transaction={editingTx} prefill={prefillData} />

            {/* Month + Year filter sheet */}
            {showMonthSheet && (
                <>
                    <div onClick={() => setShowMonthSheet(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, backdropFilter: 'blur(2px)' }} />
                    <div style={{
                        position: 'fixed', left: 0, right: 0,
                        bottom: isMobile ? 0 : 'auto',
                        top: isMobile ? 'auto' : '50%',
                        ...(isMobile ? {} : { left: '50%', transform: 'translate(-50%, -50%)', right: 'auto', width: '360px' }),
                        background: 'var(--bg-secondary)',
                        borderTop: isMobile ? '1px solid var(--bg-border)' : 'none',
                        border: isMobile ? undefined : '1px solid var(--bg-border)',
                        borderRadius: isMobile ? '20px 20px 0 0' : '20px',
                        zIndex: 500,
                        padding: '20px 16px',
                        paddingBottom: isMobile ? 'calc(20px + env(safe-area-inset-bottom))' : '20px',
                        boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
                        maxHeight: isMobile ? '80vh' : '520px',
                        overflowY: 'auto',
                    }}>
                        {/* Sheet header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Sora, sans-serif' }}>Filter by period</span>
                            <button onClick={() => setShowMonthSheet(false)} style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <X size={14} />
                            </button>
                        </div>

                        {/* Section 1 — Year pills */}
                        <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px 0' }}>Year</p>
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '4px', marginBottom: '20px' }}>
                            {YEARS.map(yr => (
                                <button key={yr} onClick={() => setPendingYear(yr)} style={{
                                    padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                                    background: pendingYear === yr ? 'var(--accent-blue)' : 'var(--bg-hover)',
                                    color: pendingYear === yr ? '#fff' : 'var(--text-secondary)',
                                    fontSize: '14px', fontWeight: 600, flexShrink: 0,
                                    fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                                }}>
                                    {yr}
                                </button>
                            ))}
                        </div>

                        {/* Section 2 — Month grid */}
                        <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px 0' }}>Month</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                            {MONTHS_SHORT.map((name, idx) => {
                                const m = idx + 1;
                                const isFuture = pendingYear === NOW_YEAR && m > NOW_MONTH;
                                const isSelected = pendingMonth === m;
                                return (
                                    <button
                                        key={m}
                                        onClick={() => !isFuture && setPendingMonth(m)}
                                        style={{
                                            borderRadius: '10px', padding: '10px 0', textAlign: 'center',
                                            fontSize: '13px', fontWeight: 500, cursor: isFuture ? 'not-allowed' : 'pointer',
                                            border: 'none',
                                            background: isSelected ? 'var(--accent-blue)' : 'var(--bg-hover)',
                                            color: isSelected ? '#fff' : 'var(--text-secondary)',
                                            opacity: isFuture ? 0.4 : 1,
                                            fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                                        }}
                                    >
                                        {name}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Section 3 — Action row */}
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={clearMonthFilter} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                                Clear
                            </button>
                            <button onClick={applyMonthFilter} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'var(--accent-blue)', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                                Apply
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Quick Add Modal */}
            {quickAddOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={e => { if (e.target === e.currentTarget) { setQuickAddOpen(false); } }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Sparkles size={18} color="#10b981" />
                                </div>
                                <div>
                                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Quick Add</h3>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0 }}>Describe the transaction in plain language</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setQuickAddOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
                        </div>

                        <textarea
                            value={quickAddText}
                            onChange={e => setQuickAddText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleQuickAdd(); }}
                            placeholder={QUICK_ADD_PLACEHOLDERS[placeholderIdx]}
                            rows={3}
                            autoFocus
                            style={{ width: '100%', padding: '14px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '12px', fontSize: '0.95rem', fontFamily: 'DM Sans, sans-serif', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, transition: 'border-color 0.15s' }}
                            onFocus={e => (e.target.style.borderColor = 'rgba(16,185,129,0.5)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--bg-border)')}
                        />

                        {quickAddError && <p style={{ fontSize: '0.8rem', color: '#f43f5e', margin: '8px 0 0 0' }}>{quickAddError}</p>}

                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
                            <Button type="button" variant="secondary" size="md" onClick={() => setQuickAddOpen(false)}>Cancel</Button>
                            <Button type="button" size="md" onClick={handleQuickAdd} isLoading={quickAddLoading} disabled={!quickAddText.trim()}>
                                <Sparkles size={14} />Parse & Fill
                            </Button>
                        </div>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '12px 0 0 0', textAlign: 'center' }}>AI will parse your text and pre-fill the transaction form</p>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}

export default function TransactionsPage() {
    return <Suspense><TransactionsPageInner /></Suspense>;
}
