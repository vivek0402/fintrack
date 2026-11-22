'use client';

import { useEffect, useState, useCallback, useRef, useMemo, Suspense, type RefObject, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchX, SlidersHorizontal, ArrowUpDown, CheckSquare } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { aiAPI } from '@/lib/api';
import { ADD_TRANSACTION_EVENT } from '@/lib/addTransactionEvent';
import { apiWithCache } from '@/lib/apiWithCache';
import {
    useTransactions, useAccounts, useCreditCards, queryKeys, invalidateAfterTransactionWrite,
    removeTransactionsFromCache, type TransactionParams,
} from '@/hooks/queries';
import { Skeleton, SkeletonCircle, SkeletonText, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { TransactionList } from '@/components/transactions/TransactionList';
import { TransactionsTopBar, SortSheet, SORT_OPTIONS, MONTH_NAMES } from '@/components/transactions/TransactionsTopBar';
import { BulkOpsPanel } from '@/components/transactions/BulkOpsPanel';
import { AdvancedSearchBar } from '@/components/transactions/AdvancedSearchBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { FetchErrorCard } from '@/components/ui/FetchErrorCard';
import { PullToRefreshIndicator } from '@/components/ui/PullToRefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { isNonSavingsExpense, isRealIncome, formatDate, fmt } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Stat, TextAction } from '@/components/ui/CardParts';
import { type } from '@/lib/typography';
import { compareToPrevious } from '@/lib/periodCompare';
import { toast } from '@/store/toastStore';
import { pruneSelectedIds, sortTransactions, periodDelta, DEFAULT_SORT, type SortKey } from '@/lib/transactionFilters';
import { toAmount, type Transaction } from '@/types/finance';

// Stable empty list, so a missing query result doesn't change identity per render.
const NO_TRANSACTIONS: never[] = [];

const getNowYear  = () => new Date().getFullYear();
const getNowMonth = () => new Date().getMonth() + 1;

function TransactionsPageInner() {
    const router       = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile     = useIsMobile();

    const [filtered, setFiltered]           = useState<Transaction[]>([]);
    const [sortKey, setSortKey]             = useState<SortKey>(DEFAULT_SORT);
    const [modalOpen, setModalOpen]         = useState(false);
    const [editingTx, setEditingTx]         = useState<Transaction | null>(null);
    const [prefillData, setPrefillData]     = useState<any>(null);
    const [selectedMonth, setSelectedMonth] = useState<number | null>(getNowMonth);
    const [selectedYear, setSelectedYear]   = useState(getNowYear);
    const [quickAddText, setQuickAddText]   = useState('');
    const [quickAddLoading, setQuickAddLoading] = useState(false);
    const [sortSheetOpen, setSortSheetOpen] = useState(false);
    const [focusDescribe, setFocusDescribe] = useState(false);
    const describeRef = useRef<HTMLInputElement>(null);
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
    const [filterFrom, setFilterFrom] = useState<string | null>(null);
    const [filterTo, setFilterTo]     = useState<string | null>(null);
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
    // One observer at a time: disconnect the previous one whenever the sentinel
    // button unmounts or is replaced, instead of piling up observers.
    const loadMoreObserver = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useCallback((node: HTMLElement | null) => {
        loadMoreObserver.current?.disconnect();
        loadMoreObserver.current = null;
        if (!node) return;
        const observer = new IntersectionObserver(
            entries => { if (entries[0].isIntersecting) setDisplayCount(c => c + 50); },
            { threshold: 0.1 }
        );
        observer.observe(node);
        loadMoreObserver.current = observer;
    }, []);

    // ── Describe-it placeholder rotation ──────────────────────────────────────
    useEffect(() => {
        const t = setInterval(() => setPlaceholderIdx(i => (i + 1) % QUICK_ADD_PLACEHOLDERS.length), 2500);
        return () => clearInterval(t);
    }, []);

    const handleDescribe = async () => {
        const text = quickAddText.trim();
        if (!text || quickAddLoading) return;
        setQuickAddLoading(true);
        try {
            const res = await aiAPI.quickAdd(text);
            const parsed = res.data.data;
            if (!parsed) throw new Error('No parsed result');
            setQuickAddText('');
            setEditingTx(null);
            setPrefillData(parsed);
            setModalOpen(true);
        } catch {
            // Manual fallback: open the form with just what was typed.
            toast.error("Couldn't read that. Fill in the form instead.");
            setQuickAddText('');
            setEditingTx(null);
            setPrefillData({ description: text });
            setModalOpen(true);
        } finally {
            setQuickAddLoading(false);
        }
    };

    // ?quickAdd=1 (Android widgets' "+") lands here before the page has rendered
    // the input (auth still loading), so the focus waits until the input exists.
    useEffect(() => {
        if (focusDescribe && describeRef.current) {
            describeRef.current.focus();
            setFocusDescribe(false);
        }
    }, [focusDescribe, user, isLoading]);

    // "+" elsewhere in the app fires this event; here the page owns the dialog.
    useEffect(() => {
        const open = () => setModalOpen(true);
        window.addEventListener(ADD_TRANSACTION_EVENT, open);
        return () => window.removeEventListener(ADD_TRANSACTION_EVENT, open);
    }, []);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    // ── Read ?q= from URL (set by GlobalSearch navigation) ───────────────────
    // Once a parameter is read, drop it from the address bar with the browser
    // history API, not router.replace: that ran a real navigation which, on a
    // cold load straight into /transactions?add=true, reloaded the page and
    // threw away the form it had just opened. Next keeps useSearchParams in
    // sync with history.replaceState, but only when the state passed in lacks
    // its own __NA marker: handing back window.history.state made Next skip
    // the sync, so it still believed ?add=true was current and a second "+"
    // tap (same URL) never re-ran the effect. Pass null; Next fills in its
    // internal state itself.
    const clearQuery = () => window.history.replaceState(null, '', window.location.pathname);
    useEffect(() => {
        const q = searchParams.get('q');
        if (q) {
            setInitialQuery(q);
            clearQuery();
        }
        if (searchParams.get('add') === 'true') {
            setModalOpen(true);
            clearQuery();
        }
        // ?quickAdd=1: the Android widgets' "+". Focuses the describe-it field.
        if (searchParams.get('quickAdd') === '1') {
            setFocusDescribe(true);
            clearQuery();
        }
        const ccId = searchParams.get('credit_card_id');
        if (ccId) {
            setFilterCreditCardId(Number(ccId));
            setSelectedMonth(null); // show all-time activity for this card, not just the current month
            clearQuery();
        }
        // from/to (e.g. deep-linked from a billing cycle row) override month/year
        // entirely on the backend, so mirror that here -- clear the month pager
        // whenever either is present.
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        if (from || to) {
            setFilterFrom(from);
            setFilterTo(to);
            setSelectedMonth(null);
            clearQuery();
        }
    }, [searchParams]);

    // Server params for the current period/filters. from/to override
    // month/year entirely on the backend -- don't send both.
    const txParams = useMemo<TransactionParams>(() => {
        if (filterFrom || filterTo) {
            return {
                ...(filterFrom ? { from: filterFrom } : {}),
                ...(filterTo ? { to: filterTo } : {}),
                ...(filterCreditCardId ? { credit_card_id: filterCreditCardId } : {}),
            };
        }
        return {
            ...(selectedMonth ? { month: selectedMonth, year: selectedYear } : {}),
            ...(filterCreditCardId ? { credit_card_id: filterCreditCardId } : {}),
        };
    }, [selectedMonth, selectedYear, filterCreditCardId, filterFrom, filterTo]);

    // Cached per period: revisiting the page (or a month) shows the last list
    // at once and refreshes it in the background -- the skeleton only shows
    // when there is nothing cached yet.
    const queryClient = useQueryClient();
    const txQuery = useTransactions(txParams);
    const transactions = txQuery.data ?? NO_TRANSACTIONS;
    const loading = txQuery.isPending;
    const fetchError = txQuery.isError && !txQuery.data;
    const refetchTransactions = txQuery.refetch;
    const fetchTransactions = useCallback(() => refetchTransactions().then(() => {}), [refetchTransactions]);
    // After a write: refresh everything it touches, in the background.
    const refreshAfterWrite = useCallback(() => invalidateAfterTransactionWrite(queryClient), [queryClient]);

    // Mobile pull-to-refresh -- resolves when the refetch actually lands.
    const { containerRef: pullToRefreshRef, pullDistance, refreshing: ptrRefreshing } = usePullToRefresh(fetchTransactions, isMobile);

    useEffect(() => {
        window.addEventListener('fintrack:queue-synced', refreshAfterWrite);
        return () => window.removeEventListener('fintrack:queue-synced', refreshAfterWrite);
    }, [refreshAfterWrite]);

    // Powers the filter bar's Account section and resolves filterCreditCardId
    // (set from a ?credit_card_id= deep link) to a human-readable chip label.
    const accounts: { id: number; name: string }[] = useAccounts().data ?? NO_TRANSACTIONS;
    const creditCards = useCreditCards().data ?? NO_TRANSACTIONS;

    const handleOfflineSave = (pendingTx: any) => {
        queryClient.setQueryData<any[]>(queryKeys.transactions(user?.id, txParams), prev => [pendingTx, ...(prev ?? [])]);
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

    const { totalIncome, totalExpense } = useMemo(() => ({
        totalIncome:  filtered.filter(isRealIncome).reduce((s, tx) => s + toAmount(tx.amount), 0),
        totalExpense: filtered.filter(isNonSavingsExpense).reduce((s, tx) => s + toAmount(tx.amount), 0),
    }), [filtered]);
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
        apiWithCache.getDashboardSummary<{ summary: { total_income: number; total_expenses: number } }>({ month: prevM, year: prevY })
            .then(setPrevPeriodSummary)
            .catch(() => setPrevPeriodSummary(null));
    }, [user, selectedMonth, selectedYear]);

    const prevIncome  = prevPeriodSummary?.summary?.total_income;
    const prevExpense = prevPeriodSummary?.summary?.total_expenses;
    // null = hide the delta (no prior-period data, or nothing to compare against --
    // a percentage change from zero is undefined, not "0%" or "∞%").
    const incomeDelta  = periodDelta(totalIncome, prevIncome);
    const expenseDelta = periodDelta(totalExpense, prevExpense);
    const prevMonthName = selectedMonth === null ? '' : MONTH_NAMES[(selectedMonth === 1 ? 12 : selectedMonth - 1) - 1];
    const incomeCompare  = compareToPrevious(incomeDelta, prevMonthName);
    const expenseCompare = compareToPrevious(expenseDelta, prevMonthName);

    const largestSpend = useMemo(() => {
        let best: Transaction | null = null;
        for (const tx of filtered) {
            if (isNonSavingsExpense(tx) && (!best || toAmount(tx.amount) > toAmount(best.amount))) best = tx;
        }
        return best;
    }, [filtered]);

    const txCount = filtered.length;
    const perDaySub = (() => {
        if (selectedMonth === null) return 'All time';
        const now = new Date();
        const isCurrent = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;
        const days = isCurrent ? now.getDate() : new Date(selectedYear, selectedMonth, 0).getDate();
        return `${Math.round(txCount / days)} a day on average`;
    })();

    const handleModalClose = () => { setModalOpen(false); setEditingTx(null); setPrefillData(null); };
    const openEdit = useCallback((tx: Transaction) => { setEditingTx(tx); setPrefillData(null); setModalOpen(true); }, []);

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
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(filtered.map(tx => tx.id)));
    }, [filtered]);

    const removeIds = useCallback((ids: string[]) => {
        removeTransactionsFromCache(queryClient, ids);
    }, [queryClient]);

    if (isLoading || !user) return (
        <>
            <SkeletonCard height={160} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={300} />
        </>
    );

    const filteredCard = filterCreditCardId ? creditCards.find(c => c.id === filterCreditCardId) : null;
    const creditCardChips = filterCreditCardId ? [{
        label: filteredCard
            ? `Card: ${filteredCard.bank_name} ${filteredCard.card_name}${filteredCard.last_four ? ' ••' + filteredCard.last_four : ''}`
            : 'Card filter',
        onClear: () => setFilterCreditCardId(null),
    }] : [];
    // Deep-linked from a billing cycle row -- lets the user get back to the
    // normal month view without editing the URL by hand.
    const cycleChips = (filterFrom || filterTo) ? [{
        label: `Cycle: ${filterFrom ? formatDate(filterFrom) : '…'} – ${filterTo ? formatDate(filterTo) : 'now'}`,
        onClear: () => { setFilterFrom(null); setFilterTo(null); },
    }] : [];

    const filtersActive = activeFilterCount > 0 || creditCardChips.length > 0 || cycleChips.length > 0;
    const sortLabel = SORT_OPTIONS.find(o => o.key === sortKey)?.label ?? 'Sort';
    const toolBtn: CSSProperties = {
        ...type.label, color: 'var(--text-primary)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
        height: 36, padding: '0 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
        border: '1px solid var(--glass-border)', background: 'var(--glass-fill-1)', whiteSpace: 'nowrap', flexShrink: 0,
    };
    const toolbar = (
        <>
            <button type="button" style={toolBtn} onClick={() => openFilterRef.current()} aria-label="Filters">
                <SlidersHorizontal size={14} />
                {!isMobile && 'Filters'}
                {activeFilterCount > 0 && <span style={{ ...type.numSmall, color: 'var(--text-primary)' }}>{activeFilterCount}</span>}
            </button>
            <button type="button" style={toolBtn} onClick={() => setSortSheetOpen(true)} aria-label={`Sort: ${sortLabel}`}>
                <ArrowUpDown size={14} />
                {!isMobile && sortLabel}
            </button>
            <button type="button" aria-pressed={selectMode} aria-label={selectMode ? 'Done selecting' : 'Select'}
                style={{ ...toolBtn, background: selectMode ? 'var(--glass-fill-3)' : 'var(--glass-fill-1)' }}
                onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}>
                <CheckSquare size={14} />
                {!isMobile && (selectMode ? 'Done' : 'Select')}
            </button>
        </>
    );

    return (
        <>
            {/* ── PULL-TO-REFRESH WRAPPER (mobile only -- usePullToRefresh no-ops
                its listeners when isMobile is false) ── */}
            <div ref={pullToRefreshRef as RefObject<HTMLDivElement>}>
            {isMobile && <PullToRefreshIndicator pullDistance={pullDistance} refreshing={ptrRefreshing} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── PAGE HEADER: the month stepper is the title ── */}
                <TransactionsTopBar
                    selectedMonth={selectedMonth}
                    selectedYear={selectedYear}
                    onPrevMonth={prevMonth}
                    onNextMonth={nextMonth}
                    onPickMonth={pickMonth}
                    onShowAllTime={showAllTime}
                />

                {/* ── DESCRIBE IT: type a sentence, review the filled-in form ── */}
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <input ref={describeRef} type="text" aria-label="Describe a transaction"
                        placeholder={`Describe one: ${QUICK_ADD_PLACEHOLDERS[placeholderIdx]}`}
                        value={quickAddText} onChange={e => setQuickAddText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleDescribe(); } }}
                        style={{ ...type.body, color: 'var(--text-primary)', flex: 1, minWidth: 0, height: 40, padding: '0 var(--space-3)', boxSizing: 'border-box', outline: 'none', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'var(--glass-surface)' }} />
                    <Button variant="secondary" onClick={handleDescribe} disabled={quickAddLoading || !quickAddText.trim()}>
                        {quickAddLoading ? 'Filling in…' : 'Fill in'}
                    </Button>
                </div>

                {/* ── SUMMARY: net, then money in / out / count / largest ── */}
                <Card>
                    <p style={{ ...type.label, margin: 0 }}>
                        {filtersActive
                            ? `Net for ${txCount} matching transaction${txCount === 1 ? '' : 's'}`
                            : selectedMonth === null ? 'Net, all time' : `Net in ${MONTH_NAMES[selectedMonth - 1]}`}
                    </p>
                    <p className="type-display" style={{ ...type.display, margin: '6px 0 0', color: netAmount >= 0 ? 'var(--text-primary)' : 'var(--color-exp-text)' }}>
                        {netAmount >= 0 ? '+' : '−'}{fmt(Math.abs(netAmount))}
                    </p>
                    <div className="dash-stats">
                        <Stat className="dash-stat" label="Money in" value={fmt(totalIncome)} sub={incomeCompare} />
                        <Stat className="dash-stat" label="Money out" value={fmt(totalExpense)} sub={expenseCompare}
                            subTone={expenseDelta === null || Math.abs(expenseDelta) < 0.5 ? 'neutral' : expenseDelta < 0 ? 'good' : 'caution'} />
                        <Stat className="dash-stat" label="Transactions" value={txCount} sub={perDaySub} />
                        <Stat className="dash-stat" label="Largest" value={largestSpend ? fmt(toAmount(largestSpend.amount)) : '—'}
                            sub={largestSpend ? largestSpend.description : 'No spending'} />
                    </div>
                </Card>

                {/* ── TRANSACTION LIST ── */}
                {/* overflow: clip, not hidden: it trims the rounded corners the same
                    way, but hidden makes this box the date headers' scroll container,
                    so their sticky `top: var(--sa-top)` pushed every header down by
                    the status-bar height (onto its first row) on Android, and they
                    never pinned while scrolling anywhere. */}
                <div className="glass-surface" data-testid="tx-list-box" style={{ borderRadius: 'var(--radius-lg)', overflow: 'clip' }}>
                    <div style={{ padding: isMobile ? 'var(--space-4) var(--space-4) var(--space-3)' : 'var(--space-4) var(--space-5) var(--space-3)' }}>
                        <AdvancedSearchBar
                            transactions={transactions}
                            onFilter={setFiltered}
                            onSetDateContext={handleSetDateContext}
                            initialQuery={initialQuery}
                            accounts={accounts}
                            extraChips={[...creditCardChips, ...cycleChips]}
                            onRegisterClearAll={fn => { clearAllRef.current = fn; }}
                            alwaysShowSearch
                            hideTriggers
                            trailing={toolbar}
                            onRegisterOpenSearch={fn => { openSearchRef.current = fn; }}
                            onRegisterOpenFilter={fn => { openFilterRef.current = fn; }}
                            onActiveFilterCountChange={setActiveFilterCount}
                        />
                    </div>

                    {selectMode && !loading && filtered.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--space-5) var(--space-3)' }}>
                            <span style={{ ...type.meta }}>
                                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Tap rows to select'}
                            </span>
                            <TextAction onClick={selectedIds.size === filtered.length ? () => setSelectedIds(new Set()) : selectAll}>
                                {selectedIds.size === filtered.length ? 'Deselect all' : `Select all ${filtered.length}`}
                            </TextAction>
                        </div>
                    )}

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
                            action={<Button variant="secondary" onClick={() => clearAllRef.current()}>Clear filters</Button>}
                        />
                    ) : (
                        <TransactionList
                            transactions={visibleTransactions}
                            currency={user.currency}
                            onEdit={openEdit}
                            onRefresh={refreshAfterWrite}
                            selectMode={selectMode}
                            selectedIds={selectedIds}
                            onToggleSelect={toggleSelect}
                            pendingDelete={pendingDelete}
                            onPendingDeleteChange={setPendingDelete}
                        />
                    )}
                    {hasMore && !loading && (
                        <button ref={loadMoreRef} type="button" className="fin-link" onClick={() => setDisplayCount(c => c + 50)}
                            style={{ display: 'block', width: '100%', padding: 'var(--space-3)', background: 'transparent', border: 'none', borderTop: '1px solid var(--glass-border)' }}>
                            Show {sortedFiltered.length - displayCount} more
                        </button>
                    )}
                </div>

            </div>
            </div>

            <SortSheet isOpen={sortSheetOpen} onClose={() => setSortSheetOpen(false)} sortKey={sortKey} onSortChange={setSortKey} />

            {/* ── TRANSACTION MODAL ── */}
            <TransactionModal isOpen={modalOpen} onClose={handleModalClose} onOfflineSave={handleOfflineSave} transaction={editingTx} prefill={prefillData} />

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
                    onRefresh={refreshAfterWrite}
                    onRemoveIds={removeIds}
                    onPendingDeleteChange={setPendingDelete}
                />
            )}

        </>
    );
}

export default function TransactionsPage() {
    return <Suspense><TransactionsPageInner /></Suspense>;
}
