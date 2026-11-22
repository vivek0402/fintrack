'use client';

import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction, Rows, type Tone, TONE_TEXT } from '@/components/ui/CardParts';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { CountUp } from '@/components/ui/CountUp';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { useUserQuery } from '@/hooks/queries';
import { analyticsAPI } from '@/lib/api';
import { fmt, getSmartIcon } from '@/lib/utils';
import { monthChangeSentence } from '@/lib/netWorth';
import { type, truncate } from '@/lib/typography';
import { budgetPct, dayLabel, groupByDay, perDayAllowance, sortBudgetsByUse } from '@/lib/mobileHome';
import type { HealthScoreResult } from '@/lib/healthScore';
import { toAmount, type Budget, type Transaction } from '@/types/finance';

/**
 * The phone home screen (the "Wallet" layout, approved 2026-11-22): swipe
 * cards, the brief, needs attention, budget rings, then activity by day.
 * Desktop keeps the grid in app/dashboard/page.tsx. Everything here is fed by
 * the data that page already loads, so the two layouts can't disagree.
 */

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BRIEF_DONE_KEY = 'fintrack-brief-action-done';
const NO_NOTICES: ReactNode[] = [];

export interface TrendPoint { month: string; income: number; expenses: number }

export interface FreeToSpend {
    income: number; totalBudgeted: number; goalMonthly: number; pool: number;
    unbudgetedSpent: number; remaining: number; usedPct: number;
}

export interface MobileHomeProps {
    month: number;
    year: number;
    isCurrentMonth: boolean;
    onPickMonth: (month: number, year: number) => void;
    greeting: string;
    loading: boolean;
    net: number;
    income: number;
    expenses: number;
    savingsPct: number;
    investmentRatio: { ratio_pct: number; invested_this_month: number; income_this_month: number } | null;
    trend: TrendPoint[];
    free: FreeToSpend | null;
    dailyBurn: number;
    daysLeft: number;
    daysInMonth: number;
    health: HealthScoreResult | null;
    /** The same widgets desktop shows under "see why". */
    healthDetails: ReactNode;
    showNetWorth: boolean;
    brief: {
        controls: ReactNode;
        body: ReactNode;
        dateSub?: string;
        action: { text: string; when: 'today' | 'week' } | null;
    } | null;
    notices: ReactNode[];
    budgets: Budget[];
    transactions: Transaction[];
}

type Sheet = 'month' | 'net' | 'free' | 'health' | null;

const savingsTone = (pct: number): Tone => (pct >= 20 ? 'good' : pct >= 10 ? 'caution' : 'bad');
const ringColor = (pct: number) => (pct > 100 ? 'var(--color-exp)' : pct >= 85 ? 'var(--color-warn)' : 'var(--color-inc)');
const budgetName = (b: Budget) => (b as Budget & { name?: string }).name ?? b.category_name ?? 'Budget';

export function MobileHome(p: MobileHomeProps) {
    const router = useRouter();
    const [sheet, setSheet] = useState<Sheet>(null);
    const [openBudget, setOpenBudget] = useState<Budget | null>(null);
    const [editTx, setEditTx] = useState<Transaction | null>(null);
    const [allNotices, setAllNotices] = useState(false);

    // ── Net worth. Its own cache key: the Net worth page keeps a bigger bundle
    // (velocity, allocation) under 'net-worth', which this must not overwrite. ──
    const netWorthQuery = useUserQuery('home-net-worth', [], async () => (await analyticsAPI.getNetWorth()).data, { enabled: p.showNetWorth });
    const netWorth = netWorthQuery.data?.current?.net_worth as number | undefined;
    const netWorthHistory: { net_worth: number }[] = netWorthQuery.data?.history ?? [];
    const hasNetWorth = p.showNetWorth && netWorth != null && !(netWorth === 0 && netWorthHistory.length === 0);

    // ── Carousel position for the dots ──
    const carRef = useRef<HTMLDivElement>(null);
    const [cardIdx, setCardIdx] = useState(0);
    const onCarouselScroll = () => {
        const el = carRef.current;
        const first = el?.firstElementChild as HTMLElement | null;
        if (!el || !first) return;
        setCardIdx(Math.round(el.scrollLeft / (first.offsetWidth + 12)));
    };
    // A different month starts again from the first card.
    const monthKey = `${p.year}-${p.month}`;
    const [prevMonthKey, setPrevMonthKey] = useState(monthKey);
    if (monthKey !== prevMonthKey) { setPrevMonthKey(monthKey); setCardIdx(0); }
    useEffect(() => { if (carRef.current) carRef.current.scrollLeft = 0; }, [monthKey]);

    const allowance = p.free ? perDayAllowance(p.free.remaining, p.daysLeft) : null;
    const weakest = p.health ? [...p.health.breakdown].sort((a, b) => a.pct - b.pct)[0] : null;
    const investedPct = p.investmentRatio && p.investmentRatio.income_this_month > 0 ? Math.round(p.investmentRatio.ratio_pct) : null;

    const cards: { key: string; label: string; onOpen: () => void; body: ReactNode }[] = [];
    cards.push({
        key: 'net', label: p.isCurrentMonth ? 'Net this month' : `Net in ${MONTH_NAMES[p.month]}`, onOpen: () => setSheet('net'),
        body: (
            <>
                <div>
                    {p.loading ? <Skeleton width="60%" height={30} borderRadius={6} style={{ margin: '6px 0' }} /> : (
                        <p style={{ ...type.figure, margin: '6px 0 4px', color: p.net >= 0 ? 'var(--text-primary)' : 'var(--color-exp-text)' }}>
                            <CountUp value={p.net} format={n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n))} />
                        </p>
                    )}
                    <p style={{ ...type.numSmall, margin: 0 }}>
                        <span style={{ color: 'var(--color-inc-text)' }}>{fmt(p.income)} in</span> · {fmt(p.expenses)} out
                    </p>
                </div>
                <MiniLine values={p.trend.map(t => t.income - t.expenses)} color="var(--color-inc)" />
                <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
                    <div>
                        <p style={{ ...type.label, margin: 0 }}>Savings rate</p>
                        <p style={{ ...type.num, margin: '2px 0 0', color: TONE_TEXT[savingsTone(p.savingsPct)] }}>{p.savingsPct}%</p>
                    </div>
                    <div>
                        <p style={{ ...type.label, margin: 0 }}>Invested</p>
                        <p style={{ ...type.num, margin: '2px 0 0' }}>{investedPct == null ? '—' : `${investedPct}%`}</p>
                    </div>
                </div>
            </>
        ),
    });
    if (p.isCurrentMonth && p.free) {
        const f = p.free;
        cards.push({
            key: 'free', label: 'Free to spend', onOpen: () => setSheet('free'),
            body: (
                <>
                    <div>
                        <p style={{ ...type.figure, margin: '6px 0 4px', color: f.remaining > 0 ? 'var(--text-primary)' : 'var(--color-warn-text)' }}>{fmt(f.remaining)}</p>
                        <p style={{ ...type.meta, margin: 0 }}>
                            {allowance != null ? `About ${fmt(allowance)} a day for the ${p.daysLeft} ${p.daysLeft === 1 ? 'day' : 'days'} left` : 'The month is over'}
                        </p>
                    </div>
                    <div>
                        <ProgressBar pct={f.usedPct} height={6} color={f.usedPct > 80 ? 'var(--color-warn)' : 'var(--color-inc)'} />
                        <p style={{ ...type.meta, margin: '8px 0 0' }}>
                            {fmt(f.unbudgetedSpent)} of a {fmt(f.pool)} pool used{p.dailyBurn > 0 ? ` · ${fmt(p.dailyBurn)} a day so far` : ''}
                        </p>
                    </div>
                </>
            ),
        });
    } else if (p.isCurrentMonth && p.dailyBurn > 0) {
        cards.push({
            key: 'spend', label: 'Spending', onOpen: () => router.push('/budgets'),
            body: (
                <>
                    <p style={{ ...type.figure, margin: '6px 0 4px' }}>{fmt(p.dailyBurn)}<span style={{ ...type.meta }}> a day</span></p>
                    <p style={{ ...type.meta, margin: 0 }}>
                        {p.daysLeft} of {p.daysInMonth} days left. Set budgets to see what is free to spend.
                    </p>
                </>
            ),
        });
    }
    if (p.health) {
        const h = p.health;
        cards.push({
            key: 'health', label: 'Health score', onOpen: () => setSheet('health'),
            body: (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <div>
                            <p style={{ ...type.figure, margin: '6px 0 4px' }}>{h.score}</p>
                            <p style={{ ...type.meta, margin: 0, color: TONE_TEXT[h.score >= 70 ? 'good' : h.score >= 50 ? 'caution' : 'bad'] }}>{h.label}</p>
                        </div>
                        <Ring pct={h.score} size={72} stroke={8} color={h.score >= 70 ? 'var(--color-inc)' : h.score >= 50 ? 'var(--color-warn)' : 'var(--color-exp)'} />
                    </div>
                    <p style={{ ...type.meta, margin: 0 }}>
                        {weakest && weakest.pct < 70 ? `${weakest.name} is holding it back. ` : ''}Tap for the breakdown, net worth, credit and debt.
                    </p>
                </>
            ),
        });
    }
    if (hasNetWorth) {
        const change = monthChangeSentence(netWorthHistory as Parameters<typeof monthChangeSentence>[0]);
        cards.push({
            key: 'worth', label: 'Net worth', onOpen: () => router.push('/net-worth'),
            body: (
                <>
                    <div>
                        <p style={{ ...type.figure, margin: '6px 0 4px' }}>{fmt(netWorth!)}</p>
                        <p style={{ ...type.meta, margin: 0 }}>{change ?? 'Assets minus what you owe'}</p>
                    </div>
                    <MiniLine values={netWorthHistory.slice(-6).map(h => Number(h.net_worth))} color="var(--color-inc)" />
                </>
            ),
        });
    }

    // ── Brief action "Done" (kept on this device; the brief has no done state on the server) ──
    // Only ever rendered on the client (the page picks it after hydration), so
    // reading storage in the initializer is safe.
    const [doneAction, setDoneAction] = useState<string | null>(() => {
        try { return typeof window === 'undefined' ? null : localStorage.getItem(BRIEF_DONE_KEY); } catch { return null; }
    });
    const markDone = (text: string) => {
        setDoneAction(text);
        try { localStorage.setItem(BRIEF_DONE_KEY, text); } catch { /* storage blocked */ }
    };
    const action = p.brief?.action ?? null;

    const notices = p.isCurrentMonth ? p.notices : NO_NOTICES;
    const shownNotices = allNotices ? notices : notices.slice(0, 3);
    const sortedBudgets = useMemo(() => sortBudgetsByUse(p.budgets), [p.budgets]);
    const days = useMemo(() => groupByDay(p.transactions, 8), [p.transactions]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

            {/* ── Header: greeting and the month picker ── */}
            <div>
                <p style={{ ...type.meta, margin: 0 }}>{p.greeting}</p>
                <button type="button" onClick={() => setSheet('month')} aria-haspopup="dialog"
                    style={{ ...type.heading, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', background: 'none', border: 'none', padding: 0, minHeight: 44, cursor: 'pointer' }}>
                    {MONTH_NAMES[p.month]} {p.year}
                    <ChevronDown size={18} color="var(--text-secondary)" aria-hidden="true" />
                </button>
            </div>

            {/* ── Swipe cards ── */}
            <div>
                <div ref={carRef} className="mh-carousel" onScroll={onCarouselScroll} aria-label="Summary cards">
                    {cards.map(c => (
                        <button key={c.key} type="button" className="glass-surface mh-card" onClick={c.onOpen}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1, justifyContent: 'space-between', width: '100%' }}>
                                <p style={{ ...type.label, margin: 0 }}>{c.label}</p>
                                {c.body}
                            </div>
                        </button>
                    ))}
                </div>
                {cards.length > 1 && (
                    <div className="mh-dots" aria-hidden="true">
                        {cards.map((c, i) => <span key={c.key} className={i === cardIdx ? 'on' : undefined} />)}
                    </div>
                )}
            </div>

            {/* ── Brief ── */}
            {p.brief && (
                <Card>
                    <CardHeader title="Brief" sub={p.brief.dateSub} action={p.brief.controls} flush={!p.brief.body && !action} />
                    {p.brief.body}
                    {action && (
                        doneAction === action.text ? (
                            <p style={{ ...type.meta, margin: 'var(--space-2) 0 0', color: 'var(--color-inc-text)' }}>
                                Done: {action.text}
                            </p>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-2) var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--accent-subtle)' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ ...type.label, margin: 0, color: 'var(--accent-text)' }}>Suggested for {action.when === 'today' ? 'today' : 'this week'}</p>
                                    <p style={{ ...type.bodyStrong, margin: '2px 0 0' }}>{action.text}</p>
                                </div>
                                <TextAction onClick={() => markDone(action.text)}>Done</TextAction>
                            </div>
                        )
                    )}
                </Card>
            )}

            {/* ── Needs attention ── */}
            {notices.length > 0 && (
                <Card>
                    <CardHeader title="Needs attention" sub={`${notices.length} ${notices.length === 1 ? 'thing' : 'things'}, most urgent first`} />
                    <Rows>{shownNotices}</Rows>
                    {notices.length > 3 && (
                        <TextAction onClick={() => setAllNotices(v => !v)}>{allNotices ? 'Show fewer' : `Show ${notices.length - 3} more`}</TextAction>
                    )}
                </Card>
            )}

            {/* ── Budgets as rings, most used first ── */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ ...type.title, margin: 0 }}>Budgets</p>
                    <TextAction onClick={() => router.push('/budgets')}>{p.budgets.length === 0 && !p.loading ? 'Set budgets' : 'See all'}</TextAction>
                </div>
                {p.loading ? (
                    <div className="mh-rings">{[1, 2, 3].map(i => <Skeleton key={i} width={116} height={132} borderRadius={16} />)}</div>
                ) : p.budgets.length === 0 ? (
                    <p style={{ ...type.body, margin: 0 }}>No budgets for this month yet.</p>
                ) : (
                    <div className="mh-rings">
                        {sortedBudgets.map(b => {
                            const pct = budgetPct(b), spent = toAmount(b.spent), limit = toAmount(b.amount), over = spent > limit && limit > 0;
                            return (
                                <button key={b.id ?? b.category_id} type="button" className="mh-ring-tile pressable" onClick={() => setOpenBudget(b)}>
                                    <span style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
                                        <Ring pct={pct} size={64} stroke={7} color={ringColor(pct)} />
                                        <span aria-hidden="true" style={{ position: 'absolute', fontSize: 'var(--text-title)' }}>{getSmartIcon('', b.category_name, b.category_icon)}</span>
                                    </span>
                                    <span style={{ ...type.label, color: 'var(--text-primary)', ...truncate, maxWidth: '100%' }}>{budgetName(b)}</span>
                                    <span style={{ ...type.numSmall, color: over ? 'var(--color-exp-text)' : 'var(--text-secondary)' }}>
                                        {over ? `${fmt(spent - limit)} over` : `${fmt(Math.max(0, limit - spent))} left`}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Activity by day ── */}
            <Card>
                <CardHeader title="Activity" action={<TextAction onClick={() => router.push('/transactions')}>View all</TextAction>} flush={!p.loading && days.length === 0} />
                {p.loading ? (
                    <Rows>
                        {[1, 2, 3, 4].map(i => (
                            <div key={i}>
                                <Skeleton width={36} height={36} borderRadius={10} />
                                <div style={{ flex: 1 }}><Skeleton width="55%" height={12} borderRadius={4} style={{ marginBottom: 6 }} /><Skeleton width="35%" height={10} borderRadius={4} /></div>
                            </div>
                        ))}
                    </Rows>
                ) : days.length === 0 ? (
                    <p style={{ ...type.body, margin: 'var(--space-2) 0 0' }}>No transactions yet. Tap + to add your first one.</p>
                ) : days.map((d, gi) => (
                    <div key={d.date} style={{ marginTop: gi ? 'var(--space-3)' : 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-1) 0' }}>
                            <span style={type.label}>{d.label}</span>
                            {d.spent > 0 && <span style={type.numSmall}>−{fmt(d.spent)}</span>}
                        </div>
                        <Rows>
                            {d.items.map(tx => {
                                const isIncome = tx.type === 'income';
                                return (
                                    <div key={tx.id} className="fin-row-link pressable" role="button" tabIndex={0}
                                        aria-label={`Edit ${tx.description}`}
                                        onClick={() => setEditTx(tx)}
                                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditTx(tx); } }}>
                                        <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 'var(--text-title)' }}>
                                            {getSmartIcon(tx.description, tx.category_name, tx.category_icon)}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{tx.description}</p>
                                            <p style={{ ...type.meta, ...truncate, margin: '2px 0 0' }}>{tx.category_name || 'Uncategorized'}</p>
                                        </div>
                                        <span style={{ ...type.num, color: isIncome ? 'var(--color-inc-text)' : 'var(--text-primary)', flexShrink: 0 }}>
                                            {isIncome ? '+' : '−'}{fmt(toAmount(tx.amount))}
                                        </span>
                                    </div>
                                );
                            })}
                        </Rows>
                    </div>
                ))}
            </Card>

            {/* ── Sheets ── */}
            <BottomSheet isOpen={sheet === 'month'} onClose={() => setSheet(null)} title="Choose a month">
                <MonthGrid month={p.month} year={p.year} onPick={(m, y) => { setSheet(null); p.onPickMonth(m, y); }} />
            </BottomSheet>

            <BottomSheet isOpen={sheet === 'net'} onClose={() => setSheet(null)} title="Last 6 months">
                <NetTrend trend={p.trend} />
                {investedPct != null && p.investmentRatio && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-3) 0', borderTop: '1px solid var(--glass-border)' }}>
                        <span style={type.body}>Invested in {MONTH_NAMES[p.month]}</span>
                        <span style={type.num}>{fmt(p.investmentRatio.invested_this_month)} · {investedPct}%</span>
                    </div>
                )}
            </BottomSheet>

            <BottomSheet isOpen={sheet === 'free'} onClose={() => setSheet(null)} title="Free to spend">
                {p.free && (
                    <>
                        <p style={{ ...type.meta, margin: '0 0 var(--space-2)' }}>Money with no job yet, after budgets and goals.</p>
                        <KV label="Income" value={fmt(p.free.income)} />
                        <KV label="Minus budgets" value={`−${fmt(p.free.totalBudgeted)}`} />
                        {p.free.goalMonthly > 0 && <KV label="Minus goal savings" value={`−${fmt(p.free.goalMonthly)}`} />}
                        <KV label="Pool" value={fmt(p.free.pool)} strong />
                        <KV label="Spent outside budgets" value={`−${fmt(p.free.unbudgetedSpent)}`} />
                        <KV label="Left" value={fmt(p.free.remaining)} strong />
                        <KV label="Days left" value={`${p.daysLeft} of ${p.daysInMonth}`} />
                        {allowance != null && <KV label="You can spend" value={`${fmt(allowance)} a day`} tone="good" />}
                    </>
                )}
            </BottomSheet>

            <BottomSheet isOpen={sheet === 'health'} onClose={() => setSheet(null)} title="Health score">
                <div className="mh-sheet-stack">{p.healthDetails}</div>
            </BottomSheet>

            <BottomSheet isOpen={!!openBudget} onClose={() => setOpenBudget(null)} title={openBudget ? budgetName(openBudget) : undefined}>
                {openBudget && <BudgetDetail budget={openBudget} transactions={p.transactions} daysLeft={p.isCurrentMonth ? p.daysLeft : 0}
                    onOpenBudgets={() => { setOpenBudget(null); router.push('/budgets'); }} />}
            </BottomSheet>

            <TransactionModal isOpen={!!editTx} onClose={() => setEditTx(null)} transaction={editTx} />
        </div>
    );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function KV({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: Tone }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-3) 0', borderTop: '1px solid var(--glass-border)' }}>
            <span style={strong ? type.bodyStrong : type.body}>{label}</span>
            <span style={{ ...type.num, color: tone ? TONE_TEXT[tone] : undefined }}>{value}</span>
        </div>
    );
}

function Ring({ pct, size, stroke, color }: { pct: number; size: number; stroke: number; color: string }) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const shown = Math.max(0, Math.min(100, pct));
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--glass-fill-2)" strokeWidth={stroke} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
        </svg>
    );
}

/** A small trend line for a card. Nothing to draw with fewer than two points. */
function MiniLine({ values, color }: { values: number[]; color: string }) {
    if (values.length < 2) return null;
    const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / span) * 26}`).join(' ');
    return (
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%', height: 36, display: 'block' }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

function MonthGrid({ month, year, onPick }: { month: number; year: number; onPick: (m: number, y: number) => void }) {
    const now = new Date();
    const options = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
        return { m: d.getMonth() + 1, y: d.getFullYear() };
    });
    return (
        <div className="mh-months">
            {options.map(o => {
                const on = o.m === month && o.y === year;
                return (
                    <button key={`${o.y}-${o.m}`} type="button" aria-pressed={on} onClick={() => onPick(o.m, o.y)} className="pressable"
                        style={{ ...type.bodyStrong, minHeight: 52, borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', cursor: 'pointer',
                            background: on ? 'var(--text-primary)' : 'var(--glass-fill-1)', color: on ? 'var(--bg-base)' : 'var(--text-primary)' }}>
                        {MONTH_SHORT[o.m]}{o.y !== now.getFullYear() ? ` ${String(o.y).slice(2)}` : ''}
                    </button>
                );
            })}
        </div>
    );
}

/** Income and spending for the last six months; drag along it to read each month. */
function NetTrend({ trend }: { trend: TrendPoint[] }) {
    const [idx, setIdx] = useState(Math.max(0, trend.length - 1));
    const ref = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);
    if (trend.length === 0) return <p style={{ ...type.body, margin: 0 }}>No history yet.</p>;

    const W = 300, H = 120, n = trend.length;
    const max = Math.max(...trend.flatMap(t => [t.income, t.expenses]), 1);
    const x = (i: number) => (n === 1 ? W / 2 : 6 + (i / (n - 1)) * (W - 12));
    const y = (v: number) => H - 4 - (v / max) * (H - 14);
    const line = (key: 'income' | 'expenses') => trend.map((t, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(t[key]).toFixed(1)}`).join(' ');
    const at = (clientX: number) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        setIdx(Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1)))));
    };
    const t = trend[Math.min(idx, n - 1)];
    const net = t.income - t.expenses;
    const rate = t.income > 0 ? Math.max(0, Math.round((net / t.income) * 100)) : 0;

    return (
        <div>
            <p style={{ ...type.label, margin: 0 }}>Net in {t.month}</p>
            <p style={{ ...type.figure, margin: '4px 0', color: net >= 0 ? 'var(--text-primary)' : 'var(--color-exp-text)' }}>
                {(net > 0 ? '+' : net < 0 ? '−' : '') + fmt(Math.abs(net))}
            </p>
            <p style={{ ...type.numSmall, margin: 0 }}>
                <span style={{ color: 'var(--color-inc-text)' }}>{fmt(t.income)} in</span> · <span style={{ color: 'var(--color-exp-text)' }}>{fmt(t.expenses)} out</span> · {rate}% saved
            </p>
            <div ref={ref} aria-label="Income and spending by month. Drag to read a month."
                style={{ marginTop: 'var(--space-4)', touchAction: 'none', cursor: 'crosshair' }}
                onPointerDown={e => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); at(e.clientX); }}
                onPointerMove={e => { if (dragging.current) at(e.clientX); }}
                onPointerUp={() => { dragging.current = false; }}
                onPointerCancel={() => { dragging.current = false; }}>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 120, overflow: 'visible' }}>
                    <path d={line('income')} fill="none" stroke="var(--color-inc)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                    <path d={line('expenses')} fill="none" stroke="var(--color-exp)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                    <line x1={x(idx)} x2={x(idx)} y1={0} y2={H} stroke="var(--border-visible)" vectorEffect="non-scaling-stroke" />
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
                    {trend.map((m, i) => <span key={i} style={{ ...type.micro, color: i === idx ? 'var(--text-primary)' : undefined }}>{m.month}</span>)}
                </div>
            </div>
        </div>
    );
}

function BudgetDetail({ budget, transactions, daysLeft, onOpenBudgets }: {
    budget: Budget; transactions: Transaction[]; daysLeft: number; onOpenBudgets: () => void;
}) {
    const spent = toAmount(budget.spent), limit = toAmount(budget.amount), left = limit - spent, pct = budgetPct(budget);
    const rows = transactions.filter(t => t.type === 'expense' && t.category_id === budget.category_id).slice(0, 8);
    return (
        <div>
            <p style={{ ...type.figure, margin: 0 }}>{fmt(spent)}</p>
            <p style={{ ...type.meta, margin: '4px 0 var(--space-3)', color: left < 0 ? 'var(--color-exp-text)' : undefined }}>
                {left >= 0 ? `${fmt(left)} left of ${fmt(limit)}` : `${fmt(-left)} over a ${fmt(limit)} budget`}
                {daysLeft > 0 ? ` · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to go` : ''}
            </p>
            <ProgressBar pct={pct} height={6} color={pct >= 85 ? 'var(--color-warn)' : 'var(--color-inc)'} />
            <p style={{ ...type.label, margin: 'var(--space-5) 0 var(--space-1)' }}>{rows.length ? 'Spent this month' : 'Nothing spent here yet this month'}</p>
            {rows.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-3) 0', borderTop: '1px solid var(--glass-border)' }}>
                    <span style={{ ...type.body, ...truncate, minWidth: 0 }}>{t.description} <span style={type.meta}>· {dayLabel(t.date)}</span></span>
                    <span style={{ ...type.num, flexShrink: 0 }}>−{fmt(toAmount(t.amount))}</span>
                </div>
            ))}
            <div style={{ marginTop: 'var(--space-2)' }}><TextAction onClick={onOpenBudgets}>Open budgets</TextAction></div>
        </div>
    );
}
