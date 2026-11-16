'use client';

// Moved out of app/transactions/page.tsx on 2026-08-25 as part of the
// transactions redesign -- Calendar was a separate tab there that silently
// lost the list's month, filters and select mode on every switch (the two
// views never shared state; selectedMonth there was 1-indexed, currentMonth
// here is 0-indexed, and always were two separate pieces of state). It's an
// analysis view, not a transaction-management one, so it lives here instead.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI, recurringAPI, analyticsAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { CardHeader, Rows, Stat, TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { Skeleton } from '@/components/ui/Skeleton';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FetchErrorCard } from '@/components/ui/FetchErrorCard';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { useIsMobile } from '@/hooks/useWindowSize';
import { formatCurrency, isNonSavingsExpense, isRealIncome } from '@/lib/utils';
import { calendarMonthStats } from '@/lib/analytics';
import { type, truncate } from '@/lib/typography';

const DAY_LABELS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CAL_MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];

const fmtAmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.trim().replace('#', '');
    if (h.length !== 6) return [225, 29, 72];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Space or Enter does what a click does, for rows and cells that are divs. */
const onActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};

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
    const caption: React.CSSProperties = { ...type.label, margin: '0 0 var(--space-2)' };

    return (
        <div>
            <CardHeader
                title={dateLabel}
                sub={`${plural(transactions.length, 'transaction')}${scheduledCount > 0 ? ` · ${scheduledCount} scheduled` : ''}`}
                action={<TextAction onClick={onAdd}>Add</TextAction>}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {isEmpty && <p style={{ ...type.meta, margin: 0 }}>Nothing on this day</p>}

                {transactions.length > 0 && (
                    <div>
                        <p style={caption}>Transactions</p>
                        <Rows>
                            {transactions.map((tx: any) => {
                                const isInc = tx.type === 'income';
                                return (
                                    <div key={tx.id} className="fin-row-link" role="button" tabIndex={0}
                                        onClick={() => onEdit(tx)} onKeyDown={onActivate(() => onEdit(tx))}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ ...type.bodyStrong, margin: 0, ...truncate }}>{tx.description}</p>
                                            {tx.category_name && <p style={{ ...type.meta, margin: '2px 0 0' }}>{tx.category_name}</p>}
                                        </div>
                                        <span style={{ ...type.num, flexShrink: 0, color: isInc ? TONE_TEXT.good : 'var(--text-primary)' }}>
                                            {isInc ? '+' : '−'}{formatCurrency(parseFloat(tx.amount), currency)}
                                        </span>
                                    </div>
                                );
                            })}
                        </Rows>
                    </div>
                )}

                {scheduledCount > 0 && (
                    <div>
                        <p style={caption}>Scheduled</p>
                        <Rows>
                            {[...recIncome, ...recExpense].map((item: any, i: number) => {
                                const isInc = item.type === 'income';
                                return (
                                    <div key={item.id ?? i}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ ...type.bodyStrong, margin: 0, ...truncate }}>{item.description}</p>
                                            <p style={{ ...type.meta, margin: '2px 0 0' }}>Recurring</p>
                                        </div>
                                        <span style={{ ...type.num, flexShrink: 0, color: isInc ? TONE_TEXT.good : 'var(--text-primary)' }}>
                                            {isInc ? '+' : '−'}{formatCurrency(parseFloat(item.amount), currency)}
                                        </span>
                                    </div>
                                );
                            })}
                        </Rows>
                    </div>
                )}

                {isFuture && forecastAmount > 0 && (
                    <div>
                        <p style={caption}>Expected</p>
                        <Rows>
                            <div>
                                <p style={{ ...type.bodyStrong, margin: 0, flex: 1 }}>Projected spend</p>
                                <span style={{ ...type.num, flexShrink: 0 }}>{formatCurrency(forecastAmount, currency)}</span>
                            </div>
                        </Rows>
                    </div>
                )}
            </div>

            {/* Bottom spacer for sheet scroll */}
            <div style={{ height: '8px' }} />
        </div>
    );
}

export function CalendarTab() {
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
    const { totalSpent, totalIncome, incomeDays, spendingDays, dailyAvg, busiest } = useMemo(() => calendarMonthStats(dayMap), [dayMap]);

    const busiestLabel = useMemo(() => {
        if (!busiest) return '—';
        const d = new Date(busiest.date + 'T00:00:00');
        return `${d.getDate()} ${CAL_MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
    }, [busiest]);

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
    const monthTitle = `${CAL_MONTH_NAMES[currentMonth]} ${currentYear}`;
    const cellMin = isMobile ? '60px' : '90px';

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

                {/* ── MONTH SUMMARY ── */}
                <Card>
                    <CardHeader
                        title={monthTitle}
                        sub="Spent this month"
                        action={
                            <>
                                <button type="button" className="fin-icon-btn" onClick={prevMonth} aria-label="Previous month"><ChevronLeft size={16} /></button>
                                <button type="button" className="fin-icon-btn" onClick={nextMonth} aria-label="Next month"><ChevronRight size={16} /></button>
                            </>
                        }
                    />
                    {loading ? (
                        <Skeleton width={180} height={40} borderRadius={8} />
                    ) : (
                        <>
                            <p className="type-display" style={{ ...type.display, margin: 0 }}>{fmtAmt(totalSpent)}</p>
                            <div className="dash-stats">
                                <Stat className="dash-stat" label="Busiest day" value={busiestLabel}
                                    sub={busiest ? `${fmtAmt(busiest.amount)} spent` : 'No spending yet'} />
                                <Stat className="dash-stat" label="Money in on" value={plural(incomeDays, 'day')}
                                    sub={`${fmtAmt(totalIncome)} in total`} />
                                <Stat className="dash-stat" label="Average per spending day" value={fmtAmt(dailyAvg)}
                                    sub={`${plural(spendingDays, 'day')} with spending`} />
                            </div>
                        </>
                    )}
                </Card>

                {/* ── CALENDAR GRID ── */}
                <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                    <Card padding={0} style={{ overflow: 'hidden' }}>
                        {/* Day-of-week header */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--glass-border)' }}>
                            {DAY_LABELS.map(d => (
                                <div key={d} style={{ ...type.meta, padding: '10px 0', textAlign: 'center' }}>{d}</div>
                            ))}
                        </div>

                        {loading ? (
                            <div style={{ ...type.meta, padding: '60px', textAlign: 'center' }}>Loading calendar</div>
                        ) : fetchError ? (
                            <FetchErrorCard onRetry={fetchAll} />
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                                {cells.map((day, idx) => {
                                    const isLastInRow = (idx + 1) % 7 === 0;

                                    /* ── Empty padding cell ── */
                                    if (!day) {
                                        return (
                                            <div key={`e-${idx}`} style={{
                                                minHeight: cellMin,
                                                borderRight:  !isLastInRow ? '1px solid var(--glass-border)' : 'none',
                                                borderBottom: '1px solid var(--glass-border)',
                                                background: 'var(--glass-fill-1)',
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
                                    const scheduled = (rec?.income.length ?? 0) + (rec?.expense.length ?? 0) > 0;
                                    const cellBg    = expenses > 0 ? getCellBg(expenses) : 'transparent';
                                    const dot = (color: string) => <span style={{ display: 'block', width: '5px', height: '5px', borderRadius: '50%', background: color, flexShrink: 0 }} />;

                                    return (
                                        <div key={dateStr} onClick={() => handleDayClick(dateStr)}
                                            role="button" tabIndex={0} aria-pressed={isSel}
                                            onKeyDown={onActivate(() => handleDayClick(dateStr))}
                                            style={{
                                                minHeight: cellMin,
                                                borderRight:  !isLastInRow ? '1px solid var(--glass-border)' : 'none',
                                                borderBottom: '1px solid var(--glass-border)',
                                                padding:      isMobile ? '4px' : '6px',
                                                cursor:       'pointer',
                                                background:   cellBg,
                                                boxShadow:    isSel ? 'inset 0 0 0 2px var(--text-primary)' : undefined,
                                                transition:   'background 0.12s',
                                                position:     'relative',
                                                boxSizing:    'border-box',
                                            }}
                                            onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'var(--glass-fill-2)'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = cellBg; }}
                                        >
                                            {/* Day number + indicator dots */}
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                                <span style={{
                                                    ...(isToday ? type.label : type.meta),
                                                    width: isMobile ? '20px' : '24px',
                                                    height: isMobile ? '20px' : '24px',
                                                    borderRadius: '50%',
                                                    background: isToday ? 'var(--accent)' : 'transparent',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: isToday ? '#fff' : isFutDay ? 'var(--text-muted)' : 'var(--text-primary)',
                                                    flexShrink: 0,
                                                }}>
                                                    {day}
                                                </span>

                                                {/* Green: money in. Grey: something scheduled. */}
                                                <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end', marginTop: '3px' }}>
                                                    {income > 0 && dot('var(--color-inc)')}
                                                    {scheduled && dot('var(--text-muted)')}
                                                </div>
                                            </div>

                                            {/* One amount per day */}
                                            <div style={{ marginTop: '2px' }}>
                                                {expenses > 0 ? (
                                                    <span style={{ ...type.micro, ...truncate, display: 'block', color: 'var(--text-primary)' }}>
                                                        −{fmtAmt(expenses)}
                                                    </span>
                                                ) : !isMobile && isFutDay && projected > 0 ? (
                                                    <span style={{ ...type.micro, ...truncate, display: 'block' }}>
                                                        ~{fmtAmt(projected)}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                </div>

                <p style={{ ...type.meta, margin: 0 }}>
                    Shading shows how much you spent compared with your daily average. A green dot is money in, a grey dot is something scheduled, and a ~ amount is what is expected on a future day.
                </p>

                {/* ── DESKTOP: inline day detail panel ── */}
                {!isMobile && selectedDate && (
                    <Card style={{ animation: 'fadeUp 160ms ease forwards' }}>
                        <DayDetail {...dayDetailProps(selectedDate)} />
                    </Card>
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
