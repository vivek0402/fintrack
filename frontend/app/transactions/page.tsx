'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Download, Zap, X, CheckSquare } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { Skeleton, SkeletonCircle, SkeletonText, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { TransactionList } from '@/components/transactions/TransactionList';
import { BulkOpsPanel } from '@/components/transactions/BulkOpsPanel';
import { AdvancedSearchBar } from '@/components/transactions/AdvancedSearchBar';
import { exportToCSV } from '@/lib/utils';

const NOW_YEAR  = new Date().getFullYear();
const NOW_MONTH = new Date().getMonth() + 1;
const fmt = (n: number) => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

function TransactionsPageInner() {
    const router       = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile     = useIsMobile();

    const [transactions, setTransactions]   = useState<any[]>([]);
    const [filtered, setFiltered]           = useState<any[]>([]);
    const [loading, setLoading]             = useState(true);
    const [modalOpen, setModalOpen]         = useState(false);
    const [editingTx, setEditingTx]         = useState<any>(null);
    const [prefillData, setPrefillData]     = useState<any>(null);
    const [selectedMonth, setSelectedMonth] = useState<number | null>(NOW_MONTH);
    const [selectedYear, setSelectedYear]   = useState(NOW_YEAR);
    const [quickAddOpen, setQuickAddOpen]   = useState(false);
    const [quickAddText, setQuickAddText]   = useState('');
    const [quickAddLoading, setQuickAddLoading] = useState(false);
    const [quickAddError, setQuickAddError] = useState('');
    const [placeholderIdx, setPlaceholderIdx] = useState(0);
    const [displayCount, setDisplayCount]   = useState(50);
    const [selectMode, setSelectMode]       = useState(false);
    const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
    const [initialQuery, setInitialQuery]   = useState('');

    const loadMoreRef = useRef<HTMLButtonElement>(null);

    const QUICK_ADD_PLACEHOLDERS = [
        'paid 450 for lunch at cafe',
        'received salary 85000',
        'uber 180 to airport',
        'netflix subscription 649',
        'grocery shopping 2300 at dmart',
    ];

    // ── Infinite scroll ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!loadMoreRef.current) return;
        const observer = new IntersectionObserver(
            entries => { if (entries[0].isIntersecting) setDisplayCount(c => c + 50); },
            { threshold: 0.1 }
        );
        observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [loadMoreRef.current, filtered.length]);

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

    // Reset display count when filtered changes
    useEffect(() => { setDisplayCount(50); }, [filtered]);

    // ── Date context from AdvancedSearchBar ───────────────────────────────────
    const handleSetDateContext = useCallback((ctx: 'month' | 'all') => {
        if (ctx === 'all') {
            setSelectedMonth(null);
        } else {
            setSelectedMonth(prev => prev === null ? NOW_MONTH : prev);
            if (selectedMonth === null) setSelectedYear(NOW_YEAR);
        }
    }, [selectedMonth]);

    const totalIncome  = filtered.filter(tx => tx.type === 'income').reduce((s, tx) => s + parseFloat(tx.amount), 0);
    const totalExpense = filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + parseFloat(tx.amount), 0);
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
        <AppLayout>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <SkeletonCard height={36} style={{ flex: 1 }} />
                <SkeletonCard height={36} style={{ flex: 1 }} />
            </div>
            <SkeletonCard height={300} />
        </AppLayout>
    );

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
                                {selectedMonth
                                    ? `${new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'short' })} ${selectedYear}`
                                    : 'All time'
                                } · {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {!isMobile && (
                                <button type="button"
                                    onClick={() => void exportToCSV(filtered, `fintrack-${selectedYear}-${String(selectedMonth ?? NOW_MONTH).padStart(2, '0')}.csv`)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                    <Download size={14} /> Export
                                </button>
                            )}
                            <button type="button"
                                onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                                title={isMobile ? (selectMode ? 'Cancel' : 'Select') : undefined}
                                style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0' : '6px', padding: isMobile ? '9px' : '8px 14px', background: selectMode ? 'var(--accent-light)' : 'var(--bg-alt)', border: `1px solid ${selectMode ? 'var(--accent-border)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', color: selectMode ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '13px', fontWeight: selectMode ? 600 : 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                <CheckSquare size={16} />
                                {!isMobile && <>{selectMode ? 'Cancel' : 'Select'}</>}
                            </button>
                            <button type="button"
                                onClick={() => { setQuickAddOpen(true); setQuickAddText(''); setQuickAddError(''); }}
                                title={isMobile ? 'Quick Add' : undefined}
                                style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0' : '6px', padding: isMobile ? '9px' : '8px 14px', background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                <Zap size={16} />
                                {!isMobile && <>Quick Add</>}
                            </button>
                            <button type="button"
                                onClick={() => { setEditingTx(null); setPrefillData(null); setModalOpen(true); }}
                                style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <Plus size={18} color="white" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── ADVANCED SEARCH BAR ── */}
                <AdvancedSearchBar
                    transactions={transactions}
                    onFilter={setFiltered}
                    onSetDateContext={handleSetDateContext}
                    initialQuery={initialQuery}
                />

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

                {/* ── SELECT ALL BAR ── */}
                {selectMode && !loading && filtered.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)' }}>
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
                                No transactions match your filters.
                            </p>
                        </div>
                    ) : (
                        <TransactionList
                            transactions={visibleTransactions}
                            currency={user.currency}
                            onEdit={tx => { setEditingTx(tx); setPrefillData(null); setModalOpen(true); }}
                            onRefresh={fetchTransactions}
                            selectMode={selectMode}
                            selectedIds={selectedIds}
                            onToggleSelect={toggleSelect}
                        />
                    )}
                    {hasMore && !loading && (
                        <button ref={loadMoreRef} type="button" onClick={() => setDisplayCount(c => c + 50)}
                            style={{ width: '100%', padding: '10px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-body)', cursor: 'pointer', opacity: 0.6 }}>
                            ↓ {filtered.length - displayCount} more
                        </button>
                    )}
                </div>

            </div>

            {/* ── TRANSACTION MODAL ── */}
            <TransactionModal isOpen={modalOpen} onClose={handleModalClose} onSuccess={fetchTransactions} transaction={editingTx} prefill={prefillData} />

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
                />
            )}

            {/* ── QUICK ADD MODAL ── */}
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
                            <button type="button" onClick={() => setQuickAddOpen(false)}
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
                            style={{ width: '100%', padding: '14px', background: 'var(--bg-alt)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.95rem', fontFamily: 'var(--font-body)', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, transition: 'border-color 0.15s' }}
                            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                        />
                        {quickAddError && <p style={{ fontSize: '0.8rem', color: 'var(--color-exp)', margin: '8px 0 0', fontFamily: 'var(--font-body)' }}>{quickAddError}</p>}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setQuickAddOpen(false)}
                                style={{ padding: '10px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-alt)', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
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

        </AppLayout>
    );
}

export default function TransactionsPage() {
    return <Suspense><TransactionsPageInner /></Suspense>;
}
