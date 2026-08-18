'use client';

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Download, Zap, X, CheckSquare, FileUp, MessageSquareText, MoreHorizontal, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, SearchX } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI, aiAPI, recurringAPI, analyticsAPI, accountsAPI, creditCardsAPI } from '@/lib/api';
import { apiWithCache } from '@/lib/apiWithCache';
import { cacheTransactions, getCachedTransactions } from '@/lib/offlineCache';
import { GCard } from '@/components/ui/GCard';
import { StatTile } from '@/components/ui/StatTile';
import { Skeleton, SkeletonCircle, SkeletonText, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { TransactionList } from '@/components/transactions/TransactionList';
import { BulkOpsPanel } from '@/components/transactions/BulkOpsPanel';
import { AdvancedSearchBar } from '@/components/transactions/AdvancedSearchBar';
import { BankStatementImporter } from '@/components/transactions/BankStatementImporter';
import { SmsImporter } from '@/components/transactions/SmsImporter';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import { exportToCSV, formatCurrency, fmt as fmtBase, getSmartIcon, isNonSavingsExpense, isRealIncome } from '@/lib/utils';

const VIEW_TABS = [
    { key: 'list', label: 'List' },
    { key: 'calendar', label: 'Calendar' },
];

const getNowYear  = () => new Date().getFullYear();
const getNowMonth = () => new Date().getMonth() + 1;
const fmt = (n: number) => fmtBase(Math.abs(n));

// ── Shared inline error card (list + calendar fetch failures) ──────────────
function FetchErrorCard({ onRetry }: { onRetry: () => void }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                Couldn't load transactions
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                Check your connection and try again.
            </p>
            <button type="button" onClick={onRetry}
                style={{ marginTop: '4px', padding: '8px 16px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Retry
            </button>
        </div>
    );
}

function TransactionsPageInner() {
    const router       = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile     = useIsMobile();

    const initialView = searchParams.get('view');
    const [view, setView] = useState<'list' | 'calendar'>(initialView === 'calendar' ? 'calendar' : 'list');

    const [transactions, setTransactions]   = useState<any[]>([]);
    const [filtered, setFiltered]           = useState<any[]>([]);
    const [loading, setLoading]             = useState(true);
    const [modalOpen, setModalOpen]         = useState(false);
    const [editingTx, setEditingTx]         = useState<any>(null);
    const [prefillData, setPrefillData]     = useState<any>(null);
    const [selectedMonth, setSelectedMonth] = useState<number | null>(getNowMonth);
    const [selectedYear, setSelectedYear]   = useState(getNowYear);
    const [quickAddOpen, setQuickAddOpen]   = useState(false);
    const [quickAddText, setQuickAddText]   = useState('');
    const [quickAddLoading, setQuickAddLoading] = useState(false);
    const [quickAddError, setQuickAddError] = useState('');
    const [placeholderIdx, setPlaceholderIdx] = useState(0);
    const [displayCount, setDisplayCount]   = useState(50);
    const [selectMode, setSelectMode]       = useState(false);
    const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
    // Shared "optimistically hidden but not yet deleted" ids -- both single-row
    // delete (TransactionList) and bulk delete (BulkOpsPanel) write to this so
    // rows disappear immediately while the undo window is still open.
    const [pendingDelete, setPendingDelete] = useState<Set<string>>(new Set());
    const [initialQuery, setInitialQuery]   = useState('');
    const [filterCreditCardId, setFilterCreditCardId] = useState<number | null>(null);
    const [accounts, setAccounts]           = useState<{ id: number; name: string }[]>([]);
    const [creditCards, setCreditCards]     = useState<any[]>([]);
    const [importOpen, setImportOpen]       = useState(false);
    const [smsImportOpen, setSmsImportOpen] = useState(false);
    const [moreMenuOpen, setMoreMenuOpen]   = useState(false);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    const [quickAddFabHover, setQuickAddFabHover] = useState(false);
    const [fetchError, setFetchError]       = useState(false);
    const [quickAddFailed, setQuickAddFailed] = useState(false);
    const [prevPeriodSummary, setPrevPeriodSummary] = useState<{ total_income: number; total_expenses: number } | null>(null);
    const clearAllRef = useRef<() => void>(() => {});

    const QUICK_ADD_PLACEHOLDERS = [
        'paid 450 for lunch at cafe',
        'received salary 85000',
        'uber 180 to airport',
        'netflix subscription 649',
        'grocery shopping 2300 at dmart',
    ];

    // ── Infinite scroll ───────────────────────────────────────────────────────
    const loadMoreRef = useCallback((node: HTMLElement | null) => {
        if (!node) return;
        const observer = new IntersectionObserver(
            entries => { if (entries[0].isIntersecting) setDisplayCount(c => c + 50); },
            { threshold: 0.1 }
        );
        observer.observe(node);
    }, []);

    // ── Quick add placeholder rotation ────────────────────────────────────────
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

    // ── Read ?q= from URL (set by GlobalSearch navigation) ───────────────────
    useEffect(() => {
        const q = searchParams.get('q');
        if (q) {
            setInitialQuery(q);
            router.replace('/transactions');
        }
        if (searchParams.get('add') === 'true') {
            setModalOpen(true);
            router.replace('/transactions');
        }
        const ccId = searchParams.get('credit_card_id');
        if (ccId) {
            setFilterCreditCardId(Number(ccId));
            setSelectedMonth(null); // show all-time activity for this card, not just the current month
            router.replace('/transactions');
        }
    }, [searchParams]);

    const fetchTransactions = async () => {
        if (!user) return;
        setLoading(true);
        setFetchError(false);
        const params: Record<string, any> = selectedMonth ? { month: selectedMonth, year: selectedYear } : {};
        if (filterCreditCardId) params.credit_card_id = filterCreditCardId;
        try {
            // Bypass apiWithCache here (which swallows failures and falls back to
            // cache silently) so a genuine backend error can surface distinctly
            // from "this month has zero transactions" -- OfflineBanner already
            // covers pure browser-offline app-wide, so this is specifically for
            // an online-but-failing backend with no cache to fall back to.
            const res = await transactionsAPI.getAll(params);
            const txs = res.data?.transactions ?? [];
            setTransactions(txs);
            cacheTransactions(txs).catch(() => {});
        } catch {
            const cached = await getCachedTransactions();
            setTransactions(cached);
            if (cached.length === 0) setFetchError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) { setDisplayCount(50); fetchTransactions(); }
    }, [user, selectedMonth, selectedYear, filterCreditCardId]);

    useEffect(() => {
        const handler = () => fetchTransactions();
        window.addEventListener('fintrack:queue-synced', handler);
        return () => window.removeEventListener('fintrack:queue-synced', handler);
    }, [user, selectedMonth, selectedYear, filterCreditCardId]);

    // Powers the filter bar's Account section and resolves filterCreditCardId
    // (set from a ?credit_card_id= deep link) to a human-readable chip label.
    useEffect(() => {
        if (!user) return;
        accountsAPI.getAll().then(res => setAccounts(res.data.accounts || [])).catch(() => setAccounts([]));
        creditCardsAPI.getAll().then(res => setCreditCards(res.data.cards || [])).catch(() => setCreditCards([]));
    }, [user]);

    const handleOfflineSave = (pendingTx: any) => {
        setTransactions(prev => [pendingTx, ...prev]);
    };

    // Reset display count when filtered changes
    useEffect(() => { setDisplayCount(50); }, [filtered]);

    // Prune selectedIds when filtered changes underneath select mode -- otherwise
    // bulk ops can silently operate on ids that fell out of the current filter.
    useEffect(() => {
        setSelectedIds(prev => {
            if (prev.size === 0) return prev;
            const filteredIds = new Set(filtered.map((tx: any) => tx.id));
            const next = new Set([...prev].filter(id => filteredIds.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [filtered]);

    // ── Date context from AdvancedSearchBar ───────────────────────────────────
    const handleSetDateContext = useCallback((ctx: 'month' | 'all') => {
        if (ctx === 'all') {
            setSelectedMonth(null);
        } else {
            setSelectedMonth(prev => prev === null ? getNowMonth() : prev);
            if (selectedMonth === null) setSelectedYear(getNowYear());
        }
    }, [selectedMonth]);

    // ── List view month navigation ────────────────────────────────────────────
    // selectedMonth is 1-indexed (getNowMonth() is `new Date().getMonth() + 1`),
    // unlike CalendarView's own 0-indexed currentMonth -- these are two
    // separate pieces of state, List and Calendar views don't share a month.
    const prevMonthList = useCallback(() => {
        setSelectedMonth(m => {
            const current = m ?? getNowMonth();
            if (current === 1) { setSelectedYear(y => y - 1); return 12; }
            return current - 1;
        });
    }, []);

    const nextMonthList = useCallback(() => {
        setSelectedMonth(m => {
            const current = m ?? getNowMonth();
            if (current === 12) { setSelectedYear(y => y + 1); return 1; }
            return current + 1;
        });
    }, []);

    const totalIncome  = filtered.filter(isRealIncome).reduce((s, tx) => s + parseFloat(tx.amount), 0);
    const totalExpense = filtered.filter(isNonSavingsExpense).reduce((s, tx) => s + parseFloat(tx.amount), 0);
    const netAmount    = totalIncome - totalExpense;
    const visibleTransactions = filtered.slice(0, displayCount);
    const hasMore = filtered.length > displayCount;

    const handleModalClose = () => { setModalOpen(false); setEditingTx(null); setPrefillData(null); };

    // ── Select mode ──────────────────────────────────────────────────────────
    const exitSelectMode = useCallback(() => { setSelectMode(false); setSelectedIds(new Set()); }, []);

    useEffect(() => {
        if (!selectMode) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') exitSelectMode(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [selectMode, exitSelectMode]);

    // Close mobile "more" menu on outside click
    useEffect(() => {
        if (!moreMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setMoreMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [moreMenuOpen]);

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(filtered.map((tx: any) => tx.id)));
    }, [filtered]);

    const removeIds = useCallback((ids: string[]) => {
        const idSet = new Set(ids);
        setTransactions(prev => prev.filter(tx => !idSet.has(tx.id)));
    }, []);

    if (isLoading || !user) return (
        <>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <SkeletonCard height={36} style={{ flex: 1 }} />
                <SkeletonCard height={36} style={{ flex: 1 }} />
            </div>
            <SkeletonCard height={300} />
        </>
    );

    const filteredCard = filterCreditCardId ? creditCards.find((c: any) => c.id === filterCreditCardId) : null;
    const creditCardChips = filterCreditCardId ? [{
        label: filteredCard
            ? `Card: ${filteredCard.bank_name} ${filteredCard.card_name}${filteredCard.last_four ? ' ••' + filteredCard.last_four : ''}`
            : 'Card filter',
        onClear: () => setFilterCreditCardId(null),
    }] : [];

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>
                                Transactions
                            </h1>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                    {view === 'list'
                                        ? <>{selectedMonth
                                            ? `${new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'short' })} ${selectedYear}`
                                            : 'All time'
                                        } · {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</>
                                        : 'Transaction timeline'
                                    }
                                </p>
                                {view === 'list' && selectedMonth !== null && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <button type="button" onClick={prevMonthList} title="Previous month" aria-label="Previous month"
                                            style={{ width: '20px', height: '20px', padding: 0, borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <ChevronLeft size={12} />
                                        </button>
                                        <button type="button" onClick={nextMonthList} title="Next month" aria-label="Next month"
                                            style={{ width: '20px', height: '20px', padding: 0, borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <ChevronRight size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        {view === 'list' && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {!isMobile && (
                                <>
                                    <button type="button"
                                        onClick={() => void exportToCSV(filtered, `fintrack-${selectedYear}-${String(selectedMonth ?? getNowMonth()).padStart(2, '0')}.csv`)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        <Download size={14} /> Export
                                    </button>
                                    <button type="button"
                                        onClick={() => setImportOpen(true)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        <FileUp size={14} /> Import PDF
                                    </button>
                                    <button type="button"
                                        onClick={() => setSmsImportOpen(true)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        <MessageSquareText size={14} /> Import SMS
                                    </button>
                                    <button type="button"
                                        onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: selectMode ? 'var(--accent-subtle)' : 'var(--bg-surface-2)', border: `1px solid ${selectMode ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', color: selectMode ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '13px', fontWeight: selectMode ? 600 : 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        <CheckSquare size={16} /> {selectMode ? 'Cancel' : 'Select'}
                                    </button>
                                </>
                            )}
                            {isMobile && (
                                <div ref={moreMenuRef} style={{ position: 'relative' }}>
                                    <button type="button"
                                        onClick={() => setMoreMenuOpen(o => !o)}
                                        title="More actions"
                                        style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: moreMenuOpen ? 'var(--accent-subtle)' : 'var(--bg-surface-2)', border: `1px solid ${moreMenuOpen ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', color: moreMenuOpen ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer' }}>
                                        <MoreHorizontal size={18} />
                                    </button>
                                    {moreMenuOpen && (
                                        <div style={{ position: 'absolute', top: '42px', right: 0, background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-modal)', zIndex: 300, minWidth: '170px', overflow: 'hidden' }}>
                                            <button type="button"
                                                onClick={() => { setImportOpen(true); setMoreMenuOpen(false); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                                                <FileUp size={15} /> Import PDF
                                            </button>
                                            <button type="button"
                                                onClick={() => { setSmsImportOpen(true); setMoreMenuOpen(false); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                                                <MessageSquareText size={15} /> Import SMS
                                            </button>
                                            <button type="button"
                                                onClick={() => { selectMode ? exitSelectMode() : setSelectMode(true); setMoreMenuOpen(false); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                                                <CheckSquare size={15} /> {selectMode ? 'Cancel select' : 'Select'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            <button type="button"
                                onClick={() => { setEditingTx(null); setPrefillData(null); setModalOpen(true); }}
                                aria-label="Add transaction"
                                style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <Plus size={18} color="white" />
                            </button>
                        </div>
                        )}
                    </div>
                </div>

                <Tabs tabs={VIEW_TABS} active={view} onChange={k => setView(k as 'list' | 'calendar')} />

                {view === 'list' && (
                <>
                {/* ── ADVANCED SEARCH BAR ── */}
                <AdvancedSearchBar
                    transactions={transactions}
                    onFilter={setFiltered}
                    onSetDateContext={handleSetDateContext}
                    initialQuery={initialQuery}
                    accounts={accounts}
                    extraChips={creditCardChips}
                    onRegisterClearAll={fn => { clearAllRef.current = fn; }}
                />

                {/* ── SUMMARY: INCOME / EXPENSE ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
                </div>

                {/* ── SUMMARY: NET (hero tile — deliberately distinct from the two above, not a third identical card) ── */}
                <StatTile
                    label="Net for this period"
                    value={`${netAmount >= 0 ? '+' : '−'}${fmt(netAmount)}`}
                    accentColor={netAmount >= 0 ? 'var(--color-inc)' : 'var(--color-exp)'}
                    icon={netAmount >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                />

                {/* ── SELECT ALL BAR ── */}
                {selectMode && !loading && filtered.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)' }}>
                        <span style={{ fontSize: '13px', color: 'var(--accent)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                            Select mode — tap rows to select
                        </span>
                        <button type="button"
                            onClick={selectedIds.size === filtered.length ? () => setSelectedIds(new Set()) : selectAll}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                            {selectedIds.size === filtered.length ? 'Deselect all' : `Select all (${filtered.length})`}
                        </button>
                    </div>
                )}

                {/* ── TRANSACTION LIST ── */}
                <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto' }}>
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
                        <EmptyState
                            icon={SearchX}
                            title="No matches"
                            subtitle="No transactions match your current search and filters."
                            action={<button type="button" onClick={() => clearAllRef.current()} style={{ padding: '10px 20px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Clear filters</button>}
                        />
                    ) : (
                        <TransactionList
                            transactions={visibleTransactions}
                            currency={user.currency}
                            onEdit={tx => { setEditingTx(tx); setPrefillData(null); setModalOpen(true); }}
                            onRefresh={fetchTransactions}
                            selectMode={selectMode}
                            selectedIds={selectedIds}
                            onToggleSelect={toggleSelect}
                            pendingDelete={pendingDelete}
                            onPendingDeleteChange={setPendingDelete}
                        />
                    )}
                    {hasMore && !loading && (
                        <button ref={loadMoreRef} type="button" onClick={() => setDisplayCount(c => c + 50)}
                            style={{ width: '100%', padding: '10px', background: 'none', border: 'none', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-body)', cursor: 'pointer', opacity: 0.6 }}>
                            ↓ {filtered.length - displayCount} more
                        </button>
                    )}
                </div>
                </>
                )}

                {view === 'calendar' && <CalendarView />}

            </div>

            {/* ── QUICK ADD FAB ── */}
            {view === 'list' && (
                <div style={{
                    position: 'fixed',
                    bottom: isMobile ? 'calc(72px + env(safe-area-inset-bottom, 0px) + 16px)' : '32px',
                    right: isMobile ? '16px' : '96px',
                    zIndex: isMobile ? 996 : 500,
                }}>
                    {!isMobile && quickAddFabHover && (
                        <div style={{
                            position: 'absolute', bottom: '100%', left: '50%',
                            transform: 'translateX(-50%)', marginBottom: '8px',
                            backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)',
                            borderRadius: '6px', padding: '4px 10px', fontSize: '12px',
                            color: 'var(--text-primary)', whiteSpace: 'nowrap', pointerEvents: 'none',
                        }}>
                            Quick Add
                        </div>
                    )}
                    <button type="button"
                        onClick={() => { setQuickAddOpen(true); setQuickAddText(''); setQuickAddError(''); }}
                        onMouseEnter={() => setQuickAddFabHover(true)}
                        onMouseLeave={() => setQuickAddFabHover(false)}
                        aria-label="Quick add with AI"
                        style={{
                            width: '52px', height: '52px', borderRadius: '50%',
                            background: 'var(--accent)', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: quickAddFabHover ? '0 6px 28px var(--accent-subtle)' : '0 4px 20px var(--accent-border)',
                            transform: quickAddFabHover ? 'scale(1.1)' : 'scale(1)',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}>
                        <Zap size={22} color="white" strokeWidth={2.5} />
                    </button>
                </div>
            )}

            {/* ── TRANSACTION MODAL ── */}
            <TransactionModal isOpen={modalOpen} onClose={handleModalClose} onSuccess={fetchTransactions} onOfflineSave={handleOfflineSave} transaction={editingTx} prefill={prefillData} pastTransactions={transactions} />

            {/* ── IMPORT PDF MODAL ── */}
            <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Import Bank Statement" maxWidth="560px">
                <BankStatementImporter onClose={() => setImportOpen(false)} onSuccess={() => fetchTransactions()} />
            </Modal>

            {/* ── IMPORT SMS MODAL ── */}
            <Modal isOpen={smsImportOpen} onClose={() => setSmsImportOpen(false)} title="Import from SMS" maxWidth="480px">
                <SmsImporter onClose={() => setSmsImportOpen(false)} onSuccess={() => fetchTransactions()} />
            </Modal>

            {/* ── BULK OPS PANEL ── */}
            {selectMode && selectedIds.size > 0 && (
                <BulkOpsPanel
                    selectedIds={selectedIds}
                    allTransactions={filtered}
                    currency={user.currency}
                    selectedYear={selectedYear}
                    selectedMonth={selectedMonth}
                    onSelectAll={selectAll}
                    onExit={exitSelectMode}
                    onRefresh={fetchTransactions}
                    onRemoveIds={removeIds}
                    pendingDelete={pendingDelete}
                    onPendingDeleteChange={setPendingDelete}
                />
            )}

            {/* ── QUICK ADD MODAL ── */}
            {quickAddOpen && createPortal(
                <div onClick={e => { if (e.target === e.currentTarget) setQuickAddOpen(false); }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: 'var(--shadow-modal)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Zap size={18} color="var(--accent)" />
                                </div>
                                <div>
                                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Quick Add</h3>
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Describe the transaction in plain language</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setQuickAddOpen(false)} aria-label="Close quick add"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}>
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
                            style={{ width: '100%', padding: '14px', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: '0.95rem', fontFamily: 'var(--font-body)', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, transition: 'border-color 0.15s' }}
                            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                        />
                        {quickAddError && <p style={{ fontSize: '0.8rem', color: 'var(--color-exp)', margin: '8px 0 0', fontFamily: 'var(--font-body)' }}>{quickAddError}</p>}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setQuickAddOpen(false)}
                                style={{ padding: '10px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface-2)', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                Cancel
                            </button>
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

        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CALENDAR VIEW (formerly /calendar)
// ═══════════════════════════════════════════════════════════════════════════
const DAY_LABELS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CAL_MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];

const fmtAmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.trim().replace('#', '');
    if (h.length !== 6) return [225, 29, 72];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// ── DayDetail panel (used in both bottom sheet + desktop inline) ──────────────

interface DayDetailProps {
    dateStr:        string;
    transactions:   any[];
    recIncome:      any[];
    recExpense:     any[];
    forecastAmount: number;
    isFuture:       boolean;
    currency:       string;
    onAdd:          () => void;
    onEdit:         (tx: any) => void;
}

function DayDetail({
    dateStr, transactions, recIncome, recExpense,
    forecastAmount, isFuture, currency, onAdd, onEdit,
}: DayDetailProps) {
    const dateLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long',
    });
    const scheduledCount = recIncome.length + recExpense.length;
    const isEmpty = transactions.length === 0 && scheduledCount === 0 && !isFuture;

    return (
        <div>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
                        {dateLabel}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '3px 0 0', fontFamily: 'var(--font-body)' }}>
                        {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                        {scheduledCount > 0 && <> · {scheduledCount} scheduled</>}
                    </p>
                </div>
                <button type="button" onClick={onAdd}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 13px', borderRadius: 'var(--radius-md)', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                    <Plus size={13} /> Add
                </button>
            </div>

            {/* Empty state */}
            {isEmpty && (
                <div style={{ padding: '28px 0 12px', textAlign: 'center' }}>
                    <p style={{ fontSize: '28px', margin: '0 0 8px' }}>📅</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>No transactions on this day</p>
                </div>
            )}

            {/* Actual transactions */}
            {transactions.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>
                        Transactions
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {transactions.map((tx: any) => {
                            const isInc = tx.type === 'income';
                            return (
                                <div key={tx.id} onClick={() => onEdit(tx)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'background var(--transition-fast)' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-3)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0, background: isInc ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {tx.category_icon
                                            ? <span style={{ fontSize: '16px' }}>{getSmartIcon(tx.description, tx.category_name, tx.category_icon)}</span>
                                            : isInc
                                                ? <TrendingUp  size={14} color="var(--color-inc)" />
                                                : <TrendingDown size={14} color="var(--color-exp)" />
                                        }
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
                                            {tx.description}
                                        </p>
                                        {tx.category_name && (
                                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>
                                                {tx.category_name}
                                            </p>
                                        )}
                                    </div>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: isInc ? 'var(--color-inc)' : 'var(--color-exp)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                        {isInc ? '+' : '−'}{formatCurrency(parseFloat(tx.amount), currency)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Scheduled recurring */}
            {scheduledCount > 0 && (
                <div style={{ marginBottom: '14px' }}>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>
                        Scheduled
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {[...recIncome, ...recExpense].map((item: any, i: number) => {
                            const isInc = item.type === 'income';
                            return (
                                <div key={item.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: isInc ? 'var(--color-info)' : 'var(--color-bill-due)' }} />
                                    <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.description}
                                    </span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: isInc ? 'var(--color-inc)' : 'var(--color-exp)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                        {isInc ? '+' : '−'}{formatCurrency(parseFloat(item.amount), currency)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Forecast for future days */}
            {isFuture && forecastAmount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--color-warn) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warn) 22%, transparent)', marginBottom: '4px' }}>
                    <Zap size={14} color="var(--color-warn)" style={{ flexShrink: 0 }} />
                    <div>
                        <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-warn)', margin: 0, fontFamily: 'var(--font-body)' }}>Projected spend</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                            {formatCurrency(forecastAmount, currency)}
                        </p>
                    </div>
                </div>
            )}

            {/* Bottom spacer for sheet scroll */}
            <div style={{ height: '8px' }} />
        </div>
    );
}

function CalendarView() {
    const { user } = useAuthStore();
    const isMobile = useIsMobile();
    const today    = new Date();

    const [currentMonth, setCurrentMonth] = useState(today.getMonth());
    const [currentYear,  setCurrentYear]  = useState(today.getFullYear());
    const [transactions, setTransactions] = useState<any[]>([]);
    const [recurring,    setRecurring]    = useState<any[]>([]);
    const [forecast,     setForecast]     = useState<any>(null);
    const [loading,      setLoading]      = useState(true);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [sheetOpen,    setSheetOpen]    = useState(false);
    const [modalOpen,    setModalOpen]    = useState(false);
    const [editingTx,    setEditingTx]    = useState<any>(null);
    const [defaultDate,  setDefaultDate]  = useState('');
    const [expRgb,       setExpRgb]       = useState<[number, number, number]>([225, 29, 72]);
    const [fetchError,   setFetchError]   = useState(false);

    // Read CSS token once for heat-map colour
    useEffect(() => {
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-exp').trim();
        if (raw) setExpRgb(hexToRgb(raw));
    }, []);

    // ── Data fetch (parallel) ─────────────────────────────────────────────────
    const fetchAll = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setFetchError(false);
        try {
            const [txRes, recRes, forecastRes] = await Promise.allSettled([
                transactionsAPI.getAll({ month: currentMonth + 1, year: currentYear }),
                recurringAPI.getAll(),
                analyticsAPI.forecast({ month: currentMonth + 1, year: currentYear }),
            ]);
            // Recurring/forecast failing is non-critical -- the grid still renders
            // without their overlays. Only the core transactions fetch failing
            // surfaces an error card, matching the list view's treatment.
            if (txRes.status      === 'fulfilled') {
                setTransactions(txRes.value.data.transactions ?? []);
            } else {
                setFetchError(true);
            }
            if (recRes.status     === 'fulfilled') {
                const d = recRes.value.data;
                setRecurring(d.recurring ?? d.items ?? d.data ?? []);
            }
            if (forecastRes.status === 'fulfilled') {
                setForecast(forecastRes.value.data);
            }
        } finally {
            setLoading(false);
        }
    }, [user, currentMonth, currentYear]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ── Month navigation ──────────────────────────────────────────────────────
    const prevMonth = useCallback(() => {
        setSelectedDate(null); setSheetOpen(false);
        if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
        else setCurrentMonth(m => m - 1);
    }, [currentMonth]);

    const nextMonth = useCallback(() => {
        setSelectedDate(null); setSheetOpen(false);
        if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
        else setCurrentMonth(m => m + 1);
    }, [currentMonth]);

    // Swipe gesture
    const touchStartX = useRef(0);
    const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
    const handleTouchEnd   = (e: React.TouchEvent) => {
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) < 50) return;
        if (dx < 0) nextMonth(); else prevMonth();
    };

    // ── Calendar geometry ─────────────────────────────────────────────────────
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
    const cells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // ── Derived maps ──────────────────────────────────────────────────────────

    const dayMap = useMemo(() => {
        const m: Record<string, { income: number; expenses: number; transactions: any[] }> = {};
        transactions.forEach(tx => {
            const key = (tx.date || '').split('T')[0];
            if (!m[key]) m[key] = { income: 0, expenses: 0, transactions: [] };
            // income/expenses power the "Total Spent" stat and day-cell heat
            // coloring, so they exclude investing/goal contributions/transfers
            // the same way the Dashboard does -- but the full transaction list
            // stays unfiltered so the day-detail view still shows everything.
            if (isRealIncome(tx)) m[key].income   += parseFloat(tx.amount) || 0;
            else if (isNonSavingsExpense(tx)) m[key].expenses += parseFloat(tx.amount) || 0;
            m[key].transactions.push(tx);
        });
        return m;
    }, [transactions]);

    // day-of-month → { income: [], expense: [] }
    const recurringMap = useMemo(() => {
        const m: Record<number, { income: any[]; expense: any[] }> = {};
        recurring.forEach(item => {
            if (item.is_active === false || item.active === false) return;
            const freq = (item.frequency || '').toLowerCase();
            const days: number[] = [];

            if (freq === 'monthly' && item.day_of_month) {
                if (item.day_of_month <= daysInMonth) days.push(item.day_of_month);
            } else if (freq === 'daily') {
                for (let d = 1; d <= daysInMonth; d++) days.push(d);
            } else if (freq === 'weekly') {
                // treat day_of_month as day-of-week (0 = Sun … 6 = Sat)
                const targetDow = (item.day_of_month ?? 0) % 7;
                for (let d = 1; d <= daysInMonth; d++) {
                    if (new Date(currentYear, currentMonth, d).getDay() === targetDow) days.push(d);
                }
            }

            days.forEach(d => {
                if (!m[d]) m[d] = { income: [], expense: [] };
                if (item.type === 'income') m[d].income.push(item);
                else                        m[d].expense.push(item);
            });
        });
        return m;
    }, [recurring, currentMonth, currentYear, daysInMonth]);

    // date string → projected amount
    const forecastMap = useMemo(() => {
        const m: Record<string, number> = {};
        if (!forecast) return m;
        const arr: any[] =
            forecast.daily_forecast ??
            forecast.forecast?.daily ??
            forecast.data?.daily_forecast ??
            (Array.isArray(forecast.forecast) ? forecast.forecast : null) ??
            [];
        arr.forEach(e => {
            if (e.date) m[e.date] = e.projected_amount ?? e.amount ?? e.projected ?? 0;
        });
        return m;
    }, [forecast]);

    // ── Month stats ───────────────────────────────────────────────────────────
    const { totalSpent, incomeDays, busiestDay } = useMemo(() => {
        let totalSpent = 0, incomeDays = 0;
        let busiestDay = { date: '', amount: 0 };
        Object.entries(dayMap).forEach(([date, d]) => {
            totalSpent += d.expenses;
            if (d.income > 0) incomeDays++;
            if (d.expenses > busiestDay.amount) busiestDay = { date, amount: d.expenses };
        });
        return { totalSpent, incomeDays, busiestDay };
    }, [dayMap]);

    const dailyAvg = useMemo(() => {
        const active = Object.values(dayMap).filter(d => d.expenses > 0).length;
        return active > 0 ? totalSpent / active : 0;
    }, [dayMap, totalSpent]);

    const busiestLabel = useMemo(() => {
        if (!busiestDay.date) return '—';
        const d = new Date(busiestDay.date + 'T00:00:00');
        return `${CAL_MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()} (${fmtAmt(busiestDay.amount)})`;
    }, [busiestDay]);

    // ── Heat-map cell background ──────────────────────────────────────────────
    const getCellBg = useCallback((expenses: number): string => {
        if (expenses <= 0 || dailyAvg <= 0) return 'transparent';
        const ratio   = Math.min(expenses / dailyAvg, 2);        // cap at 2× avg
        const opacity = 0.05 + (ratio / 2) * 0.15;               // 5 %–20 %
        const [r, g, b] = expRgb;
        return `rgba(${r},${g},${b},${opacity.toFixed(3)})`;
    }, [dailyAvg, expRgb]);

    // ── Day click ─────────────────────────────────────────────────────────────
    const handleDayClick = useCallback((dateStr: string) => {
        setSelectedDate(prev => {
            if (prev === dateStr) { setSheetOpen(false); return null; }
            return dateStr;
        });
        if (isMobile) setSheetOpen(true);
    }, [isMobile]);

    // ── Selected day derived ──────────────────────────────────────────────────
    const selDay      = selectedDate ? parseInt(selectedDate.split('-')[2]) : null;
    const selData     = selectedDate ? (dayMap[selectedDate]     ?? null) : null;
    const selRec      = selDay       ? (recurringMap[selDay]     ?? null) : null;
    const selForecast = selectedDate ? (forecastMap[selectedDate] ?? 0)   : 0;
    const selIsFuture = selectedDate ? selectedDate > todayStr            : false;

    // ── DayDetail props helper ────────────────────────────────────────────────
    const dayDetailProps = (dateStr: string) => ({
        dateStr,
        transactions:   selData?.transactions ?? [],
        recIncome:      selRec?.income        ?? [],
        recExpense:     selRec?.expense       ?? [],
        forecastAmount: selForecast,
        isFuture:       selIsFuture,
        currency:       user!.currency,
        onAdd: () => { setDefaultDate(dateStr); setEditingTx(null); setModalOpen(true); },
        onEdit: (tx: any) => { setEditingTx(tx); setModalOpen(true); },
    });

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* ── MONTH NAV ── */}
                <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? '14px' : '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {isMobile ? CAL_MONTH_NAMES[currentMonth].slice(0, 3) : CAL_MONTH_NAMES[currentMonth]} {currentYear}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button type="button" onClick={prevMonth} aria-label="Previous month"
                                style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ChevronLeft size={16} />
                            </button>
                            <button type="button" onClick={nextMonth} aria-label="Next month"
                                style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── STAT CHIPS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '10px' }}>
                    <StatTile label="Total Spent" value={fmtAmt(totalSpent)} accentColor="var(--color-exp)" loading={loading} />
                    <StatTile label="Income Days" value={`${incomeDays} day${incomeDays !== 1 ? 's' : ''}`} accentColor="var(--color-inc)" loading={loading} />
                    <StatTile label="Busiest Day" value={busiestLabel} loading={loading} style={{ gridColumn: isMobile ? '1 / -1' : undefined }} />
                </div>

                {/* ── LEGEND ── */}
                <div style={{ display: 'flex', gap: isMobile ? '12px' : '20px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 16px' }}>
                    {[
                        { color: 'var(--color-inc)',  label: 'Income'    },
                        { color: 'var(--color-exp)',  label: 'Expense'   },
                        { color: 'var(--color-info)', label: 'Recurring' },
                        { color: 'var(--color-bill-due)', label: 'Bill Due'  },
                    ].map(({ color, label }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{label}</span>
                        </div>
                    ))}
                </div>

                {/* ── CALENDAR GRID ── */}
                <div
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
                >
                    {/* Day-of-week header */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border-subtle)' }}>
                        {DAY_LABELS.map(d => (
                            <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', letterSpacing: '0.04em' }}>
                                {d}
                            </div>
                        ))}
                    </div>

                    {loading ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-body)' }}>
                            Loading calendar…
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                            {cells.map((day, idx) => {
                                const isLastInRow = (idx + 1) % 7 === 0;

                                /* ── Empty padding cell ── */
                                if (!day) {
                                    return (
                                        <div key={`e-${idx}`} style={{
                                            minHeight: isMobile ? '60px' : '90px',
                                            borderRight:  !isLastInRow ? '1px solid var(--border-subtle)' : 'none',
                                            borderBottom: '1px solid var(--border-subtle)',
                                            background: 'var(--bg-surface-2)',
                                            opacity: 0.5,
                                        }} />
                                    );
                                }

                                /* ── Real day cell ── */
                                const dateStr   = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                const data      = dayMap[dateStr];
                                const rec       = recurringMap[day];
                                const isToday   = dateStr === todayStr;
                                const isSel     = dateStr === selectedDate;
                                const isFutDay  = dateStr > todayStr;
                                const projected = forecastMap[dateStr] ?? 0;
                                const expenses  = data?.expenses ?? 0;
                                const income    = data?.income   ?? 0;
                                const cellBg    = !isSel && expenses > 0 ? getCellBg(expenses) : 'transparent';

                                return (
                                    <div key={dateStr} onClick={() => handleDayClick(dateStr)}
                                        style={{
                                            minHeight: isMobile ? '60px' : '90px',
                                            borderRight:  !isLastInRow ? '1px solid var(--border-subtle)' : 'none',
                                            borderBottom: '1px solid var(--border-subtle)',
                                            /* Accent top-border marks today */
                                            borderTop:    isToday ? '2px solid var(--accent)' : undefined,
                                            padding:      isMobile ? '4px' : '6px',
                                            cursor:       'pointer',
                                            background:   isSel ? 'var(--accent-subtle)' : cellBg,
                                            transition:   'background 0.12s',
                                            position:     'relative',
                                            boxSizing:    'border-box',
                                        }}
                                        onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-3)'; }}
                                        onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = cellBg; }}
                                    >
                                        {/* Day number + indicator dots */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                            <span style={{
                                                width: isMobile ? '20px' : '24px',
                                                height: isMobile ? '20px' : '24px',
                                                borderRadius: '50%',
                                                background: isToday ? 'var(--accent)' : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize:   isMobile ? '11px' : '12px',
                                                fontWeight: isToday ? 700 : 400,
                                                color:      isToday ? 'white' : isFutDay ? 'var(--text-muted)' : 'var(--text-primary)',
                                                fontFamily: 'var(--font-body)',
                                                flexShrink: 0,
                                            }}>
                                                {day}
                                            </span>

                                            {/* Indicator dots (top-right) */}
                                            <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: '3px', maxWidth: '22px' }}>
                                                {income   > 0                    && <span style={{ display: 'block', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--color-inc)',  flexShrink: 0 }} />}
                                                {expenses > 0                    && <span style={{ display: 'block', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--color-exp)',  flexShrink: 0 }} />}
                                                {(rec?.income.length  ?? 0) > 0  && <span style={{ display: 'block', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--color-info)', flexShrink: 0 }} />}
                                                {(rec?.expense.length ?? 0) > 0  && <span style={{ display: 'block', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--color-bill-due)', flexShrink: 0 }} />}
                                            </div>
                                        </div>

                                        {/* Amount labels */}
                                        <div style={{ marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                            {income > 0 && (
                                                <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: isMobile ? '9px' : '10px', color: 'var(--color-inc)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    +{fmtAmt(income)}
                                                </span>
                                            )}
                                            {expenses > 0 && (
                                                <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: isMobile ? '9px' : '10px', color: 'var(--color-exp)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    −{fmtAmt(expenses)}
                                                </span>
                                            )}
                                            {/* Projected spend on future days (desktop only — too small on mobile) */}
                                            {!isMobile && isFutDay && projected > 0 && (
                                                <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-warn)', fontWeight: 500, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    ~{fmtAmt(projected)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── DESKTOP: inline day detail panel ── */}
                {!isMobile && selectedDate && (
                    <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '20px', animation: 'fadeUp 160ms ease forwards' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                            <button type="button" onClick={() => setSelectedDate(null)} aria-label="Close day details"
                                style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={13} />
                            </button>
                        </div>
                        <DayDetail {...dayDetailProps(selectedDate)} />
                    </div>
                )}

            </div>

            {/* ── MOBILE: bottom sheet ── */}
            {isMobile && (
                <BottomSheet
                    isOpen={sheetOpen}
                    onClose={() => { setSheetOpen(false); setSelectedDate(null); }}
                    title={selectedDate
                        ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
                        : ''}
                >
                    {selectedDate && <DayDetail {...dayDetailProps(selectedDate)} />}
                </BottomSheet>
            )}

            <TransactionModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); setEditingTx(null); }}
                onSuccess={fetchAll}
                transaction={editingTx}
                defaultDate={defaultDate}
            />
        </>
    );
}

export default function TransactionsPage() {
    return <Suspense><TransactionsPageInner /></Suspense>;
}
