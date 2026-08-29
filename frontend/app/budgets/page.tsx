'use client';

import { useEffect, useState, useMemo, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Plus, Trash2, Pencil, AlertCircle, BarChart2, CopyPlus,
    RefreshCw, Pause, Play, TrendingUp, TrendingDown, Sparkles, X, Brain,
    Check, Calendar, Target, Repeat,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { budgetsAPI, categoriesAPI, analyticsAPI, recurringAPI, aiAPI, splitsAPI } from '@/lib/api';
import { GCard } from '@/components/ui/GCard';
import { StatTile } from '@/components/ui/StatTile';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { Skeleton, SkeletonCard, SkeletonCircle } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/store/toastStore';
import { SuggestionsBanner, SuggestionItem } from '@/components/budgets/SuggestionsBanner';
import { Tabs } from '@/components/ui/Tabs';
import { formatDate, fmt as fmtBase, looksLikeEmoji } from '@/lib/utils';

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
const inputSt: React.CSSProperties = { width: '100%', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' };
const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block', fontFamily: 'var(--font-body)' };
const iconBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const glassTileStyle: React.CSSProperties = { background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', boxShadow: 'var(--glass-edge)' };

// ── One-Time Expenses: local types & constants ──────────────────────────────

const OT_CATEGORIES = ['Travel', 'Event', 'Electronics', 'Medical', 'Education',
    'Home', 'Vehicle', 'Gift', 'Investment', 'Other'];

const OT_CATEGORY_EMOJI: Record<string, string> = {
    Travel: '✈️', Event: '🎉', Electronics: '💻', Medical: '🏥',
    Education: '📚', Home: '🏠', Vehicle: '🚗', Gift: '🎁',
    Investment: '📈', Other: '🧾',
};

const OT_CATEGORY_COLORS: Record<string, string> = {
    Travel: '#6366f1', Event: '#f59e0b', Electronics: '#8b5cf6', Medical: '#ef4444',
    Education: '#06b6d4', Home: '#00e5a0', Vehicle: '#f97316', Gift: '#ec4899',
    Investment: '#22c55e', Other: '#a855f7',
};

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
    credit_card_id: null as number | null,
});

function BudgetsPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const initialTab = searchParams.get('tab');
    const [tab, setTab] = useState(TABS.some(t => t.key === initialTab) ? initialTab! : 'budgets');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    // ════════════════════════════════════════════════════════════════════════
    // ── BUDGETS TAB STATE ──
    // ════════════════════════════════════════════════════════════════════════
    const currentMonth = new Date().getMonth() + 1;
    const currentYear  = new Date().getFullYear();

    const [budgets, setBudgets]       = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [budgetsLoading, setBudgetsLoading] = useState(true);
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
    const [healthFilter, setHealthFilter]           = useState<'all'|'on-track'|'over'|'suggestion'>('all');
    const [adjusting, setAdjusting]                 = useState<string | null>(null);
    const [copying, setCopying]                      = useState(false);

    useEffect(() => {
        try { setDismissed(new Set(JSON.parse(localStorage.getItem('fintrack-budget-dismissed') ?? '[]'))); } catch {}
        try { setRolloverEnabled(JSON.parse(localStorage.getItem('fintrack-budget-rollover') ?? '{}')); } catch {}
    }, []);

    const fetchBudgets = async () => {
        setBudgetsLoading(true);
        try {
            const res = await budgetsAPI.getAll({ month: currentMonth, year: currentYear });
            setBudgets(res.data.budgets);
        } catch (err) { console.error(err); toast.error('Failed to load budgets'); }
        finally { setBudgetsLoading(false); }
    };

    useEffect(() => {
        if (!user) return;
        fetchBudgets();
        categoriesAPI.getAll().then(res => setCategories(res.data.categories)).catch(err => { console.error(err); toast.error('Failed to load categories'); });

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
    const overBudgetList  = budgets.filter(b => parseFloat(b.spent) > parseFloat(b.amount));
    const isOverTotal     = totalSpent > totalBudgeted;
    const onTrackCount    = budgets.filter(b => parseFloat(b.spent) <= parseFloat(b.amount)).length;
    // Zero-based budgeting's "unallocated" tracks every dollar given a job --
    // an Investments budget is still a job for that money, so this counts all
    // budgets, not just spendingBudgets.
    const totalAllocated  = budgets.reduce((s, b) => s + parseFloat(b.amount), 0);
    const unallocated     = monthlyIncome - totalAllocated;
    const copyableCount   = prevMonthBudgets.filter(pb => !budgets.find(b => b.category_id === pb.category_id)).length;
    const visibleBudgets  = budgets.filter(b => !pendingDeleteBudget.has(b.id));
    const filteredBudgets = healthFilter === 'all'       ? visibleBudgets
        : healthFilter === 'on-track'                    ? visibleBudgets.filter(b => parseFloat(b.spent) <= parseFloat(b.amount))
        : healthFilter === 'over'                        ? visibleBudgets.filter(b => parseFloat(b.spent) >  parseFloat(b.amount))
        : visibleBudgets.filter(b => suggestions.some(s => s.categoryId === b.category_id));

    const openAdd = () => { setShowForm(true); setFormError(''); setFormCategory(''); setFormAmount(''); };
    const chipStyle = (active: boolean): React.CSSProperties => ({
        fontSize: '11px', padding: '4px 10px', borderRadius: '20px', border: 'none',
        cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: active ? 600 : 400,
        background: active ? 'var(--accent)' : undefined,
        color: active ? 'white' : 'var(--text-secondary)',
        transition: 'all var(--transition-fast)',
    });

    // ════════════════════════════════════════════════════════════════════════
    // ── RECURRING TAB STATE ──
    // ════════════════════════════════════════════════════════════════════════
    const [recurring, setRecurring]         = useState<any[]>([]);
    const [recCategories, setRecCategories] = useState<any[]>([]);
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
    const [patterns, setPatterns]           = useState<any[]>([]);
    const [dismissedPatterns, setDismissedPatterns] = useState<Set<number>>(new Set());
    const [patternsLoading, setPatternsLoading]     = useState(false);
    const [addingPattern, setAddingPattern] = useState<number | null>(null);
    const [recurringFetched, setRecurringFetched] = useState(false);

    const fetchRecurringData = async () => {
        setRecurringLoading(true);
        try { const [recRes, catRes] = await Promise.all([recurringAPI.getAll(), categoriesAPI.getAll()]); setRecurring(recRes.data.recurring); setRecCategories(catRes.data.categories); }
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

    const formatNextDate = (dateStr: string) => {
        if (!dateStr) return 'Not set';
        try { const [year, month, day] = dateStr.split('T')[0].split('-').map(Number); const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${day} ${months[month]} ${year}`; }
        catch { return 'Not set'; }
    };

    const freqLabel = (r: any) => {
        if (r.frequency === 'monthly' && r.day_of_month) { const s = r.day_of_month===1?'st':r.day_of_month===2?'nd':r.day_of_month===3?'rd':'th'; return `Monthly on the ${r.day_of_month}${s}`; }
        return r.frequency.charAt(0).toUpperCase() + r.frequency.slice(1);
    };

    const visiblePatterns = patterns.filter((_, i) => !dismissedPatterns.has(i));
    const activeCount = recurring.filter(r => r.is_active).length;

    const recInputSt: React.CSSProperties = { padding: '10px 14px', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' };
    const recIconBt: React.CSSProperties = { width: '32px', height: '32px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--transition-fast)' };

    const TypeToggle = ({ value, onChange }: { value: string; onChange: (v: 'income' | 'expense') => void }) => (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {(['expense', 'income'] as const).map(t => (
                <button key={t} type="button" onClick={() => onChange(t)} className={value === t ? undefined : 'glass-field'} style={{ padding: '8px', borderRadius: '8px', border: value === t ? `1px solid ${t === 'income' ? 'color-mix(in srgb, var(--color-inc) 30%, transparent)' : 'color-mix(in srgb, var(--color-exp) 30%, transparent)'}` : 'none', background: value === t ? (t === 'income' ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)') : undefined, color: value === t ? (t === 'income' ? 'var(--color-inc)' : 'var(--color-exp)') : 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize', fontFamily: 'var(--font-body)' }}>
                    {t}
                </button>
            ))}
        </div>
    );

    // ════════════════════════════════════════════════════════════════════════
    // ── SPLITS TAB STATE ──
    // ════════════════════════════════════════════════════════════════════════
    const [splits,       setSplits]       = useState<any[]>([]);
    const [splitsLoading, setSplitsLoading] = useState(true);
    const [splitsFetched, setSplitsFetched] = useState(false);
    const [showSplitModal, setShowSplitModal] = useState(false);
    const [editingSplit, setEditingSplit] = useState<any | null>(null);
    const [splitDeletingId, setSplitDeletingId] = useState<string | null>(null);
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
            if (p) setSplitForm({ description: p.description || '', total_amount: p.total_amount ? String(p.total_amount) : '', participants: p.participants?.length ? p.participants : [{ name: '' }], date: new Date().toISOString().split('T')[0] });
        } catch { /* silent */ }
        finally { setNlLoading(false); }
    };

    const addParticipant    = () => setSplitForm({ ...splitForm, participants: [...splitForm.participants, { name: '' }] });
    const removeParticipant = (i: number) => setSplitForm({ ...splitForm, participants: splitForm.participants.filter((_, idx) => idx !== i) });
    const updateParticipant = (i: number, name: string) => { const updated = [...splitForm.participants]; updated[i] = { name }; setSplitForm({ ...splitForm, participants: updated }); };

    const splitCount = splitForm.participants.length + 1;
    const yourShare  = splitForm.total_amount ? (parseFloat(splitForm.total_amount) / splitCount) : 0;

    const openEditSplit = (split: any) => {
        setEditingSplit(split);
        setSplitForm({ description: split.description, total_amount: String(parseFloat(split.total_amount)), participants: (split.participants || []).map((p: any) => ({ name: p.name })), date: split.date?.split('T')[0] || new Date().toISOString().split('T')[0] });
        setNlInput(''); setSplitFormError(''); setShowSplitModal(true);
    };

    const closeSplitModal = () => { setShowSplitModal(false); setEditingSplit(null); setNlInput(''); setSplitForm({ description: '', total_amount: '', participants: [{ name: '' }], date: new Date().toISOString().split('T')[0] }); setSplitFormError(''); };

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

    const allSettled = (split: any) => split.participants.every((p: any) => p.settled);

    const splitInputSt: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 10, fontSize: '0.875rem', fontFamily: 'var(--font-body)', outline: 'none' };

    // ════════════════════════════════════════════════════════════════════════
    // ── ONE-TIME EXPENSES TAB STATE ──
    // ════════════════════════════════════════════════════════════════════════
    const [otExpenses, setOtExpenses]           = useState<OtExpense[]>([]);
    const [otAccounts, setOtAccounts]           = useState<OtAccount[]>([]);
    const [otCards, setOtCards]                 = useState<any[]>([]);
    const [otTxCategories, setOtTxCategories]   = useState<any[]>([]);
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
    const [otDeleteConfirm, setOtDeleteConfirm] = useState<OtExpense | null>(null);
    const [otToast, setOtToast]                 = useState('');
    const [otMounted, setOtMounted]             = useState(false);

    useEffect(() => { setOtMounted(true); }, []);

    const otGetHeaders = useCallback(() => {
        const token = useAuthStore.getState().token;
        return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
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
            otShowToast('Failed to load one-time expenses');
        }
        try {
            const catRes = await categoriesAPI.getAll();
            setOtTxCategories(catRes.data.categories || []);
        } catch (_) { /* silent — falls back to hardcoded list */ }
    }, [otGetHeaders]);

    useEffect(() => {
        if (user && tab === 'one-time' && !otFetched) {
            setOtFetched(true);
            otFetchAll().finally(() => setOtLoading(false));
        }
    }, [user, tab, otFetched, otFetchAll]);

    const otShowToast = (msg: string) => {
        setOtToast(msg);
        setTimeout(() => setOtToast(''), 3000);
    };

    const otOpenAddExpense = () => {
        setOtEditingExp(null);
        setOtExpForm(otEmptyExpenseForm());
        setOtShowModal(true);
    };

    const otOpenEditExpense = (exp: OtExpense, e: React.MouseEvent) => {
        e.stopPropagation();
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
                const res  = await fetch(`${OT_API}/api/one-time-expenses/${otEditingExp.id}`, {
                    method: 'PUT', headers: otGetHeaders(), body: JSON.stringify(body),
                });
                const data = await res.json();
                setOtExpenses(prev => prev.map(ex => ex.id === otEditingExp.id ? { ...ex, ...data.expense } : ex));
                otShowToast('Expense updated');
            } else {
                const res  = await fetch(`${OT_API}/api/one-time-expenses`, {
                    method: 'POST', headers: otGetHeaders(), body: JSON.stringify(body),
                });
                const data = await res.json();
                const newExp: OtExpense = { ...data.expense, items: [], total_amount: 0, item_count: 0 };
                setOtExpenses(prev => [newExp, ...prev]);
                setOtExpandedId(newExp.id);
                otShowToast('Expense created — add items below');
            }
            setOtShowModal(false);
            setOtEditingExp(null);
        } catch (err) {
            console.error(err);
            otShowToast('Failed to save expense — try again');
        } finally {
            setOtSavingExp(false);
        }
    };

    const otHandleDeleteExpense = async (exp: OtExpense) => {
        try {
            await fetch(`${OT_API}/api/one-time-expenses/${exp.id}`, {
                method: 'DELETE', headers: otGetHeaders(),
            });
            setOtExpenses(prev => prev.filter(e => e.id !== exp.id));
            if (otExpandedId === exp.id) setOtExpandedId(null);
            setOtDeleteConfirm(null);
            otShowToast(
                exp.total_amount > 0 && exp.bank_account_name
                    ? `Deleted — ${otFmt(exp.total_amount)} restored to ${exp.bank_account_name}`
                    : 'Expense deleted'
            );
        } catch (err) {
            console.error(err);
            otShowToast('Failed to delete expense — try again');
        }
    };

    const otHandleAddItem = async (expenseId: string) => {
        if (!otItemForm.description || !otItemForm.amount || !otItemForm.date) return;
        setOtAddingItem(true);
        try {
            const res  = await fetch(`${OT_API}/api/one-time-expenses/${expenseId}/items`, {
                method: 'POST',
                headers: otGetHeaders(),
                body: JSON.stringify({
                    description:    otItemForm.description,
                    amount:         parseFloat(otItemForm.amount),
                    date:           otItemForm.date,
                    payment_method: otItemForm.payment_method,
                    category:       otItemForm.category,
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
            otShowToast('Failed to add item — try again');
        } finally {
            setOtAddingItem(false);
        }
    };

    const otOpenEditItem = (expenseId: string, item: OtExpenseItem) => {
        setOtEditingItem({ expenseId, item });
        setOtItemForm({
            description:    item.description,
            amount:         String(item.amount),
            date:           (item.date || '').split('T')[0],
            payment_method: item.payment_method || 'Cash',
            category:       item.category || 'Other',
            credit_card_id: item.credit_card_id ?? null,
        });
        setOtAddingItemFor(expenseId);
    };

    const otHandleUpdateItem = async (expenseId: string, itemId: string) => {
        if (!otItemForm.description || !otItemForm.amount || !otItemForm.date) return;
        setOtAddingItem(true);
        try {
            const res = await fetch(`${OT_API}/api/one-time-expenses/${expenseId}/items/${itemId}`, {
                method: 'PUT',
                headers: otGetHeaders(),
                body: JSON.stringify({
                    description:    otItemForm.description,
                    amount:         parseFloat(otItemForm.amount),
                    date:           otItemForm.date,
                    payment_method: otItemForm.payment_method,
                    category:       otItemForm.category,
                    credit_card_id: otItemForm.payment_method === 'Credit Card' ? otItemForm.credit_card_id : null,
                }),
            });
            const data = await res.json();
            setOtExpenses(prev => prev.map(ex => {
                if (ex.id !== expenseId) return ex;
                const newItems = ex.items.map(i => i.id === itemId ? data.item : i);
                return { ...ex, items: newItems, total_amount: newItems.reduce((s, i) => s + Number(i.amount), 0) };
            }));
            setOtEditingItem(null);
            setOtAddingItemFor(null);
            setOtItemForm(otEmptyItemForm());
        } catch (err) {
            console.error(err);
            otShowToast('Failed to update item — try again');
        } finally {
            setOtAddingItem(false);
        }
    };

    const otHandleDeleteItem = async (expenseId: string, itemId: string) => {
        try {
            await fetch(`${OT_API}/api/one-time-expenses/${expenseId}/items/${itemId}`, {
                method: 'DELETE', headers: otGetHeaders(),
            });
            setOtExpenses(prev => prev.map(ex => {
                if (ex.id !== expenseId) return ex;
                const newItems = ex.items.filter(i => i.id !== itemId);
                return { ...ex, items: newItems, total_amount: newItems.reduce((s, i) => s + Number(i.amount), 0), item_count: newItems.length };
            }));
        } catch (err) {
            console.error(err);
            otShowToast('Failed to delete item — try again');
        }
    };

    const otCurrentYear = new Date().getFullYear();
    const otTotalSpent  = otExpenses.reduce((s, e) => s + Number(e.total_amount), 0);
    const otThisYear    = otExpenses
        .filter(e => {
            const d = e.start_date || e.items?.[0]?.date;
            return d ? new Date(d).getFullYear() === otCurrentYear : false;
        })
        .reduce((s, e) => s + Number(e.total_amount), 0);

    const otFormatDateRange = (exp: OtExpense) => {
        if (!exp.start_date) return '';
        const s = new Date(exp.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        if (!exp.end_date || exp.end_date === exp.start_date) return s;
        const en = new Date(exp.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return `${s} – ${en}`;
    };

    const [otIsMobile, setOtIsMobile] = useState(false);
    useEffect(() => {
        setOtIsMobile(window.innerWidth < 768);
        const onResize = () => setOtIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const otModalStyle: React.CSSProperties = otIsMobile ? {
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-surface-1)',
        borderRadius: '20px 20px 0 0',
        borderTop: '1px solid var(--border-subtle)',
        padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
        zIndex: 10000, maxHeight: '92vh', overflowY: 'auto',
    } : {
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'var(--bg-surface-1)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        padding: '28px', zIndex: 10000,
        width: '480px', maxHeight: '90vh', overflowY: 'auto',
    };

    const otInputStyle: React.CSSProperties = {
        width: '100%', background: 'var(--bg-surface-2)',
        border: '1px solid var(--border-subtle)', borderRadius: '8px',
        padding: '10px 12px', color: 'var(--text-primary)',
        fontSize: '14px', outline: 'none', boxSizing: 'border-box',
    };

    const otLabelStyle: React.CSSProperties = {
        fontSize: '11px', fontWeight: 600,
        color: 'var(--text-secondary)', letterSpacing: '0.5px',
        textTransform: 'uppercase', marginBottom: '6px', display: 'block',
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

                {/* ── PAGE HEADER ── */}
                <div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        Budgets
                    </h1>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                        Monthly limits, recurring bills, shared expenses, and one-off spends
                    </p>
                </div>

                <Tabs tabs={TABS} active={tab} onChange={setTab} />

                {/* ══════════════════════════════════════════════════════════ */}
                {/* ══ BUDGETS TAB ══ */}
                {/* ══════════════════════════════════════════════════════════ */}
                {tab === 'budgets' && (
                    <>
                        {/* ── HEADER ── */}
                        <div className="glass-surface" style={{ borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                        {MONTH_NAMES[currentMonth]} {currentYear} · {budgets.length} {budgets.length === 1 ? 'category' : 'categories'}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                    <button type="button" onClick={() => setZeroBasedMode(v => !v)}
                                        className={zeroBasedMode ? undefined : 'glass-field'}
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '7px 10px', background: zeroBasedMode ? 'var(--accent-subtle)' : undefined, border: zeroBasedMode ? '1px solid var(--accent-border)' : 'none', borderRadius: 'var(--radius-md)', color: zeroBasedMode ? 'var(--accent)' : 'var(--text-muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        <BarChart2 size={12} /> {isMobile ? '0-base' : 'Zero-based'}
                                    </button>
                                    <button type="button" onClick={openAdd}
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        <Plus size={14} /> {isMobile ? 'Add' : 'Add Budget'}
                                    </button>
                                </div>
                            </div>

                            {/* ── BUDGET HEALTH CHIPS ── */}
                            {!budgetsLoading && budgets.length > 0 && (
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--glass-border)' }}>
                                    {([
                                        { id: 'all',        label: 'All',           count: budgets.length },
                                        { id: 'on-track',   label: '✅ On track',   count: onTrackCount },
                                        { id: 'over',       label: '🔴 Over budget', count: overBudgetList.length },
                                        { id: 'suggestion', label: '💡 Suggestions', count: suggestions.length },
                                    ] as const).filter(chip => chip.id === 'all' || chip.count > 0).map(chip => (
                                        <button key={chip.id} type="button"
                                            onClick={() => setHealthFilter(healthFilter === chip.id ? 'all' : chip.id)}
                                            className={healthFilter === chip.id ? undefined : 'glass-field'}
                                            style={chipStyle(healthFilter === chip.id)}>
                                            {chip.label} · {chip.count}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── BUDGET SUMMARY (hero numbers) ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <StatTile label="Total Budget" value={fmt(totalBudgeted)} accentColor="var(--accent)" style={glassTileStyle} />
                            <StatTile label="Spent So Far" value={fmt(totalSpent)} accentColor={isOverTotal ? 'var(--color-exp)' : undefined} style={glassTileStyle} />
                        </div>

                        {budgets.length > 0 && (
                            <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Overall Usage</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 800, color: isOverTotal ? 'var(--color-exp)' : 'var(--accent)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                        {Math.round(Math.min(overallRawPct, 100))}%
                                    </p>
                                </div>
                                <ProgressBar pct={overallRawPct} height={8} />
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0', fontFamily: 'var(--font-body)' }}>
                                    {isOverTotal
                                        ? <span style={{ color: 'var(--color-exp)' }}>{fmt(totalSpent - totalBudgeted)} over total budget</span>
                                        : <span>{fmt(totalRemaining)} remaining across all categories</span>
                                    }
                                </p>
                            </div>
                        )}

                        {/* ── ZERO-BASED MODE BANNER ── */}
                        {zeroBasedMode && monthlyIncome > 0 && (
                            <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
                                <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Zero-based Budget</p>
                                <p style={{ fontSize: '14px', color: 'var(--text-primary)', margin: '0 0 10px', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>{fmt(monthlyIncome)}</span> income allocated: {' '}
                                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(totalBudgeted)}</span> budgeted, {' '}
                                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: unallocated >= 0 ? 'var(--color-inc)' : 'var(--color-exp)' }}>
                                        {unallocated >= 0 ? `${fmt(unallocated)} unallocated` : `${fmt(-unallocated)} over-allocated`}
                                    </span>
                                </p>
                                {unallocated > 0 && (
                                    <button type="button" onClick={openAdd}
                                        style={{ padding: '7px 16px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        + Allocate {fmt(unallocated)}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* ── OVER-BUDGET ALERT BANNER ── */}
                        {overBudgetList.length > 0 && (
                            <div style={{ background: 'color-mix(in srgb, var(--color-warn) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warn) 28%, transparent)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <AlertCircle size={18} color="var(--color-warn)" style={{ flexShrink: 0, marginTop: '1px' }} />
                                <div>
                                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--color-warn)', margin: '0 0 3px' }}>
                                        {overBudgetList.length} {overBudgetList.length === 1 ? 'category is' : 'categories are'} over budget
                                    </p>
                                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                        {overBudgetList.map(b => b.category_name).join(', ')}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ── SMART SUGGESTIONS BANNER ── */}
                        {suggestions.length > 0 && (
                            <SuggestionsBanner items={suggestions} adjusting={adjusting} onAdjust={handleAdjust} onDismiss={handleDismiss} />
                        )}

                        {/* ── GOAL SURPLUS NUDGE ── */}
                        {goalSurplusNudge && (
                            <div style={{ background: 'color-mix(in srgb, var(--color-inc) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-inc) 25%, transparent)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <span style={{ fontSize: '20px', flexShrink: 0 }}>🎯</span>
                                <div style={{ flex: 1 }}>
                                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--color-inc)', margin: '0 0 3px' }}>
                                        Month-end surplus: {fmt(goalSurplusNudge.surplusTotal)}
                                    </p>
                                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px', fontFamily: 'var(--font-body)' }}>
                                        {goalSurplusNudge.daysLeft === 0 ? 'Last day of the month!' : `${goalSurplusNudge.daysLeft} day${goalSurplusNudge.daysLeft !== 1 ? 's' : ''} left`} — consider putting {fmt(goalSurplusNudge.surplusTotal)} unspent toward your goals.
                                    </p>
                                    <button type="button" onClick={() => router.push('/goals')}
                                        style={{ padding: '6px 14px', background: 'var(--color-inc)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        View Goals →
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── BUDGET CATEGORY CARDS ── */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                    Budget Categories {healthFilter !== 'all' && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px' }}>({filteredBudgets.length} shown)</span>}
                                </h2>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {!budgetsLoading && copyableCount > 0 && (
                                        <button type="button" onClick={handleCopyFromLastMonth} disabled={copying} className="glass-field"
                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', border: 'none', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: copying ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: copying ? 0.6 : 1 }}>
                                            <CopyPlus size={12} /> {copying ? 'Copying…' : `Copy last month (${copyableCount})`}
                                        </button>
                                    )}
                                    <button type="button" onClick={openAdd}
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        <Plus size={12} /> Add Budget
                                    </button>
                                </div>
                            </div>

                            {budgetsLoading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {[1, 2, 3].map(i => <SkeletonCard key={i} height={110} />)}
                                </div>
                            ) : budgets.length === 0 ? (
                                <EmptyState
                                    icon={Target}
                                    title="No budgets set"
                                    subtitle="Set monthly limits to stay on track"
                                    action={
                                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                            {prevMonthBudgets.length > 0 && (
                                                <button type="button" onClick={handleCopyFromLastMonth} disabled={copying} className="glass-field"
                                                    style={{ padding: '10px 20px', border: 'none', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: copying ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: '6px', opacity: copying ? 0.6 : 1 }}>
                                                    <CopyPlus size={14} /> {copying ? 'Copying…' : `Copy from last month (${prevMonthBudgets.length})`}
                                                </button>
                                            )}
                                            <button type="button" onClick={openAdd} style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                                Set your first budget
                                            </button>
                                        </div>
                                    }
                                />
                            ) : filteredBudgets.length === 0 ? (
                                <div className="glass-surface" style={{ textAlign: 'center', padding: '32px 24px', borderRadius: 'var(--radius-lg)' }}>
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>No budgets match this filter</p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '12px' }}>
                                    {filteredBudgets.map(budget => {
                                        const spent    = parseFloat(budget.spent);
                                        const limit    = parseFloat(budget.amount);
                                        const rawPct   = limit > 0 ? (spent / limit) * 100 : 0;
                                        const isOver   = spent > limit;
                                        const overAmt  = isOver ? spent - limit : 0;
                                        const leftAmt  = isOver ? 0 : limit - spent;
                                        const barColor = isOver ? 'var(--color-exp)' : 'var(--accent)';
                                        const emojiBg  = isOver ? 'color-mix(in srgb, var(--color-exp) 12%, transparent)' : 'var(--accent-subtle)';
                                        const rollover = rolloverEnabled[budget.category_id];
                                        const prevB    = prevMonthBudgets.find(p => p.category_id === budget.category_id);
                                        const rolloverAmt = prevB ? Math.max(0, parseFloat(prevB.amount) - parseFloat(prevB.spent)) : 0;
                                        const _today = new Date().getDate();
                                        const _dim   = new Date(currentYear, currentMonth, 0).getDate();
                                        const _rate  = _today > 0 ? spent / _today : 0;
                                        const _proj  = Math.round(_rate * _dim);
                                        const _willExceed = !isOver && _today > 3 && _proj > limit;
                                        const _runOutDay  = _rate > 0 ? Math.ceil(limit / _rate) : _dim + 1;
                                        const _runOutStr  = _runOutDay <= _dim
                                            ? new Date(currentYear, currentMonth - 1, _runOutDay).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                                            : null;

                                        return (
                                            <div key={budget.id} className="glass-surface" style={{ border: `1px solid ${isOver ? 'color-mix(in srgb, var(--color-exp) 20%, transparent)' : 'var(--glass-border)'}`, borderRadius: 'var(--radius-lg)', padding: '16px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '10px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                                        <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: emojiBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '18px' }}>
                                                            {[budget.category_icon, budget.category_emoji].find(looksLikeEmoji) || '📊'}
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <p style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {budget.category_name}
                                                            </p>
                                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                                                                Budget: {fmt(limit)}
                                                                {rollover && rolloverAmt > 0 && (
                                                                    <span style={{ color: 'var(--color-inc)', fontFamily: 'var(--font-body)' }}> · +{fmt(rolloverAmt)} rolled over</span>
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: isOver ? 'var(--color-exp)' : 'var(--text-primary)', margin: '0 0 3px', fontVariantNumeric: 'tabular-nums' }}>
                                                                {fmt(spent)}
                                                            </p>
                                                            {isOver ? (
                                                                <Badge color="var(--color-exp)" bg="color-mix(in srgb, var(--color-exp) 10%, transparent)">
                                                                    +{fmt(overAmt)} over
                                                                </Badge>
                                                            ) : _today > 3 && _willExceed ? (
                                                                <p style={{ fontSize: '11px', color: 'var(--color-warn)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                                                    {_runOutStr ? `Runs out ~${_runOutStr}` : `${fmt(_proj)} projected`}
                                                                </p>
                                                            ) : (
                                                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)', fontVariantNumeric: 'tabular-nums' }}>
                                                                    {fmt(leftAmt)} left
                                                                </p>
                                                            )}
                                                        </div>

                                                        <button type="button" onClick={() => toggleRollover(budget.category_id)}
                                                            title={rollover ? 'Rollover enabled — click to disable' : 'Enable rollover'}
                                                            aria-label={rollover ? 'Rollover enabled — click to disable' : 'Enable rollover'}
                                                            style={{ ...iconBtn, color: rollover ? 'var(--accent)' : 'var(--text-muted)', borderColor: rollover ? 'var(--accent-border)' : 'var(--glass-border)', background: rollover ? 'var(--accent-subtle)' : 'transparent' }}>
                                                            <Repeat size={13} />
                                                        </button>

                                                        {confirmDeleteId === budget.id ? (
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button type="button" onClick={() => handleDelete(budget.id)} disabled={deletingId === budget.id}
                                                                    style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'color-mix(in srgb, var(--color-exp) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 20%, transparent)', color: 'var(--color-exp)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                                                    {deletingId === budget.id ? '…' : 'Delete'}
                                                                </button>
                                                                <button type="button" onClick={() => setConfirmDeleteId(null)} className="glass-field"
                                                                    style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: 'none', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button type="button" onClick={() => { setEditingId(budget.id); setEditAmount(String(parseFloat(budget.amount))); setEditError(''); }} aria-label={`Edit ${budget.category_name} budget`} style={iconBtn}
                                                                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent-subtle)'; el.style.color = 'var(--accent)'; }}
                                                                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                                    <Pencil size={13} />
                                                                </button>
                                                                <button type="button" onClick={() => setConfirmDeleteId(budget.id)} disabled={!!deletingId} aria-label={`Delete ${budget.category_name} budget`} style={iconBtn}
                                                                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'color-mix(in srgb, var(--color-exp) 10%, transparent)'; el.style.color = 'var(--color-exp)'; }}
                                                                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <ProgressBar pct={rawPct} color={barColor} height={6} />

                                                {/* Inline edit */}
                                                {editingId === budget.id && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                                            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 13 }}>₹</span>
                                                            <input type="number" min="1" value={editAmount} onChange={e => setEditAmount(e.target.value)} autoFocus
                                                                style={{ width: 120, padding: '6px 8px 6px 22px', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', border: '1px solid var(--accent)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', fontVariantNumeric: 'tabular-nums' }} />
                                                        </div>
                                                        <Button size="sm" onClick={() => handleEditSave(budget)} isLoading={editLoading}>Save</Button>
                                                        <button type="button" onClick={() => { setEditingId(null); setEditError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)' }}>Cancel</button>
                                                        {editError && <span style={{ fontSize: 12, color: 'var(--color-exp)', fontFamily: 'var(--font-body)' }}>{editError}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

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
                                    <select value={formCategory} onChange={e => setFormCategory(e.target.value)} style={{ ...inputSt, cursor: 'pointer', color: formCategory ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                        <option value="">Select a category</option>
                                        {categories.filter(c => !budgets.find(b => b.category_id === c.id)).map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
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
                    recurringLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {[1,2,3].map(i => <div key={i} className="glass-surface" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 'var(--radius-lg)' }}>
                                <SkeletonCircle size={40} />
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <Skeleton width="50%" height={14} borderRadius={4} />
                                    <Skeleton width="30%" height={12} borderRadius={4} />
                                </div>
                                <Skeleton width={72} height={20} borderRadius={6} />
                            </div>)}
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div className="glass-surface" style={{ borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                            {recurring.length > 0 ? `${activeCount} active schedule${activeCount !== 1 ? 's' : ''}` : 'Automate your regular income and expenses'}
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <Button onClick={handleProcessRecurring} isLoading={processingRecurring} variant="secondary" size="md">
                                            <RefreshCw size={16} />Process now
                                        </Button>
                                        <Button onClick={() => setShowRecForm(!showRecForm)} size="md"><Plus size={16} />Add Recurring</Button>
                                    </div>
                                </div>
                            </div>

                            {/* AI Detect Patterns strip */}
                            {(patternsLoading || visiblePatterns.length > 0) && (
                                <div style={{ background: 'color-mix(in srgb, var(--color-info) 8%, transparent)', border: '1.5px solid color-mix(in srgb, var(--color-info) 20%, transparent)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
                                    {patternsLoading ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <Brain size={16} color="var(--color-info)" />
                                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>AI is scanning your transactions for recurring patterns…</span>
                                            <div style={{ width: '14px', height: '14px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginLeft: 'auto' }} />
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                                <Sparkles size={16} color="var(--color-info)" />
                                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    AI found {visiblePatterns.length} potential recurring transaction{visiblePatterns.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {visiblePatterns.map((p, i) => {
                                                    const realIdx = patterns.indexOf(p);
                                                    return (
                                                        <div key={realIdx} className="glass-field" style={{ borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius-md)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{p.merchant || p.description}</span>
                                                                    <Badge color={p.confidence === 'high' ? 'var(--color-inc)' : 'var(--color-warn)'} bg={p.confidence === 'high' ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-warn) 10%, transparent)'}>
                                                                        {p.confidence}
                                                                    </Badge>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '10px', marginTop: '3px' }}>
                                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(p.amount)}</span>
                                                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{p.frequency}</span>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                                                <button type="button" onClick={() => handleAddPattern(p, realIdx)} disabled={addingPattern === realIdx}
                                                                    style={{ padding: '6px 12px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)', color: 'var(--accent)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: addingPattern === realIdx ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>
                                                                    {addingPattern === realIdx ? 'Adding…' : '+ Add'}
                                                                </button>
                                                                <button type="button" onClick={() => setDismissedPatterns(prev => new Set([...prev, realIdx]))} aria-label="Dismiss suggestion" style={{ ...recIconBt, border: '1px solid var(--glass-border)' }}><X size={13} /></button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Add form */}
                            {showRecForm && (
                                <div className="glass-surface" style={{ border: '1px solid color-mix(in srgb, var(--color-inc) 20%, transparent)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
                                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>New Recurring Transaction</h3>
                                    <form onSubmit={handleRecSubmit}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</label>
                                                <TypeToggle value={recForm.type} onChange={t => setRecForm({ ...recForm, type: t })} />
                                            </div>
                                            <Input label="Amount (₹)" type="number" placeholder="5000" min="1" value={recForm.amount} onChange={e => setRecForm({ ...recForm, amount: e.target.value })} required />
                                            <Input label="Description" type="text" placeholder="Monthly Salary" value={recForm.description} onChange={e => setRecForm({ ...recForm, description: e.target.value })} required />
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Frequency</label>
                                                <select value={recForm.frequency} onChange={e => setRecForm({ ...recForm, frequency: e.target.value })} style={recInputSt}>
                                                    <option value="daily">Daily</option>
                                                    <option value="weekly">Weekly</option>
                                                    <option value="monthly">Monthly</option>
                                                </select>
                                            </div>
                                            {recForm.frequency === 'monthly' && <Input label="Day of Month" type="number" placeholder="1" min="1" max="31" value={recForm.day_of_month} onChange={e => setRecForm({ ...recForm, day_of_month: e.target.value })} />}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category</label>
                                                <select value={recForm.category_id} onChange={e => setRecForm({ ...recForm, category_id: e.target.value })} style={{ ...recInputSt, color: recForm.category_id ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                    <option value="">Select category</option>
                                                    {recCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        {recFormError && <p style={{ fontSize: '12px', color: 'var(--color-exp)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>{recFormError}</p>}
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <Button type="submit" isLoading={recFormLoading} size="md">Save</Button>
                                            <Button type="button" variant="secondary" size="md" onClick={() => setShowRecForm(false)}>Cancel</Button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            {/* List */}
                            {recurring.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                                    <p style={{ fontSize: '40px', marginBottom: '10px' }}>🔄</p>
                                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>No recurring transactions</p>
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 18px', fontFamily: 'var(--font-body)' }}>Schedule bills, subscriptions, and EMIs to track them automatically</p>
                                    <button type="button" onClick={() => setShowRecForm(true)} style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Add your first one</button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {recurring.filter(r => !pendingDeleteRecurring.has(r.id)).map(r => {
                                        const isIncome = r.type === 'income';
                                        return (
                                            <div key={r.id}>
                                                <div className="glass-surface" style={{ borderRadius: recEditingId === r.id ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)', padding: '14px 18px', opacity: r.is_active ? 1 : 0.55, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                                        <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: isIncome ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            {isIncome ? <TrendingUp size={16} color="var(--color-inc)" /> : <TrendingDown size={16} color="var(--color-exp)" />}
                                                        </div>
                                                        <div>
                                                            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>{r.description}</p>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                                                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{freqLabel(r)}</span>
                                                                {r.category_name && <Badge color={r.category_color || 'var(--text-muted)'} bg={r.category_color ? `${r.category_color}20` : 'color-mix(in srgb, var(--text-primary) 8%, transparent)'}>{r.category_name}</Badge>}
                                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Next: {formatNextDate(r.next_due_date)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 600, color: isIncome ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{isIncome ? '+' : '−'}{fmt(parseFloat(r.amount))}</p>
                                                        <button type="button" onClick={() => handleRecToggle(r.id)} disabled={togglingId === r.id} title={r.is_active ? 'Pause' : 'Resume'} aria-label={r.is_active ? `Pause ${r.description}` : `Resume ${r.description}`}
                                                            style={{ ...recIconBt, background: r.is_active ? 'color-mix(in srgb, var(--color-warn) 10%, transparent)' : 'color-mix(in srgb, var(--color-inc) 10%, transparent)', border: `1px solid ${r.is_active ? 'color-mix(in srgb, var(--color-warn) 20%, transparent)' : 'color-mix(in srgb, var(--color-inc) 20%, transparent)'}`, color: r.is_active ? 'var(--color-warn)' : 'var(--color-inc)', opacity: togglingId === r.id ? 0.5 : 1 }}>
                                                            {r.is_active ? <Pause size={13} /> : <Play size={13} />}
                                                        </button>
                                                        <button type="button" onClick={() => { setRecEditingId(r.id); setRecEditForm({ type: r.type, amount: String(r.amount), description: r.description, frequency: r.frequency, day_of_month: r.day_of_month ? String(r.day_of_month) : '', category_id: r.category_id || '' }); setRecEditError(''); }} aria-label={`Edit ${r.description}`} style={recIconBt}
                                                            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent-subtle)'; el.style.color = 'var(--accent)'; }}
                                                            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button type="button" onClick={() => handleRecDelete(r.id)} disabled={recDeletingId === r.id} aria-label={`Delete ${r.description}`} style={{ ...recIconBt, opacity: recDeletingId === r.id ? 0.5 : 1 }}
                                                            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'color-mix(in srgb, var(--color-exp) 10%, transparent)'; el.style.color = 'var(--color-exp)'; }}
                                                            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                                {recEditingId === r.id && (
                                                    <div className="glass-surface" style={{ border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', borderTop: 'none', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', padding: '20px' }}>
                                                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>Edit Recurring Transaction</h3>
                                                        <form onSubmit={handleRecEditSubmit}>
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</label>
                                                                    <TypeToggle value={recEditForm.type} onChange={t => setRecEditForm({ ...recEditForm, type: t })} />
                                                                </div>
                                                                <Input label="Amount (₹)" type="number" placeholder="5000" min="1" value={recEditForm.amount} onChange={e => setRecEditForm({ ...recEditForm, amount: e.target.value })} required />
                                                                <Input label="Description" type="text" placeholder="Monthly Salary" value={recEditForm.description} onChange={e => setRecEditForm({ ...recEditForm, description: e.target.value })} required />
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Frequency</label>
                                                                    <select value={recEditForm.frequency} onChange={e => setRecEditForm({ ...recEditForm, frequency: e.target.value })} style={recInputSt}>
                                                                        <option value="daily">Daily</option>
                                                                        <option value="weekly">Weekly</option>
                                                                        <option value="monthly">Monthly</option>
                                                                    </select>
                                                                </div>
                                                                {recEditForm.frequency === 'monthly' && <Input label="Day of Month" type="number" placeholder="1" min="1" max="31" value={recEditForm.day_of_month} onChange={e => setRecEditForm({ ...recEditForm, day_of_month: e.target.value })} />}
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category</label>
                                                                    <select value={recEditForm.category_id} onChange={e => setRecEditForm({ ...recEditForm, category_id: e.target.value })} style={{ ...recInputSt, color: recEditForm.category_id ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                                        <option value="">Select category</option>
                                                                        {recCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                                    </select>
                                                                </div>
                                                            </div>
                                                            {recEditError && <p style={{ fontSize: '12px', color: 'var(--color-exp)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>{recEditError}</p>}
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <Button type="submit" isLoading={recEditLoading} size="md">Save</Button>
                                                                <Button type="button" variant="secondary" size="md" onClick={() => { setRecEditingId(null); setRecEditError(''); }}>Cancel</Button>
                                                            </div>
                                                        </form>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* ══ SPLITS TAB ══ */}
                {/* ══════════════════════════════════════════════════════════ */}
                {tab === 'splits' && (
                    splitsLoading ? (
                        <>
                            <SkeletonCard height={64} style={{ marginBottom: '4px' }} />
                            {[1, 2, 3].map(i => <SkeletonCard key={i} height={120} />)}
                        </>
                    ) : (
                        <>
                            {/* ── HEADER ── */}
                            <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                            {splits.length > 0 ? `${splits.length} split${splits.length !== 1 ? 's' : ''}` : 'Track shared expenses and who owes you'}
                                        </p>
                                    </div>
                                    <button type="button" onClick={() => setShowSplitModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        <Plus size={14} /> Add Split
                                    </button>
                                </div>
                            </div>

                            {/* ── AI PARSE STRIP ── */}
                            <div style={{ background: 'color-mix(in srgb, var(--color-info) 8%, var(--bg-surface-1))', border: '1.5px solid color-mix(in srgb, var(--color-info) 20%, transparent)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                                    <Sparkles size={14} color="var(--color-info)" />
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-info)', fontFamily: 'var(--font-display)' }}>AI Parse Split</span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input type="text" placeholder='"Dinner ₹2400 split 4 ways with Raj, Priya, Sam"'
                                        value={nlInput} onChange={e => setNlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleNlParse()}
                                        style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 9, fontSize: '13px', fontFamily: 'var(--font-body)', outline: 'none', transition: 'border-color var(--transition-fast)' }}
                                        onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                                        onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                                    />
                                    <button type="button" onClick={handleNlParse} disabled={nlLoading || !nlInput.trim()}
                                        style={{ padding: '9px 16px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 9, color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: nlLoading || !nlInput.trim() ? 'not-allowed' : 'pointer', opacity: nlLoading || !nlInput.trim() ? 0.6 : 1, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                                        {nlLoading ? '…' : 'Parse'}
                                    </button>
                                </div>
                            </div>

                            {/* ── SPLITS LIST ── */}
                            {splits.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                                    <p style={{ fontSize: '40px', marginBottom: '10px' }}>🧾</p>
                                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>No splits yet</p>
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 18px', fontFamily: 'var(--font-body)' }}>Add a split to track shared expenses and who owes you</p>
                                    <button type="button" onClick={() => setShowSplitModal(true)} style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Add first split</button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {splits.filter(split => !pendingDeleteSplit.has(split.id)).map(split => {
                                        const settled = allSettled(split);
                                        return (
                                            <div key={split.id} style={{ background: 'var(--bg-surface-1)', border: `1px solid ${settled ? 'color-mix(in srgb, var(--color-inc) 20%, transparent)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                                {/* Header */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px 10px', gap: '10px' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{split.description}</span>
                                                            <Badge color={settled ? 'var(--color-inc)' : 'var(--color-warn)'} bg={settled ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-warn) 10%, transparent)'}>
                                                                {settled ? 'Settled' : 'Pending'}
                                                            </Badge>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(parseFloat(split.total_amount))}</span>
                                                            <span style={{ fontSize: '12px', color: 'var(--color-inc)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>Your share: {fmt(parseFloat(split.your_share))}</span>
                                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{formatDate(split.date)}</span>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                                        <button type="button" onClick={() => openEditSplit(split)} aria-label={`Edit ${split.description} split`} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer' }}
                                                            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent-subtle)'; el.style.color = 'var(--accent)'; }}
                                                            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button type="button" onClick={() => handleSplitDelete(split.id)} disabled={splitDeletingId === split.id} aria-label={`Delete ${split.description} split`} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', opacity: splitDeletingId === split.id ? 0.5 : 1 }}
                                                            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'color-mix(in srgb, var(--color-exp) 10%, transparent)'; el.style.color = 'var(--color-exp)'; }}
                                                            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Participants */}
                                                <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '8px 16px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {split.participants.map((p: any, i: number) => (
                                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: p.settled ? 'color-mix(in srgb, var(--color-inc) 12%, transparent)' : 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: p.settled ? 'var(--color-inc)' : 'var(--text-secondary)', flexShrink: 0, fontFamily: 'var(--font-display)' }}>
                                                                {p.name?.[0]?.toUpperCase() || '?'}
                                                            </div>
                                                            <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{p.name}</span>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(parseFloat(p.share))}</span>
                                                            <button type="button" onClick={() => handleSettle(split.id, i)}
                                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: 6, border: `1px solid ${p.settled ? 'color-mix(in srgb, var(--color-inc) 25%, transparent)' : 'var(--border-subtle)'}`, background: p.settled ? 'color-mix(in srgb, var(--color-inc) 8%, transparent)' : 'transparent', color: p.settled ? 'var(--color-inc)' : 'var(--text-muted)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                                                                {p.settled ? <><Check size={11} /> Settled</> : 'Mark settled'}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* ── NEW/EDIT SPLIT MODAL ── */}
                            <Modal isOpen={showSplitModal} onClose={closeSplitModal} title={editingSplit ? 'Edit Split' : 'New Split'} maxWidth="500px">
                                {/* AI Parse */}
                                <GCard style={{ marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                        <Sparkles size={13} color="var(--color-info)" />
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-info)', fontFamily: 'var(--font-display)' }}>AI Parse</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input type="text" placeholder='"Dinner ₹2400 split 4 ways with Raj, Priya, Sam"'
                                            value={nlInput} onChange={e => setNlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleNlParse()}
                                            style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: '12px', fontFamily: 'var(--font-body)', outline: 'none' }} />
                                        <button type="button" onClick={handleNlParse} disabled={nlLoading || !nlInput.trim()}
                                            style={{ padding: '8px 14px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 8, color: 'var(--accent)', fontSize: '12px', fontWeight: 600, cursor: nlLoading || !nlInput.trim() ? 'not-allowed' : 'pointer', opacity: nlLoading || !nlInput.trim() ? 0.6 : 1, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                                            {nlLoading ? '…' : 'Parse'}
                                        </button>
                                    </div>
                                </GCard>

                                <form onSubmit={handleSplitSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)' }}>Description</label>
                                        <input type="text" placeholder="e.g. Dinner at restaurant" value={splitForm.description} onChange={e => setSplitForm({ ...splitForm, description: e.target.value })} required style={splitInputSt} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)' }}>Total Amount *</label>
                                            <div style={{ position: 'relative' }}>
                                                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>₹</span>
                                                <input type="number" placeholder="2400" min="1" step="0.01" value={splitForm.total_amount} onChange={e => setSplitForm({ ...splitForm, total_amount: e.target.value })} required style={{ ...splitInputSt, paddingLeft: 30, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }} />
                                            </div>
                                        </div>
                                        <DatePicker label="Date" value={splitForm.date} onChange={date => setSplitForm({ ...splitForm, date })} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)' }}>Participants (excl. you)</label>
                                            <button type="button" onClick={addParticipant} style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ Add person</button>
                                        </div>
                                        {splitForm.participants.map((p, i) => (
                                            <div key={i} style={{ display: 'flex', gap: '8px' }}>
                                                <input type="text" placeholder={`Person ${i + 1} name`} value={p.name} onChange={e => updateParticipant(i, e.target.value)} style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: '13px', fontFamily: 'var(--font-body)', outline: 'none' }} />
                                                {splitForm.participants.length > 1 && (
                                                    <button type="button" onClick={() => removeParticipant(i)} aria-label={`Remove ${p.name || `person ${i + 1}`}`} style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={13} /></button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {splitForm.total_amount && (
                                        <GCard>
                                            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                                Split {splitCount} ways → <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-inc)', fontVariantNumeric: 'tabular-nums' }}>{fmt(yourShare)} each</strong>
                                            </p>
                                        </GCard>
                                    )}
                                    {splitFormError && (
                                        <div style={{ padding: '8px 12px', background: 'color-mix(in srgb, var(--color-exp) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 20%, transparent)', borderRadius: 8, fontSize: '13px', color: 'var(--color-exp)', fontFamily: 'var(--font-body)' }}>{splitFormError}</div>
                                    )}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <Button type="button" variant="secondary" size="lg" onClick={closeSplitModal}>Cancel</Button>
                                        <Button type="submit" size="lg" isLoading={splitFormLoading}>{editingSplit ? 'Save Changes' : 'Create Split'}</Button>
                                    </div>
                                </form>
                            </Modal>
                        </>
                    )
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* ══ ONE-TIME EXPENSES TAB ══ */}
                {/* ══════════════════════════════════════════════════════════ */}
                {tab === 'one-time' && (
                    <>
                        {/* Header */}
                        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                        {otExpenses.length > 0 ? `${otExpenses.length} entr${otExpenses.length !== 1 ? 'ies' : 'y'}` : 'Trips, events, big purchases — tracked separately'}
                                    </p>
                                </div>
                                <Button onClick={otOpenAddExpense} size="md"><Calendar size={16} /> New Expense</Button>
                            </div>
                        </div>

                        {/* Toast */}
                        {otToast && (
                            <div style={{
                                position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
                                background: 'color-mix(in srgb, var(--color-inc) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-inc) 20%, transparent)',
                                color: 'var(--color-inc)', padding: '10px 20px', borderRadius: '10px',
                                fontSize: '14px', fontWeight: 500, zIndex: 2000, whiteSpace: 'nowrap',
                            }}>
                                {otToast}
                            </div>
                        )}

                        {/* Summary tiles */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                            {[
                                { label: 'TOTAL SPENT', value: otFmt(otTotalSpent), color: 'var(--accent)' },
                                { label: 'THIS YEAR',   value: otFmt(otThisYear),   color: 'var(--accent)'   },
                                { label: 'ENTRIES',     value: String(otExpenses.length), color: 'var(--text-primary)' },
                            ].map(tile => (
                                <div key={tile.label} style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '14px 16px' }}>
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '1px', margin: '0 0 6px', fontWeight: 600 }}>{tile.label}</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: tile.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{tile.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* List */}
                        {otLoading ? (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading…</div>
                        ) : otExpenses.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                                <p style={{ fontSize: '40px', marginBottom: '10px' }}>🧾</p>
                                <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>No one-time expenses yet</p>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 18px', fontFamily: 'var(--font-body)' }}>Log trips, events, or big purchases separately. Add items day by day and watch the total build up.</p>
                                <Button onClick={otOpenAddExpense} size="md"><Calendar size={16} /> Create Your First Expense</Button>
                            </div>
                        ) : (
                            <div>{otExpenses.map(exp => {
                                const isExpanded   = otExpandedId === exp.id;
                                const isAddingItem = otAddingItemFor === exp.id;
                                const dateRange    = otFormatDateRange(exp);

                                const PAY_COLORS: Record<string, string> = {
                                    'UPI': 'var(--accent)',
                                    'Credit Card': 'var(--accent)',
                                    'Debit Card': 'var(--accent)',
                                    'Net Banking': 'var(--accent)',
                                    'Cash': 'var(--color-inc)',
                                    'Other': 'var(--text-muted)',
                                };

                                const fieldLabel: React.CSSProperties = {
                                    fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4,
                                    letterSpacing: '0.4px', textTransform: 'uppercase', display: 'block',
                                };
                                const fieldInput: React.CSSProperties = {
                                    width: '100%', height: 36, borderRadius: 8,
                                    border: '1px solid var(--border-subtle)', background: 'var(--bg-surface-1)',
                                    color: 'var(--text-primary)', fontSize: 13, padding: '0 10px',
                                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                                };

                                return (
                                    <div
                                        key={exp.id}
                                        style={{
                                            background: 'var(--bg-surface-1)',
                                            border: `1px solid ${isExpanded ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--border-subtle)'}`,
                                            borderRadius: 14, marginBottom: 12, overflow: 'hidden',
                                            transition: 'border-color 0.15s',
                                        }}
                                    >
                                        {/* ── Card header ── */}
                                        <div
                                            onClick={() => setOtExpandedId(isExpanded ? null : exp.id)}
                                            style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                                        >
                                            {/* Emoji badge */}
                                            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                                                {OT_CATEGORY_EMOJI[exp.category] || '🧾'}
                                            </div>

                                            {/* Title + meta */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {exp.title}
                                                </span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', fontWeight: 500 }}>
                                                        {exp.category}
                                                    </span>
                                                    {dateRange && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dateRange}</span>}
                                                    {exp.bank_account_name && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>🏦 {exp.bank_account_name}</span>}
                                                </div>
                                            </div>

                                            {/* Total + count + action buttons */}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                                                    {otFmt(Number(exp.total_amount))}
                                                </span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                        {exp.item_count} item{exp.item_count !== 1 ? 's' : ''}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={e => otOpenEditExpense(exp, e)}
                                                        title="Edit"
                                                        aria-label={`Edit ${exp.title}`}
                                                        style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}
                                                    >✏️</button>
                                                    <button
                                                        type="button"
                                                        onClick={e => { e.stopPropagation(); setOtDeleteConfirm(exp); }}
                                                        title="Delete"
                                                        aria-label={`Delete ${exp.title}`}
                                                        style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--color-exp) 30%, transparent)', background: 'color-mix(in srgb, var(--color-exp) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-exp)', fontSize: 13 }}
                                                    >🗑️</button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── Expanded body ── */}
                                        {isExpanded && (
                                            <>
                                                {/* Divider */}
                                                <div style={{ height: 1, background: 'var(--border-subtle)' }} />

                                                <div style={{ padding: '0 20px 4px' }}>

                                                    {/* Item table */}
                                                    {exp.items.length > 0 && (
                                                        <div style={{ overflowX: 'auto' }}>
                                                            {/* Table header */}
                                                            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px 100px 64px', gap: 12, padding: '12px 0 8px', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', borderBottom: '1px solid var(--border-subtle)', minWidth: 460 }}>
                                                                <span>Date</span>
                                                                <span>What</span>
                                                                <span>How Paid</span>
                                                                <span style={{ textAlign: 'right' }}>Amount</span>
                                                                <span />
                                                            </div>

                                                            {/* Item rows */}
                                                            {exp.items.map(item => (
                                                                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px 100px 64px', gap: 12, padding: '12px 0', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', minWidth: 460 }}>
                                                                    {/* Date */}
                                                                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                                                        {new Date((item.date || '').split('T')[0] + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                                    </span>
                                                                    {/* Description + category pill */}
                                                                    <span style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                                                                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                            {item.description}
                                                                        </span>
                                                                        {item.category && item.category !== 'Other' && (
                                                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--bg-surface-3)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', marginLeft: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                                                {item.category}
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                    {/* Payment method with dot */}
                                                                    <span style={{ display: 'flex', alignItems: 'center' }}>
                                                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: PAY_COLORS[item.payment_method] || 'var(--text-muted)', marginRight: 6, flexShrink: 0, display: 'inline-block' }} />
                                                                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{item.payment_method}</span>
                                                                    </span>
                                                                    {/* Amount */}
                                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--color-exp)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                                        {otFmt(Number(item.amount))}
                                                                    </span>
                                                                    {/* Edit + Delete */}
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => otOpenEditItem(exp.id, item)}
                                                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '2px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, borderRadius: 4 }}
                                                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent)'}
                                                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
                                                                            title="Edit"
                                                                            aria-label={`Edit ${item.description}`}
                                                                        >✎</button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => otHandleDeleteItem(exp.id, item.id)}
                                                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, padding: '2px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, borderRadius: 4 }}
                                                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-exp)'}
                                                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
                                                                            title="Remove"
                                                                            aria-label={`Remove ${item.description}`}
                                                                        >×</button>
                                                                    </div>
                                                                </div>
                                                            ))}

                                                            {/* Total row */}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0 4px', borderTop: '1px solid var(--border-subtle)' }}>
                                                                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Total spent</span>
                                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{otFmt(Number(exp.total_amount))}</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Add item toggle */}
                                                    <div
                                                        onClick={() => {
                                                            if (isAddingItem) { setOtAddingItemFor(null); setOtEditingItem(null); setOtItemForm(otEmptyItemForm()); }
                                                            else { setOtAddingItemFor(exp.id); setOtEditingItem(null); setOtItemForm(otEmptyItemForm()); }
                                                        }}
                                                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', fontSize: 13, color: 'var(--accent)', cursor: 'pointer', fontWeight: 500, userSelect: 'none', fontFamily: 'var(--font-body)' }}
                                                    >
                                                        <span style={{ fontSize: 16, lineHeight: 1 }}>{isAddingItem ? '−' : '+'}</span>
                                                        {isAddingItem ? (otEditingItem ? 'Cancel edit' : 'Cancel') : 'Add item'}
                                                    </div>

                                                    {/* Expanded add item form */}
                                                    {isAddingItem && (
                                                        <div style={{ background: 'var(--bg-surface-3)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 16, marginBottom: 12 }}>

                                                            {/* Row 1: description */}
                                                            <div style={{ marginBottom: 12 }}>
                                                                <label style={fieldLabel}>What did you spend on?</label>
                                                                <input
                                                                    style={fieldInput}
                                                                    placeholder="e.g. Dinner, Auto ride, Entry ticket..."
                                                                    value={otItemForm.description}
                                                                    onChange={e => setOtItemForm(f => ({ ...f, description: e.target.value }))}
                                                                    autoFocus
                                                                />
                                                            </div>

                                                            {/* Row 2: date / amount / category */}
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                                                                <div>
                                                                    <label style={fieldLabel}>Date</label>
                                                                    <input
                                                                        type="date"
                                                                        style={fieldInput}
                                                                        value={otItemForm.date}
                                                                        onChange={e => setOtItemForm(f => ({ ...f, date: e.target.value }))}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label style={fieldLabel}>Amount</label>
                                                                    <div style={{ position: 'relative' }}>
                                                                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-secondary)', pointerEvents: 'none' }}>₹</span>
                                                                        <input
                                                                            type="number" min="0" step="1"
                                                                            style={{ ...fieldInput, paddingLeft: 22 }}
                                                                            placeholder="0"
                                                                            value={otItemForm.amount}
                                                                            onChange={e => setOtItemForm(f => ({ ...f, amount: e.target.value }))}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <label style={fieldLabel}>Category</label>
                                                                    <select
                                                                        style={fieldInput}
                                                                        value={otItemForm.category}
                                                                        onChange={e => setOtItemForm(f => ({ ...f, category: e.target.value }))}
                                                                    >
                                                                        {otTxCategories.length > 0
                                                                            ? otTxCategories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)
                                                                            : OT_CATEGORIES.map(c => <option key={c} value={c}>{OT_CATEGORY_EMOJI[c]} {c}</option>)
                                                                        }
                                                                    </select>
                                                                </div>
                                                            </div>

                                                            {/* Row 3: payment method / notes */}
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                                                <div>
                                                                    <label style={fieldLabel}>How paid</label>
                                                                    <select
                                                                        style={fieldInput}
                                                                        value={otItemForm.payment_method}
                                                                        onChange={e => setOtItemForm(f => ({
                                                                            ...f,
                                                                            payment_method: e.target.value,
                                                                            credit_card_id: e.target.value === 'Credit Card' ? (otCards.length === 1 ? otCards[0].id : f.credit_card_id) : null,
                                                                        }))}
                                                                    >
                                                                        {OT_PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label style={fieldLabel}>Notes (optional)</label>
                                                                    <input
                                                                        style={fieldInput}
                                                                        placeholder="Any extra details..."
                                                                        value={(otItemForm as any).notes || ''}
                                                                        onChange={e => setOtItemForm(f => ({ ...f, notes: e.target.value } as any))}
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Row 4: which card (only when Credit Card is selected and there's more than one) */}
                                                            {otItemForm.payment_method === 'Credit Card' && otCards.length > 1 && (
                                                                <div style={{ marginBottom: 14 }}>
                                                                    <label style={fieldLabel}>Which card?</label>
                                                                    <select
                                                                        style={fieldInput}
                                                                        value={otItemForm.credit_card_id ?? ''}
                                                                        onChange={e => setOtItemForm(f => ({ ...f, credit_card_id: e.target.value ? Number(e.target.value) : null }))}
                                                                    >
                                                                        <option value="">Select card</option>
                                                                        {otCards.map((c: any) => (
                                                                            <option key={c.id} value={c.id}>{c.bank_name} {c.card_name}{c.last_four ? ` ••${c.last_four}` : ''}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            )}

                                                            {/* Footer buttons */}
                                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setOtAddingItemFor(null); setOtEditingItem(null); setOtItemForm(otEmptyItemForm()); }}
                                                                    style={{ height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => otEditingItem ? otHandleUpdateItem(exp.id, otEditingItem.item.id) : otHandleAddItem(exp.id)}
                                                                    disabled={otAddingItem || !otItemForm.description || !otItemForm.amount}
                                                                    style={{ height: 34, padding: '0 20px', borderRadius: 8, border: 'none', background: otAddingItem ? 'var(--border-subtle)' : 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: otAddingItem ? 'not-allowed' : 'pointer' }}
                                                                >
                                                                    {otAddingItem ? '…' : otEditingItem ? 'Update item' : '+ Add item'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}</div>
                        )}

                        {/* Delete confirm */}
                        {otDeleteConfirm && otMounted && createPortal(
                            <>
                                <div onClick={() => setOtDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} />
                                <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg-surface-1)', borderRadius: 14, border: '1px solid var(--border-subtle)', padding: '28px', zIndex: 10000, width: 360, maxWidth: '90vw' }}>
                                    <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)' }}>
                                        Delete {otDeleteConfirm.title}?
                                    </p>
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
                                        {otDeleteConfirm.total_amount > 0 && otDeleteConfirm.bank_account_name
                                            ? `This will restore ${otFmt(Number(otDeleteConfirm.total_amount))} to your bank balance.`
                                            : 'This action cannot be undone.'}
                                    </p>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button onClick={() => setOtDeleteConfirm(null)} style={{ flex: 1, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
                                        <button onClick={() => otHandleDeleteExpense(otDeleteConfirm)} style={{ flex: 1, background: 'var(--color-exp)', border: 'none', borderRadius: 10, padding: '10px', fontSize: '14px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>Delete</button>
                                    </div>
                                </div>
                            </>,
                            document.body
                        )}

                        {/* Add/Edit modal */}
                        {otShowModal && otMounted && createPortal(
                            <div onClick={e => e.stopPropagation()} style={otModalStyle}>
                                {otIsMobile && <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-subtle)', margin: '0 auto 16px' }} />}
                                <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px', fontFamily: 'var(--font-display)' }}>
                                    {otEditingExp ? 'Edit Expense' : 'New One-Time Expense'}
                                </h2>

                                <form onSubmit={otHandleSaveExpense}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                                        <div>
                                            <label style={otLabelStyle}>Expense Name *</label>
                                            <input style={otInputStyle} placeholder="e.g. Goa Trip, MacBook Pro" value={otExpForm.title} onChange={e => setOtExpForm(f => ({ ...f, title: e.target.value }))} required />
                                        </div>

                                        <div>
                                            <label style={otLabelStyle}>Category</label>
                                            <select style={otInputStyle} value={otExpForm.category} onChange={e => setOtExpForm(f => ({ ...f, category: e.target.value }))}>
                                                {OT_CATEGORIES.map(c => <option key={c} value={c}>{OT_CATEGORY_EMOJI[c]} {c}</option>)}
                                            </select>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            <div>
                                                <label style={otLabelStyle}>Start Date</label>
                                                <input style={otInputStyle} type="date" value={otExpForm.start_date} onChange={e => setOtExpForm(f => ({ ...f, start_date: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label style={otLabelStyle}>End Date</label>
                                                <input style={otInputStyle} type="date" value={otExpForm.end_date} onChange={e => setOtExpForm(f => ({ ...f, end_date: e.target.value }))} />
                                            </div>
                                        </div>

                                        <div>
                                            <label style={otLabelStyle}>Bank Account</label>
                                            <select style={otInputStyle} value={otExpForm.bank_account_id} onChange={e => setOtExpForm(f => ({ ...f, bank_account_id: e.target.value }))}>
                                                <option value="">No account (cash)</option>
                                                {otAccounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}{a.bank_name ? ` — ${a.bank_name}` : ''}</option>)}
                                            </select>
                                        </div>

                                        <div>
                                            <label style={otLabelStyle}>Notes</label>
                                            <textarea style={{ ...otInputStyle, minHeight: 64, resize: 'vertical' }} placeholder="Optional notes…" value={otExpForm.notes} onChange={e => setOtExpForm(f => ({ ...f, notes: e.target.value }))} />
                                        </div>

                                        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                                            <button type="button" onClick={() => setOtShowModal(false)} style={{ flex: 1, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
                                            <button type="submit" disabled={otSavingExp} style={{ flex: 2, background: otSavingExp ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, padding: '12px', fontSize: '14px', fontWeight: 600, color: '#fff', cursor: otSavingExp ? 'not-allowed' : 'pointer' }}>
                                                {otSavingExp ? 'Saving…' : otEditingExp ? 'Save Changes' : 'Create Expense'}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>,
                            document.body
                        )}
                    </>
                )}

            </div>
    );
}

export default function BudgetsPage() {
    return <Suspense><BudgetsPageInner /></Suspense>;
}
