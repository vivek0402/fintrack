'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';

import { Plus, Search, Download, Sparkles, X, CalendarDays, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageShell } from '@/components/layout/PageShell';
import { Skeleton, SkeletonTitle, SkeletonCircle, SkeletonText, SkeletonButton } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { TransactionList } from '@/components/transactions/TransactionList';
import { exportToCSV } from '@/lib/utils';
import PageHelp from '@/components/ui/PageHelp';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW_YEAR = new Date().getFullYear();
const NOW_MONTH = new Date().getMonth() + 1;

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
    const [earliestYear, setEarliestYear] = useState(NOW_YEAR);
    const [earliestMonth, setEarliestMonth] = useState(1);
    const filterBtnRef = useRef<HTMLButtonElement>(null);
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
        if (filterBtnRef.current) {
            const rect = filterBtnRef.current.getBoundingClientRect();
            const screenWidth = window.innerWidth;
            let popoverWidth = screenWidth < 480 ? screenWidth - 16 : 280;
            let leftPos = rect.right + window.scrollX - popoverWidth;
            if (leftPos < 8) leftPos = 8;
            if (leftPos + popoverWidth > screenWidth - 8) leftPos = screenWidth - popoverWidth - 8;
            setFilterPos({
                top: rect.bottom + window.scrollY + 8,
                left: leftPos,
            });
        }
        setShowMonthSheet(true);
    };

    // Close filter popover on outside click
    useEffect(() => {
        if (!showMonthSheet) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                filterPopoverRef.current && !filterPopoverRef.current.contains(target) &&
                filterBtnRef.current && !filterBtnRef.current.contains(target)
            ) {
                setShowMonthSheet(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMonthSheet]);

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
            <div style={{ animation: 'fadeUp 200ms ease forwards' }}>
            <PageShell
                title="Transactions"
                subtitle={`${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}`}
                headerRight={
                    isMobile ? (
                        // Mobile: just the + icon in the corner
                        <button
                            type="button"
                            onClick={() => { setEditingTx(null); setPrefillData(null); setModalOpen(true); }}
                            style={{
                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                background: 'var(--accent-blue)', border: 'none',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', flexShrink: 0,
                            }}
                        >
                            <Plus size={18} color="#fff" />
                        </button>
                    ) : (
                        // Desktop: full action row
                        <>
                            <Button variant="secondary" size="md" onClick={() => void exportToCSV(filtered, `fintrack-${selectedYear}-${String(selectedMonth ?? new Date().getMonth() + 1).padStart(2, '0')}.csv`)}>
                                <Download size={16} />Export CSV
                            </Button>
                            <Button variant="secondary" size="md" onClick={() => { setQuickAddOpen(true); setQuickAddText(''); setQuickAddError(''); }}>
                                <Sparkles size={16} />Quick Add
                            </Button>
                            <Button onClick={() => { setEditingTx(null); setPrefillData(null); setModalOpen(true); }} size="md">
                                <Plus size={16} />Add Transaction
                            </Button>
                            <PageHelp title="Transactions" sections={[
                                { icon: '💸', heading: 'What is this page?', body: 'View, add, edit and delete all your transactions. Filter by month/year or search by description.' },
                                { icon: '➕', heading: 'Adding Transactions', body: "Tap the blue + button to add a transaction manually. Or use Quick Add — type naturally like '₹500 food at Zomato' and AI fills in the details." },
                                { icon: '✏️', heading: 'Editing', body: 'Tap any transaction row to edit it. Swipe left to reveal the delete button.' },
                                { icon: '🔍', heading: 'Filtering', body: 'Use the month/year pills at the top to filter transactions by time period.' },
                            ]} />
                        </>
                    )
                }
            >
                {/* Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: isMobile ? '8px' : '12px' }}>
                    {(isMobile
                        ? [
                            { label: 'Income', value: totalIncome, color: 'var(--accent-green)' },
                            { label: 'Expenses', value: totalExpense, color: 'var(--accent-red)' },
                        ]
                        : [
                            { label: 'Income', value: totalIncome, color: 'var(--accent-green)' },
                            { label: 'Expenses', value: totalExpense, color: 'var(--accent-red)' },
                            { label: 'Net', value: totalIncome - totalExpense, color: totalIncome - totalExpense >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
                        ]
                    ).map(card => (
                        <div key={card.label} style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-md)', padding: isMobile ? '10px 12px' : 'var(--space-4)', textAlign: isMobile ? 'center' : undefined }}>
                            <p style={{ fontSize: isMobile ? '0.68rem' : '0.72rem', color: 'var(--text-secondary)', margin: isMobile ? '0 0 3px 0' : '0 0 4px 0' }}>{card.label}</p>
                            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '1rem', fontWeight: 600, color: card.color, margin: 0 }}>₹{Math.abs(card.value).toLocaleString('en-IN')}</p>
                        </div>
                    ))}
                </div>

                {/* Mobile-only: Quick Add + Export row */}
                {isMobile && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={() => { setQuickAddOpen(true); setQuickAddText(''); setQuickAddError(''); }}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'Satoshi', 'DM Sans', sans-serif" }}
                        >
                            <Sparkles size={14} color="var(--accent-green)" />Quick Add
                        </button>
                        <button
                            type="button"
                            onClick={() => void exportToCSV(filtered, `fintrack-${selectedYear}-${String(selectedMonth ?? new Date().getMonth() + 1).padStart(2, '0')}.csv`)}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'Satoshi', 'DM Sans', sans-serif" }}
                        >
                            <Download size={14} />Export CSV
                        </button>
                    </div>
                )}

                {/* Filters */}
                {isMobile ? (
                    <div>
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
                            <button ref={filterBtnRef} onClick={openMonthSheet} style={monthChipStyle(!!selectedMonth)}>
                                <CalendarDays size={12} />
                                {filterLabel}
                                <ChevronDown size={11} />
                            </button>
                            <input type="text" placeholder="#tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)}
                                style={{ height: '32px', padding: '0 12px', background: tagFilter ? 'var(--accent-purple-bg)' : 'var(--bg-secondary)', color: tagFilter ? 'var(--accent-purple)' : 'var(--text-primary)', border: tagFilter ? '1px solid var(--accent-blue-border)' : '1px solid var(--bg-border)', borderRadius: '999px', fontSize: '0.75rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', width: '72px', flexShrink: 0, transition: 'all 0.2s' }} />
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
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
                        <button ref={filterBtnRef} onClick={openMonthSheet} style={{ padding: '8px 12px', borderRadius: '10px', border: selectedMonth ? '1px solid var(--accent-blue-border, var(--bg-border))' : '1px solid var(--bg-border)', background: selectedMonth ? 'var(--accent-blue-bg)' : 'var(--bg-secondary)', color: selectedMonth ? 'var(--accent-blue)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'DM Sans, sans-serif', transition: 'all var(--transition-fast)' }}>
                            <CalendarDays size={14} />
                            {filterLabel}
                            <ChevronDown size={13} />
                        </button>
                        <input type="text" placeholder="#tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)}
                            style={{ padding: '8px 12px', background: tagFilter ? 'var(--accent-purple-bg)' : 'var(--bg-secondary)', color: tagFilter ? 'var(--accent-purple)' : 'var(--text-primary)', border: tagFilter ? '1px solid var(--accent-blue-border)' : '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.78rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', width: '80px', transition: 'all 0.2s' }} />
                    </div>
                )}

                {/* List */}
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', transition: `box-shadow var(--transition-fast)` }}>
                    {loading ? (
                        <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {[...Array(3)].map((_, g) => (
                                <div key={g} style={{ marginBottom: 'var(--space-2)' }}>
                                    <Skeleton width="120px" height={12} borderRadius={4} style={{ marginBottom: '10px' }} />
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) 0' }}>
                                            <SkeletonCircle size={32} />
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <SkeletonText />
                                                <Skeleton width="50%" height={10} borderRadius={4} />
                                            </div>
                                            <Skeleton width={72} height={16} borderRadius={4} />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <TransactionList transactions={filtered} currency={user.currency} onEdit={tx => { setEditingTx(tx); setPrefillData(null); setModalOpen(true); }} onRefresh={fetchTransactions} />
                    )}
                </div>
            </PageShell>

            <TransactionModal isOpen={modalOpen} onClose={handleModalClose} onSuccess={fetchTransactions} transaction={editingTx} prefill={prefillData} />
            </div>

            {/* Month + Year filter popover — portal, anchored below the filter button */}
            {showMonthSheet && typeof document !== 'undefined' && createPortal(
                <div
                    ref={filterPopoverRef}
                    style={{
                        position: 'absolute',
                        top: filterPos.top,
                        left: filterPos.left,
                        zIndex: 1000,
                        width: typeof window !== 'undefined' && window.innerWidth < 480 ? `${window.innerWidth - 16}px` : '280px',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--bg-border)',
                        borderRadius: '16px',
                        padding: '20px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'DM Sans, sans-serif' }}>Filter by period</span>
                        <button onClick={() => setShowMonthSheet(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px' }}>
                            <X size={15} />
                        </button>
                    </div>

                    {/* Year pills */}
                    <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px 0' }}>Year</p>
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '4px', marginBottom: '16px' }}>
                        {Array.from({ length: NOW_YEAR - earliestYear + 1 }, (_, i) => earliestYear + i).map(yr => (
                            <button key={yr} onClick={() => setPendingYear(yr)} style={{
                                padding: '4px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer', flexShrink: 0,
                                backgroundColor: pendingYear === yr ? 'var(--accent-blue)' : 'var(--bg-hover)',
                                color: pendingYear === yr ? '#fff' : 'var(--text-secondary)',
                                fontSize: '13px', fontWeight: 600, fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                            }}>
                                {yr}
                            </button>
                        ))}
                    </div>

                    {/* Month grid */}
                    <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px 0' }}>Month</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '16px' }}>
                        {MONTHS_SHORT.map((name, idx) => {
                            const m = idx + 1;
                            const isFuture = pendingYear === NOW_YEAR && m > NOW_MONTH;
                            const isPast = pendingYear === earliestYear && m < earliestMonth;
                            const isSelected = pendingMonth === m;
                            return (
                                <button
                                    key={m}
                                    onClick={() => !isFuture && !isPast && setPendingMonth(m)}
                                    style={{
                                        padding: '6px 0', textAlign: 'center', borderRadius: '8px',
                                        fontSize: '13px', fontWeight: 500, border: 'none',
                                        cursor: (isFuture || isPast) ? 'not-allowed' : 'pointer',
                                        pointerEvents: (isFuture || isPast) ? 'none' : 'auto',
                                        backgroundColor: isSelected ? 'var(--accent-blue)' : 'var(--bg-hover)',
                                        color: isSelected ? '#fff' : 'var(--text-secondary)',
                                        opacity: (isFuture || isPast) ? 0.35 : 1,
                                        fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                                    }}
                                >
                                    {name}
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={clearMonthFilter} style={{ flex: 1, padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                            Clear
                        </button>
                        <button onClick={applyMonthFilter} style={{ flex: 1, padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--accent-blue)', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                            Apply
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {/* Quick Add Modal */}
            {quickAddOpen && createPortal(
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={e => { if (e.target === e.currentTarget) { setQuickAddOpen(false); } }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Sparkles size={18} color="#10b981" />
                                </div>
                                <div>
                                    <h3 style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Quick Add</h3>
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
                </div>,
                document.body
            )}

        </AppLayout>
    );
}

export default function TransactionsPage() {
    return <Suspense><TransactionsPageInner /></Suspense>;
}
