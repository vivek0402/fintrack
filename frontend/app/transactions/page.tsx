'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Download, Zap, X, CalendarDays, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { Skeleton, SkeletonCircle, SkeletonText, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { TransactionList } from '@/components/transactions/TransactionList';
import { exportToCSV } from '@/lib/utils';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW_YEAR  = new Date().getFullYear();
const NOW_MONTH = new Date().getMonth() + 1;
const fmt = (n: number) => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

function TransactionsPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const [transactions, setTransactions]   = useState<any[]>([]);
    const [filtered, setFiltered]           = useState<any[]>([]);
    const [loading, setLoading]             = useState(true);
    const [modalOpen, setModalOpen]         = useState(false);
    const [editingTx, setEditingTx]         = useState<any>(null);
    const [prefillData, setPrefillData]     = useState<any>(null);
    const [search, setSearch]               = useState('');
    const [typeFilter, setTypeFilter]       = useState('all');
    const [selectedMonth, setSelectedMonth] = useState<number | null>(NOW_MONTH);
    const [selectedYear, setSelectedYear]   = useState(NOW_YEAR);
    const [pendingMonth, setPendingMonth]   = useState<number | null>(NOW_MONTH);
    const [pendingYear, setPendingYear]     = useState(NOW_YEAR);
    const [showMonthSheet, setShowMonthSheet] = useState(false);
    const [tagFilter, setTagFilter]         = useState('');
    const [quickAddOpen, setQuickAddOpen]   = useState(false);
    const [quickAddText, setQuickAddText]   = useState('');
    const [quickAddLoading, setQuickAddLoading] = useState(false);
    const [quickAddError, setQuickAddError] = useState('');
    const [placeholderIdx, setPlaceholderIdx] = useState(0);
    const [earliestYear, setEarliestYear]   = useState(NOW_YEAR);
    const [earliestMonth, setEarliestMonth] = useState(1);
    const [displayCount, setDisplayCount]   = useState(50);
    const filterBtnRef    = useRef<HTMLButtonElement>(null);
    const filterPopoverRef = useRef<HTMLDivElement>(null);
    const [filterPos, setFilterPos] = useState({ top: 0, left: 0 });

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

    // ── Search clears month filter ───────────────────────────────────────────
    const searchClearedMonthRef = useRef(false);
    useEffect(() => {
        if (search.trim() && selectedMonth !== null) {
            searchClearedMonthRef.current = true;
            setSelectedMonth(null);
        } else if (!search.trim() && searchClearedMonthRef.current) {
            searchClearedMonthRef.current = false;
            setSelectedMonth(NOW_MONTH);
            setSelectedYear(NOW_YEAR);
        }
    }, [search]);

    // ── Quick add placeholder rotation ──────────────────────────────────────
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
            const res = await aiAPI.quickAdd(quickAddText.trim());
            const parsed = res.data.data;
            if (!parsed) throw new Error('No parsed result');
            setQuickAddOpen(false);
            setQuickAddText('');
            setEditingTx(null);
            setPrefillData(parsed);
            setModalOpen(true);
        } catch {
            setQuickAddError('Could not parse — try rephrasing');
        } finally {
            setQuickAddLoading(false);
        }
    };

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        transactionsAPI.earliest().then(res => {
            const d = new Date(res.data.date);
            setEarliestYear(d.getFullYear());
            setEarliestMonth(d.getMonth() + 1);
        }).catch(() => {});
    }, [user]);

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

    useEffect(() => {
        if (user) { setDisplayCount(50); fetchTransactions(); }
    }, [user, selectedMonth, selectedYear]);

    useEffect(() => {
        let result = [...transactions];
        if (typeFilter !== 'all') result = result.filter(tx => tx.type === typeFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(tx =>
                tx.description?.toLowerCase().includes(q) ||
                tx.category_name?.toLowerCase().includes(q) ||
                tx.notes?.toLowerCase().includes(q) ||
                tx.tags?.some((t: string) => t.toLowerCase().includes(q))
            );
        }
        if (tagFilter.trim()) {
            const tag = tagFilter.toLowerCase().replace('#', '');
            result = result.filter(tx => tx.tags?.some((t: string) => t.toLowerCase().includes(tag)));
        }
        setFiltered(result);
        setDisplayCount(50);
    }, [transactions, typeFilter, search, tagFilter]);

    const totalIncome  = filtered.filter(tx => tx.type === 'income').reduce((s, tx) => s + parseFloat(tx.amount), 0);
    const totalExpense = filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + parseFloat(tx.amount), 0);
    const visibleTransactions = filtered.slice(0, displayCount);
    const hasMore = filtered.length > displayCount;

    const handleModalClose = () => { setModalOpen(false); setEditingTx(null); setPrefillData(null); };

    const openMonthSheet = () => {
        setPendingMonth(selectedMonth);
        setPendingYear(selectedYear);
        if (filterBtnRef.current) {
            const rect = filterBtnRef.current.getBoundingClientRect();
            const sw = window.innerWidth;
            const pw = sw < 480 ? sw - 16 : 280;
            let lp = rect.right + window.scrollX - pw;
            if (lp < 8) lp = 8;
            if (lp + pw > sw - 8) lp = sw - pw - 8;
            setFilterPos({ top: rect.bottom + window.scrollY + 8, left: lp });
        }
        setShowMonthSheet(true);
    };

    useEffect(() => {
        if (!showMonthSheet) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (
                filterPopoverRef.current && !filterPopoverRef.current.contains(t) &&
                filterBtnRef.current && !filterBtnRef.current.contains(t)
            ) setShowMonthSheet(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMonthSheet]);

    const applyMonthFilter  = () => { setSelectedMonth(pendingMonth); setSelectedYear(pendingYear); setShowMonthSheet(false); };
    const clearMonthFilter  = () => { setSelectedMonth(null); setSelectedYear(NOW_YEAR); setShowMonthSheet(false); };

    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <SkeletonCard height={36} style={{ flex: 1 }} />
                <SkeletonCard height={36} style={{ flex: 1 }} />
            </div>
            <SkeletonCard height={300} />
        </AppLayout>
    );

    const filterPillStyle = (active: boolean): React.CSSProperties => ({
        height: '32px', padding: '0 14px', borderRadius: '999px', flexShrink: 0,
        background: active ? 'var(--accent)' : 'var(--bg-card)',
        color: active ? 'white' : 'var(--text-muted)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        fontSize: '13px', fontWeight: active ? 600 : 400, cursor: 'pointer',
        whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: '5px',
        fontFamily: 'var(--font-body)', transition: 'all var(--transition-fast)',
    });

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>
                                Transactions
                            </h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                {filterLabel} · {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {!isMobile && (
                                <button type="button" onClick={() => void exportToCSV(filtered, `fintrack-${selectedYear}-${String(selectedMonth ?? NOW_MONTH).padStart(2, '0')}.csv`)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                    <Download size={14} /> Export
                                </button>
                            )}
                            <button type="button" onClick={() => { setQuickAddOpen(true); setQuickAddText(''); setQuickAddError(''); }}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                <Zap size={14} /> Quick Add
                            </button>
                            <button type="button" onClick={() => { setEditingTx(null); setPrefillData(null); setModalOpen(true); }}
                                style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <Plus size={18} color="white" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── SEARCH + FILTER PILLS ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                        <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        <input
                            type="text"
                            placeholder="Search transactions…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px 10px 36px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '14px', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', transition: 'border-color var(--transition-fast)' }}
                            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                        />
                    </div>

                    {/* Filter pills row */}
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', paddingBottom: '2px' }}>
                        {(['all', 'income', 'expense'] as const).map(t => (
                            <button key={t} type="button" onClick={() => setTypeFilter(t)} style={filterPillStyle(typeFilter === t)}>
                                {t === 'all' ? 'All' : t === 'income' ? '↑ Income' : '↓ Expenses'}
                            </button>
                        ))}
                        <button ref={filterBtnRef} type="button" onClick={openMonthSheet} style={filterPillStyle(!!selectedMonth)}>
                            <CalendarDays size={12} />
                            {filterLabel}
                            <ChevronDown size={11} />
                        </button>
                        <input
                            type="text"
                            placeholder="#tag"
                            value={tagFilter}
                            onChange={e => setTagFilter(e.target.value)}
                            style={{ height: '32px', padding: '0 12px', background: tagFilter ? 'var(--accent-light)' : 'var(--bg-card)', color: tagFilter ? 'var(--accent)' : 'var(--text-primary)', border: `1px solid ${tagFilter ? 'var(--accent-border)' : 'var(--border)'}`, borderRadius: '999px', fontSize: '13px', fontFamily: 'var(--font-body)', outline: 'none', width: '72px', flexShrink: 0, transition: 'all 0.2s' }}
                        />
                    </div>
                </div>

                {/* ── SUMMARY GCARDS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '10px' }}>
                    <GCard style={{ textAlign: isMobile ? 'center' : undefined }}>
                        <p style={{ fontSize: '10px', color: 'var(--color-inc)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Income</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-inc)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(totalIncome)}
                        </p>
                    </GCard>
                    <GCard style={{ textAlign: isMobile ? 'center' : undefined }}>
                        <p style={{ fontSize: '10px', color: 'var(--color-exp)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Expenses</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(totalExpense)}
                        </p>
                    </GCard>
                    {!isMobile && (
                        <GCard>
                            <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Net</p>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: totalIncome - totalExpense >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                {totalIncome - totalExpense >= 0 ? '+' : '−'}{fmt(totalIncome - totalExpense)}
                            </p>
                        </GCard>
                    )}
                </div>

                {/* ── TRANSACTION LIST ── */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                    {loading ? (
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <SkeletonCircle size={32} />
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <SkeletonText />
                                        <Skeleton width="45%" height={10} borderRadius={4} />
                                    </div>
                                    <Skeleton width={70} height={14} borderRadius={4} />
                                </div>
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                            <p style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</p>
                            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                {search ? 'No transactions match your search.' : 'No transactions this period.'}
                            </p>
                        </div>
                    ) : (
                        <TransactionList
                            transactions={visibleTransactions}
                            currency={user.currency}
                            onEdit={tx => { setEditingTx(tx); setPrefillData(null); setModalOpen(true); }}
                            onRefresh={fetchTransactions}
                        />
                    )}
                    {hasMore && !loading && (
                        <button type="button" onClick={() => setDisplayCount(c => c + 50)}
                            style={{ width: '100%', padding: '14px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            Load more ({filtered.length - displayCount} remaining)
                        </button>
                    )}
                </div>

            </div>

            {/* ── TRANSACTION MODAL ── */}
            <TransactionModal isOpen={modalOpen} onClose={handleModalClose} onSuccess={fetchTransactions} transaction={editingTx} prefill={prefillData} />

            {/* ── MONTH FILTER POPOVER (portal) ── */}
            {showMonthSheet && typeof document !== 'undefined' && createPortal(
                <div
                    ref={filterPopoverRef}
                    style={{
                        position: 'absolute', top: filterPos.top, left: filterPos.left, zIndex: 1000,
                        width: typeof window !== 'undefined' && window.innerWidth < 480 ? `${window.innerWidth - 16}px` : '280px',
                        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-modal)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-head)' }}>Filter by period</span>
                        <button type="button" onClick={() => setShowMonthSheet(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px' }}>
                            <X size={15} />
                        </button>
                    </div>
                    <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>Year</p>
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '4px', marginBottom: '16px' }}>
                        {Array.from({ length: NOW_YEAR - earliestYear + 1 }, (_, i) => earliestYear + i).map(yr => (
                            <button key={yr} type="button" onClick={() => setPendingYear(yr)} style={{ padding: '4px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer', flexShrink: 0, backgroundColor: pendingYear === yr ? 'var(--accent)' : 'var(--bg-hover)', color: pendingYear === yr ? 'white' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}>
                                {yr}
                            </button>
                        ))}
                    </div>
                    <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>Month</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '16px' }}>
                        {MONTHS_SHORT.map((name, idx) => {
                            const m = idx + 1;
                            const isFuture = pendingYear === NOW_YEAR && m > NOW_MONTH;
                            const isPast   = pendingYear === earliestYear && m < earliestMonth;
                            const isSelected = pendingMonth === m;
                            return (
                                <button key={m} type="button" onClick={() => !isFuture && !isPast && setPendingMonth(m)} style={{ padding: '6px 0', textAlign: 'center', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: (isFuture || isPast) ? 'not-allowed' : 'pointer', pointerEvents: (isFuture || isPast) ? 'none' : 'auto', backgroundColor: isSelected ? 'var(--accent)' : 'var(--bg-hover)', color: isSelected ? 'white' : 'var(--text-secondary)', opacity: (isFuture || isPast) ? 0.35 : 1, fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}>
                                    {name}
                                </button>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" onClick={clearMonthFilter} style={{ flex: 1, padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Clear</button>
                        <button type="button" onClick={applyMonthFilter} style={{ flex: 1, padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--accent)', color: 'white', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Apply</button>
                    </div>
                </div>,
                document.body
            )}

            {/* ── QUICK ADD MODAL (portal) ── */}
            {quickAddOpen && createPortal(
                <div onClick={e => { if (e.target === e.currentTarget) setQuickAddOpen(false); }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: 'var(--shadow-modal)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'var(--accent-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Zap size={18} color="var(--accent)" />
                                </div>
                                <div>
                                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Quick Add</h3>
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Describe the transaction in plain language</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setQuickAddOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <textarea
                            value={quickAddText}
                            onChange={e => setQuickAddText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleQuickAdd(); }}
                            placeholder={QUICK_ADD_PLACEHOLDERS[placeholderIdx]}
                            rows={3}
                            autoFocus
                            style={{ width: '100%', padding: '14px', background: 'var(--bg-alt)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.95rem', fontFamily: 'var(--font-body)', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, transition: 'border-color 0.15s' }}
                            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                        />
                        {quickAddError && <p style={{ fontSize: '0.8rem', color: 'var(--color-exp)', margin: '8px 0 0', fontFamily: 'var(--font-body)' }}>{quickAddError}</p>}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setQuickAddOpen(false)} style={{ padding: '10px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-alt)', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
                            <button type="button" onClick={handleQuickAdd} disabled={!quickAddText.trim() || quickAddLoading}
                                style={{ padding: '10px 20px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--accent)', color: 'white', fontSize: '14px', fontWeight: 600, cursor: !quickAddText.trim() || quickAddLoading ? 'not-allowed' : 'pointer', opacity: !quickAddText.trim() || quickAddLoading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-body)' }}>
                                <Zap size={14} />{quickAddLoading ? 'Parsing…' : 'Parse & Fill'}
                            </button>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '12px 0 0', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
                            AI will parse your text and pre-fill the transaction form
                        </p>
                    </div>
                </div>,
                document.body
            )}

        </AppLayout>
    );
}

export default function TransactionsPage() {
    return <Suspense><TransactionsPageInner /></Suspense>;
}
