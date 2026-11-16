'use client';

import { useEffect, useState, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Trash2, RefreshCw, X,
    Calendar, Target, Receipt,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { budgetsAPI, analyticsAPI, recurringAPI, aiAPI, splitsAPI } from '@/lib/api';
import { useBudgets, queryKeys } from '@/hooks/queries';
import { CategoryField, type CategoryOption } from '@/components/categories/CategoryPickerDialog';
import { useCategories } from '@/hooks/useCategories';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/store/toastStore';
import type { SuggestionItem } from '@/components/budgets/SuggestionsBanner';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction, Rows, NoticeRow, Stat, Switch, TONE_TEXT, type Tone } from '@/components/ui/CardParts';
import { type, truncate } from '@/lib/typography';
import { Tabs } from '@/components/ui/Tabs';
import { formatDate, fmt as fmtBase, looksLikeEmoji } from '@/lib/utils';
import { isTransactionWrite, refreshWidgets } from '@/lib/widgets';
import { groupRecurring, recurringSummary, daysUntil, dueLabel, dueTone } from '@/lib/recurring';
import { groupSplits, whoOwes, splitsSummary, owedOn } from '@/lib/splits';
import { groupByYear, oneTimeSummary, byCategory, itemsByDay, dateRangeLabel, entryYear } from '@/lib/oneTime';

const NO_BUDGETS: any[] = [];

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

const fmt = (n: number) => fmtBase(Math.abs(n));

const TABS = [
    { key: 'budgets',   label: 'Budgets' },
    { key: 'recurring', label: 'Recurring' },
    { key: 'splits',    label: 'Splits' },
    { key: 'one-time',  label: 'One-Time' },
];

// Shared by all four tabs — Recurring/Splits/One-Time inherit the glass-field
// recipe from here rather than each redeclaring it.
const inputSt: React.CSSProperties = { width: '100%', background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' };
const labelSt: React.CSSProperties = { ...type.label, marginBottom: 6, display: 'block' };

// ── One-Time Expenses: local types & constants ──────────────────────────────

const OT_CATEGORIES = ['Travel', 'Event', 'Electronics', 'Medical', 'Education',
    'Home', 'Vehicle', 'Gift', 'Investment', 'Other'];

const OT_CATEGORY_EMOJI: Record<string, string> = {
    Travel: '✈️', Event: '🎉', Electronics: '💻', Medical: '🏥',
    Education: '📚', Home: '🏠', Vehicle: '🚗', Gift: '🎁',
    Investment: '📈', Other: '🧾',
};

// The one-time-expense sites store a category *name*, not an id, and the parent
// form never reads DB categories at all -- so the hardcoded list is projected
// into the shape CategoryField expects, emoji included.
const OT_FALLBACK_CATEGORIES: CategoryOption[] = OT_CATEGORIES.map(name => ({
    id: name, name, icon: OT_CATEGORY_EMOJI[name],
}));

const OT_PAYMENT_METHODS = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Other'];

const otFmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

const OT_API = process.env.NEXT_PUBLIC_API_URL;

interface OtExpenseItem {
    id: string;
    expense_id: string;
    description: string;
    amount: number;
    category: string;
    date: string;
    payment_method: string;
    notes?: string;
    credit_card_id?: number | null;
}

interface OtExpense {
    id: string;
    title: string;
    category: string;
    icon: string;
    color: string;
    notes?: string;
    start_date?: string;
    end_date?: string;
    bank_account_id?: number;
    bank_account_name?: string;
    bank_name?: string;
    total_amount: number;
    item_count: number;
    items: OtExpenseItem[];
    created_at?: string;
}

interface OtAccount {
    id: number;
    name: string;
    bank_name?: string;
}

const otEmptyExpenseForm = () => ({
    title: '',
    category: 'Other',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    bank_account_id: '',
    notes: '',
});

const otEmptyItemForm = () => ({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    payment_method: 'Cash',
    category: 'Other',
    notes: '',
    credit_card_id: null as number | null,
});

// How one budget is doing this month. `willExceed` projects the month's spend
// from the daily rate so far (only after day 3, when the rate means something).
// A budget spent exactly to its limit is "fully used", not "running out": a
// fixed cost such as rent hits 100% on day one and stays there.
interface BudgetView {
    spent: number; limit: number; pct: number;
    isOver: boolean; willExceed: boolean; runOutDay: number;
    status: string; tone: Tone;
}

function budgetView(b: any, month: number, year: number): BudgetView {
    const spent = parseFloat(b.spent);
    const limit = parseFloat(b.amount);
    const pct   = limit > 0 ? (spent / limit) * 100 : 0;
    const isOver    = spent > limit;
    const fullyUsed = !isOver && limit > 0 && spent >= limit;
    const today = new Date().getDate();
    const dim   = new Date(year, month, 0).getDate();
    const rate  = today > 0 ? spent / today : 0;
    const proj  = Math.round(rate * dim);
    const willExceed = !isOver && !fullyUsed && today > 3 && proj > limit;
    const runOutDay  = rate > 0 ? Math.ceil(limit / rate) : dim + 1;
    const runOutStr  = runOutDay <= dim
        ? new Date(year, month - 1, runOutDay).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : null;
    const status = isOver ? `${fmt(spent - limit)} over`
        : fullyUsed ? 'Fully used'
        : willExceed ? (runOutStr ? `Runs out ~${runOutStr}` : `${fmt(proj)} projected`)
        : `${fmt(limit - spent)} left`;
    return { spent, limit, pct, isOver, willExceed, runOutDay, status, tone: isOver ? 'bad' : willExceed ? 'caution' : 'neutral' };
}

function BudgetsPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const initialTab = searchParams.get('tab');
    const [tab, setTab] = useState(TABS.some(t => t.key === initialTab) ? initialTab! : 'budgets');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    // ════════════════════════════════════════════════════════════════════════
    // ── BUDGETS TAB STATE ──
    // ════════════════════════════════════════════════════════════════════════
    const currentMonth = new Date().getMonth() + 1;
    const currentYear  = new Date().getFullYear();

    // Cached: revisits show this month's budgets at once; saves refresh in the
    // background instead of reloading the list behind a skeleton.
    const queryClient = useQueryClient();
    const budgetsQuery = useBudgets(currentMonth, currentYear);
    const budgets: any[] = budgetsQuery.data ?? NO_BUDGETS;
    const budgetsLoading = budgetsQuery.isPending;
    const budgetsKey = queryKeys.budgets(user?.id, currentMonth, currentYear);
    const { categories } = useCategories();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [pendingDeleteBudget, setPendingDeleteBudget] = useState<Set<string>>(new Set());
    const [pendingDeleteRecurring, setPendingDeleteRecurring] = useState<Set<string>>(new Set());
    const [pendingDeleteSplit, setPendingDeleteSplit] = useState<Set<string>>(new Set());
    const [showForm, setShowForm]         = useState(false);
    const [formCategory, setFormCategory] = useState('');
    const [formAmount, setFormAmount]     = useState('');
    const [formLoading, setFormLoading]   = useState(false);
    const [formError, setFormError]       = useState('');
    const [editingId, setEditingId]   = useState<string | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError]   = useState('');

    const [prevMonthBudgets, setPrevMonthBudgets]   = useState<any[]>([]);
    const [prev2MonthBudgets, setPrev2MonthBudgets] = useState<any[]>([]);
    const [monthlyIncome, setMonthlyIncome]         = useState(0);
    const [dismissed, setDismissed]                 = useState<Set<string>>(new Set());
    const [rolloverEnabled, setRolloverEnabled]     = useState<Record<string, boolean>>({});
    const [zeroBasedMode, setZeroBasedMode]         = useState(false);
    const [adjusting, setAdjusting]                 = useState<string | null>(null);
    const [copying, setCopying]                      = useState(false);

    useEffect(() => {
        try { setDismissed(new Set(JSON.parse(localStorage.getItem('fintrack-budget-dismissed') ?? '[]'))); } catch {}
        try { setRolloverEnabled(JSON.parse(localStorage.getItem('fintrack-budget-rollover') ?? '{}')); } catch {}
    }, []);

    // The dashboard bundle carries its own budgets copy -- refresh both.
    const fetchBudgets = () => {
        queryClient.invalidateQueries({ queryKey: ['budgets'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };
    useEffect(() => {
        if (budgetsQuery.isError && !budgetsQuery.data) toast.error('Failed to load budgets');
    }, [budgetsQuery.isError, budgetsQuery.data]);

    useEffect(() => {
        if (!user) return;

        const pm  = currentMonth === 1 ? 12 : currentMonth - 1;
        const py  = currentMonth === 1 ? currentYear - 1 : currentYear;
        const p2m = currentMonth <= 2  ? currentMonth + 10 : currentMonth - 2;
        const p2y = currentMonth <= 2  ? currentYear  - 1  : currentYear;
        Promise.all([
            budgetsAPI.getAll({ month: pm, year: py }),
            budgetsAPI.getAll({ month: p2m, year: p2y }),
            analyticsAPI.summary({ month: currentMonth, year: currentYear }),
        ]).then(([r1, r2, rs]) => {
            setPrevMonthBudgets(r1.data.budgets ?? []);
            setPrev2MonthBudgets(r2.data.budgets ?? []);
            setMonthlyIncome(parseFloat(rs.data.summary?.total_income ?? '0'));
        }).catch(() => {});
    }, [user]);

    const suggestions = useMemo<SuggestionItem[]>(() => {
        const out: SuggestionItem[] = [];
        for (const b of budgets) {
            const catId = b.category_id;
            const id    = `${catId}-${currentMonth}-${currentYear}`;
            if (dismissed.has(id)) continue;
            const p1 = prevMonthBudgets.find(x => x.category_id === catId);
            const p2 = prev2MonthBudgets.find(x => x.category_id === catId);
            if (!p1 && !p2) continue;
            const spends = [p1, p2].filter(Boolean).map(x => parseFloat(x!.spent)).filter(s => s > 0);
            if (!spends.length) continue;
            const avg    = spends.reduce((a, s) => a + s, 0) / spends.length;
            const getAmt = (x: any) => x ? parseFloat(x.amount) : 0;
            const overCnt  = [p1, p2].filter(x => x && getAmt(x) > 0 && parseFloat(x.spent) > getAmt(x) * 1.2).length;
            const underCnt = [p1, p2].filter(x => x && getAmt(x) > 0 && parseFloat(x.spent) > 0 && parseFloat(x.spent) < getAmt(x) * 0.6).length;
            const curAmt   = parseFloat(b.amount);
            if (overCnt >= 2) {
                const s = Math.ceil(avg / 500) * 500;
                if (s > curAmt) out.push({ id, categoryId: catId, categoryName: b.category_name, categoryIcon: b.category_icon || '📊', type: 'over', avgSpend: avg, currentBudget: curAmt, suggestedAmount: s });
            } else if (underCnt >= 2) {
                const s = Math.max(100, Math.floor(avg / 100) * 100);
                if (s < curAmt) out.push({ id, categoryId: catId, categoryName: b.category_name, categoryIcon: b.category_icon || '📊', type: 'under', avgSpend: avg, currentBudget: curAmt, suggestedAmount: s });
            }
        }
        return out;
    }, [budgets, prevMonthBudgets, prev2MonthBudgets, dismissed, currentMonth, currentYear]);

    const goalSurplusNudge = useMemo(() => {
        const today = new Date().getDate();
        const dim = new Date(currentYear, currentMonth, 0).getDate();
        const daysLeft = dim - today;
        if (daysLeft > 5 || budgets.length === 0) return null;
        const surplusTotal = budgets.reduce((acc: number, b: any) => {
            const s = parseFloat(b.spent); const l = parseFloat(b.amount);
            return acc + Math.max(0, l - s);
        }, 0);
        if (surplusTotal < 200) return null;
        return { daysLeft, surplusTotal };
    }, [budgets, currentMonth, currentYear]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (!formCategory || !formAmount) { setFormError('Please select a category and enter an amount.'); return; }
        if (!navigator.onLine) { setFormError("You're offline — try again when connected"); return; }
        setFormLoading(true);
        try {
            await budgetsAPI.create({ category_id: formCategory, amount: parseFloat(formAmount), month: currentMonth, year: currentYear });
            setFormCategory(''); setFormAmount(''); setShowForm(false); fetchBudgets();
        } catch (err: any) { setFormError(err.response?.data?.error || 'Failed to save.'); }
        finally { setFormLoading(false); }
    };

    const handleDelete = (id: string) => {
        // Optimistically hide, then give the user an undo window before actually
        // deleting — same pattern as goals/investments delete.
        setPendingDeleteBudget(prev => new Set([...prev, id]));
        setConfirmDeleteId(null);

        let cancelled = false;
        toast.undo('Budget deleted', () => {
            cancelled = true;
            setPendingDeleteBudget(prev => { const s = new Set(prev); s.delete(id); return s; });
        });

        setTimeout(async () => {
            if (cancelled) return;
            setDeletingId(id);
            try {
                await budgetsAPI.delete(id);
                // Out of the cache before un-hiding, so the row never flashes back.
                queryClient.setQueryData<any[]>(budgetsKey, list => (list ?? []).filter(b => b.id !== id));
                setPendingDeleteBudget(prev => { const s = new Set(prev); s.delete(id); return s; });
                fetchBudgets();
            } catch {
                toast.error('Failed to delete budget');
                setPendingDeleteBudget(prev => { const s = new Set(prev); s.delete(id); return s; });
            } finally {
                setDeletingId(null);
            }
        }, 4000);
    };

    const handleEditSave = async (budget: any) => {
        if (!editAmount) { setEditError('Enter an amount.'); return; }
        setEditLoading(true); setEditError('');
        try {
            await budgetsAPI.create({ category_id: budget.category_id, amount: parseFloat(editAmount), month: currentMonth, year: currentYear });
            // Show the new limit now; the background refresh confirms it.
            queryClient.setQueryData<any[]>(budgetsKey, list => (list ?? []).map(b =>
                b.id === budget.id ? { ...b, amount: String(parseFloat(editAmount)) } : b));
            setEditingId(null); fetchBudgets();
        } catch (err: any) { setEditError(err.response?.data?.error || 'Failed to update.'); }
        finally { setEditLoading(false); }
    };

    const handleAdjust = async (item: SuggestionItem) => {
        setAdjusting(item.id);
        try {
            await budgetsAPI.create({ category_id: item.categoryId, amount: item.suggestedAmount, month: currentMonth, year: currentYear });
            handleDismiss(item.id); fetchBudgets();
            toast.success(`Budget adjusted to ${fmt(item.suggestedAmount)}`);
        } catch { toast.error('Failed to update budget'); }
        finally { setAdjusting(null); }
    };

    const handleDismiss = (id: string) => {
        const next = new Set([...dismissed, id]);
        setDismissed(next);
        try { localStorage.setItem('fintrack-budget-dismissed', JSON.stringify([...next])); } catch {}
    };

    const toggleRollover = (catId: string) => {
        const next = { ...rolloverEnabled, [catId]: !rolloverEnabled[catId] };
        setRolloverEnabled(next);
        try { localStorage.setItem('fintrack-budget-rollover', JSON.stringify(next)); } catch {}
    };

    const handleCopyFromLastMonth = async () => {
        const toCopy = prevMonthBudgets.filter(pb => !budgets.find(b => b.category_id === pb.category_id));
        if (!toCopy.length) { toast.info('All last month\'s categories already have budgets this month.'); return; }
        setCopying(true);
        try {
            await Promise.all(toCopy.map(pb =>
                budgetsAPI.create({ category_id: pb.category_id, amount: parseFloat(pb.amount), month: currentMonth, year: currentYear })
            ));
            toast.success(`Copied ${toCopy.length} budget${toCopy.length > 1 ? 's' : ''} from last month`);
            fetchBudgets();
        } catch { toast.error('Failed to copy budgets'); }
        finally { setCopying(false); }
    };

    // Investments-category budgets are excluded from the page's aggregate spend
    // totals only (Total Budget/Spent So Far/Overall Usage) -- investing isn't
    // "spending" (every analytics view in the app already treats it that way), so
    // lumping it in there would be misleading. The health-status chips (All/On
    // track/Over budget) and each budget's own card intentionally still cover
    // every budget, investments included -- those classify each budget on its own
    // terms, not as a slice of total spending.
    const spendingBudgets = budgets.filter(b => !b.is_investment_category);
    const totalBudgeted   = spendingBudgets.reduce((s, b) => s + parseFloat(b.amount), 0);
    const totalSpent      = spendingBudgets.reduce((s, b) => s + parseFloat(b.spent),  0);
    const totalRemaining  = Math.max(totalBudgeted - totalSpent, 0);
    const overallRawPct   = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
    const isOverTotal     = totalSpent > totalBudgeted;
    // Zero-based budgeting's "unallocated" tracks every dollar given a job --
    // an Investments budget is still a job for that money, so this counts all
    // budgets, not just spendingBudgets.
    const totalAllocated  = budgets.reduce((s, b) => s + parseFloat(b.amount), 0);
    const unallocated     = monthlyIncome - totalAllocated;
    const copyableCount   = prevMonthBudgets.filter(pb => !budgets.find(b => b.category_id === pb.category_id)).length;
    const visibleBudgets  = budgets.filter(b => !pendingDeleteBudget.has(b.id));

    // ── Categories grouped by state ──
    // "Needs attention" is over the limit or on pace to run out before month
    // end; everything else is on track. Over comes first (largest overrun on
    // top), then the earliest projected run-out.
    const dayOfMonth  = new Date().getDate();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const budgetViews = visibleBudgets.map(b => ({ budget: b, view: budgetView(b, currentMonth, currentYear) }));
    const attentionBudgets = budgetViews
        .filter(x => x.view.isOver || x.view.willExceed)
        .sort((a, b) => a.view.isOver !== b.view.isOver
            ? (a.view.isOver ? -1 : 1)
            : a.view.isOver ? (b.view.spent - b.view.limit) - (a.view.spent - a.view.limit) : a.view.runOutDay - b.view.runOutDay);
    const onTrackBudgets  = budgetViews.filter(x => !x.view.isOver && !x.view.willExceed);
    const overCount       = attentionBudgets.filter(x => x.view.isOver).length;
    const runningOutCount = attentionBudgets.length - overCount;

    const openAdd = () => { setShowForm(true); setFormError(''); setFormCategory(''); setFormAmount(''); };

    const closeEditor = () => { setEditingId(null); setEditError(''); setConfirmDeleteId(null); };

    // One budget as a row: tap to open its limit and rollover in place. A
    // suggestion about this category sits on the row, next to its numbers.
    const renderBudgetRow = ({ budget, view }: { budget: any; view: BudgetView }) => {
        const editing     = editingId === budget.id;
        const confirming  = confirmDeleteId === budget.id;
        const rollover    = !!rolloverEnabled[budget.category_id];
        const prevB       = prevMonthBudgets.find(p => p.category_id === budget.category_id);
        const rolloverAmt = prevB ? Math.max(0, parseFloat(prevB.amount) - parseFloat(prevB.spent)) : 0;
        const suggestion  = suggestions.find(s => s.categoryId === budget.category_id);
        const toggle = () => {
            if (editing) { closeEditor(); return; }
            setEditingId(budget.id); setEditAmount(String(view.limit)); setEditError(''); setConfirmDeleteId(null);
        };
        const inset: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px var(--space-3)', padding: '6px var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)' };

        return (
            <div key={budget.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                    <div role="button" tabIndex={0} aria-expanded={editing} className="pressable" onClick={toggle}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: 'var(--radius-md)' }}>
                        <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 'var(--text-title)' }}>
                            {[budget.category_icon, budget.category_emoji].find(looksLikeEmoji) || '📊'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{budget.category_name}</p>
                            <p style={{ ...type.numSmall, ...truncate, margin: 0 }}>
                                Limit {fmt(view.limit)}
                                {rollover && (rolloverAmt > 0 ? ` · +${fmt(rolloverAmt)} rolled over` : ' · rollover on')}
                            </p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ ...type.num, margin: 0 }}>{fmt(view.spent)}</p>
                            <p style={{ ...type.meta, margin: 0, color: TONE_TEXT[view.tone] }}>{view.status}</p>
                        </div>
                    </div>
                    <button type="button" className="fin-icon-btn fin-row-hover-action" aria-label={`Delete ${budget.category_name} budget`}
                        onClick={() => { setEditingId(null); setConfirmDeleteId(budget.id); }} disabled={!!deletingId}>
                        <Trash2 size={14} />
                    </button>
                </div>

                <ProgressBar pct={view.pct} height={4} color={view.pct >= 85 ? 'var(--color-warn)' : 'var(--text-secondary)'} />

                {confirming && (
                    <div style={inset}>
                        <span style={{ ...type.meta, flex: '1 1 160px', color: 'var(--text-primary)' }}>Delete the {budget.category_name} budget?</span>
                        <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                            <TextAction tone="danger" onClick={() => { setEditingId(null); handleDelete(budget.id); }} disabled={deletingId === budget.id}>Delete budget</TextAction>
                            <TextAction quiet onClick={() => setConfirmDeleteId(null)}>Keep it</TextAction>
                        </span>
                    </div>
                )}

                {suggestion && !editing && !confirming && (
                    <div style={inset}>
                        <span style={{ ...type.meta, flex: '1 1 200px' }}>
                            You&apos;ve averaged {fmt(suggestion.avgSpend)} a month. {suggestion.type === 'over' ? 'Raise' : 'Lower'} the limit to {fmt(suggestion.suggestedAmount)}?
                        </span>
                        <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                            <TextAction onClick={() => handleAdjust(suggestion)} disabled={adjusting === suggestion.id}>{adjusting === suggestion.id ? 'Saving…' : 'Adjust'}</TextAction>
                            <TextAction quiet onClick={() => handleDismiss(suggestion.id)}>Dismiss</TextAction>
                        </span>
                    </div>
                )}

                {editing && !confirming && (
                    <div style={{ ...inset, alignItems: 'flex-end', gap: 'var(--space-3) var(--space-4)', padding: 'var(--space-3)' }}>
                        <div>
                            <label htmlFor={`limit-${budget.id}`} style={{ ...type.label, display: 'block', marginBottom: 6 }}>Monthly limit</label>
                            <div style={{ position: 'relative' }}>
                                <span aria-hidden="true" style={{ ...type.num, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>₹</span>
                                <input id={`limit-${budget.id}`} type="number" min="1" inputMode="decimal" value={editAmount} autoFocus
                                    onChange={e => setEditAmount(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleEditSave(budget); if (e.key === 'Escape') closeEditor(); }}
                                    style={{ ...type.num, fontSize: 'var(--text-title)', width: 140, height: 40, padding: '0 10px 0 26px', borderRadius: 'var(--radius-sm)', background: 'var(--glass-fill-1)', border: '1px solid var(--border-visible)', outline: 'none' }} />
                            </div>
                        </div>
                        <div style={{ height: 40, display: 'flex', alignItems: 'center' }}>
                            <Switch checked={rollover} onChange={() => toggleRollover(budget.category_id)} label="Roll over unspent" />
                        </div>
                        <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <Button size="sm" onClick={() => handleEditSave(budget)} isLoading={editLoading}>Save limit</Button>
                            <TextAction quiet onClick={closeEditor}>Cancel</TextAction>
                        </div>
                        <div style={{ height: 40, display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                            <TextAction tone="danger" onClick={() => setConfirmDeleteId(budget.id)} disabled={!!deletingId}>Delete budget</TextAction>
                        </div>
                        {editError && <p role="alert" style={{ ...type.meta, margin: 0, flexBasis: '100%', color: 'var(--color-exp-text)' }}>{editError}</p>}
                    </div>
                )}
            </div>
        );
    };

    // ════════════════════════════════════════════════════════════════════════
    // ── RECURRING TAB STATE ──
    // ════════════════════════════════════════════════════════════════════════
    const [recurring, setRecurring]         = useState<any[]>([]);
    const [recurringLoading, setRecurringLoading] = useState(true);
    const [processingRecurring, setProcessingRecurring] = useState(false);
    const [showRecForm, setShowRecForm]     = useState(false);
    const [recDeletingId, setRecDeletingId] = useState<string | null>(null);
    const [togglingId, setTogglingId]       = useState<string | null>(null);
    const [recForm, setRecForm]             = useState({ type: 'expense' as 'income' | 'expense', amount: '', description: '', frequency: 'monthly', day_of_month: '', category_id: '' });
    const [recFormLoading, setRecFormLoading] = useState(false);
    const [recFormError, setRecFormError]   = useState('');
    const [recEditingId, setRecEditingId]   = useState<string | null>(null);
    const [recEditForm, setRecEditForm]     = useState({ type: 'expense' as 'income' | 'expense', amount: '', description: '', frequency: 'monthly', day_of_month: '', category_id: '' });
    const [recEditLoading, setRecEditLoading] = useState(false);
    const [recEditError, setRecEditError]   = useState('');
    const [recConfirmDeleteId, setRecConfirmDeleteId] = useState<string | null>(null);
    const [patterns, setPatterns]           = useState<any[]>([]);
    const [dismissedPatterns, setDismissedPatterns] = useState<Set<number>>(new Set());
    const [patternsLoading, setPatternsLoading]     = useState(false);
    const [addingPattern, setAddingPattern] = useState<number | null>(null);
    const [recurringFetched, setRecurringFetched] = useState(false);

    const fetchRecurringData = async () => {
        setRecurringLoading(true);
        try { const recRes = await recurringAPI.getAll(); setRecurring(recRes.data.recurring); }
        catch (err) { console.error(err); toast.error('Failed to load recurring transactions'); }
        finally { setRecurringLoading(false); }
    };

    const handleProcessRecurring = async () => {
        setProcessingRecurring(true);
        try {
            const res = await recurringAPI.process();
            const processed = res.data?.processed ?? 0;
            toast.success(processed > 0 ? `Processed ${processed} item${processed > 1 ? 's' : ''}` : 'All caught up — nothing due');
            if (processed > 0) fetchRecurringData();
        } catch {
            toast.error('Failed to process recurring transactions — try again');
        } finally {
            setProcessingRecurring(false);
        }
    };

    const fetchPatterns = async () => {
        setPatternsLoading(true);
        try { const res = await aiAPI.detectPatterns(); setPatterns(res.data.patterns || []); setDismissedPatterns(new Set()); }
        catch { setPatterns([]); }
        finally { setPatternsLoading(false); }
    };

    useEffect(() => {
        if (user && tab === 'recurring' && !recurringFetched) {
            setRecurringFetched(true);
            fetchRecurringData();
            fetchPatterns();
        }
    }, [user, tab, recurringFetched]);

    const handleRecSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setRecFormError(''); setRecFormLoading(true);
        try {
            await recurringAPI.create({ type: recForm.type, amount: parseFloat(recForm.amount), description: recForm.description, frequency: recForm.frequency, day_of_month: recForm.day_of_month ? parseInt(recForm.day_of_month) : undefined, category_id: recForm.category_id || undefined });
            setRecForm({ type: 'expense', amount: '', description: '', frequency: 'monthly', day_of_month: '', category_id: '' });
            setShowRecForm(false); fetchRecurringData();
        } catch (err: any) { setRecFormError(err.response?.data?.error || 'Failed to save.'); }
        finally { setRecFormLoading(false); }
    };

    const handleRecToggle = async (id: string) => {
        setTogglingId(id);
        try { await recurringAPI.toggle(id); fetchRecurringData(); }
        finally { setTogglingId(null); }
    };

    const handleRecEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setRecEditError(''); setRecEditLoading(true);
        try {
            await recurringAPI.update(recEditingId!, { type: recEditForm.type, amount: parseFloat(recEditForm.amount), description: recEditForm.description, frequency: recEditForm.frequency, day_of_month: recEditForm.day_of_month ? parseInt(recEditForm.day_of_month) : undefined, category_id: recEditForm.category_id || undefined });
            setRecEditingId(null); fetchRecurringData();
        } catch (err: any) { setRecEditError(err.response?.data?.error || 'Failed to update.'); }
        finally { setRecEditLoading(false); }
    };

    const handleRecDelete = (id: string) => {
        // Optimistically hide, then give the user an undo window before actually
        // deleting — replaces the native confirm() with the same undo pattern used
        // for goals/investments/budgets delete.
        setPendingDeleteRecurring(prev => new Set([...prev, id]));

        let cancelled = false;
        toast.undo('Recurring transaction deleted', () => {
            cancelled = true;
            setPendingDeleteRecurring(prev => { const s = new Set(prev); s.delete(id); return s; });
        });

        setTimeout(async () => {
            if (cancelled) return;
            setRecDeletingId(id);
            try {
                await recurringAPI.delete(id);
                setPendingDeleteRecurring(prev => { const s = new Set(prev); s.delete(id); return s; });
                fetchRecurringData();
            } catch {
                toast.error('Failed to delete recurring transaction');
                setPendingDeleteRecurring(prev => { const s = new Set(prev); s.delete(id); return s; });
            } finally {
                setRecDeletingId(null);
            }
        }, 4000);
    };

    const handleAddPattern = async (pattern: any, idx: number) => {
        setAddingPattern(idx);
        try {
            await recurringAPI.create({ type: 'expense', amount: pattern.amount, description: pattern.description || pattern.merchant, frequency: pattern.frequency });
            setDismissedPatterns(prev => new Set([...prev, idx])); fetchRecurringData();
        } catch { toast.error('Failed to add as recurring — try again'); }
        finally { setAddingPattern(null); }
    };

    const freqLabel = (r: any) => {
        if (r.frequency === 'monthly' && r.day_of_month) { const s = r.day_of_month===1?'st':r.day_of_month===2?'nd':r.day_of_month===3?'rd':'th'; return `Monthly on the ${r.day_of_month}${s}`; }
        return r.frequency.charAt(0).toUpperCase() + r.frequency.slice(1);
    };

    const visiblePatterns = patterns.filter((_, i) => !dismissedPatterns.has(i));
    const visibleRecurring = recurring.filter(r => !pendingDeleteRecurring.has(r.id));
    const activeCount = visibleRecurring.filter(r => r.is_active).length;
    const pausedCount = visibleRecurring.length - activeCount;
    const recToday = new Date();
    const recGroups = groupRecurring(visibleRecurring, recToday);
    const recSummary = recurringSummary(visibleRecurring, recToday);

    const openRecAdd = () => {
        setRecForm({ type: 'expense', amount: '', description: '', frequency: 'monthly', day_of_month: '', category_id: '' });
        setRecFormError('');
        setShowRecForm(true);
    };

    const closeRecEditor = () => { setRecEditingId(null); setRecEditError(''); setRecConfirmDeleteId(null); };

    // Neutral two-option segmented control: no red/green, the selected side is a lighter fill.
    const TypeToggle = ({ value, onChange }: { value: string; onChange: (v: 'income' | 'expense') => void }) => (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, padding: 2, borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)' }}>
            {([['expense', 'Expense'], ['income', 'Income']] as const).map(([t, text]) => (
                <button key={t} type="button" aria-pressed={value === t} onClick={() => onChange(t)}
                    style={{ ...type.label, border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px', cursor: 'pointer', background: value === t ? 'var(--glass-fill-3)' : 'transparent', color: value === t ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {text}
                </button>
            ))}
        </div>
    );

    // One schedule as a row: tap to open its editor in place. The due line
    // carries the urgency; the amount stays the default colour.
    const renderRecRow = (r: any) => {
        const editing    = recEditingId === r.id;
        const confirming = recConfirmDeleteId === r.id;
        const isIncome   = r.type === 'income';
        const days       = daysUntil(r.next_due_date, recToday);
        const dueText    = r.is_active ? dueLabel(days, r.next_due_date, recToday) : 'Paused';
        const dueColor   = r.is_active ? TONE_TEXT[dueTone(days)] : TONE_TEXT.neutral;
        const toggle = () => {
            if (editing) { closeRecEditor(); return; }
            setRecEditingId(r.id);
            setRecEditForm({ type: r.type, amount: String(r.amount), description: r.description, frequency: r.frequency, day_of_month: r.day_of_month ? String(r.day_of_month) : '', category_id: r.category_id || '' });
            setRecEditError(''); setRecConfirmDeleteId(null);
        };
        const confirmDelete = () => { setRecEditingId(null); setRecConfirmDeleteId(null); handleRecDelete(r.id); };
        const inset: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px var(--space-3)', padding: '6px var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)' };

        return (
            <div key={r.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                    <div role="button" tabIndex={0} aria-expanded={editing} className="pressable" onClick={toggle}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{r.description}</p>
                            <p style={{ ...type.meta, ...truncate, margin: 0 }}>{freqLabel(r)}{r.category_name ? ` · ${r.category_name}` : ''}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ ...type.num, margin: 0, ...(isIncome ? { color: 'var(--color-inc-text)' } : {}) }}>{isIncome ? '+' : '−'}{fmt(parseFloat(r.amount))}</p>
                            <p style={{ ...type.meta, margin: 0, color: dueColor }}>{dueText}</p>
                        </div>
                    </div>
                    {r.is_active ? (
                        <button type="button" className="fin-icon-btn fin-row-hover-action" aria-label={`Delete ${r.description}`}
                            onClick={() => { setRecEditingId(null); setRecConfirmDeleteId(r.id); }} disabled={recDeletingId === r.id}>
                            <Trash2 size={14} />
                        </button>
                    ) : (
                        <TextAction onClick={() => handleRecToggle(r.id)} disabled={togglingId === r.id}>Resume</TextAction>
                    )}
                </div>

                {confirming && (
                    <div style={inset}>
                        <span style={{ ...type.meta, flex: '1 1 160px', color: 'var(--text-primary)' }}>Delete the {r.description} schedule?</span>
                        <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                            <TextAction tone="danger" onClick={confirmDelete} disabled={recDeletingId === r.id}>Delete schedule</TextAction>
                            <TextAction quiet onClick={() => setRecConfirmDeleteId(null)}>Keep it</TextAction>
                        </span>
                    </div>
                )}

                {editing && !confirming && (
                    <div style={{ background: 'var(--glass-fill-1)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
                        <form onSubmit={handleRecEditSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                            <div>
                                <label style={labelSt}>Type</label>
                                <TypeToggle value={recEditForm.type} onChange={t => setRecEditForm({ ...recEditForm, type: t })} />
                            </div>
                            <Input label="Amount (₹)" type="number" placeholder="5000" min="1" value={recEditForm.amount} onChange={e => setRecEditForm({ ...recEditForm, amount: e.target.value })} required />
                            <Input label="Description" type="text" placeholder="Monthly salary" value={recEditForm.description} onChange={e => setRecEditForm({ ...recEditForm, description: e.target.value })} required />
                            <div>
                                <label htmlFor={`rec-freq-${r.id}`} style={labelSt}>Repeats</label>
                                <select id={`rec-freq-${r.id}`} value={recEditForm.frequency} onChange={e => setRecEditForm({ ...recEditForm, frequency: e.target.value })} style={inputSt}>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                            </div>
                            {recEditForm.frequency === 'monthly' && <Input label="Day of month" type="number" placeholder="1" min="1" max="31" value={recEditForm.day_of_month} onChange={e => setRecEditForm({ ...recEditForm, day_of_month: e.target.value })} />}
                            <div>
                                <label style={labelSt}>Category</label>
                                <CategoryField value={recEditForm.category_id} onChange={v => setRecEditForm({ ...recEditForm, category_id: v })} categories={categories} placeholder="Select category" />
                            </div>
                            <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
                                <Button type="submit" size="sm" isLoading={recEditLoading}>Save changes</Button>
                                <TextAction quiet onClick={closeRecEditor}>Cancel</TextAction>
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                                    <Switch label="Active" checked={r.is_active} onChange={() => handleRecToggle(r.id)} />
                                    <TextAction tone="danger" onClick={() => setRecConfirmDeleteId(r.id)}>Delete schedule</TextAction>
                                </div>
                            </div>
                            {recEditError && <p role="alert" style={{ ...type.meta, margin: 0, gridColumn: '1 / -1', color: 'var(--color-exp-text)' }}>{recEditError}</p>}
                        </form>
                    </div>
                )}
            </div>
        );
    };

    // ════════════════════════════════════════════════════════════════════════
    // ── SPLITS TAB STATE ──
    // ════════════════════════════════════════════════════════════════════════
    const [splits,       setSplits]       = useState<any[]>([]);
    const [splitsLoading, setSplitsLoading] = useState(true);
    const [splitsFetched, setSplitsFetched] = useState(false);
    const [showSplitModal, setShowSplitModal] = useState(false);
    const [editingSplit, setEditingSplit] = useState<any | null>(null);
    const [splitDeletingId, setSplitDeletingId] = useState<string | null>(null);
    const [splitConfirmDeleteId, setSplitConfirmDeleteId] = useState<string | null>(null);
    const [splitModalConfirmDelete, setSplitModalConfirmDelete] = useState(false);
    const [nlInput,      setNlInput]     = useState('');
    const [nlLoading,    setNlLoading]   = useState(false);
    const [splitForm,    setSplitForm]   = useState({ description: '', total_amount: '', participants: [{ name: '' }], date: new Date().toISOString().split('T')[0] });
    const [splitFormLoading, setSplitFormLoading] = useState(false);
    const [splitFormError, setSplitFormError]     = useState('');

    const fetchSplits = async () => {
        setSplitsLoading(true);
        try { const res = await splitsAPI.getAll(); setSplits(res.data.splits); }
        catch { setSplits([]); toast.error('Failed to load splits'); }
        finally { setSplitsLoading(false); }
    };

    useEffect(() => {
        if (user && tab === 'splits' && !splitsFetched) {
            setSplitsFetched(true);
            fetchSplits();
        }
    }, [user, tab, splitsFetched]);

    const handleNlParse = async () => {
        if (!nlInput.trim()) return;
        setNlLoading(true);
        try {
            const res = await aiAPI.parseSplit(nlInput);
            const p = res.data.parsed;
            if (p) {
                setSplitForm({ description: p.description || '', total_amount: p.total_amount ? String(p.total_amount) : '', participants: p.participants?.length ? p.participants : [{ name: '' }], date: new Date().toISOString().split('T')[0] });
                setSplitFormError('');
                setEditingSplit(null);
                setShowSplitModal(true);
                setNlInput('');
            } else {
                toast.error("Couldn't read that. Add the split by hand instead.");
            }
        } catch {
            toast.error("Couldn't read that. Add the split by hand instead.");
        } finally { setNlLoading(false); }
    };

    const openSplitAdd = () => {
        setSplitForm({ description: '', total_amount: '', participants: [{ name: '' }], date: new Date().toISOString().split('T')[0] });
        setSplitFormError('');
        setEditingSplit(null);
        setSplitModalConfirmDelete(false);
        setShowSplitModal(true);
    };

    const addParticipant    = () => setSplitForm({ ...splitForm, participants: [...splitForm.participants, { name: '' }] });
    const removeParticipant = (i: number) => setSplitForm({ ...splitForm, participants: splitForm.participants.filter((_, idx) => idx !== i) });
    const updateParticipant = (i: number, name: string) => { const updated = [...splitForm.participants]; updated[i] = { name }; setSplitForm({ ...splitForm, participants: updated }); };

    const splitCount = splitForm.participants.length + 1;
    const yourShare  = splitForm.total_amount ? (parseFloat(splitForm.total_amount) / splitCount) : 0;

    const openEditSplit = (split: any) => {
        setEditingSplit(split);
        setSplitForm({ description: split.description, total_amount: String(parseFloat(split.total_amount)), participants: (split.participants || []).map((p: any) => ({ name: p.name })), date: split.date?.split('T')[0] || new Date().toISOString().split('T')[0] });
        setNlInput(''); setSplitFormError(''); setSplitModalConfirmDelete(false); setShowSplitModal(true);
    };

    const closeSplitModal = () => { setShowSplitModal(false); setEditingSplit(null); setSplitModalConfirmDelete(false); setNlInput(''); setSplitForm({ description: '', total_amount: '', participants: [{ name: '' }], date: new Date().toISOString().split('T')[0] }); setSplitFormError(''); };

    const handleSplitSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setSplitFormError(''); setSplitFormLoading(true);
        try {
            const validParticipants = splitForm.participants.filter(p => p.name.trim());
            if (!validParticipants.length) { setSplitFormError('Add at least one participant.'); setSplitFormLoading(false); return; }
            if (editingSplit) await splitsAPI.update(editingSplit.id, { description: splitForm.description, total_amount: parseFloat(splitForm.total_amount), participants: validParticipants, date: splitForm.date });
            else await splitsAPI.create({ description: splitForm.description, total_amount: parseFloat(splitForm.total_amount), participants: validParticipants, date: splitForm.date });
            closeSplitModal(); fetchSplits();
        } catch (err: any) { setSplitFormError(err.response?.data?.error || (editingSplit ? 'Failed to update.' : 'Failed to create.')); }
        finally { setSplitFormLoading(false); }
    };

    const handleSettle = async (splitId: string, idx: number) => {
        try { const res = await splitsAPI.settle(splitId, idx); setSplits(splits.map(s => s.id === splitId ? res.data.split : s)); }
        catch { toast.error('Failed to settle split — try again'); }
    };

    const handleSplitDelete = (id: string) => {
        // Optimistically hide, then give the user an undo window before actually
        // deleting (this also removes the linked transaction on the backend, so
        // the undo window matters more here than for most deletes).
        setPendingDeleteSplit(prev => new Set([...prev, id]));

        let cancelled = false;
        toast.undo('Split deleted', () => {
            cancelled = true;
            setPendingDeleteSplit(prev => { const s = new Set(prev); s.delete(id); return s; });
        });

        setTimeout(async () => {
            if (cancelled) return;
            setSplitDeletingId(id);
            try {
                await splitsAPI.delete(id);
                setPendingDeleteSplit(prev => { const s = new Set(prev); s.delete(id); return s; });
                fetchSplits();
            } catch {
                toast.error('Failed to delete split');
                setPendingDeleteSplit(prev => { const s = new Set(prev); s.delete(id); return s; });
            } finally {
                setSplitDeletingId(null);
            }
        }, 4000);
    };

    const visibleSplits = splits.filter(s => !pendingDeleteSplit.has(s.id));
    const splitGroups = groupSplits(visibleSplits);
    const splitDebtors = whoOwes(splitGroups.open);
    const splitSum = splitsSummary(visibleSplits);

    const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const oldestOpenLabel = (() => {
        const m = splitSum.oldestOpenDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(splitSum.oldestOpenDate) : null;
        return m ? `${Number(m[3])} ${SHORT_MONTHS[Number(m[2]) - 1]}` : null;
    })();

    const splitInset: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px var(--space-3)', padding: '6px var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)' };

    const confirmSplitDelete = (id: string) => { setSplitConfirmDeleteId(null); handleSplitDelete(id); };

    // One open split: the top line opens the editor; the people underneath are
    // settled one by one without leaving the row.
    const renderOpenSplit = (split: any) => {
        const confirming = splitConfirmDeleteId === split.id;
        const people = split.participants || [];
        const openEditor = () => openEditSplit(split);
        return (
            <div key={split.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                    <div role="button" tabIndex={0} className="pressable" onClick={openEditor}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditor(); } }}
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{split.description}</p>
                            <p style={{ ...type.numSmall, ...truncate, margin: 0 }}>
                                {formatDate(split.date)} · {fmt(parseFloat(split.total_amount))} split {people.length + 1} ways · your share {fmt(parseFloat(split.your_share))}
                            </p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ ...type.num, margin: 0 }}>{fmt(owedOn(split))}</p>
                            <p style={{ ...type.meta, margin: 0 }}>still owed</p>
                        </div>
                    </div>
                    <button type="button" className="fin-icon-btn fin-row-hover-action" aria-label={`Delete ${split.description} split`}
                        onClick={() => setSplitConfirmDeleteId(split.id)} disabled={splitDeletingId === split.id}>
                        <Trash2 size={14} />
                    </button>
                </div>

                {confirming && (
                    <div style={splitInset}>
                        <span style={{ ...type.meta, flex: '1 1 160px', color: 'var(--text-primary)' }}>Delete the {split.description} split? Its linked transaction goes too.</span>
                        <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                            <TextAction tone="danger" onClick={() => confirmSplitDelete(split.id)}>Delete split</TextAction>
                            <TextAction quiet onClick={() => setSplitConfirmDeleteId(null)}>Keep it</TextAction>
                        </span>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 'var(--space-3)', borderLeft: '1px solid var(--glass-border)' }}>
                    {people.map((p: any, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 32 }}>
                            <p style={{ ...type.body, ...truncate, margin: 0, flex: 1 }}>{p.name}</p>
                            <span style={type.numSmall}>{fmt(parseFloat(p.share))}</span>
                            {p.settled
                                ? <TextAction tone="good" aria-label={`Mark ${p.name} as not settled`} onClick={() => handleSettle(split.id, i)}>Settled</TextAction>
                                : <TextAction onClick={() => handleSettle(split.id, i)}>Mark settled</TextAction>}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // A fully paid split: one line.
    const renderSettledSplit = (split: any) => {
        const confirming = splitConfirmDeleteId === split.id;
        const n = (split.participants || []).length;
        const openEditor = () => openEditSplit(split);
        return (
            <div key={split.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                    <div role="button" tabIndex={0} className="pressable" onClick={openEditor}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditor(); } }}
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{split.description}</p>
                            <p style={{ ...type.numSmall, ...truncate, margin: 0 }}>{formatDate(split.date)} · {n} {n === 1 ? 'person' : 'people'} paid</p>
                        </div>
                        <p style={{ ...type.num, margin: 0, flexShrink: 0 }}>{fmt(parseFloat(split.total_amount))}</p>
                    </div>
                    <button type="button" className="fin-icon-btn fin-row-hover-action" aria-label={`Delete ${split.description} split`}
                        onClick={() => setSplitConfirmDeleteId(split.id)} disabled={splitDeletingId === split.id}>
                        <Trash2 size={14} />
                    </button>
                </div>
                {confirming && (
                    <div style={splitInset}>
                        <span style={{ ...type.meta, flex: '1 1 160px', color: 'var(--text-primary)' }}>Delete the {split.description} split? Its linked transaction goes too.</span>
                        <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                            <TextAction tone="danger" onClick={() => confirmSplitDelete(split.id)}>Delete split</TextAction>
                            <TextAction quiet onClick={() => setSplitConfirmDeleteId(null)}>Keep it</TextAction>
                        </span>
                    </div>
                )}
            </div>
        );
    };

    // ════════════════════════════════════════════════════════════════════════
    // ── ONE-TIME EXPENSES TAB STATE ──
    // ════════════════════════════════════════════════════════════════════════
    const [otExpenses, setOtExpenses]           = useState<OtExpense[]>([]);
    const [otAccounts, setOtAccounts]           = useState<OtAccount[]>([]);
    const [otCards, setOtCards]                 = useState<any[]>([]);
    const [otLoading, setOtLoading]             = useState(true);
    const [otFetched, setOtFetched]             = useState(false);
    const [otExpandedId, setOtExpandedId]       = useState<string | null>(null);
    const [otAddingItemFor, setOtAddingItemFor] = useState<string | null>(null);
    const [otItemForm, setOtItemForm]           = useState(otEmptyItemForm());
    const [otAddingItem, setOtAddingItem]       = useState(false);
    const [otEditingItem, setOtEditingItem]     = useState<{ expenseId: string; item: OtExpenseItem } | null>(null);
    const [otShowModal, setOtShowModal]         = useState(false);
    const [otEditingExp, setOtEditingExp]       = useState<OtExpense | null>(null);
    const [otExpForm, setOtExpForm]             = useState(otEmptyExpenseForm());
    const [otSavingExp, setOtSavingExp]         = useState(false);
    const [otConfirmDeleteExp, setOtConfirmDeleteExp]   = useState<string | null>(null);
    const [otConfirmDeleteItem, setOtConfirmDeleteItem] = useState<string | null>(null);
    const [otPendingDeleteExp, setOtPendingDeleteExp]     = useState<Set<string>>(new Set());
    const [otPendingDeleteItems, setOtPendingDeleteItems] = useState<Set<string>>(new Set());

    const otGetHeaders = useCallback(() => {
        const token = useAuthStore.getState().token;
        return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    }, []);

    // One-time expense writes go through plain fetch (not lib/api.ts), so they
    // miss its interceptor: nudge the Android widgets here instead.
    const otWrite = useCallback(async (url: string, init: RequestInit) => {
        const res = await fetch(url, init);
        if (res.ok && isTransactionWrite(init.method, url)) refreshWidgets();
        return res;
    }, []);

    const otFetchAll = useCallback(async () => {
        try {
            const [eRes, aRes, cRes] = await Promise.all([
                fetch(`${OT_API}/api/one-time-expenses`, { headers: otGetHeaders() }),
                fetch(`${OT_API}/api/accounts`,          { headers: otGetHeaders() }),
                fetch(`${OT_API}/api/credit-cards`,      { headers: otGetHeaders() }),
            ]);
            const [eData, aData, cData] = await Promise.all([eRes.json(), aRes.json(), cRes.json()]);
            setOtExpenses(eData.expenses || []);
            setOtAccounts(aData.accounts  || []);
            setOtCards(cData.cards || []);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load one-time expenses. Try again.');
        }
    }, [otGetHeaders]);

    useEffect(() => {
        if (user && tab === 'one-time' && !otFetched) {
            setOtFetched(true);
            otFetchAll().finally(() => setOtLoading(false));
        }
    }, [user, tab, otFetched, otFetchAll]);

    const otOpenAddExpense = () => {
        setOtEditingExp(null);
        setOtExpForm(otEmptyExpenseForm());
        setOtShowModal(true);
    };

    const otOpenEditExpense = (exp: OtExpense) => {
        setOtEditingExp(exp);
        setOtExpForm({
            title:          exp.title,
            category:       exp.category,
            start_date:     exp.start_date || '',
            end_date:       exp.end_date   || '',
            bank_account_id: exp.bank_account_id ? String(exp.bank_account_id) : '',
            notes:          exp.notes || '',
        });
        setOtShowModal(true);
    };

    const otCloseItemForm = () => {
        setOtAddingItemFor(null);
        setOtEditingItem(null);
        setOtItemForm(otEmptyItemForm());
    };

    const otHandleSaveExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!otExpForm.title) return;
        setOtSavingExp(true);
        try {
            const body = {
                title:          otExpForm.title,
                category:       otExpForm.category,
                start_date:     otExpForm.start_date  || null,
                end_date:       otExpForm.end_date    || null,
                bank_account_id: otExpForm.bank_account_id ? parseInt(otExpForm.bank_account_id, 10) : null,
                notes:          otExpForm.notes || null,
            };

            if (otEditingExp) {
                const res  = await otWrite(`${OT_API}/api/one-time-expenses/${otEditingExp.id}`, {
                    method: 'PUT', headers: otGetHeaders(), body: JSON.stringify(body),
                });
                const data = await res.json();
                setOtExpenses(prev => prev.map(ex => ex.id === otEditingExp.id ? { ...ex, ...data.expense } : ex));
                toast.success('Expense updated');
            } else {
                const res  = await otWrite(`${OT_API}/api/one-time-expenses`, {
                    method: 'POST', headers: otGetHeaders(), body: JSON.stringify(body),
                });
                const data = await res.json();
                const newExp: OtExpense = { ...data.expense, items: [], total_amount: 0, item_count: 0 };
                setOtExpenses(prev => [newExp, ...prev]);
                setOtExpandedId(newExp.id);
                setOtEditingItem(null);
                setOtItemForm(otEmptyItemForm());
                setOtAddingItemFor(newExp.id);
                toast.success('Expense created. Add its first item.');
            }
            setOtShowModal(false);
            setOtEditingExp(null);
        } catch (err) {
            console.error(err);
            toast.error('Failed to save expense. Try again.');
        } finally {
            setOtSavingExp(false);
        }
    };

    // The DELETE itself. Throws on failure so the deferred caller can un-hide the entry.
    const otHandleDeleteExpense = async (exp: OtExpense) => {
        const res = await otWrite(`${OT_API}/api/one-time-expenses/${exp.id}`, {
            method: 'DELETE', headers: otGetHeaders(),
        });
        if (!res.ok) throw new Error(`Delete failed (${res.status})`);
        setOtExpenses(prev => prev.filter(e => e.id !== exp.id));
        setOtExpandedId(cur => (cur === exp.id ? null : cur));
        setOtAddingItemFor(cur => (cur === exp.id ? null : cur));
    };

    // Hide the entry at once, delete for real after the undo window (same
    // pattern as handleSplitDelete).
    const otDeleteExpense = (exp: OtExpense) => {
        const total = Number(exp.total_amount) || 0;
        const unhide = () => setOtPendingDeleteExp(prev => { const s = new Set(prev); s.delete(exp.id); return s; });
        setOtPendingDeleteExp(prev => new Set([...prev, exp.id]));
        setOtConfirmDeleteExp(null);

        let cancelled = false;
        toast.undo('Expense deleted', () => {
            cancelled = true;
            unhide();
        });

        setTimeout(async () => {
            if (cancelled) return;
            try {
                await otHandleDeleteExpense(exp);
                unhide();
                if (total > 0 && exp.bank_account_name) toast.success(`${otFmt(total)} restored to ${exp.bank_account_name}`);
            } catch (err) {
                console.error(err);
                unhide();
                toast.error('Failed to delete expense. Try again.');
            }
        }, 4000);
    };

    const otHandleAddItem = async (expenseId: string) => {
        if (!otItemForm.description || !otItemForm.amount || !otItemForm.date) return;
        setOtAddingItem(true);
        try {
            const res  = await otWrite(`${OT_API}/api/one-time-expenses/${expenseId}/items`, {
                method: 'POST',
                headers: otGetHeaders(),
                body: JSON.stringify({
                    description:    otItemForm.description,
                    amount:         parseFloat(otItemForm.amount),
                    date:           otItemForm.date,
                    payment_method: otItemForm.payment_method,
                    category:       otItemForm.category,
                    notes:          otItemForm.notes || null,
                    credit_card_id: otItemForm.payment_method === 'Credit Card' ? otItemForm.credit_card_id : null,
                }),
            });
            const data = await res.json();
            setOtExpenses(prev => prev.map(ex => {
                if (ex.id !== expenseId) return ex;
                const newItems = [...ex.items, data.item];
                return { ...ex, items: newItems, total_amount: newItems.reduce((s, i) => s + Number(i.amount), 0), item_count: newItems.length };
            }));
            setOtItemForm(otEmptyItemForm());
        } catch (err) {
            console.error(err);
            toast.error('Failed to add item. Try again.');
        } finally {
            setOtAddingItem(false);
        }
    };

    const otOpenEditItem = (expenseId: string, item: OtExpenseItem) => {
        setOtEditingItem({ expenseId, item });
        setOtConfirmDeleteItem(null);
        setOtItemForm({
            description:    item.description,
            amount:         String(item.amount),
            date:           (item.date || '').split('T')[0],
            payment_method: item.payment_method || 'Cash',
            category:       item.category || 'Other',
            notes:          item.notes || '',
            credit_card_id: item.credit_card_id ?? null,
        });
        setOtAddingItemFor(expenseId);
    };

    const otHandleUpdateItem = async (expenseId: string, itemId: string) => {
        if (!otItemForm.description || !otItemForm.amount || !otItemForm.date) return;
        setOtAddingItem(true);
        try {
            const res = await otWrite(`${OT_API}/api/one-time-expenses/${expenseId}/items/${itemId}`, {
                method: 'PUT',
                headers: otGetHeaders(),
                body: JSON.stringify({
                    description:    otItemForm.description,
                    amount:         parseFloat(otItemForm.amount),
                    date:           otItemForm.date,
                    payment_method: otItemForm.payment_method,
                    category:       otItemForm.category,
                    notes:          otItemForm.notes || null,
                    credit_card_id: otItemForm.payment_method === 'Credit Card' ? otItemForm.credit_card_id : null,
                }),
            });
            const data = await res.json();
            setOtExpenses(prev => prev.map(ex => {
                if (ex.id !== expenseId) return ex;
                const newItems = ex.items.map(i => i.id === itemId ? data.item : i);
                return { ...ex, items: newItems, total_amount: newItems.reduce((s, i) => s + Number(i.amount), 0) };
            }));
            otCloseItemForm();
        } catch (err) {
            console.error(err);
            toast.error('Failed to update item. Try again.');
        } finally {
            setOtAddingItem(false);
        }
    };

    // The DELETE itself. Throws on failure so the deferred caller can un-hide the item.
    const otHandleDeleteItem = async (expenseId: string, itemId: string) => {
        const res = await otWrite(`${OT_API}/api/one-time-expenses/${expenseId}/items/${itemId}`, {
            method: 'DELETE', headers: otGetHeaders(),
        });
        if (!res.ok) throw new Error(`Delete failed (${res.status})`);
        setOtExpenses(prev => prev.map(ex => {
            if (ex.id !== expenseId) return ex;
            const newItems = ex.items.filter(i => i.id !== itemId);
            return { ...ex, items: newItems, total_amount: newItems.reduce((s, i) => s + Number(i.amount), 0), item_count: newItems.length };
        }));
    };

    const otDeleteItem = (expenseId: string, itemId: string) => {
        const unhide = () => setOtPendingDeleteItems(prev => { const s = new Set(prev); s.delete(itemId); return s; });
        setOtPendingDeleteItems(prev => new Set([...prev, itemId]));
        setOtConfirmDeleteItem(null);
        if (otEditingItem?.item.id === itemId) otCloseItemForm();

        let cancelled = false;
        toast.undo('Item deleted', () => {
            cancelled = true;
            unhide();
        });

        setTimeout(async () => {
            if (cancelled) return;
            try {
                await otHandleDeleteItem(expenseId, itemId);
                unhide();
            } catch (err) {
                console.error(err);
                unhide();
                toast.error('Failed to delete item. Try again.');
            }
        }, 4000);
    };

    // What the tab shows: entries and items still waiting out their undo window
    // are hidden, and an entry's total follows the items that remain.
    const otVisible: OtExpense[] = otExpenses
        .filter(e => !otPendingDeleteExp.has(e.id))
        .map(e => {
            if (!e.items.some(i => otPendingDeleteItems.has(i.id))) return e;
            const items = e.items.filter(i => !otPendingDeleteItems.has(i.id));
            return { ...e, items, item_count: items.length, total_amount: items.reduce((s, i) => s + Number(i.amount), 0) };
        });
    const otGroups = groupByYear(otVisible, currentYear);
    const otSum = oneTimeSummary(otVisible, currentYear);
    const otCats = byCategory(otVisible.filter(e => entryYear(e, currentYear) === currentYear));

    const otInset: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px var(--space-3)', padding: '6px var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)' };

    // The add / edit item form, an inset panel under the entry's actions.
    const renderOtItemForm = (exp: OtExpense) => {
        const id = (name: string) => `ot-item-${name}-${exp.id}`;
        const canSave = !!otItemForm.description && !!otItemForm.amount;
        const submit = (e: React.FormEvent) => {
            e.preventDefault();
            if (!canSave) return;
            if (otEditingItem) otHandleUpdateItem(exp.id, otEditingItem.item.id);
            else otHandleAddItem(exp.id);
        };
        return (
            <div style={{ background: 'var(--glass-fill-1)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
                <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label htmlFor={id('desc')} style={labelSt}>What did you spend on?</label>
                        <input id={id('desc')} type="text" autoFocus placeholder="Dinner, auto ride, entry ticket" style={inputSt}
                            value={otItemForm.description} onChange={e => setOtItemForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div>
                        <label htmlFor={id('amount')} style={labelSt}>Amount</label>
                        <div style={{ position: 'relative' }}>
                            <span aria-hidden="true" style={{ ...type.num, color: 'var(--text-secondary)', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>₹</span>
                            <input id={id('amount')} type="number" min="0" step="1" placeholder="0" style={{ ...inputSt, ...type.num, paddingLeft: 30 }}
                                value={otItemForm.amount} onChange={e => setOtItemForm(f => ({ ...f, amount: e.target.value }))} />
                        </div>
                    </div>
                    <DatePicker label="Date" value={otItemForm.date} onChange={date => setOtItemForm(f => ({ ...f, date }))} />
                    <div>
                        <label style={labelSt}>Category</label>
                        <CategoryField
                            valueKey="name"
                            value={otItemForm.category}
                            onChange={v => setOtItemForm(f => ({ ...f, category: v }))}
                            categories={categories.length > 0 ? categories : OT_FALLBACK_CATEGORIES}
                        />
                    </div>
                    <div>
                        <label htmlFor={id('pay')} style={labelSt}>Paid with</label>
                        <select id={id('pay')} style={inputSt} value={otItemForm.payment_method}
                            onChange={e => setOtItemForm(f => ({
                                ...f,
                                payment_method: e.target.value,
                                credit_card_id: e.target.value === 'Credit Card' ? (otCards.length === 1 ? otCards[0].id : f.credit_card_id) : null,
                            }))}>
                            {OT_PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    {otItemForm.payment_method === 'Credit Card' && otCards.length > 1 && (
                        <div>
                            <label htmlFor={id('card')} style={labelSt}>Which card?</label>
                            <select id={id('card')} style={inputSt} value={otItemForm.credit_card_id ?? ''}
                                onChange={e => setOtItemForm(f => ({ ...f, credit_card_id: e.target.value ? Number(e.target.value) : null }))}>
                                <option value="">Select card</option>
                                {otCards.map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.bank_name} {c.card_name}{c.last_four ? ` ••${c.last_four}` : ''}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label htmlFor={id('notes')} style={labelSt}>Note</label>
                        <input id={id('notes')} type="text" placeholder="Optional" style={inputSt}
                            value={otItemForm.notes} onChange={e => setOtItemForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <Button type="submit" size="sm" isLoading={otAddingItem} disabled={!canSave}>{otEditingItem ? 'Save item' : 'Add item'}</Button>
                        <TextAction quiet onClick={otCloseItemForm}>Cancel</TextAction>
                        {otEditingItem && (
                            <span style={{ marginLeft: 'auto' }}>
                                <TextAction tone="danger" onClick={() => otDeleteItem(exp.id, otEditingItem.item.id)}>Delete item</TextAction>
                            </span>
                        )}
                    </div>
                </form>
            </div>
        );
    };

    // One item: tap to edit, the trash icon asks first.
    const renderOtItem = (exp: OtExpense, item: OtExpenseItem) => {
        const confirming = otConfirmDeleteItem === item.id;
        const edit = () => otOpenEditItem(exp.id, item);
        const meta = [item.category && item.category !== 'Other' ? item.category : null, item.payment_method].filter(Boolean).join(' · ');
        return (
            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '8px 0' }}>
                    <div role="button" tabIndex={0} className="pressable" onClick={edit}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(); } }}
                        style={{ flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: 'var(--radius-md)' }}>
                        <p style={{ ...type.body, color: 'var(--text-primary)', ...truncate, margin: 0 }}>{item.description}</p>
                        {meta && <p style={{ ...type.meta, ...truncate, margin: 0 }}>{meta}</p>}
                    </div>
                    <span style={{ ...type.num, flexShrink: 0 }}>{otFmt(Number(item.amount) || 0)}</span>
                    <button type="button" className="fin-icon-btn fin-row-hover-action" aria-label={`Delete ${item.description}`}
                        onClick={() => setOtConfirmDeleteItem(item.id)}>
                        <Trash2 size={14} />
                    </button>
                </div>
                {confirming && (
                    <div style={otInset}>
                        <span style={{ ...type.meta, flex: '1 1 160px', color: 'var(--text-primary)' }}>Delete {item.description}?</span>
                        <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                            <TextAction tone="danger" onClick={() => otDeleteItem(exp.id, item.id)}>Delete item</TextAction>
                            <TextAction quiet onClick={() => setOtConfirmDeleteItem(null)}>Keep it</TextAction>
                        </span>
                    </div>
                )}
            </div>
        );
    };

    // One entry as a row: the top line opens it; the days and items sit underneath.
    const renderOtEntry = (exp: OtExpense) => {
        const expanded   = otExpandedId === exp.id;
        const formOpen   = otAddingItemFor === exp.id;
        const confirming = otConfirmDeleteExp === exp.id;
        const total      = Number(exp.total_amount) || 0;
        const count      = exp.items.length;
        const meta = [
            exp.category,
            dateRangeLabel(exp.start_date, exp.end_date, currentYear),
            exp.bank_account_name ? `from ${exp.bank_account_name}` : null,
        ].filter(Boolean).join(' · ');
        const toggle = () => {
            otCloseItemForm();
            setOtConfirmDeleteExp(null);
            setOtConfirmDeleteItem(null);
            setOtExpandedId(expanded ? null : exp.id);
        };
        const openNewItem = () => {
            if (formOpen && !otEditingItem) return;
            setOtEditingItem(null);
            setOtItemForm(otEmptyItemForm());
            setOtAddingItemFor(exp.id);
        };
        const days = itemsByDay(exp.items, currentYear);

        return (
            <div key={exp.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                <div role="button" tabIndex={0} aria-expanded={expanded} className="pressable" onClick={toggle}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0, cursor: 'pointer', borderRadius: 'var(--radius-md)' }}>
                    <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {OT_CATEGORY_EMOJI[exp.category] || '🧾'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{exp.title}</p>
                        <p style={{ ...type.meta, ...truncate, margin: 0 }}>{meta}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ ...type.num, margin: 0 }}>{otFmt(total)}</p>
                        <p style={{ ...type.meta, margin: 0 }}>{count} {count === 1 ? 'item' : 'items'}</p>
                    </div>
                </div>

                {expanded && (
                    <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <Button size="sm" onClick={openNewItem}>Add item</Button>
                            <div style={{ flex: 1 }} />
                            <TextAction quiet onClick={() => otOpenEditExpense(exp)}>Edit details</TextAction>
                            <TextAction tone="danger" onClick={() => setOtConfirmDeleteExp(exp.id)}>Delete entry</TextAction>
                        </div>

                        {confirming && (
                            <div style={otInset}>
                                <span style={{ ...type.meta, flex: '1 1 160px', color: 'var(--text-primary)' }}>
                                    Delete {exp.title}?{total > 0 && exp.bank_account_name ? ` ${otFmt(total)} goes back to ${exp.bank_account_name}.` : ''}
                                </span>
                                <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                                    <TextAction tone="danger" onClick={() => otDeleteExpense(exp)}>Delete entry</TextAction>
                                    <TextAction quiet onClick={() => setOtConfirmDeleteExp(null)}>Keep it</TextAction>
                                </span>
                            </div>
                        )}

                        {formOpen && renderOtItemForm(exp)}

                        {days.length === 0 ? (
                            <p style={{ ...type.meta, margin: 0 }}>No items yet. Add the first one above.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {days.map((day, idx) => (
                                    <div key={day.date || 'no-date'} style={{ display: 'flex', flexDirection: 'column', gap: 4, ...(idx > 0 ? { borderTop: '1px solid var(--glass-border)', paddingTop: 10 } : {}) }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                                            <span style={type.label}>{day.label}</span>
                                            <span style={type.numSmall}>{otFmt(day.total)}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 'var(--space-3)', borderLeft: '1px solid var(--glass-border)' }}>
                                            {day.items.map(item => renderOtItem(exp, item))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    // ════════════════════════════════════════════════════════════════════════
    // ── LOADING SKELETON (auth gate) ──
    // ════════════════════════════════════════════════════════════════════════
    if (isLoading || !user) return (
        <>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <SkeletonCard height={64} />
                <SkeletonCard height={64} />
            </div>
            <SkeletonCard height={70} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={110} />)}
            </div>
        </>
    );

    return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── PAGE HEADER: title, then the page's actions ── */}
                <div className="fin-page-head">
                    <div style={{ minWidth: 0 }}>
                        <p style={{ ...type.meta, margin: 0 }}>
                            {tab === 'budgets'
                                ? `${MONTH_NAMES[currentMonth]} ${currentYear} · ${budgets.length} ${budgets.length === 1 ? 'category' : 'categories'}`
                                : tab === 'recurring'
                                    ? (visibleRecurring.length > 0
                                        ? `${activeCount} active schedule${activeCount !== 1 ? 's' : ''}${pausedCount > 0 ? ` · ${pausedCount} paused` : ''}`
                                        : !recurringLoading ? 'Automate your regular income and expenses' : 'Monthly limits, recurring bills, shared expenses and one-off spends')
                                    : tab === 'splits'
                                        ? (visibleSplits.length > 0
                                            ? `${splitSum.openCount} open split${splitSum.openCount !== 1 ? 's' : ''}${splitSum.settledCount > 0 ? ` · ${splitSum.settledCount} settled` : ''}`
                                            : !splitsLoading ? 'Track shared expenses and who owes you' : 'Monthly limits, recurring bills, shared expenses and one-off spends')
                                        : tab === 'one-time'
                                            ? 'Trips, events and big purchases, kept out of your monthly budgets'
                                            : 'Monthly limits, recurring bills, shared expenses and one-off spends'}
                        </p>
                        <h1 style={{ ...type.heading, margin: 0 }}>Budgets</h1>
                    </div>
                    {tab === 'budgets' && (
                        <div className="fin-page-actions">
                            {!budgetsLoading && copyableCount > 0 && (
                                <Button variant="secondary" onClick={handleCopyFromLastMonth} disabled={copying}>
                                    {copying ? 'Copying…' : `Copy ${copyableCount} from last month`}
                                </Button>
                            )}
                            <Button onClick={openAdd}>Add budget</Button>
                        </div>
                    )}
                    {tab === 'recurring' && (
                        <div className="fin-page-actions">
                            <Button variant="secondary" onClick={handleProcessRecurring} isLoading={processingRecurring}>Process due now</Button>
                            <Button onClick={openRecAdd}>Add recurring</Button>
                        </div>
                    )}
                    {tab === 'splits' && (
                        <div className="fin-page-actions">
                            <Button onClick={openSplitAdd}>Add split</Button>
                        </div>
                    )}
                    {tab === 'one-time' && (
                        <div className="fin-page-actions">
                            <Button onClick={otOpenAddExpense}>New expense</Button>
                        </div>
                    )}
                </div>

                <Tabs tabs={TABS} active={tab} onChange={setTab} />

                {/* ══════════════════════════════════════════════════════════ */}
                {/* ══ BUDGETS TAB ══ */}
                {/* ══════════════════════════════════════════════════════════ */}
                {tab === 'budgets' && (
                    <>
                        {budgetsLoading ? (
                            <>
                                <SkeletonCard height={190} />
                                <div className="fin-two">
                                    <SkeletonCard height={260} />
                                    <SkeletonCard height={260} />
                                </div>
                            </>
                        ) : budgets.length === 0 ? (
                            <EmptyState
                                icon={Target}
                                title="No budgets set"
                                subtitle="Set monthly limits to stay on track"
                                action={<Button onClick={openAdd}>Set your first budget</Button>}
                            />
                        ) : (
                            <>
                                {/* ── THE MONTH: every total in one card ── */}
                                <Card>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                                        <p style={{ ...type.label, margin: 0 }}>Spent of {fmt(totalBudgeted)} budgeted</p>
                                        <Switch checked={zeroBasedMode} onChange={setZeroBasedMode} label="Zero-based" labelSide="left" />
                                    </div>
                                    <p className="type-display" style={{ ...type.display, margin: '6px 0 14px', color: isOverTotal ? 'var(--color-exp-text)' : 'var(--text-primary)' }}>
                                        {fmt(totalSpent)}
                                    </p>
                                    <ProgressBar pct={overallRawPct} height={6} color={overallRawPct >= 85 ? 'var(--color-warn)' : 'var(--text-secondary)'} />
                                    <div className="dash-stats">
                                        {isOverTotal
                                            ? <Stat className="dash-stat" label="Over" value={fmt(totalSpent - totalBudgeted)} sub="Above the total budget" subTone="bad" />
                                            : <Stat className="dash-stat" label="Left" value={fmt(totalRemaining)} sub="Across all categories" />}
                                        <Stat className="dash-stat" label="Used" value={`${Math.round(overallRawPct)}%`} sub={`Day ${dayOfMonth} of ${daysInMonth}`} />
                                        <Stat className="dash-stat" label="Needs attention" value={`${attentionBudgets.length}`}
                                            sub={attentionBudgets.length === 0 ? 'Nothing to fix'
                                                : [overCount > 0 && `${overCount} over`, runningOutCount > 0 && `${runningOutCount} running out early`].filter(Boolean).join(', ')}
                                            subTone={overCount > 0 ? 'bad' : runningOutCount > 0 ? 'caution' : 'neutral'} />
                                        {zeroBasedMode && monthlyIncome > 0 ? (
                                            unallocated >= 0
                                                ? <Stat className="dash-stat" label="Unallocated income" value={fmt(unallocated)}
                                                    sub={unallocated > 0 ? <TextAction onClick={openAdd}>Allocate it</TextAction> : `All of ${fmt(monthlyIncome)} has a job`} />
                                                : <Stat className="dash-stat" label="Over-allocated" value={fmt(-unallocated)} sub={`More than ${fmt(monthlyIncome)} income`} subTone="bad" />
                                        ) : (
                                            <Stat className="dash-stat" label="On track" value={`${onTrackBudgets.length}`}
                                                sub={zeroBasedMode ? 'No income recorded this month' : `of ${visibleBudgets.length} ${visibleBudgets.length === 1 ? 'category' : 'categories'}`} />
                                        )}
                                    </div>
                                    {goalSurplusNudge && (
                                        <Rows style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--glass-border)' }}>
                                            <NoticeRow tone="good"
                                                title={`${fmt(goalSurplusNudge.surplusTotal)} unspent with ${goalSurplusNudge.daysLeft === 0 ? 'the month ending today' : `${goalSurplusNudge.daysLeft} day${goalSurplusNudge.daysLeft !== 1 ? 's' : ''} left`}`}
                                                sub="Consider putting it toward your goals">
                                                <TextAction onClick={() => router.push('/goals')}>View goals</TextAction>
                                            </NoticeRow>
                                        </Rows>
                                    )}
                                </Card>

                                {/* ── CATEGORIES, grouped by state: what needs you first ── */}
                                <div className={attentionBudgets.length > 0 && onTrackBudgets.length > 0 ? 'fin-two' : undefined}>
                                    {attentionBudgets.length > 0 && (
                                        <Card>
                                            <CardHeader title="Needs attention" sub="Over the limit, or on pace to run out before month end" />
                                            <Rows>{attentionBudgets.map(renderBudgetRow)}</Rows>
                                        </Card>
                                    )}
                                    {onTrackBudgets.length > 0 && (
                                        <Card>
                                            <CardHeader title="On track" sub="Inside the limit at the current pace" />
                                            <Rows>{onTrackBudgets.map(renderBudgetRow)}</Rows>
                                        </Card>
                                    )}
                                </div>
                            </>
                        )}

                        {/* ── ADD BUDGET MODAL ── */}
                        <Modal isOpen={showForm} onClose={() => { setShowForm(false); setFormError(''); }} title={`Set Budget — ${MONTH_NAMES[currentMonth]}`} maxWidth="440px"
                            footer={
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    <button type="button" onClick={() => { setShowForm(false); setFormError(''); }} className="glass-field" style={{ padding: 10, border: 'none', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                    <button type="submit" form="add-budget-form" disabled={formLoading || !formCategory || !formAmount} style={{ padding: 10, background: formLoading || !formCategory || !formAmount ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: formLoading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                                        {formLoading ? 'Saving…' : 'Set Budget'}
                                    </button>
                                </div>
                            }
                        >
                            <form id="add-budget-form" onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div>
                                    <label style={labelSt}>Category</label>
                                    <CategoryField
                                        value={formCategory}
                                        onChange={v => setFormCategory(v)}
                                        categories={categories}
                                        placeholder="Select a category"
                                        exclude={c => !!budgets.find(b => b.category_id === c.id)}
                                    />
                                </div>
                                <div>
                                    <label style={labelSt}>Monthly Limit *</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 16 }}>₹</span>
                                        <input type="number" placeholder="5000" min="1" value={formAmount} onChange={e => setFormAmount(e.target.value)} style={{ ...inputSt, paddingLeft: 32, fontFamily: 'var(--font-mono)', fontSize: 15, fontVariantNumeric: 'tabular-nums' }} />
                                    </div>
                                </div>
                                {formError && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{formError}</p>}
                            </form>
                        </Modal>
                    </>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* ══ RECURRING TAB ══ */}
                {/* ══════════════════════════════════════════════════════════ */}
                {tab === 'recurring' && (
                    <>
                        {recurringLoading ? (
                            <>
                                <SkeletonCard height={150} />
                                <div className="fin-two">
                                    <SkeletonCard height={220} />
                                    <SkeletonCard height={220} />
                                </div>
                            </>
                        ) : visibleRecurring.length === 0 ? (
                            <EmptyState
                                icon={RefreshCw}
                                title="No recurring transactions"
                                subtitle="Schedule bills, subscriptions and EMIs to track them automatically"
                                action={<Button onClick={openRecAdd}>Add your first one</Button>}
                            />
                        ) : (
                            <>
                                {/* ── THE MONTH: what the schedules add up to ── */}
                                <Card>
                                    <p style={{ ...type.label, margin: 0 }}>Scheduled to go out each month</p>
                                    <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{fmt(recSummary.outMonthly)}</p>
                                    <div className="dash-stats">
                                        <Stat className="dash-stat" label="Scheduled in" value={fmt(recSummary.inMonthly)}
                                            sub={`${recSummary.inCount} ${recSummary.inCount === 1 ? 'schedule' : 'schedules'}`} />
                                        {recSummary.left >= 0
                                            ? <Stat className="dash-stat" label="Left after schedules" value={fmt(recSummary.left)} sub="Each month" />
                                            : <Stat className="dash-stat" label="Short each month" value={fmt(-recSummary.left)} sub="Schedules exceed scheduled income" subTone="bad" />}
                                        <Stat className="dash-stat" label="Due in 7 days" value={fmt(recSummary.dueSoonTotal)}
                                            sub={recSummary.dueSoonCount > 0 ? `${recSummary.dueSoonCount} ${recSummary.dueSoonCount === 1 ? 'payment' : 'payments'}` : 'Nothing due'} />
                                        <Stat className="dash-stat" label="Next" value={recSummary.next ? recSummary.next.label : '—'}
                                            sub={recSummary.next ? recSummary.next.description : 'No upcoming schedule'} />
                                    </div>
                                </Card>

                                {/* ── SCHEDULES, grouped by when they are due ── */}
                                {(recGroups.dueSoon.length > 0 || recGroups.later.length > 0) && (
                                    <div className={recGroups.dueSoon.length > 0 && recGroups.later.length > 0 ? 'fin-two' : undefined}>
                                        {recGroups.dueSoon.length > 0 && (
                                            <Card>
                                                <CardHeader title="Due in the next 7 days" sub="Soonest first" />
                                                <Rows>{recGroups.dueSoon.map(renderRecRow)}</Rows>
                                            </Card>
                                        )}
                                        {recGroups.later.length > 0 && (
                                            <Card>
                                                <CardHeader title="Later" sub="Nothing to do yet" />
                                                <Rows>{recGroups.later.map(renderRecRow)}</Rows>
                                            </Card>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* ── FOUND + PAUSED ── */}
                        {!recurringLoading && ((patternsLoading || visiblePatterns.length > 0) || (visibleRecurring.length > 0 && recGroups.paused.length > 0)) && (
                            <div className={(patternsLoading || visiblePatterns.length > 0) && recGroups.paused.length > 0 ? 'fin-two' : undefined}>
                                {(patternsLoading || visiblePatterns.length > 0) && (
                                    <Card>
                                        <CardHeader title="Found in your transactions" sub="Payments that repeat but have no schedule yet" />
                                        {patternsLoading ? (
                                            <p style={{ ...type.body, margin: 0 }}>Scanning your transactions for repeats…</p>
                                        ) : (
                                            <Rows>
                                                {visiblePatterns.map(p => {
                                                    const realIdx = patterns.indexOf(p);
                                                    return (
                                                        <div key={realIdx}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{p.merchant || p.description}</p>
                                                                <p style={{ ...type.numSmall, ...truncate, margin: 0 }}>
                                                                    {fmt(p.amount)} · {p.frequency}{p.confidence ? ` · ${p.confidence} confidence` : ''}
                                                                </p>
                                                            </div>
                                                            <span style={{ display: 'flex', gap: 'var(--space-3)', flexShrink: 0 }}>
                                                                <TextAction onClick={() => handleAddPattern(p, realIdx)} disabled={addingPattern === realIdx}>
                                                                    {addingPattern === realIdx ? 'Adding…' : 'Add schedule'}
                                                                </TextAction>
                                                                <TextAction quiet onClick={() => setDismissedPatterns(prev => new Set([...prev, realIdx]))}>Dismiss</TextAction>
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </Rows>
                                        )}
                                    </Card>
                                )}
                                {recGroups.paused.length > 0 && (
                                    <Card>
                                        <CardHeader title="Paused" sub="Not posting until resumed" />
                                        <Rows>{recGroups.paused.map(renderRecRow)}</Rows>
                                    </Card>
                                )}
                            </div>
                        )}

                        {/* ── ADD RECURRING MODAL ── */}
                        <Modal isOpen={showRecForm} onClose={() => { setShowRecForm(false); setRecFormError(''); }} title="New recurring transaction" maxWidth="440px"
                            footer={
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    <Button type="button" variant="secondary" onClick={() => { setShowRecForm(false); setRecFormError(''); }}>Cancel</Button>
                                    <Button type="submit" form="add-recurring-form" isLoading={recFormLoading}>Add recurring</Button>
                                </div>
                            }
                        >
                            <form id="add-recurring-form" onSubmit={handleRecSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div>
                                    <label style={labelSt}>Type</label>
                                    <TypeToggle value={recForm.type} onChange={t => setRecForm({ ...recForm, type: t })} />
                                </div>
                                <Input label="Amount (₹)" type="number" placeholder="5000" min="1" value={recForm.amount} onChange={e => setRecForm({ ...recForm, amount: e.target.value })} required />
                                <Input label="Description" type="text" placeholder="Monthly salary" value={recForm.description} onChange={e => setRecForm({ ...recForm, description: e.target.value })} required />
                                <div>
                                    <label htmlFor="rec-add-freq" style={labelSt}>Repeats</label>
                                    <select id="rec-add-freq" value={recForm.frequency} onChange={e => setRecForm({ ...recForm, frequency: e.target.value })} style={inputSt}>
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                </div>
                                {recForm.frequency === 'monthly' && <Input label="Day of month" type="number" placeholder="1" min="1" max="31" value={recForm.day_of_month} onChange={e => setRecForm({ ...recForm, day_of_month: e.target.value })} />}
                                <div>
                                    <label style={labelSt}>Category</label>
                                    <CategoryField value={recForm.category_id} onChange={v => setRecForm({ ...recForm, category_id: v })} categories={categories} placeholder="Select category" />
                                </div>
                                {recFormError && <p role="alert" style={{ ...type.meta, margin: 0, color: 'var(--color-exp-text)' }}>{recFormError}</p>}
                            </form>
                        </Modal>
                    </>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* ══ SPLITS TAB ══ */}
                {/* ══════════════════════════════════════════════════════════ */}
                {tab === 'splits' && (
                    <>
                        {/* ── DESCRIBE IT: type a sentence, review the filled-in form ── */}
                        {!splitsLoading && (
                            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                <input type="text" aria-label="Describe a split" placeholder="Or describe it: Dinner ₹2400 split 4 ways with Raj, Priya, Sam"
                                    value={nlInput} onChange={e => setNlInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleNlParse(); } }}
                                    style={{ ...inputSt, flex: 1, minWidth: 0, height: 40 }} />
                                <Button variant="secondary" onClick={handleNlParse} disabled={nlLoading || !nlInput.trim()}>
                                    {nlLoading ? 'Filling in…' : 'Fill in'}
                                </Button>
                            </div>
                        )}

                        {splitsLoading ? (
                            <>
                                <SkeletonCard height={150} />
                                <div className="fin-two">
                                    <SkeletonCard height={220} />
                                    <SkeletonCard height={220} />
                                </div>
                            </>
                        ) : visibleSplits.length === 0 ? (
                            <EmptyState
                                icon={Receipt}
                                title="No splits yet"
                                subtitle="Add a split to track shared expenses and who owes you"
                                action={<Button onClick={openSplitAdd}>Add first split</Button>}
                            />
                        ) : (
                            <>
                                {/* ── WHAT YOU ARE OWED ── */}
                                <Card>
                                    <p style={{ ...type.label, margin: 0 }}>Owed to you</p>
                                    <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{fmt(splitSum.owed)}</p>
                                    <div className="dash-stats">
                                        <Stat className="dash-stat" label="From" value={splitSum.people} sub={splitSum.people === 1 ? 'person' : 'people'} />
                                        <Stat className="dash-stat" label="Open splits" value={splitSum.openCount}
                                            sub={oldestOpenLabel ? `Oldest from ${oldestOpenLabel}` : 'None open'} />
                                        <Stat className="dash-stat" label="Collected" value={fmt(splitSum.collected)} sub="Marked settled" />
                                        <Stat className="dash-stat" label="Your share" value={fmt(splitSum.yourShareOpen)} sub="Of open splits" />
                                    </div>
                                </Card>

                                {/* ── THE SPLITS, and who owes you ── */}
                                {(() => {
                                    const hasLeft = splitGroups.open.length > 0;
                                    const hasRight = splitDebtors.length > 0 || splitGroups.settled.length > 0;
                                    const left = hasLeft && (
                                        <Card>
                                            <CardHeader title="Waiting on people" sub="Newest first" />
                                            <Rows>{splitGroups.open.map(renderOpenSplit)}</Rows>
                                        </Card>
                                    );
                                    const right = hasRight && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
                                            {splitDebtors.length > 0 && (
                                                <Card>
                                                    <CardHeader title="Who owes you" sub="Across all open splits" />
                                                    <Rows>
                                                        {splitDebtors.map(d => (
                                                            <div key={d.name.toLowerCase()}>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{d.name}</p>
                                                                    <p style={{ ...type.meta, ...truncate, margin: 0 }}>{d.count} {d.count === 1 ? 'split' : 'splits'}</p>
                                                                </div>
                                                                <p style={{ ...type.num, margin: 0, flexShrink: 0 }}>{fmt(d.amount)}</p>
                                                            </div>
                                                        ))}
                                                    </Rows>
                                                </Card>
                                            )}
                                            {splitGroups.settled.length > 0 && (
                                                <Card>
                                                    <CardHeader title="Settled" sub="Everyone has paid" />
                                                    <Rows>{splitGroups.settled.map(renderSettledSplit)}</Rows>
                                                </Card>
                                            )}
                                        </div>
                                    );
                                    return (
                                        <div className={hasLeft && hasRight ? 'fin-two' : undefined}>
                                            {left}
                                            {right}
                                        </div>
                                    );
                                })()}
                            </>
                        )}

                        {/* ── NEW/EDIT SPLIT DIALOG ── */}
                        {!splitsLoading && (
                            <Modal isOpen={showSplitModal} onClose={closeSplitModal} title={editingSplit ? 'Edit split' : 'New split'} maxWidth="500px"
                                footer={
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        <Button type="button" variant="secondary" onClick={closeSplitModal}>Cancel</Button>
                                        <Button type="submit" form="split-form" isLoading={splitFormLoading}>{editingSplit ? 'Save changes' : 'Create split'}</Button>
                                    </div>
                                }
                            >
                                <form id="split-form" onSubmit={handleSplitSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <div>
                                        <label htmlFor="split-description" style={labelSt}>Description</label>
                                        <input id="split-description" type="text" placeholder="e.g. Dinner at restaurant" value={splitForm.description} onChange={e => setSplitForm({ ...splitForm, description: e.target.value })} required style={inputSt} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div>
                                            <label htmlFor="split-total" style={labelSt}>Total amount</label>
                                            <div style={{ position: 'relative' }}>
                                                <span aria-hidden="true" style={{ ...type.num, color: 'var(--text-secondary)', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>₹</span>
                                                <input id="split-total" type="number" placeholder="2400" min="1" step="0.01" value={splitForm.total_amount} onChange={e => setSplitForm({ ...splitForm, total_amount: e.target.value })} required style={{ ...inputSt, ...type.num, paddingLeft: 30 }} />
                                            </div>
                                        </div>
                                        <DatePicker label="Date" value={splitForm.date} onChange={date => setSplitForm({ ...splitForm, date })} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ ...labelSt, marginBottom: 0 }}>People (not counting you)</span>
                                            <TextAction onClick={addParticipant}>Add person</TextAction>
                                        </div>
                                        {splitForm.participants.map((p, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <input type="text" aria-label={`Person ${i + 1} name`} placeholder={`Person ${i + 1} name`} value={p.name} onChange={e => updateParticipant(i, e.target.value)} style={{ ...inputSt, flex: 1, minWidth: 0 }} />
                                                {splitForm.participants.length > 1 && (
                                                    <button type="button" className="fin-icon-btn" onClick={() => removeParticipant(i)} aria-label={`Remove ${p.name || `person ${i + 1}`}`}><X size={14} /></button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {splitForm.total_amount && (
                                        <p style={{ ...type.meta, margin: 0 }}>
                                            Split {splitCount} ways, <span style={{ ...type.numSmall, color: 'var(--text-primary)' }}>{fmt(yourShare)}</span> each
                                        </p>
                                    )}
                                    {splitFormError && <p role="alert" style={{ ...type.meta, margin: 0, color: 'var(--color-exp-text)' }}>{splitFormError}</p>}
                                </form>
                                {editingSplit && (
                                    <div style={{ marginTop: 'var(--space-4)' }}>
                                        {splitModalConfirmDelete ? (
                                            <div style={splitInset}>
                                                <span style={{ ...type.meta, flex: '1 1 160px', color: 'var(--text-primary)' }}>Delete this split? Its linked transaction goes too.</span>
                                                <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                                                    <TextAction tone="danger" onClick={() => { const id = editingSplit.id; closeSplitModal(); handleSplitDelete(id); }}>Delete split</TextAction>
                                                    <TextAction quiet onClick={() => setSplitModalConfirmDelete(false)}>Keep it</TextAction>
                                                </span>
                                            </div>
                                        ) : (
                                            <TextAction tone="danger" onClick={() => setSplitModalConfirmDelete(true)}>Delete split</TextAction>
                                        )}
                                    </div>
                                )}
                            </Modal>
                        )}
                    </>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* ══ ONE-TIME EXPENSES TAB ══ */}
                {/* ══════════════════════════════════════════════════════════ */}
                {tab === 'one-time' && (
                    <>
                        {otLoading ? (
                            <>
                                <SkeletonCard height={150} />
                                <div className="dash-grid">
                                    <div className="dash-col"><SkeletonCard height={260} /></div>
                                    <div className="dash-col"><SkeletonCard height={180} /></div>
                                </div>
                            </>
                        ) : otVisible.length === 0 ? (
                            <EmptyState
                                icon={Calendar}
                                title="No one-time expenses yet"
                                subtitle="Log trips, events and big purchases here. Add items day by day and the total builds up."
                                action={<Button onClick={otOpenAddExpense}>New expense</Button>}
                            />
                        ) : (
                            <>
                                {/* ── THE YEAR: what one-time spending added up to ── */}
                                <Card>
                                    <p style={{ ...type.label, margin: 0 }}>Spent on one-time expenses in {currentYear}</p>
                                    <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{otFmt(otSum.yearTotal)}</p>
                                    <div className="dash-stats">
                                        <Stat className="dash-stat" label="Entries" value={otSum.yearCount} sub="This year" />
                                        <Stat className="dash-stat" label="Biggest" value={otSum.biggest ? otFmt(otSum.biggest.amount) : '—'}
                                            sub={otSum.biggest ? otSum.biggest.title : 'Nothing this year'} />
                                        <Stat className="dash-stat" label="Latest" value={otSum.latest ? otFmt(otSum.latest.amount) : '—'}
                                            sub={otSum.latest ? otSum.latest.title : 'Nothing this year'} />
                                        <Stat className="dash-stat" label="All time" value={otFmt(otSum.allTimeTotal)}
                                            sub={`${otSum.allTimeCount} ${otSum.allTimeCount === 1 ? 'entry' : 'entries'}`} />
                                    </div>
                                </Card>

                                {/* ── THE ENTRIES, a card per year, and where this year's money went ── */}
                                <div className={otCats.length > 0 ? 'dash-grid' : undefined}>
                                    <div className="dash-col">
                                        {otGroups.map(group => (
                                            <Card key={group.year}>
                                                <CardHeader title={String(group.year)}
                                                    sub={group.year === currentYear
                                                        ? 'Newest first'
                                                        : `${group.entries.length} ${group.entries.length === 1 ? 'entry' : 'entries'} · ${otFmt(group.total)}`} />
                                                <Rows>{group.entries.map(renderOtEntry)}</Rows>
                                            </Card>
                                        ))}
                                    </div>
                                    {otCats.length > 0 && (
                                        <div className="dash-col">
                                            <Card>
                                                <CardHeader title="Where it went" sub={`${currentYear}, by category`} />
                                                <Rows>
                                                    {otCats.map(c => (
                                                        <div key={c.category} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                                                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                                                                <span style={{ ...type.bodyStrong, ...truncate }}>{c.category}</span>
                                                                <span style={{ ...type.num, flexShrink: 0 }}>{otFmt(c.amount)}</span>
                                                            </div>
                                                            <ProgressBar pct={c.pct} height={4} color="var(--text-secondary)" />
                                                        </div>
                                                    ))}
                                                </Rows>
                                            </Card>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* ── NEW/EDIT EXPENSE DIALOG ── */}
                        <Modal isOpen={otShowModal} onClose={() => setOtShowModal(false)} title={otEditingExp ? 'Edit details' : 'New one-time expense'} maxWidth="480px"
                            footer={
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    <Button type="button" variant="secondary" onClick={() => setOtShowModal(false)}>Cancel</Button>
                                    <Button type="submit" form="ot-expense-form" isLoading={otSavingExp}>{otEditingExp ? 'Save changes' : 'Create expense'}</Button>
                                </div>
                            }
                        >
                            <form id="ot-expense-form" onSubmit={otHandleSaveExpense} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div>
                                    <label htmlFor="ot-exp-title" style={labelSt}>Name</label>
                                    <input id="ot-exp-title" type="text" placeholder="Goa trip, MacBook Pro" required style={inputSt}
                                        value={otExpForm.title} onChange={e => setOtExpForm(f => ({ ...f, title: e.target.value }))} />
                                </div>
                                <div>
                                    <label style={labelSt}>Category</label>
                                    <CategoryField
                                        valueKey="name"
                                        value={otExpForm.category}
                                        onChange={v => setOtExpForm(f => ({ ...f, category: v }))}
                                        categories={OT_FALLBACK_CATEGORIES}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label htmlFor="ot-exp-start" style={labelSt}>Starts</label>
                                        <input id="ot-exp-start" type="date" style={inputSt}
                                            value={otExpForm.start_date} onChange={e => setOtExpForm(f => ({ ...f, start_date: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label htmlFor="ot-exp-end" style={labelSt}>Ends</label>
                                        <input id="ot-exp-end" type="date" style={inputSt}
                                            value={otExpForm.end_date} onChange={e => setOtExpForm(f => ({ ...f, end_date: e.target.value }))} />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="ot-exp-bank" style={labelSt}>Paid from</label>
                                    <select id="ot-exp-bank" style={inputSt} value={otExpForm.bank_account_id}
                                        onChange={e => setOtExpForm(f => ({ ...f, bank_account_id: e.target.value }))}>
                                        <option value="">No account</option>
                                        {otAccounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}{a.bank_name ? ` · ${a.bank_name}` : ''}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="ot-exp-notes" style={labelSt}>Notes</label>
                                    <textarea id="ot-exp-notes" placeholder="Optional" style={{ ...inputSt, minHeight: 64, resize: 'vertical' }}
                                        value={otExpForm.notes} onChange={e => setOtExpForm(f => ({ ...f, notes: e.target.value }))} />
                                </div>
                            </form>
                        </Modal>
                    </>
                )}

            </div>
    );
}

export default function BudgetsPage() {
    return <Suspense><BudgetsPageInner /></Suspense>;
}
