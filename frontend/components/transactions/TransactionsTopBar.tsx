'use client';

// Floating glass top bar for /transactions -- replaces the old plain header
// card + Tabs(List/Calendar) + separate income/expense GCard pair. Built for
// the approved "B2" mockup: net-as-hero, income/expense chips, and an
// icon-only control row (search expands inline, no persistent box). Calendar
// moved out to Insights (components/analytics/CalendarTab.tsx) on 2026-08-25
// so this bar only ever needs to talk about the list view's own state.
//
// Deliberate scope trim vs. the approved mock: the net-hero figure does NOT
// live-swap to "N matches" while actively searching -- AdvancedSearchBar's
// search/filter state stays internal to that component (via the existing
// onRegisterOpenSearch/onRegisterOpenFilter callback-registration pattern),
// and plumbing a live match-count up here would mean lifting that state much
// further than this pattern supports cleanly. Net figure stays static.

import { useState } from 'react';
import { Search, SlidersHorizontal, ArrowUpDown, CheckSquare, ChevronLeft, ChevronRight, MoreHorizontal, Download, FileUp, MessageSquareText, TrendingUp, TrendingDown, Check, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { fmt as fmtBase } from '@/lib/utils';
import type { SortKey } from '@/lib/transactionFilters';

const fmt = (n: number) => fmtBase(Math.abs(n));

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'newest',   label: 'Newest first' },
    { key: 'oldest',   label: 'Oldest first' },
    { key: 'largest',  label: 'Largest amount' },
    { key: 'smallest', label: 'Smallest amount' },
];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface Props {
    selectedMonth: number | null;   // 1-indexed; null = all time
    selectedYear: number;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    onPickMonth: (month: number, year: number) => void;
    onShowAllTime: () => void;
    netAmount: number;
    netDelta: number | null;
    totalIncome: number;
    totalExpense: number;
    incomeDelta: number | null;
    expenseDelta: number | null;
    activeFilterCount: number;
    onOpenSearch: () => void;
    onOpenFilter: () => void;
    sortKey: SortKey;
    onSortChange: (key: SortKey) => void;
    selectMode: boolean;
    onToggleSelectMode: () => void;
    onExport: () => void;
    onImportPDF: () => void;
    onImportSMS: () => void;
    onAddTransaction: () => void;
}

export function TransactionsTopBar({
    selectedMonth, selectedYear, onPrevMonth, onNextMonth, onPickMonth, onShowAllTime,
    netAmount, netDelta, totalIncome, totalExpense, incomeDelta, expenseDelta,
    activeFilterCount, onOpenSearch, onOpenFilter, sortKey, onSortChange,
    selectMode, onToggleSelectMode, onExport, onImportPDF, onImportSMS, onAddTransaction,
}: Props) {
    const [monthSheetOpen, setMonthSheetOpen] = useState(false);
    const [sortSheetOpen, setSortSheetOpen]   = useState(false);
    const [moreOpen, setMoreOpen]             = useState(false);

    const monthLabel = selectedMonth
        ? `${MONTH_NAMES[selectedMonth - 1].slice(0, 3)} ${selectedYear}`
        : 'All time';

    const now = new Date();
    const pickerMonths = Array.from({ length: 12 }, (_, i) => i + 1);

    return (
        <>
            <div className="glass-surface" style={{ borderRadius: 'var(--radius-xl)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {/* ── Month nav + icon controls ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button type="button" onClick={onPrevMonth} aria-label="Previous month"
                            style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <ChevronLeft size={18} />
                        </button>
                        <button type="button" onClick={() => setMonthSheetOpen(true)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {monthLabel}
                            </span>
                        </button>
                        <button type="button" onClick={onNextMonth} aria-label="Next month"
                            style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <button type="button" onClick={onOpenSearch} title="Search" aria-label="Search"
                            style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <Search size={17} />
                        </button>
                        <button type="button" onClick={onOpenFilter} title="Filters" aria-label="Filters"
                            style={{ position: 'relative', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <SlidersHorizontal size={17} />
                            {activeFilterCount > 0 && (
                                <span style={{ position: 'absolute', top: '4px', right: '4px', minWidth: '14px', height: '14px', padding: '0 3px', borderRadius: '999px', background: 'var(--accent)', color: 'white', fontSize: '9px', fontWeight: 700, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>
                        <button type="button" onClick={() => setSortSheetOpen(true)} title="Sort" aria-label="Sort"
                            style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-md)', color: sortKey !== 'newest' ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer' }}>
                            <ArrowUpDown size={17} />
                        </button>
                        <button type="button" onClick={onToggleSelectMode} title={selectMode ? 'Cancel select' : 'Select'} aria-label={selectMode ? 'Cancel select' : 'Select'}
                            style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: selectMode ? 'var(--accent-subtle)' : 'none', border: 'none', borderRadius: 'var(--radius-md)', color: selectMode ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer' }}>
                            <CheckSquare size={17} />
                        </button>
                        <div style={{ position: 'relative' }}>
                            <button type="button" onClick={() => setMoreOpen(o => !o)} title="More" aria-label="More actions"
                                style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: moreOpen ? 'var(--accent-subtle)' : 'none', border: 'none', borderRadius: 'var(--radius-md)', color: moreOpen ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer' }}>
                                <MoreHorizontal size={17} />
                            </button>
                            {moreOpen && (
                                <>
                                    <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 299 }} />
                                    <div style={{ position: 'absolute', top: '46px', right: 0, background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-modal)', zIndex: 300, minWidth: '170px', overflow: 'hidden' }}>
                                        <button type="button" onClick={() => { onExport(); setMoreOpen(false); }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                                            <Download size={15} /> Export CSV
                                        </button>
                                        <button type="button" onClick={() => { onImportPDF(); setMoreOpen(false); }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                                            <FileUp size={15} /> Import PDF
                                        </button>
                                        <button type="button" onClick={() => { onImportSMS(); setMoreOpen(false); }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                                            <MessageSquareText size={15} /> Import SMS
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                        <button type="button" onClick={onAddTransaction} title="Add transaction" aria-label="Add transaction"
                            style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', cursor: 'pointer', marginLeft: '4px' }}>
                            <Plus size={18} />
                        </button>
                    </div>
                </div>

                {/* ── Net hero ── */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(24px, 7vw, 34px)', fontWeight: 700, color: netAmount >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                            {netAmount >= 0 ? '+' : '−'}{fmt(netAmount)}
                        </span>
                        {netDelta !== null && (
                            <span style={{ fontSize: '12px', fontWeight: 600, color: netDelta >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', fontFamily: 'var(--font-mono)' }}>
                                {netDelta >= 0 ? '▲' : '▼'} {Math.abs(netDelta).toFixed(0)}%
                            </span>
                        )}
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Net for this period</span>
                </div>

                {/* ── Income / expense chips ── */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)' }}>
                        <TrendingUp size={13} color="var(--color-inc)" style={{ flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-inc)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalIncome)}</span>
                        {incomeDelta !== null && (
                            <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 600, color: incomeDelta >= 0 ? 'var(--color-inc)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                {incomeDelta >= 0 ? '↑' : '↓'}{Math.abs(incomeDelta).toFixed(0)}%
                            </span>
                        )}
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)' }}>
                        <TrendingDown size={13} color="var(--color-exp)" style={{ flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalExpense)}</span>
                        {expenseDelta !== null && (
                            <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 600, color: expenseDelta > 0 ? 'var(--color-exp)' : 'var(--color-inc)', fontFamily: 'var(--font-mono)' }}>
                                {expenseDelta > 0 ? '↑' : '↓'}{Math.abs(expenseDelta).toFixed(0)}%
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Month picker sheet ── */}
            <Modal isOpen={monthSheetOpen} onClose={() => setMonthSheetOpen(false)} title="Jump to month" maxWidth="360px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button type="button" onClick={() => { onShowAllTime(); setMonthSheetOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '11px 14px', background: selectedMonth === null ? 'var(--accent-subtle)' : 'none', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: selectedMonth === null ? 'var(--accent)' : 'var(--text-primary)', fontSize: '14px', fontWeight: selectedMonth === null ? 600 : 400, fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                        All time
                        {selectedMonth === null && <Check size={14} />}
                    </button>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginTop: '4px' }}>
                        {pickerMonths.map(m => {
                            const active = selectedMonth === m && selectedYear === now.getFullYear();
                            return (
                                <button key={m} type="button" onClick={() => { onPickMonth(m, now.getFullYear()); setMonthSheetOpen(false); }}
                                    style={{ padding: '10px 6px', background: active ? 'var(--accent-subtle)' : 'var(--bg-surface-2)', border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '13px', fontWeight: active ? 600 : 400, fontFamily: 'var(--font-body)' }}>
                                    {MONTH_NAMES[m - 1].slice(0, 3)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Modal>

            {/* ── Sort sheet ── */}
            <Modal isOpen={sortSheetOpen} onClose={() => setSortSheetOpen(false)} title="Sort by" maxWidth="340px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {SORT_OPTIONS.map(opt => (
                        <button key={opt.key} type="button" onClick={() => { onSortChange(opt.key); setSortSheetOpen(false); }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 14px', background: sortKey === opt.key ? 'var(--accent-subtle)' : 'none', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: sortKey === opt.key ? 'var(--accent)' : 'var(--text-primary)', fontSize: '14px', fontWeight: sortKey === opt.key ? 600 : 400, fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                            {opt.label}
                            {sortKey === opt.key && <Check size={14} />}
                        </button>
                    ))}
                </div>
            </Modal>
        </>
    );
}
