'use client';

// Page header for /transactions: the "Transactions" meta line, then the month
// stepper as the title (prev arrow, the month as a button that opens the
// "Jump to month" sheet, next arrow). The summary card, tools and list live in
// the page itself; the sort sheet is exported so the page's toolbar can open it.

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { type } from '@/lib/typography';
import type { SortKey } from '@/lib/transactionFilters';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'newest',   label: 'Newest first' },
    { key: 'oldest',   label: 'Oldest first' },
    { key: 'largest',  label: 'Largest amount' },
    { key: 'smallest', label: 'Smallest amount' },
];

export const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface Props {
    selectedMonth: number | null;   // 1-indexed; null = all time
    selectedYear: number;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    onPickMonth: (month: number, year: number) => void;
    onShowAllTime: () => void;
}

export function TransactionsTopBar({
    selectedMonth, selectedYear, onPrevMonth, onNextMonth, onPickMonth, onShowAllTime,
}: Props) {
    const [monthSheetOpen, setMonthSheetOpen] = useState(false);
    const [pickerYear, setPickerYear]         = useState(selectedYear);
    const [titleHover, setTitleHover]         = useState(false);

    const monthLabel = selectedMonth ? `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}` : 'All time';

    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;
    const pickerMonths = Array.from({ length: 12 }, (_, i) => i + 1);

    const openPicker = () => { setPickerYear(selectedYear); setMonthSheetOpen(true); };

    return (
        <>
            <div className="fin-page-head">
                <div style={{ minWidth: 0 }}>
                    <p style={{ ...type.meta, margin: 0 }}>Transactions</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                        <button type="button" className="fin-icon-btn" onClick={onPrevMonth} aria-label="Previous month">
                            <ChevronLeft size={16} />
                        </button>
                        <button type="button" onClick={openPicker}
                            onMouseEnter={() => setTitleHover(true)} onMouseLeave={() => setTitleHover(false)}
                            style={{ ...type.heading, margin: 0, padding: '2px var(--space-2)', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-md)', background: titleHover ? 'var(--glass-fill-1)' : 'transparent', transition: 'background var(--transition-fast)' }}>
                            {monthLabel}
                        </button>
                        <button type="button" className="fin-icon-btn" onClick={onNextMonth} aria-label="Next month">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Month picker sheet ── */}
            <Modal isOpen={monthSheetOpen} onClose={() => setMonthSheetOpen(false)} title="Jump to month" maxWidth="360px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                    <button type="button" onClick={() => { onShowAllTime(); setMonthSheetOpen(false); }}
                        style={{ ...type.body, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '11px 14px', background: selectedMonth === null ? 'var(--glass-fill-3)' : 'none', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: selectedMonth === null ? 'var(--text-primary)' : 'var(--text-secondary)', textAlign: 'left' }}>
                        All time
                        {selectedMonth === null && <Check size={14} />}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: 'var(--space-2) 0' }}>
                        <button type="button" className="fin-icon-btn" aria-label="Previous year" onClick={() => setPickerYear(y => y - 1)}>
                            <ChevronLeft size={16} />
                        </button>
                        <span style={{ ...type.title }}>{pickerYear}</span>
                        <button type="button" className="fin-icon-btn" aria-label="Next year" disabled={pickerYear >= nowYear} onClick={() => setPickerYear(y => Math.min(y + 1, nowYear))}>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-1)' }}>
                        {pickerMonths.map(m => {
                            const active = selectedMonth === m && selectedYear === pickerYear;
                            const future = pickerYear === nowYear && m > nowMonth;
                            return (
                                <button key={m} type="button" disabled={future}
                                    onClick={() => { onPickMonth(m, pickerYear); setMonthSheetOpen(false); }}
                                    style={{ ...type.body, padding: '10px 6px', background: active ? 'var(--glass-fill-3)' : 'var(--glass-fill-1)', border: 'none', borderRadius: 'var(--radius-md)', cursor: future ? 'default' : 'pointer', opacity: future ? 0.35 : 1, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                    {MONTH_NAMES[m - 1].slice(0, 3)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Modal>
        </>
    );
}

export function SortSheet({ isOpen, onClose, sortKey, onSortChange }: {
    isOpen: boolean;
    onClose: () => void;
    sortKey: SortKey;
    onSortChange: (key: SortKey) => void;
}) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Sort by" maxWidth="340px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {SORT_OPTIONS.map(opt => (
                    <button key={opt.key} type="button" onClick={() => { onSortChange(opt.key); onClose(); }}
                        style={{ ...type.body, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 14px', background: sortKey === opt.key ? 'var(--glass-fill-3)' : 'none', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: sortKey === opt.key ? 'var(--text-primary)' : 'var(--text-secondary)', textAlign: 'left' }}>
                        {opt.label}
                        {sortKey === opt.key && <Check size={14} />}
                    </button>
                ))}
            </div>
        </Modal>
    );
}
