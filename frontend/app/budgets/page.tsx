'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { budgetsAPI, categoriesAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Modal } from '@/components/ui/Modal';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { toast } from '@/store/toastStore';

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

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

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
    }, [user]);

    // ── Handlers (logic unchanged) ────────────────────────────────────────────

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

    // ── Derived totals ────────────────────────────────────────────────────────

    const totalBudgeted  = budgets.reduce((s, b) => s + parseFloat(b.amount), 0);
    const totalSpent     = budgets.reduce((s, b) => s + parseFloat(b.spent),  0);
    const totalRemaining = Math.max(totalBudgeted - totalSpent, 0);
    const overallRawPct  = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
    const overBudgetList = budgets.filter(b => parseFloat(b.spent) > parseFloat(b.amount));
    const isOverTotal    = totalSpent > totalBudgeted;

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
                        <button type="button" onClick={() => { setShowForm(true); setFormError(''); setFormCategory(''); setFormAmount(''); }}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px', background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            <Plus size={14} /> {isMobile ? 'Add' : 'Add Budget'}
                        </button>
                    </div>
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

                {/* ── BUDGET CATEGORY CARDS ── */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                            Budget Categories
                        </h2>
                        <button type="button" onClick={() => { setShowForm(true); setFormError(''); setFormCategory(''); setFormAmount(''); }}
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
                            <button type="button" onClick={() => setShowForm(true)} style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                Set your first budget
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {budgets.map(budget => {
                                const spent    = parseFloat(budget.spent);
                                const limit    = parseFloat(budget.amount);
                                const rawPct   = limit > 0 ? (spent / limit) * 100 : 0;
                                const isOver   = spent > limit;
                                const overAmt  = isOver ? spent - limit : 0;
                                const leftAmt  = isOver ? 0 : limit - spent;
                                const barColor = isOver ? 'var(--color-exp)' : 'var(--accent-2)';
                                const emojiBg  = isOver ? 'color-mix(in srgb, var(--color-exp) 12%, transparent)' : 'var(--accent-light)';

                                return (
                                    <div key={budget.id} style={{ background: 'var(--bg-card)', border: `1px solid ${isOver ? 'color-mix(in srgb, var(--color-exp) 20%, transparent)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: '16px' }}>
                                        {/* Top row: emoji + name + budget amount | spent + over/left */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '10px' }}>
                                            {/* Left: emoji icon + name + limit */}
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

                                            {/* Right: spent + over/left + actions */}
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

                                                {/* Edit / Delete */}
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

                                        {/* ProgressBar */}
                                        <ProgressBar pct={rawPct} color={barColor} height={6} />

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
