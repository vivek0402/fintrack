'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, AlertCircle, BarChart2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { budgetsAPI, categoriesAPI, analyticsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Modal } from '@/components/ui/Modal';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { toast } from '@/store/toastStore';
import { SuggestionsBanner, SuggestionItem } from '@/components/budgets/SuggestionsBanner';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

const fmt = (n: number) => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

const inputSt: React.CSSProperties = { width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' };
const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block', fontFamily: 'var(--font-body)' };
const iconBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

export default function BudgetsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();
    const currentMonth = new Date().getMonth() + 1;
    const currentYear  = new Date().getFullYear();

    const [budgets, setBudgets]       = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading]       = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [showForm, setShowForm]         = useState(false);
    const [formCategory, setFormCategory] = useState('');
    const [formAmount, setFormAmount]     = useState('');
    const [formLoading, setFormLoading]   = useState(false);
    const [formError, setFormError]       = useState('');
    const [editingId, setEditingId]   = useState<string | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError]   = useState('');

    // Smart budget features
    const [prevMonthBudgets, setPrevMonthBudgets]   = useState<any[]>([]);
    const [prev2MonthBudgets, setPrev2MonthBudgets] = useState<any[]>([]);
    const [monthlyIncome, setMonthlyIncome]         = useState(0);
    const [dismissed, setDismissed]                 = useState<Set<string>>(new Set());
    const [rolloverEnabled, setRolloverEnabled]     = useState<Record<string, boolean>>({});
    const [zeroBasedMode, setZeroBasedMode]         = useState(false);
    const [healthFilter, setHealthFilter]           = useState<'all'|'on-track'|'over'|'suggestion'>('all');
    const [adjusting, setAdjusting]                 = useState<string | null>(null);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    // Load persisted preferences
    useEffect(() => {
        try { setDismissed(new Set(JSON.parse(localStorage.getItem('fintrack-budget-dismissed') ?? '[]'))); } catch {}
        try { setRolloverEnabled(JSON.parse(localStorage.getItem('fintrack-budget-rollover') ?? '{}')); } catch {}
    }, []);

    const fetchBudgets = async () => {
        setLoading(true);
        try {
            const res = await budgetsAPI.getAll({ month: currentMonth, year: currentYear });
            setBudgets(res.data.budgets);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        if (!user) return;
        fetchBudgets();
        categoriesAPI.getAll().then(res => setCategories(res.data.categories)).catch(console.error);

        // Fetch prev 2 months + current summary for suggestions / zero-based mode
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

    // ── Smart suggestions ─────────────────────────────────────────────────────
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

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (!formCategory || !formAmount) { setFormError('Please select a category and enter an amount.'); return; }
        setFormLoading(true);
        try {
            await budgetsAPI.create({ category_id: formCategory, amount: parseFloat(formAmount), month: currentMonth, year: currentYear });
            setFormCategory(''); setFormAmount(''); setShowForm(false); fetchBudgets();
        } catch (err: any) { setFormError(err.response?.data?.error || 'Failed to save.'); }
        finally { setFormLoading(false); }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try { await budgetsAPI.delete(id); fetchBudgets(); toast.success('Budget deleted'); }
        catch { toast.error('Failed to delete budget'); }
        finally { setDeletingId(null); setConfirmDeleteId(null); }
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

    // ── Derived totals ────────────────────────────────────────────────────────

    const totalBudgeted   = budgets.reduce((s, b) => s + parseFloat(b.amount), 0);
    const totalSpent      = budgets.reduce((s, b) => s + parseFloat(b.spent),  0);
    const totalRemaining  = Math.max(totalBudgeted - totalSpent, 0);
    const overallRawPct   = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
    const overBudgetList  = budgets.filter(b => parseFloat(b.spent) > parseFloat(b.amount));
    const isOverTotal     = totalSpent > totalBudgeted;
    const onTrackCount    = budgets.filter(b => parseFloat(b.spent) <= parseFloat(b.amount)).length;
    const unallocated     = monthlyIncome - totalBudgeted;
    const filteredBudgets = healthFilter === 'all'       ? budgets
        : healthFilter === 'on-track'                    ? budgets.filter(b => parseFloat(b.spent) <= parseFloat(b.amount))
        : healthFilter === 'over'                        ? budgets.filter(b => parseFloat(b.spent) >  parseFloat(b.amount))
        : budgets.filter(b => suggestions.some(s => s.categoryId === b.category_id));

    // ── Loading skeleton ──────────────────────────────────────────────────────

    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <SkeletonCard height={64} />
                <SkeletonCard height={64} />
            </div>
            <SkeletonCard height={70} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={110} />)}
            </div>
        </AppLayout>
    );

    const openAdd = () => { setShowForm(true); setFormError(''); setFormCategory(''); setFormAmount(''); };
    const chipStyle = (active: boolean): React.CSSProperties => ({
        fontSize: '11px', padding: '4px 10px', borderRadius: '20px', border: 'none',
        cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: active ? 600 : 400,
        background: active ? 'var(--accent)' : 'var(--bg-alt)',
        color: active ? 'white' : 'var(--text-secondary)',
        transition: 'all var(--transition-fast)',
    });

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Budgets</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                {MONTH_NAMES[currentMonth]} {currentYear} · {budgets.length} {budgets.length === 1 ? 'category' : 'categories'}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            <button type="button" onClick={() => setZeroBasedMode(v => !v)}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '7px 10px', background: zeroBasedMode ? 'var(--accent-light)' : 'var(--bg-alt)', border: `1px solid ${zeroBasedMode ? 'var(--accent-border)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', color: zeroBasedMode ? 'var(--accent)' : 'var(--text-muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                <BarChart2 size={12} /> {isMobile ? '0-base' : 'Zero-based'}
                            </button>
                            <button type="button" onClick={openAdd}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px', background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                <Plus size={14} /> {isMobile ? 'Add' : 'Add Budget'}
                            </button>
                        </div>
                    </div>

                    {/* ── BUDGET HEALTH CHIPS ── */}
                    {!loading && budgets.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                            {([
                                { id: 'all',        label: 'All',           count: budgets.length },
                                { id: 'on-track',   label: '✅ On track',   count: onTrackCount },
                                { id: 'over',       label: '🔴 Over budget', count: overBudgetList.length },
                                { id: 'suggestion', label: '💡 Suggestions', count: suggestions.length },
                            ] as const).map(chip => (
                                <button key={chip.id} type="button"
                                    onClick={() => setHealthFilter(healthFilter === chip.id ? 'all' : chip.id)}
                                    style={chipStyle(healthFilter === chip.id)}>
                                    {chip.label} · {chip.count}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── SUMMARY GCARDS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <GCard>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Total Budget</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700, color: 'var(--accent)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalBudgeted)}</p>
                    </GCard>
                    <GCard>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Spent So Far</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700, color: isOverTotal ? 'var(--color-exp)' : 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalSpent)}</p>
                    </GCard>
                </div>

                {/* ── OVERALL PROGRESS CARD ── */}
                {budgets.length > 0 && (
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <p style={{ fontFamily: 'var(--font-head)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Overall Usage</p>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 800, color: isOverTotal ? 'var(--color-exp)' : 'var(--accent)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
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
                    <div style={{ background: 'var(--accent-light)', border: '1.5px solid var(--accent-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
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
                            <p style={{ fontFamily: 'var(--font-head)', fontSize: '13px', fontWeight: 700, color: 'var(--color-warn)', margin: '0 0 3px' }}>
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

                {/* ── BUDGET CATEGORY CARDS ── */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                            Budget Categories {healthFilter !== 'all' && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px' }}>({filteredBudgets.length} shown)</span>}
                        </h2>
                        <button type="button" onClick={openAdd}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            <Plus size={12} /> Add Budget
                        </button>
                    </div>

                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {[1, 2, 3].map(i => <SkeletonCard key={i} height={110} />)}
                        </div>
                    ) : budgets.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                            <p style={{ fontSize: '40px', marginBottom: '10px' }}>🎯</p>
                            <p style={{ fontFamily: 'var(--font-head)', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>No budgets set</p>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 18px', fontFamily: 'var(--font-body)' }}>Set monthly limits to stay on track</p>
                            <button type="button" onClick={openAdd} style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                Set your first budget
                            </button>
                        </div>
                    ) : filteredBudgets.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px 24px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>No budgets match this filter</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {filteredBudgets.map(budget => {
                                const spent    = parseFloat(budget.spent);
                                const limit    = parseFloat(budget.amount);
                                const rawPct   = limit > 0 ? (spent / limit) * 100 : 0;
                                const isOver   = spent > limit;
                                const overAmt  = isOver ? spent - limit : 0;
                                const leftAmt  = isOver ? 0 : limit - spent;
                                const barColor = isOver ? 'var(--color-exp)' : 'var(--accent-2)';
                                const emojiBg  = isOver ? 'color-mix(in srgb, var(--color-exp) 12%, transparent)' : 'var(--accent-light)';
                                const rollover = rolloverEnabled[budget.category_id];
                                const prevB    = prevMonthBudgets.find(p => p.category_id === budget.category_id);
                                const rolloverAmt = prevB ? Math.max(0, parseFloat(prevB.amount) - parseFloat(prevB.spent)) : 0;

                                return (
                                    <div key={budget.id} style={{ background: 'var(--bg-card)', border: `1px solid ${isOver ? 'color-mix(in srgb, var(--color-exp) 20%, transparent)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: emojiBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '18px' }}>
                                                    {budget.category_icon || budget.category_emoji || '📊'}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {budget.category_name}
                                                    </p>
                                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                                                        Budget: {fmt(limit)}
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
                                                    ) : (
                                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)', fontVariantNumeric: 'tabular-nums' }}>
                                                            {fmt(leftAmt)} left
                                                        </p>
                                                    )}
                                                </div>

                                                {confirmDeleteId === budget.id ? (
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button type="button" onClick={() => handleDelete(budget.id)} disabled={deletingId === budget.id}
                                                            style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'color-mix(in srgb, var(--color-exp) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 20%, transparent)', color: 'var(--color-exp)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                                            {deletingId === budget.id ? '…' : 'Delete'}
                                                        </button>
                                                        <button type="button" onClick={() => setConfirmDeleteId(null)}
                                                            style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-alt)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                                            Cancel
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button type="button" onClick={() => { setEditingId(budget.id); setEditAmount(String(parseFloat(budget.amount))); setEditError(''); }} style={iconBtn}
                                                            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent-light)'; el.style.color = 'var(--accent)'; }}
                                                            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button type="button" onClick={() => setConfirmDeleteId(budget.id)} disabled={!!deletingId} style={iconBtn}
                                                            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'color-mix(in srgb, var(--color-exp) 10%, transparent)'; el.style.color = 'var(--color-exp)'; }}
                                                            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <ProgressBar pct={rawPct} color={barColor} height={6} />

                                        {/* Rollover toggle + amount */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '7px' }}>
                                            <button type="button" onClick={() => toggleRollover(budget.category_id)}
                                                style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', border: `1px solid ${rollover ? 'var(--accent-border)' : 'var(--border)'}`, background: rollover ? 'var(--accent-light)' : 'transparent', color: rollover ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500, transition: 'all var(--transition-fast)' }}>
                                                ↩ Rollover
                                            </button>
                                            {rollover && rolloverAmt > 0 && (
                                                <span style={{ fontSize: '11px', color: 'var(--color-inc)', fontFamily: 'var(--font-body)' }}>
                                                    (+{fmt(rolloverAmt)} rolled over from last month)
                                                </span>
                                            )}
                                        </div>

                                        {/* Inline edit */}
                                        {editingId === budget.id && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 13 }}>₹</span>
                                                    <input type="number" min="1" value={editAmount} onChange={e => setEditAmount(e.target.value)} autoFocus
                                                        style={{ width: 120, padding: '6px 8px 6px 22px', borderRadius: 'var(--radius-md)', background: 'var(--bg-alt)', border: '1px solid var(--accent)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', fontVariantNumeric: 'tabular-nums' }} />
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

            </div>

            {/* ── ADD BUDGET MODAL ── */}
            <Modal isOpen={showForm} onClose={() => { setShowForm(false); setFormError(''); }} title={`Set Budget — ${MONTH_NAMES[currentMonth]}`} maxWidth="440px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button type="button" onClick={() => { setShowForm(false); setFormError(''); }} style={{ padding: 10, background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="submit" form="add-budget-form" disabled={formLoading || !formCategory || !formAmount} style={{ padding: 10, background: formLoading || !formCategory || !formAmount ? 'var(--border)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: formLoading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
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

        </AppLayout>
    );
}
