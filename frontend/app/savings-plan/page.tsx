'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PiggyBank, Zap, Trophy, Flame } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, goalsAPI, transactionsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const AUTO_SAVE_KEY = 'fintrack-auto-save-plan';
const CH_KEY = (id: string) => `fintrack-challenge-${id}`;

const CHALLENGES = [
    {
        id: 'no-eating-out',
        emoji: '🍕',
        title: 'No Eating Out Week',
        desc: 'Skip restaurants & food delivery for 7 days',
        days: 7,
        catKw: ['restaurant', 'food delivery', 'zomato', 'swiggy', 'dining', 'pizza', 'burger'],
    },
    {
        id: 'coffee',
        emoji: '☕',
        title: 'Coffee Challenge',
        desc: 'Log ₹0 on café & coffee for 14 days',
        days: 14,
        catKw: ['café', 'cafe', 'coffee', 'starbucks', 'barista', 'costa'],
    },
    {
        id: 'no-spend-weekend',
        emoji: '🏠',
        title: 'Weekend No-Spend',
        desc: 'Zero discretionary spend Sat & Sun for 4 weekends',
        days: 28,
        catKw: ['shopping', 'entertainment', 'movies', 'games', 'clothing', 'accessories'],
    },
] as const;

const roundUp10 = (n: number) => Math.ceil(n / 10) * 10;

function projectedDate(remaining: number, monthly: number): string {
    if (monthly <= 0 || remaining <= 0) return '';
    const months = Math.ceil(remaining / monthly);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function matchesCat(tx: any, keywords: readonly string[]): boolean {
    const haystack = ((tx.category_name ?? '') + ' ' + (tx.description ?? '')).toLowerCase();
    return keywords.some(kw => haystack.includes(kw));
}

export default function SavingsPlanPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const [summary, setSummary]           = useState<any>(null);
    const [goals, setGoals]               = useState<any[]>([]);
    const [trends, setTrends]             = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [dataLoading, setDataLoading]   = useState(true);

    const [savePlan, setSavePlan]               = useState<Record<string, number>>({});
    const [roundUpEnabled, setRoundUpEnabled]   = useState(false);
    const [roundUpGoalId, setRoundUpGoalId]     = useState('');
    const [challengeStarts, setChallengeStarts] = useState<Record<string, string>>({});

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        setDataLoading(true);
        Promise.all([
            analyticsAPI.summary(),
            goalsAPI.getAll(),
            analyticsAPI.trends(),
            transactionsAPI.getAll(),
        ]).then(([sumRes, goalsRes, trendsRes, txRes]) => {
            setSummary(sumRes.data.summary);
            setGoals(goalsRes.data.goals ?? []);
            setTrends(trendsRes.data.trends ?? []);
            setTransactions(txRes.data.transactions ?? []);
        }).catch(() => {}).finally(() => setDataLoading(false));
    }, [user]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(AUTO_SAVE_KEY);
            if (raw) setSavePlan(JSON.parse(raw));
        } catch {}
        const starts: Record<string, string> = {};
        CHALLENGES.forEach(c => { const v = localStorage.getItem(CH_KEY(c.id)); if (v) starts[c.id] = v; });
        setChallengeStarts(starts);
    }, []);

    const updateSavePlan = (goalId: string, amount: number) => {
        const next = { ...savePlan, [goalId]: amount };
        setSavePlan(next);
        localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(next));
    };

    const startChallenge = (id: string) => {
        const today = new Date().toISOString().split('T')[0];
        setChallengeStarts(prev => ({ ...prev, [id]: today }));
        localStorage.setItem(CH_KEY(id), today);
    };

    const stopChallenge = (id: string) => {
        setChallengeStarts(prev => { const n = { ...prev }; delete n[id]; return n; });
        localStorage.removeItem(CH_KEY(id));
    };

    // ── Derived ──────────────────────────────────────────────────────────────

    const income = summary?.total_income ?? 0;

    const totalAutoSave = useMemo(
        () => Object.values(savePlan).reduce((s: number, v: number) => s + v, 0),
        [savePlan]
    );

    const roundUpMonthly = useMemo(() => {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        return transactions
            .filter(tx => tx.type === 'expense' && new Date((tx.date || '').split('T')[0] + 'T00:00:00').getTime() >= cutoff)
            .reduce((sum, tx) => { const a = parseFloat(tx.amount); return sum + (roundUp10(a) - a); }, 0);
    }, [transactions]);

    const streak = useMemo(() => {
        const monthMap: Record<string, { inc: number; exp: number }> = {};
        trends.forEach(row => {
            const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
            if (!monthMap[key]) monthMap[key] = { inc: 0, exp: 0 };
            if (row.type === 'income') monthMap[key].inc += parseFloat(row.total);
            else monthMap[key].exp += parseFloat(row.total);
        });
        const sorted = Object.keys(monthMap).sort();
        let count = 0;
        for (let i = sorted.length - 1; i >= 0; i--) {
            const { inc, exp } = monthMap[sorted[i]];
            if (inc > exp) count++; else break;
        }
        return count;
    }, [trends]);

    const challengeEstimates = useMemo(() => {
        const now = new Date();
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);
        const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

        const lastMonthExp = transactions.filter(tx => {
            const d = new Date((tx.date || '').split('T')[0] + 'T00:00:00');
            return tx.type === 'expense' && d >= lastMonthStart && d <= lastMonthEnd;
        });

        const foodAmt = lastMonthExp
            .filter(tx => matchesCat(tx, CHALLENGES[0].catKw))
            .reduce((s, tx) => s + parseFloat(tx.amount), 0);

        const coffeeAmt = transactions
            .filter(tx => tx.type === 'expense' && new Date((tx.date || '').split('T')[0] + 'T00:00:00').getTime() >= cutoff30 && matchesCat(tx, CHALLENGES[1].catKw))
            .reduce((s, tx) => s + parseFloat(tx.amount), 0);

        const weekendAmt = transactions
            .filter(tx => {
                const d = new Date((tx.date || '').split('T')[0] + 'T00:00:00');
                const dow = d.getDay();
                return tx.type === 'expense' && d >= fourWeeksAgo && (dow === 0 || dow === 6) && matchesCat(tx, CHALLENGES[2].catKw);
            })
            .reduce((s, tx) => s + parseFloat(tx.amount), 0);

        return [foodAmt / 4, coffeeAmt, weekendAmt / 4];
    }, [transactions]);

    const getProgress = (id: string, totalDays: number) => {
        const startStr = challengeStarts[id];
        if (!startStr) return { active: false, daysCompleted: 0, pct: 0 };
        const daysCompleted = Math.min(Math.floor((Date.now() - new Date(startStr).getTime()) / 86400000), totalDays);
        return { active: true, daysCompleted, pct: (daysCompleted / totalDays) * 100 };
    };

    const activeGoals = goals.filter(g => parseFloat(g.saved_amount) < parseFloat(g.target_amount));
    const autoSavePct = income > 0 ? (totalAutoSave / income * 100).toFixed(1) : '0';

    const card: React.CSSProperties = {
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: 0,
    };
    const sHead = (icon: React.ReactNode, title: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            {icon}
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
        </div>
    );

    if (isLoading || !user) return <AppLayout><div /></AppLayout>;

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 24, animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'color-mix(in srgb, var(--color-inc) 12%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--color-inc) 22%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <PiggyBank size={20} color="var(--color-inc)" />
                        </div>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>Savings Planner</h1>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Automate, simulate, and challenge yourself</p>
                        </div>
                    </div>
                    {income > 0 && (
                        <div style={{ marginTop: 14, padding: '10px 14px', background: 'color-mix(in srgb, var(--color-inc) 8%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--color-inc) 20%, transparent)', borderRadius: 'var(--radius-md)' }}>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                💰 Income detected:&nbsp;
                                <strong style={{ color: 'var(--color-inc)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmt(income)}/mo</strong>
                            </p>
                        </div>
                    )}
                </div>

                {/* ── SECTION 1 — PAY YOURSELF FIRST ── */}
                <div style={card}>
                    {sHead(<PiggyBank size={16} color="var(--accent)" />, 'Pay Yourself First')}

                    {dataLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[1, 2].map(i => <Skeleton key={i} height={72} borderRadius={10} />)}
                        </div>
                    ) : activeGoals.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', fontFamily: 'var(--font-body)' }}>
                            No active goals.{' '}
                            <a href="/goals" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Create one →</a>
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {activeGoals.map(goal => {
                                const saved     = parseFloat(goal.saved_amount);
                                const target    = parseFloat(goal.target_amount);
                                const remaining = Math.max(target - saved, 0);
                                const pct       = Math.min((saved / target) * 100, 100);
                                const monthly   = savePlan[goal.id] ?? 0;
                                const projected = projectedDate(remaining, monthly);

                                const isOnTrack: boolean | null = goal.deadline && monthly > 0 ? (() => {
                                    const days = Math.ceil((new Date(goal.deadline + 'T00:00:00').getTime() - Date.now()) / 86400000);
                                    return days > 0 && Math.ceil(remaining / monthly) <= Math.ceil(days / 30);
                                })() : null;

                                return (
                                    <div key={goal.id} style={{ padding: 14, background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                                    <span style={{ fontSize: 16 }}>{goal.icon || goal.emoji || '🎯'}</span>
                                                    <span style={{ fontFamily: 'var(--font-head)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.name}</span>
                                                    {isOnTrack !== null && (
                                                        <Badge color={isOnTrack ? 'var(--color-inc)' : 'var(--color-warn)'} bg={isOnTrack ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-warn) 10%, transparent)'}>
                                                            {isOnTrack ? '✓ On track' : '⚠ Adjust'}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <ProgressBar pct={pct} color={goal.color || 'var(--accent)'} height={4} />
                                                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                                                    {fmt(saved)} / {fmt(target)}
                                                </p>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 0 4px', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Monthly</p>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>₹</span>
                                                    <input
                                                        type="number" min="0"
                                                        value={monthly || ''}
                                                        placeholder="0"
                                                        onChange={e => updateSavePlan(goal.id, parseFloat(e.target.value) || 0)}
                                                        style={{ width: 76, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        {projected && (
                                            <p style={{ fontSize: 11, color: 'var(--accent)', margin: '8px 0 0', fontFamily: 'var(--font-body)' }}>
                                                At {fmt(monthly)}/mo → reach goal by <strong>{projected}</strong>
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {totalAutoSave > 0 && (
                        <div style={{ marginTop: 14, padding: '12px 16px', background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', borderRadius: 'var(--radius-md)' }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-head)' }}>
                                Total auto-saving:{' '}
                                <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAutoSave)}/mo</span>
                                {income > 0 && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}> ({autoSavePct}% of income)</span>}
                            </p>
                        </div>
                    )}
                </div>

                {/* ── SECTION 2 — ROUND-UP SIMULATOR ── */}
                <div style={card}>
                    {sHead(<Zap size={16} color="var(--color-warn)" />, 'Round-Up Savings Simulator')}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>Enable round-up savings</p>
                        <button
                            type="button"
                            onClick={() => setRoundUpEnabled(v => !v)}
                            aria-label={roundUpEnabled ? 'Disable round-up' : 'Enable round-up'}
                            style={{ width: 44, height: 24, borderRadius: 12, background: roundUpEnabled ? 'var(--color-inc)' : 'var(--border)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background var(--transition-fast)', flexShrink: 0 }}
                        >
                            <span style={{ position: 'absolute', top: 2, left: roundUpEnabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left var(--transition-fast)', display: 'block' }} />
                        </button>
                    </div>

                    {roundUpEnabled && (
                        <>
                            <div style={{ padding: '14px 16px', background: 'color-mix(in srgb, var(--color-warn) 8%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--color-warn) 20%, transparent)', borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
                                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Based on your last 30 days:</p>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--color-warn)', margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>
                                    ~{fmt(roundUpMonthly)}/mo in round-ups
                                </p>
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                    → {fmt(roundUpMonthly * 12)}/year if you round every transaction to the nearest ₹10
                                </p>
                            </div>
                            {activeGoals.length > 0 && (
                                <>
                                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Assign round-ups to a goal:</p>
                                    <select
                                        value={roundUpGoalId}
                                        onChange={e => setRoundUpGoalId(e.target.value)}
                                        style={{ width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }}
                                    >
                                        <option value="">— Select a goal —</option>
                                        {activeGoals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                    </select>
                                    {roundUpGoalId && (
                                        <p style={{ fontSize: 11, color: 'var(--color-inc)', margin: '8px 0 0', fontFamily: 'var(--font-body)' }}>
                                            ✓ ~{fmt(roundUpMonthly)}/mo allocated to "{activeGoals.find(g => g.id === roundUpGoalId)?.name}"
                                        </p>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* ── SECTION 3 — CHALLENGES ── */}
                <div style={card}>
                    {sHead(<Trophy size={16} color="var(--color-info)" />, '30-Day Challenges')}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {CHALLENGES.map((ch, idx) => {
                            const prog    = getProgress(ch.id, ch.days);
                            const estimate = challengeEstimates[idx] ?? 0;
                            const isDone  = prog.daysCompleted >= ch.days;

                            return (
                                <div key={ch.id} style={{ background: 'var(--bg-alt)', border: `1px solid ${prog.active ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', padding: 14, transition: 'border-color var(--transition-fast)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                                        <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{ch.emoji}</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                                                    <span style={{ fontFamily: 'var(--font-head)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ch.title}</span>
                                                    {isDone && <Badge color="var(--color-inc)" bg="color-mix(in srgb, var(--color-inc) 10%, transparent)">✓ Done!</Badge>}
                                                    {prog.active && !isDone && <Badge color="var(--accent)" bg="var(--accent-light)">Active</Badge>}
                                                </div>
                                                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 3px', fontFamily: 'var(--font-body)' }}>{ch.desc}</p>
                                                {estimate > 0 && (
                                                    <p style={{ fontSize: 12, color: 'var(--color-inc)', margin: 0, fontFamily: 'var(--font-body)' }}>Est. save: {fmt(estimate)}</p>
                                                )}
                                            </div>
                                        </div>
                                        {!prog.active ? (
                                            <button type="button" onClick={() => startChallenge(ch.id)}
                                                style={{ flexShrink: 0, padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                                                Start
                                            </button>
                                        ) : (
                                            <button type="button" onClick={() => stopChallenge(ch.id)}
                                                style={{ flexShrink: 0, padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                                                Stop
                                            </button>
                                        )}
                                    </div>
                                    {prog.active && (
                                        <div style={{ marginTop: 10 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Day {prog.daysCompleted} of {ch.days}</span>
                                                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: isDone ? 'var(--color-inc)' : 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(prog.pct)}%</span>
                                            </div>
                                            <ProgressBar pct={prog.pct} color={isDone ? 'var(--color-inc)' : 'var(--accent)'} height={5} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── SECTION 4 — SAVINGS STREAK ── */}
                <div style={card}>
                    {sHead(<Flame size={16} color="#f97316" />, 'Savings Streak')}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{ fontSize: `${Math.max(28, Math.min(52, 28 + streak * 4))}px`, lineHeight: 1, userSelect: 'none', flexShrink: 0 }}>🔥</span>
                        {streak > 0 ? (
                            <div>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 22 : 26, fontWeight: 800, color: '#f97316', margin: 0, fontVariantNumeric: 'tabular-nums', animation: 'numberReveal 400ms cubic-bezier(0.22,1,0.36,1) both' }}>
                                    {streak}-month streak
                                </p>
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0', fontFamily: 'var(--font-body)' }}>
                                    {streak >= 6 ? '🏆 Incredible discipline — you\'re a saver!' : streak >= 3 ? '💪 Great momentum, keep it going!' : '✅ Good start — build the habit!'}
                                </p>
                            </div>
                        ) : (
                            <div>
                                <p style={{ fontFamily: 'var(--font-head)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>No streak yet</p>
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>Spend less than you earn this month to start your streak</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </AppLayout>
    );
}
