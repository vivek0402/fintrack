'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    PiggyBank, Zap, Trophy, Flame, Loader2, AlertCircle, Sparkles,
    Utensils, Car, Plane, ShoppingBag, Laptop, Home, Heart,
    Gamepad2, BookOpen, Coffee, Music, Dumbbell, Gift, Bus, Wallet,
    TrendingUp, CreditCard, Plus, Pencil, Trash2, Flag, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, goalsAPI, transactionsAPI, aiAPI, milestoneAPI } from '@/lib/api';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/store/toastStore';
import { fmt } from '@/lib/utils';

const AUTO_SAVE_KEY = 'fintrack-auto-save-plan';
const ROUND_UP_KEY = 'fintrack-round-up-plan';
const CH_KEY = (id: string) => `fintrack-challenge-${id}`;

const TABS = [
    { key: 'savings-plan', label: 'Savings Plan' },
    { key: 'forecast',     label: 'Forecast' },
    { key: 'milestones',   label: 'Milestones' },
];

// ─────────────────────────────────────────────────────────────────────────
// SAVINGS PLAN — shared constants
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
// FORECAST — shared constants
// ─────────────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
    utensils: Utensils, zap: Zap, car: Car, plane: Plane,
    'shopping-bag': ShoppingBag, laptop: Laptop, home: Home,
    heart: Heart, gamepad2: Gamepad2, 'book-open': BookOpen,
    coffee: Coffee, music: Music, dumbbell: Dumbbell, gift: Gift,
    bus: Bus, wallet: Wallet, 'trending-up': TrendingUp, 'credit-card': CreditCard,
};

function CategoryIcon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
    const Icon = ICON_MAP[name?.toLowerCase()] || Wallet;
    return <Icon size={size} color={color || 'var(--accent)'} />;
}

interface CalendarDay { day: number; actual?: number; projected?: number; isFuture: boolean; }
interface ForecastCategory { name: string; icon: string; color: string | null; avgMonthly: number; projected: number; spentSoFar: number; percentOfTotal: number; }
interface ForecastData { totalForecast: number; avgDaily: number; currentMonthSpent: number; daysElapsed: number; daysInMonth: number; daysRemaining: number; categories: ForecastCategory[]; calendarDays: CalendarDay[]; insight: string; insufficientData?: boolean; }

const forecastCard: React.CSSProperties = { borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 16 };
const DAYS_HEADER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ─────────────────────────────────────────────────────────────────────────
// MILESTONES — shared constants
// ─────────────────────────────────────────────────────────────────────────


const labelSt: React.CSSProperties = { fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', display: 'block', marginBottom: '6px' };
// Same wash as .glass-field, inlined since these fields live inside already-glass Modals/cards.
const inputSt: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--glass-fill-1)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '14px', boxSizing: 'border-box' as const };

interface Feasibility {
    days_remaining: number;
    months_remaining: number;
    amount_remaining?: number;
    monthly_needed?: number;
    is_on_track?: boolean;
}

interface Milestone {
    id: string;
    name: string;
    description: string | null;
    target_date: string;
    target_amount: number | null;
    current_amount: number;
    parent_id: string | null;
    parent_name: string | null;
    priority: number;
    status: string;
    feasibility: Feasibility;
    overdue?: boolean;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
    not_started: { label: 'Not Started', color: 'var(--text-muted)', bg: 'var(--glass-fill-2)' },
    in_progress: { label: 'In Progress', color: 'var(--color-info)', bg: 'color-mix(in srgb, var(--color-info) 10%, transparent)' },
    achieved: { label: 'Achieved', color: 'var(--color-inc)', bg: 'color-mix(in srgb, var(--color-inc) 10%, transparent)' },
    missed: { label: 'Missed', color: 'var(--color-exp)', bg: 'color-mix(in srgb, var(--color-exp) 10%, transparent)' },
};

const STATUS_OPTIONS = ['not_started', 'in_progress', 'achieved', 'missed'];

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface FormState {
    name: string;
    target_date: string;
    description: string;
    target_amount: string;
    current_amount: string;
    parent_id: string;
    priority: string;
}

const EMPTY_FORM: FormState = { name: '', target_date: '', description: '', target_amount: '', current_amount: '0', parent_id: '', priority: '0' };

function SavingsPlanPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const initialTab = searchParams.get('tab');
    const [tab, setTab] = useState(TABS.some(t => t.key === initialTab) ? initialTab! : 'savings-plan');

    // ── Savings Plan state ──
    const [summary, setSummary]           = useState<any>(null);
    const [goals, setGoals]               = useState<any[]>([]);
    const [trends, setTrends]             = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [dataLoading, setDataLoading]   = useState(true);

    const [savePlan, setSavePlan]               = useState<Record<string, number>>({});
    const [roundUpEnabled, setRoundUpEnabled]   = useState(false);
    const [roundUpGoalId, setRoundUpGoalId]     = useState('');
    const [challengeStarts, setChallengeStarts] = useState<Record<string, string>>({});

    // ── Forecast state ──
    const [forecast, setForecast]   = useState<ForecastData | null>(null);
    const [forecastLoading, setForecastLoading]     = useState(false);
    const [forecastGenerated, setForecastGenerated] = useState(false);
    const [forecastError, setForecastError]         = useState('');

    // ── Milestones state ──
    const [milestonesLoading, setMilestonesLoading] = useState(true);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const [formOpen, setFormOpen] = useState(false);
    const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<Milestone | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [progressEditId, setProgressEditId] = useState<string | null>(null);
    const [progressAmount, setProgressAmount] = useState('');
    const [progressStatus, setProgressStatus] = useState('');
    const [progressSaving, setProgressSaving] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    // ── Combined data fetch on mount ──
    useEffect(() => {
        if (!user) return;
        setDataLoading(true);
        setMilestonesLoading(true);
        Promise.all([
            analyticsAPI.summary(),
            goalsAPI.getAll(),
            analyticsAPI.trends(),
            transactionsAPI.getAll(),
            milestoneAPI.getAll(),
        ]).then(([sumRes, goalsRes, trendsRes, txRes, milestonesRes]) => {
            setSummary(sumRes.data.summary);
            setGoals(goalsRes.data.goals ?? []);
            setTrends(trendsRes.data.trends ?? []);
            setTransactions(txRes.data.transactions ?? []);
            setMilestones(milestonesRes.data.milestones || []);
        }).catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
          .finally(() => { setDataLoading(false); setMilestonesLoading(false); });
    }, [user]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(AUTO_SAVE_KEY);
            if (raw) setSavePlan(JSON.parse(raw));
        } catch {}
        try {
            const raw = localStorage.getItem(ROUND_UP_KEY);
            if (raw) {
                const { enabled, goalId } = JSON.parse(raw);
                setRoundUpEnabled(!!enabled);
                setRoundUpGoalId(goalId || '');
            }
        } catch {}
        const starts: Record<string, string> = {};
        CHALLENGES.forEach(c => { const v = localStorage.getItem(CH_KEY(c.id)); if (v) starts[c.id] = v; });
        setChallengeStarts(starts);
    }, []);

    // Load forecast from cache on mount — avoids re-fetching on every page visit
    useEffect(() => {
        if (!user) return;
        const now = new Date();
        const key = `forecast-cache-${user.id}-${now.getFullYear()}-${now.getMonth() + 1}`;
        try {
            const cached = localStorage.getItem(key);
            if (cached) {
                const { data, ts } = JSON.parse(cached);
                // 1-hour TTL
                if (Date.now() - ts < 60 * 60 * 1000) {
                    setForecast(data);
                    setForecastGenerated(true);
                }
            }
        } catch { /* stale / corrupt — ignore */ }
    }, [user]);

    const fetchForecast = async (force = false) => {
        setForecastError(''); setForecastLoading(true);
        try {
            const res = await aiAPI.forecastCalendar(force);
            const data: ForecastData = res.data.data;
            setForecast(data); setForecastGenerated(true);
            // Persist to cache
            if (user) {
                const now = new Date();
                const key = `forecast-cache-${user.id}-${now.getFullYear()}-${now.getMonth() + 1}`;
                try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* storage full */ }
            }
        } catch (err: any) {
            setForecastError(err?.response?.data?.error || 'Could not generate forecast. Please try again.');
        } finally { setForecastLoading(false); }
    };

    function fetchMilestones() {
        setMilestonesLoading(true);
        milestoneAPI.getAll()
            .then(res => setMilestones(res.data.milestones || []))
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => setMilestonesLoading(false));
    }

    function toggleExpand(id: string) {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function openAddForm(parentId?: string) {
        setEditingMilestone(null);
        setForm({ ...EMPTY_FORM, parent_id: parentId || '' });
        setFormOpen(true);
    }

    function openEditForm(m: Milestone) {
        setEditingMilestone(m);
        setForm({
            name: m.name,
            target_date: m.target_date.slice(0, 10),
            description: m.description || '',
            target_amount: m.target_amount !== null ? String(m.target_amount) : '',
            current_amount: String(m.current_amount ?? 0),
            parent_id: m.parent_id || '',
            priority: String(m.priority ?? 0),
        });
        setFormOpen(true);
    }

    function submitForm() {
        if (!form.name.trim() || !form.target_date) {
            toast.error('Name and target date are required.');
            return;
        }
        const payload: any = {
            name: form.name.trim(),
            target_date: form.target_date,
            description: form.description.trim() || undefined,
            target_amount: form.target_amount !== '' ? Number(form.target_amount) : undefined,
            current_amount: form.current_amount !== '' ? Number(form.current_amount) : undefined,
            priority: form.priority !== '' ? Number(form.priority) : undefined,
        };
        if (editingMilestone) {
            payload.parent_id = form.parent_id || null;
        } else if (form.parent_id) {
            payload.parent_id = form.parent_id;
        }

        setSaving(true);
        const req = editingMilestone
            ? milestoneAPI.update(editingMilestone.id, payload)
            : milestoneAPI.create(payload);

        req.then(() => {
            toast.success(editingMilestone ? 'Milestone updated.' : 'Milestone added.');
            setFormOpen(false);
            fetchMilestones();
        })
            .catch((err: any) => toast.error(err.response?.data?.error || 'Failed to save milestone.'))
            .finally(() => setSaving(false));
    }

    function confirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        milestoneAPI.delete(deleteTarget.id)
            .then(() => {
                toast.success('Milestone deleted.');
                setDeleteTarget(null);
                fetchMilestones();
            })
            .catch(() => toast.error('Failed to delete milestone.'))
            .finally(() => setDeleting(false));
    }

    function openProgressPanel(m: Milestone) {
        setProgressEditId(m.id);
        setProgressAmount(String(m.current_amount ?? 0));
        setProgressStatus(m.status);
    }

    function saveProgress(id: string) {
        setProgressSaving(true);
        milestoneAPI.updateProgress(id, { current_amount: Number(progressAmount), status: progressStatus })
            .then(() => {
                toast.success('Progress updated.');
                setProgressEditId(null);
                fetchMilestones();
            })
            .catch((err: any) => toast.error(err.response?.data?.error || 'Failed to update progress.'))
            .finally(() => setProgressSaving(false));
    }

    const updateSavePlan = (goalId: string, amount: number) => {
        const next = { ...savePlan, [goalId]: amount };
        setSavePlan(next);
        localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(next));
    };

    const updateRoundUp = (next: { enabled: boolean; goalId: string }) => {
        setRoundUpEnabled(next.enabled);
        setRoundUpGoalId(next.goalId);
        localStorage.setItem(ROUND_UP_KEY, JSON.stringify(next));
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

    // ── Derived: Savings Plan ──────────────────────────────────────────────

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
        return { active: true, daysCompleted, pct: totalDays > 0 ? (daysCompleted / totalDays) * 100 : 0 };
    };

    const activeGoals = goals.filter(g => parseFloat(g.saved_amount) < parseFloat(g.target_amount));
    const autoSavePct = income > 0 ? (totalAutoSave / income * 100).toFixed(1) : '0';

    const spCard: React.CSSProperties = {
        borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: 0,
    };
    const sHead = (icon: React.ReactNode, title: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            {icon}
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
        </div>
    );

    // ── Derived: Forecast ──────────────────────────────────────────────────

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayDay = now.getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const monthLabel = `${MONTH_NAMES[month]} ${year}`;

    // ── Derived: Milestones ────────────────────────────────────────────────

    const totalCount = milestones.length;
    const onTrackCount = milestones.filter(m => m.status !== 'achieved' && m.feasibility?.is_on_track).length;
    const achievedCount = milestones.filter(m => m.status === 'achieved').length;

    const childrenOf = (id: string | null) => milestones.filter(m => (m.parent_id || null) === id);
    const roots = childrenOf(null);

    const childCountOf = (id: string) => milestones.filter(m => m.parent_id === id).length;

    if (isLoading || !user) return <div />;

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 24, animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div className="glass-surface" style={spCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'color-mix(in srgb, var(--color-inc) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-inc) 22%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <PiggyBank size={20} color="var(--color-inc)" />
                        </div>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>Savings Planner</h1>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Automate, simulate, and challenge yourself</p>
                        </div>
                    </div>
                    {income > 0 && tab === 'savings-plan' && (
                        <div style={{ marginTop: 14, padding: '10px 14px', background: 'color-mix(in srgb, var(--color-inc) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-inc) 20%, transparent)', borderRadius: 'var(--radius-md)' }}>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                💰 Income detected:&nbsp;
                                <strong style={{ color: 'var(--color-inc)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmt(income)}/mo</strong>
                            </p>
                        </div>
                    )}
                </div>

                <Tabs tabs={TABS} active={tab} onChange={setTab} />

                {/* ══════════════════════ SAVINGS PLAN ══════════════════════ */}
                {tab === 'savings-plan' && (
                    <>
                        {/* ── SECTION 1 — PAY YOURSELF FIRST ── */}
                        <div className="glass-surface" style={spCard}>
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
                                            <div key={goal.id} className="glass-field" style={{ padding: 14, borderRadius: 'var(--radius-md)' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                                            <span style={{ fontSize: 16 }}>{goal.icon || goal.emoji || '🎯'}</span>
                                                            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.name}</span>
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
                                                                style={{ width: 76, background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
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
                                <div style={{ marginTop: 14, padding: '12px 16px', background: 'color-mix(in srgb, var(--accent) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', borderRadius: 'var(--radius-md)' }}>
                                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
                                        Total auto-saving:{' '}
                                        <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAutoSave)}/mo</span>
                                        {income > 0 && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}> ({autoSavePct}% of income)</span>}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ── SECTION 2 — ROUND-UP SIMULATOR ── */}
                        <div className="glass-surface" style={spCard}>
                            {sHead(<Zap size={16} color="var(--color-warn)" />, 'Round-Up Savings Simulator')}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>Enable round-up savings</p>
                                <button
                                    type="button"
                                    onClick={() => updateRoundUp({ enabled: !roundUpEnabled, goalId: roundUpGoalId })}
                                    aria-label={roundUpEnabled ? 'Disable round-up' : 'Enable round-up'}
                                    style={{ width: 44, height: 24, borderRadius: 12, background: roundUpEnabled ? 'var(--color-inc)' : 'var(--border-visible)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background var(--transition-fast)', flexShrink: 0 }}
                                >
                                    <span style={{ position: 'absolute', top: 2, left: roundUpEnabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left var(--transition-fast)', display: 'block' }} />
                                </button>
                            </div>

                            {roundUpEnabled && (
                                <>
                                    <div className="glass-field" style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
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
                                                onChange={e => updateRoundUp({ enabled: roundUpEnabled, goalId: e.target.value })}
                                                className="glass-field"
                                                style={{ width: '100%', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }}
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
                        <div className="glass-surface" style={spCard}>
                            {sHead(<Trophy size={16} color="var(--color-info)" />, '30-Day Challenges')}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {CHALLENGES.map((ch, idx) => {
                                    const prog    = getProgress(ch.id, ch.days);
                                    const estimate = challengeEstimates[idx] ?? 0;
                                    const isDone  = prog.daysCompleted >= ch.days;

                                    return (
                                        <div key={ch.id} className="glass-field" style={{ borderColor: prog.active ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : undefined, borderRadius: 'var(--radius-md)', padding: 14, transition: 'border-color var(--transition-fast)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                                                <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
                                                    <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{ch.emoji}</span>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                                                            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ch.title}</span>
                                                            {isDone && <Badge color="var(--color-inc)" bg="color-mix(in srgb, var(--color-inc) 10%, transparent)">✓ Done!</Badge>}
                                                            {prog.active && !isDone && <Badge color="var(--accent)" bg="var(--accent-subtle)">Active</Badge>}
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
                                                        style={{ flexShrink: 0, padding: '6px 12px', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
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
                        <div className="glass-surface" style={spCard}>
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
                                        <p style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>No streak yet</p>
                                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>Spend less than you earn this month to start your streak</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* ══════════════════════ FORECAST ══════════════════════ */}
                {tab === 'forecast' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            {forecastGenerated && !forecastLoading && <Button variant="secondary" size="md" onClick={() => fetchForecast(true)}>Regenerate</Button>}
                        </div>

                        {/* Error */}
                        {forecastError && (
                            <div className="glass-surface" style={{ ...forecastCard, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 40 }}>
                                <AlertCircle size={28} color="var(--color-exp)" />
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>Could not generate forecast</p>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-body)' }}>{forecastError}</p>
                                <button type="button" onClick={() => fetchForecast(true)} style={{ background: 'none', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 20px', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Try Again</button>
                            </div>
                        )}

                        {/* Loading */}
                        {forecastLoading && (
                            <div className="glass-surface" style={{ ...forecastCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80, gap: 14 }}>
                                <Loader2 size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>Generating your forecast...</p>
                            </div>
                        )}

                        {/* Empty */}
                        {!forecastGenerated && !forecastLoading && !forecastError && (
                            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                                <p style={{ fontSize: '48px', marginBottom: '12px' }}>📅</p>
                                <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>No forecast yet</p>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>Uses your last 3 months of transactions to predict this month's spending — no guesswork</p>
                                <Button variant="primary" size="md" onClick={() => fetchForecast()}>Generate Forecast</Button>
                            </div>
                        )}

                        {/* Insufficient data */}
                        {forecast?.insufficientData && !forecastLoading && (
                            <div className="glass-surface" style={{ ...forecastCard, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 50, textAlign: 'center' }}>
                                <Sparkles size={32} color="var(--text-muted)" />
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>Not enough data yet</p>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, maxWidth: 340, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>Add at least 1 week of transactions to generate a forecast.</p>
                                <button type="button" onClick={() => router.push('/transactions')} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Go to Transactions</button>
                            </div>
                        )}

                        {forecast && !forecast.insufficientData && !forecastLoading && (
                            <>
                                {/* Stat tiles */}
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'FORECASTED TOTAL', value: fmt(forecast.totalForecast), color: 'var(--accent)' },
                                        { label: 'SPENT SO FAR',     value: fmt(forecast.currentMonthSpent), color: 'var(--color-exp)' },
                                        { label: 'DAILY AVERAGE',    value: fmt(forecast.avgDaily), color: 'var(--color-warn)' },
                                    ].map(tile => (
                                        <div key={tile.label} className="glass-surface" style={{ flex: 1, minWidth: 140, borderRadius: 'var(--radius-md)', padding: '20px 24px' }}>
                                            <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.8px', margin: '0 0 8px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>{tile.label}</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: tile.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{tile.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Calendar */}
                                <div className="glass-surface" style={forecastCard}>
                                    <p style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>{monthLabel}</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                                        {DAYS_HEADER.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', padding: '4px 0', fontFamily: 'var(--font-body)' }}>{d}</div>)}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                                        {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} style={{ minHeight: 64 }} />)}
                                        {forecast.calendarDays.map(cd => {
                                            const isToday  = cd.day === todayDay;
                                            const hasActual = !cd.isFuture && (cd.actual || 0) > 0;
                                            return (
                                                <div key={cd.day} style={{ minHeight: 64, padding: '6px 8px', borderRadius: 8, background: hasActual ? 'var(--glass-fill-1)' : 'transparent', border: isToday ? '1px solid var(--accent)' : '1px solid transparent', opacity: cd.isFuture ? 0.75 : 1 }}>
                                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: isToday ? 700 : 400, marginBottom: 4, fontFamily: 'var(--font-body)' }}>{cd.day}</div>
                                                    {hasActual && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--color-exp)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{fmt(cd.actual!)}</div>}
                                                    {cd.isFuture && cd.projected! > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>~{fmt(cd.projected!)}</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Category breakdown */}
                                <div className="glass-surface" style={forecastCard}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 20 }}>
                                        <p style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Category Breakdown</p>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>(last 3 months average)</span>
                                    </div>
                                    {forecast.categories.map(cat => (
                                        <div key={cat.name} style={{ marginBottom: 20 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                                                <CategoryIcon name={cat.icon} size={20} color={cat.color || 'var(--accent)'} />
                                                <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, flex: 1, fontFamily: 'var(--font-body)' }}>{cat.name}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(cat.projected)}</span>
                                            </div>
                                            <div style={{ background: 'var(--border-subtle)', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                                                <div style={{ height: '100%', width: `${Math.min(cat.percentOfTotal, 100)}%`, background: cat.color || 'var(--accent)', borderRadius: 3 }} />
                                            </div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(cat.spentSoFar)} spent so far this month</p>
                                        </div>
                                    ))}
                                </div>

                                {/* AI Insight */}
                                {forecast.insight && (
                                    <div className="glass-surface" style={{ padding: 'var(--space-4)', background: 'color-mix(in srgb, var(--color-info) 6%, var(--glass-surface))', borderColor: 'color-mix(in srgb, var(--color-info) 18%, var(--glass-border))' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                                            <Sparkles size={16} color="var(--color-info)" />
                                            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>AI Insight</span>
                                        </div>
                                        <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 16 }}>
                                            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8, fontFamily: 'var(--font-body)' }}>{forecast.insight}</p>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* ══════════════════════ MILESTONES ══════════════════════ */}
                {tab === 'milestones' && (
                    milestonesLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {[1, 2, 3].map(i => <SkeletonCard key={i} height={100} />)}
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <Button variant="primary" onClick={() => openAddForm()}>
                                    <Plus size={16} /> Add Milestone
                                </Button>
                            </div>

                            {/* ── SUMMARY ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                                <StatTile label="Total Milestones" value={String(totalCount)} icon={<Flag size={14} />} />
                                <StatTile label="On Track" value={String(onTrackCount)} accentColor="var(--color-inc)" icon={<CheckCircle2 size={14} />} />
                                <StatTile label="Achieved" value={String(achievedCount)} accentColor="var(--color-inc)" />
                            </div>

                            {/* ── MILESTONE TREE ── */}
                            {milestones.length === 0 ? (
                                <Card>
                                    <EmptyState
                                        icon={Flag}
                                        title="No milestones yet"
                                        subtitle="Track your financial journey from emergency fund to retirement — every step counts."
                                        action={<Button variant="primary" onClick={() => openAddForm()}><Plus size={16} /> Add Milestone</Button>}
                                    />
                                </Card>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {roots.map(m => (
                                        <MilestoneNode
                                            key={m.id}
                                            milestone={m}
                                            childrenOf={childrenOf}
                                            childCountOf={childCountOf}
                                            expanded={expanded}
                                            toggleExpand={toggleExpand}
                                            onEdit={openEditForm}
                                            onDelete={setDeleteTarget}
                                            progressEditId={progressEditId}
                                            progressAmount={progressAmount}
                                            progressStatus={progressStatus}
                                            setProgressAmount={setProgressAmount}
                                            setProgressStatus={setProgressStatus}
                                            onOpenProgress={openProgressPanel}
                                            onCancelProgress={() => setProgressEditId(null)}
                                            onSaveProgress={saveProgress}
                                            progressSaving={progressSaving}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )
                )}
            </div>

            {/* ── ADD / EDIT MODAL ── */}
            <Modal
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                title={editingMilestone ? 'Edit Milestone' : 'Add Milestone'}
                footer={
                    <Button variant="primary" onClick={submitForm} isLoading={saving} style={{ width: '100%' }}>
                        {editingMilestone ? 'Save Changes' : 'Add Milestone'}
                    </Button>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={labelSt}>Name *</label>
                        <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputSt} />
                    </div>
                    <div>
                        <label style={labelSt}>Target date *</label>
                        <input type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} style={inputSt} />
                    </div>
                    <div>
                        <label style={labelSt}>Description</label>
                        <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={inputSt} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                        <div>
                            <label style={labelSt}>Target amount (₹)</label>
                            <input type="number" value={form.target_amount} onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} style={inputSt} />
                        </div>
                        <div>
                            <label style={labelSt}>Current amount (₹)</label>
                            <input type="number" value={form.current_amount} onChange={e => setForm(f => ({ ...f, current_amount: e.target.value }))} style={inputSt} />
                        </div>
                    </div>
                    <div>
                        <label style={labelSt}>Depends on</label>
                        <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))} style={inputSt}>
                            <option value="">None</option>
                            {milestones.filter(m => !editingMilestone || m.id !== editingMilestone.id).map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelSt}>Priority</label>
                        <input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inputSt} />
                    </div>
                </div>
            </Modal>

            {/* ── DELETE CONFIRMATION ── */}
            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Milestone"
                footer={
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)} style={{ flex: 1 }}>Cancel</Button>
                        <Button variant="danger" onClick={confirmDelete} isLoading={deleting} style={{ flex: 1 }}>Delete</Button>
                    </div>
                }
            >
                {deleteTarget && (
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
                        {childCountOf(deleteTarget.id) > 0
                            ? `Deleting "${deleteTarget.name}" will unlink ${childCountOf(deleteTarget.id)} child milestone${childCountOf(deleteTarget.id) === 1 ? '' : 's'}. They will become independent milestones. Continue?`
                            : `Are you sure you want to delete "${deleteTarget.name}"?`}
                    </p>
                )}
            </Modal>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Milestone tree node
// ─────────────────────────────────────────────────────────────────────────

interface MilestoneNodeProps {
    milestone: Milestone;
    childrenOf: (id: string | null) => Milestone[];
    childCountOf: (id: string) => number;
    expanded: Set<string>;
    toggleExpand: (id: string) => void;
    onEdit: (m: Milestone) => void;
    onDelete: (m: Milestone) => void;
    progressEditId: string | null;
    progressAmount: string;
    progressStatus: string;
    setProgressAmount: (v: string) => void;
    setProgressStatus: (v: string) => void;
    onOpenProgress: (m: Milestone) => void;
    onCancelProgress: () => void;
    onSaveProgress: (id: string) => void;
    progressSaving: boolean;
}

function MilestoneNode({
    milestone, childrenOf, childCountOf, expanded, toggleExpand, onEdit, onDelete,
    progressEditId, progressAmount, progressStatus, setProgressAmount, setProgressStatus,
    onOpenProgress, onCancelProgress, onSaveProgress, progressSaving,
}: MilestoneNodeProps) {
    const isExpanded = expanded.has(milestone.id);
    const statusMeta = STATUS_META[milestone.status] || STATUS_META.not_started;
    const children = childrenOf(milestone.id);
    const { feasibility, overdue, status } = milestone;
    const targetAmount = milestone.target_amount !== null ? Number(milestone.target_amount) : null;
    const currentAmount = Number(milestone.current_amount || 0);
    const pct = targetAmount && targetAmount > 0 ? Math.min(100, (currentAmount / targetAmount) * 100) : 0;

    let feasibilityChip: React.ReactNode = null;
    if (overdue && status !== 'achieved') {
        feasibilityChip = <Badge color="var(--color-exp)" bg="color-mix(in srgb, var(--color-exp) 10%, transparent)"><AlertTriangle size={11} style={{ marginRight: 4 }} />Overdue</Badge>;
    } else if (status === 'in_progress' && feasibility?.is_on_track) {
        feasibilityChip = <Badge color="var(--color-inc)" bg="color-mix(in srgb, var(--color-inc) 10%, transparent)">On track</Badge>;
    } else if (status !== 'achieved' && feasibility?.is_on_track === false) {
        feasibilityChip = <Badge color="var(--color-warn)" bg="color-mix(in srgb, var(--color-warn) 10%, transparent)">Behind — needs {fmt(feasibility.monthly_needed || 0)}/mo more</Badge>;
    }

    return (
        <div>
            <Card onClick={() => toggleExpand(milestone.id)} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{milestone.name}</span>
                            <Badge color={statusMeta.color} bg={statusMeta.bg}>{statusMeta.label}</Badge>
                            {feasibilityChip}
                        </div>
                        {!isExpanded && milestone.description && (
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {milestone.description}
                            </p>
                        )}
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                            Target: {formatDate(milestone.target_date)}
                            {targetAmount !== null && ` · ${fmt(targetAmount)}`}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(milestone); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px', display: 'flex' }} aria-label="Edit milestone">
                            <Pencil size={15} />
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(milestone); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px', display: 'flex' }} aria-label="Delete milestone">
                            <Trash2 size={15} />
                        </button>
                    </div>
                </div>

                {targetAmount !== null && targetAmount > 0 && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                            <span>{fmt(currentAmount)} / {fmt(targetAmount)}</span>
                            <span>{pct.toFixed(0)}%</span>
                        </div>
                        <ProgressBar pct={pct} color={status === 'achieved' ? 'var(--color-inc)' : 'var(--accent)'} />
                    </div>
                )}

                {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {milestone.description && (
                            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
                                {milestone.description}
                            </p>
                        )}
                        {feasibility?.monthly_needed !== undefined && status !== 'achieved' && (
                            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                Monthly savings needed to stay on track: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(feasibility.monthly_needed)}</strong>
                            </p>
                        )}

                        {progressEditId === milestone.id ? (
                            <div className="glass-field" onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                                    <div>
                                        <label style={labelSt}>Current amount (₹)</label>
                                        <input type="number" value={progressAmount} onChange={e => setProgressAmount(e.target.value)} style={inputSt} />
                                    </div>
                                    <div>
                                        <label style={labelSt}>Status</label>
                                        <select value={progressStatus} onChange={e => setProgressStatus(e.target.value)} style={inputSt}>
                                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Button variant="primary" size="sm" onClick={() => onSaveProgress(milestone.id)} isLoading={progressSaving}>Save</Button>
                                    <Button variant="secondary" size="sm" onClick={onCancelProgress}>Cancel</Button>
                                </div>
                            </div>
                        ) : (
                            <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); onOpenProgress(milestone); }} style={{ alignSelf: 'flex-start' }}>
                                Log progress
                            </Button>
                        )}
                    </div>
                )}
            </Card>

            {children.length > 0 && (
                <div style={{ marginLeft: '28px', paddingLeft: '20px', borderLeft: '2px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                    {children.map(child => (
                        <div key={child.id} style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', left: '-20px', top: '24px', width: '20px', height: '2px', background: 'var(--border-subtle)' }} />
                            <MilestoneNode
                                milestone={child}
                                childrenOf={childrenOf}
                                childCountOf={childCountOf}
                                expanded={expanded}
                                toggleExpand={toggleExpand}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                progressEditId={progressEditId}
                                progressAmount={progressAmount}
                                progressStatus={progressStatus}
                                setProgressAmount={setProgressAmount}
                                setProgressStatus={setProgressStatus}
                                onOpenProgress={onOpenProgress}
                                onCancelProgress={onCancelProgress}
                                onSaveProgress={onSaveProgress}
                                progressSaving={progressSaving}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function SavingsPlanPage() {
    return <Suspense><SavingsPlanPageInner /></Suspense>;
}
