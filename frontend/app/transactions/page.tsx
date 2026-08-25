'use client';

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, X, SearchX } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI, aiAPI, accountsAPI, creditCardsAPI } from '@/lib/api';
import { apiWithCache } from '@/lib/apiWithCache';
import { cacheTransactions, getCachedTransactions } from '@/lib/offlineCache';
import { Skeleton, SkeletonCircle, SkeletonText, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { TransactionList } from '@/components/transactions/TransactionList';
import { TransactionsTopBar } from '@/components/transactions/TransactionsTopBar';
import { BulkOpsPanel } from '@/components/transactions/BulkOpsPanel';
import { AdvancedSearchBar } from '@/components/transactions/AdvancedSearchBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { FetchErrorCard } from '@/components/ui/FetchErrorCard';
import { isNonSavingsExpense, isRealIncome } from '@/lib/utils';
import { pruneSelectedIds, sortTransactions, DEFAULT_SORT, type SortKey } from '@/lib/transactionFilters';

const getNowYear  = () => new Date().getFullYear();
const getNowMonth = () => new Date().getMonth() + 1;

function TransactionsPageInner() {
    const router       = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile     = useIsMobile();

    const [transactions, setTransactions]   = useState<any[]>([]);
    const [filtered, setFiltered]           = useState<any[]>([]);
    const [sortKey, setSortKey]             = useState<SortKey>(DEFAULT_SORT);
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
    const [quickAddFabHover, setQuickAddFabHover] = useState(false);
    // AppLayout's <main> runs a page-enter animation whose final keyframe
    // leaves `transform: translateY(0)` applied via fill-mode: forwards --
    // an identity transform still makes it a containing block for
    // position:fixed descendants, so anything fixed *inside* a page (like
    // this FAB) ends up pinned to <main> instead of the viewport and
    // scrolls with it. Portalling to document.body sidesteps that entirely.
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    const [fetchError, setFetchError]       = useState(false);
    const [quickAddFailed, setQuickAddFailed] = useState(false);
    const [prevPeriodSummary, setPrevPeriodSummary] = useState<{ summary: { total_income: number; total_expenses: number } } | null>(null);
    const [activeFilterCount, setActiveFilterCount] = useState(0);
    const clearAllRef   = useRef<() => void>(() => {});
    const openSearchRef = useRef<() => void>(() => {});
    const openFilterRef = useRef<() => void>(() => {});

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
            setQuickAddFailed(false);
            setEditingTx(null);
            setPrefillData(parsed);
            setModalOpen(true);
        } catch {
            setQuickAddError('Could not parse — try rephrasing');
            setQuickAddFailed(true);
        } finally {
            setQuickAddLoading(false);
        }
    };

    const handleQuickAddManualFallback = () => {
        setQuickAddOpen(false);
        setQuickAddFailed(false);
        setEditingTx(null);
        setPrefillData({ description: quickAddText.trim() });
        setModalOpen(true);
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
        setSelectedIds(prev => pruneSelectedIds(prev, filtered));
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

    // ── Month navigation ──────────────────────────────────────────────────────
    const prevMonth = useCallback(() => {
        setSelectedMonth(m => {
            const current = m ?? getNowMonth();
            if (current === 1) { setSelectedYear(y => y - 1); return 12; }
            return current - 1;
        });
    }, []);

    const nextMonth = useCallback(() => {
        setSelectedMonth(m => {
            const current = m ?? getNowMonth();
            if (current === 12) { setSelectedYear(y => y + 1); return 1; }
            return current + 1;
        });
    }, []);

    const pickMonth = useCallback((month: number, year: number) => {
        setSelectedMonth(month);
        setSelectedYear(year);
    }, []);

    const showAllTime = useCallback(() => setSelectedMonth(null), []);

    const sortedFiltered = useMemo(() => sortTransactions(filtered, sortKey), [filtered, sortKey]);

    const totalIncome  = filtered.filter(isRealIncome).reduce((s, tx) => s + parseFloat(tx.amount), 0);
    const totalExpense = filtered.filter(isNonSavingsExpense).reduce((s, tx) => s + parseFloat(tx.amount), 0);
    const netAmount    = totalIncome - totalExpense;
    const visibleTransactions = sortedFiltered.slice(0, displayCount);
    const hasMore = sortedFiltered.length > displayCount;

    // ── Period-over-period delta ──────────────────────────────────────────────
    // "All time" (selectedMonth === null) has no single prior month to compare
    // against, so the delta is hidden entirely in that case too.
    useEffect(() => {
        if (!user || selectedMonth === null) { setPrevPeriodSummary(null); return; }
        const prevM = selectedMonth === 1 ? 12 : selectedMonth - 1;
        const prevY = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
        apiWithCache.getDashboardSummary({ month: prevM, year: prevY })
            .then(setPrevPeriodSummary)
            .catch(() => setPrevPeriodSummary(null));
    }, [user, selectedMonth, selectedYear]);

    const prevIncome  = prevPeriodSummary?.summary?.total_income;
    const prevExpense = prevPeriodSummary?.summary?.total_expenses;
    // null = hide the delta (no prior-period data, or nothing to compare against --
    // a percentage change from zero is undefined, not "0%" or "∞%").
    const incomeDelta  = prevIncome  != null && prevIncome  > 0 ? ((totalIncome  - prevIncome)  / prevIncome)  * 100 : null;
    const expenseDelta = prevExpense != null && prevExpense > 0 ? ((totalExpense - prevExpense) / prevExpense) * 100 : null;
    const prevNet   = prevIncome != null && prevExpense != null ? prevIncome - prevExpense : null;
    const netDelta  = prevNet != null && prevNet !== 0 ? ((netAmount - prevNet) / Math.abs(prevNet)) * 100 : null;

    const handleModalClose = () => { setModalOpen(false); setEditingTx(null); setPrefillData(null); };

    // ── Select mode ──────────────────────────────────────────────────────────
    const exitSelectMode = useCallback(() => { setSelectMode(false); setSelectedIds(new Set()); }, []);

    useEffect(() => {
        if (!selectMode) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') exitSelectMode(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [selectMode, exitSelectMode]);

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
            <SkeletonCard height={160} style={{ marginBottom: '16px' }} />
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

                {/* ── TOP BAR: month nav, net hero, income/expense chips, icon controls ── */}
                <TransactionsTopBar
                    selectedMonth={selectedMonth}
                    selectedYear={selectedYear}
                    onPrevMonth={prevMonth}
                    onNextMonth={nextMonth}
                    onPickMonth={pickMonth}
                    onShowAllTime={showAllTime}
                    netAmount={netAmount}
                    netDelta={netDelta}
                    totalIncome={totalIncome}
                    totalExpense={totalExpense}
                    incomeDelta={incomeDelta}
                    expenseDelta={expenseDelta}
                    activeFilterCount={activeFilterCount}
                    onOpenSearch={() => openSearchRef.current()}
                    onOpenFilter={() => openFilterRef.current()}
                    sortKey={sortKey}
                    onSortChange={setSortKey}
                    selectMode={selectMode}
                    onToggleSelectMode={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                    onAddTransaction={() => { setEditingTx(null); setPrefillData(null); setModalOpen(true); }}
                />

                {/* ── ADVANCED SEARCH BAR (triggers hidden — top bar's icons open it) ── */}
                <AdvancedSearchBar
                    transactions={transactions}
                    onFilter={setFiltered}
                    onSetDateContext={handleSetDateContext}
                    initialQuery={initialQuery}
                    accounts={accounts}
                    extraChips={creditCardChips}
                    onRegisterClearAll={fn => { clearAllRef.current = fn; }}
                    hideTriggers
                    onRegisterOpenSearch={fn => { openSearchRef.current = fn; }}
                    onRegisterOpenFilter={fn => { openFilterRef.current = fn; }}
                    onActiveFilterCountChange={setActiveFilterCount}
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
                <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
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
                    ) : fetchError ? (
                        <FetchErrorCard onRetry={fetchTransactions} />
                    ) : filtered.length === 0 && transactions.length === 0 ? (
                        <EmptyState
                            icon={SearchX}
                            title="No transactions this month"
                            subtitle="Tap + to add one."
                        />
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
                            ↓ {sortedFiltered.length - displayCount} more
                        </button>
                    )}
                </div>

            </div>

            {/* ── QUICK ADD FAB — portalled to document.body so it's pinned to the
                viewport, not to <main> (see the `mounted` comment above) ── */}
            {mounted && createPortal(
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
                        onClick={() => { setQuickAddOpen(true); setQuickAddText(''); setQuickAddError(''); setQuickAddFailed(false); }}
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
                </div>,
                document.body
            )}

            {/* ── TRANSACTION MODAL ── */}
            <TransactionModal isOpen={modalOpen} onClose={handleModalClose} onSuccess={fetchTransactions} onOfflineSave={handleOfflineSave} transaction={editingTx} prefill={prefillData} pastTransactions={transactions} />

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
                        {quickAddFailed && (
                            <button type="button" onClick={handleQuickAddManualFallback}
                                style={{ background: 'none', border: 'none', padding: 0, marginTop: '8px', color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'underline' }}>
                                Enter manually instead
                            </button>
                        )}
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

export default function TransactionsPage() {
    return <Suspense><TransactionsPageInner /></Suspense>;
}
