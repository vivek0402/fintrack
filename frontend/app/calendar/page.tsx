'use client';

import { useEffect, useState, useRef, useMemo, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, TrendingUp, TrendingDown, X, Zap } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI, recurringAPI, analyticsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { formatCurrency } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useWindowSize';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_LABELS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
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
                                            ? <span style={{ fontSize: '16px' }}>{tx.category_icon}</span>
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
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: isInc ? 'var(--color-info)' : '#f97316' }} />
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

// ── Main page ─────────────────────────────────────────────────────────────────

function CalendarPageInner() {
    const router  = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
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

    // Read CSS token once for heat-map colour
    useEffect(() => {
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-exp').trim();
        if (raw) setExpRgb(hexToRgb(raw));
    }, []);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    // ── Data fetch (parallel) ─────────────────────────────────────────────────
    const fetchAll = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const [txRes, recRes, forecastRes] = await Promise.allSettled([
                transactionsAPI.getAll({ month: currentMonth + 1, year: currentYear }),
                recurringAPI.getAll(),
                analyticsAPI.forecast({ month: currentMonth + 1, year: currentYear }),
            ]);
            if (txRes.status      === 'fulfilled') {
                setTransactions(txRes.value.data.transactions ?? []);
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
            if (tx.type === 'income') m[key].income   += parseFloat(tx.amount) || 0;
            else                      m[key].expenses += parseFloat(tx.amount) || 0;
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
        return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()} (${fmtAmt(busiestDay.amount)})`;
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

    // ── Loading skeleton ──────────────────────────────────────────────────────
    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={80}  style={{ marginBottom: '16px' }} />
            <SkeletonCard height={60}  style={{ marginBottom: '16px' }} />
            <SkeletonCard height={500} />
        </AppLayout>
    );

    // ── DayDetail props helper ────────────────────────────────────────────────
    const dayDetailProps = (dateStr: string) => ({
        dateStr,
        transactions:   selData?.transactions ?? [],
        recIncome:      selRec?.income        ?? [],
        recExpense:     selRec?.expense       ?? [],
        forecastAmount: selForecast,
        isFuture:       selIsFuture,
        currency:       user.currency,
        onAdd: () => { setDefaultDate(dateStr); setEditingTx(null); setModalOpen(true); },
        onEdit: (tx: any) => { setEditingTx(tx); setModalOpen(true); },
    });

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── PAGE HEADER ── */}
                <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                                Calendar
                            </h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                Transaction timeline
                            </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button type="button" onClick={prevMonth}
                                style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ChevronLeft size={16} />
                            </button>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? '14px' : '15px', fontWeight: 700, color: 'var(--text-primary)', minWidth: isMobile ? '88px' : '130px', textAlign: 'center' }}>
                                {isMobile ? MONTH_NAMES[currentMonth].slice(0, 3) : MONTH_NAMES[currentMonth]} {currentYear}
                            </span>
                            <button type="button" onClick={nextMonth}
                                style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── STAT CHIPS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '10px' }}>
                    <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
                        <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Total Spent</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? '14px' : '16px', fontWeight: 700, color: 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                            {loading ? '—' : fmtAmt(totalSpent)}
                        </p>
                    </div>
                    <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
                        <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Income Days</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? '14px' : '16px', fontWeight: 700, color: 'var(--color-inc)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                            {loading ? '—' : `${incomeDays} day${incomeDays !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                    <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px', gridColumn: isMobile ? '1 / -1' : undefined }}>
                        <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Busiest Day</p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: isMobile ? '13px' : '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {loading ? '—' : busiestLabel}
                        </p>
                    </div>
                </div>

                {/* ── LEGEND ── */}
                <div style={{ display: 'flex', gap: isMobile ? '12px' : '20px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 16px' }}>
                    {[
                        { color: 'var(--color-inc)',  label: 'Income'    },
                        { color: 'var(--color-exp)',  label: 'Expense'   },
                        { color: 'var(--color-info)', label: 'Recurring' },
                        { color: '#f97316',           label: 'Bill Due'  },
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
                                                {(rec?.expense.length ?? 0) > 0  && <span style={{ display: 'block', width: '5px', height: '5px', borderRadius: '50%', background: '#f97316',           flexShrink: 0 }} />}
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
                            <button type="button" onClick={() => setSelectedDate(null)}
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
        </AppLayout>
    );
}

export default function CalendarPage() {
    return <Suspense><CalendarPageInner /></Suspense>;
}
