'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { budgetsAPI, categoriesAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function BudgetsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const [budgets, setBudgets] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [formCategory, setFormCategory] = useState('');
    const [formAmount, setFormAmount] = useState('');
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');

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
        try { await budgetsAPI.delete(id); fetchBudgets(); }
        catch { alert('Failed to delete.'); }
        finally { setDeletingId(null); setConfirmDeleteId(null); }
    };

    const totalBudgeted = budgets.reduce((s, b) => s + parseFloat(b.amount), 0);
    const totalSpent = budgets.reduce((s, b) => s + parseFloat(b.spent), 0);
    const overBudget = budgets.filter(b => parseFloat(b.spent) > parseFloat(b.amount)).length;

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} height={120} />)}
            </div>
        </AppLayout>
    );

    return (
        <AppLayout>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Budgets</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>{MONTH_NAMES[currentMonth]} {currentYear}</p>
                </div>
                <Button onClick={() => setShowForm(!showForm)} size="md"><Plus size={16} />{isMobile ? 'Add' : 'Set Budget'}</Button>
            </div>

            {showForm && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent-green-border)', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Set Budget for {MONTH_NAMES[currentMonth]}</h3>
                    <form onSubmit={handleAdd}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Category</label>
                                <select value={formCategory} onChange={e => setFormCategory(e.target.value)}
                                    style={{ padding: '10px 14px', background: 'var(--bg-card)', color: formCategory ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer' }}>
                                    <option value="">Select category</option>
                                    {categories.filter(c => !budgets.find(b => b.category_id === c.id)).map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Monthly Limit (₹)</label>
                                <input type="number" placeholder="5000" min="1" value={formAmount} onChange={e => setFormAmount(e.target.value)}
                                    style={{ padding: '10px 14px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none' }} />
                            </div>
                            <Button type="submit" isLoading={formLoading} size="md">Save</Button>
                        </div>
                        {formError && <p style={{ fontSize: '0.8rem', color: 'var(--accent-red)', margin: '10px 0 0 0' }}>{formError}</p>}
                    </form>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Total Budgeted', value: formatCurrency(totalBudgeted, user.currency), color: 'var(--accent-blue)' },
                    { label: 'Total Spent', value: formatCurrency(totalSpent, user.currency), color: 'var(--accent-red)' },
                    { label: 'Remaining', value: formatCurrency(Math.max(totalBudgeted - totalSpent, 0), user.currency), color: 'var(--accent-green)' },
                    { label: 'Over Budget', value: `${overBudget} categor${overBudget === 1 ? 'y' : 'ies'}`, color: overBudget > 0 ? 'var(--accent-red)' : 'var(--accent-green)' },
                ].map(card => (
                    <div key={card.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '14px', padding: '16px 20px' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>{card.label}</p>
                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.15rem', fontWeight: 600, color: card.color, margin: 0 }}>{card.value}</p>
                    </div>
                ))}
            </div>

            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
            ) : budgets.length === 0 ? (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '60px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 16px 0' }}>No budgets for {MONTH_NAMES[currentMonth]} yet</p>
                    <Button onClick={() => setShowForm(true)} size="sm">Set your first budget</Button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {budgets.map(budget => {
                        const spent = parseFloat(budget.spent);
                        const limit = parseFloat(budget.amount);
                        const pct = Math.min((spent / limit) * 100, 100);
                        const isOver = spent > limit;
                        const isNear = pct >= 80 && !isOver;
                        const barColor = isOver ? 'var(--accent-red)' : isNear ? 'var(--accent-yellow)' : budget.category_color;
                        const isConfirmDelete = confirmDeleteId === budget.id;

                        return (
                            <div key={budget.id} style={{ background: 'var(--bg-secondary)', border: `1px solid ${isOver ? 'var(--accent-red-border)' : isNear ? 'var(--accent-yellow-border)' : 'var(--bg-border)'}`, borderRadius: '16px', padding: '20px 24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: budget.category_color }} />
                                        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{budget.category_name}</span>
                                        {isOver && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--accent-red)', background: 'var(--accent-red-bg)', border: '1px solid var(--accent-red-border)', padding: '2px 8px', borderRadius: '6px' }}><AlertTriangle size={10} />Over budget</span>}
                                        {isNear && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--accent-yellow)', background: 'var(--accent-yellow-bg)', border: '1px solid var(--accent-yellow-border)', padding: '2px 8px', borderRadius: '6px' }}><AlertTriangle size={10} />Near limit</span>}
                                        {!isOver && !isNear && pct > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--accent-green)', background: 'var(--accent-green-bg)', border: '1px solid var(--accent-green-border)', padding: '2px 8px', borderRadius: '6px' }}><CheckCircle size={10} />On track</span>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 2px 0' }}>{formatCurrency(spent, user.currency)} of {formatCurrency(limit, user.currency)}</p>
                                            <p style={{ fontSize: '0.72rem', color: isOver ? 'var(--accent-red)' : 'var(--text-secondary)', margin: 0 }}>{isOver ? `${formatCurrency(spent - limit, user.currency)} over` : `${formatCurrency(Math.max(limit - spent, 0), user.currency)} remaining`}</p>
                                        </div>
                                        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '1rem', fontWeight: 700, color: barColor, minWidth: '44px', textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                                        {isConfirmDelete ? (
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button onClick={() => handleDelete(budget.id)} disabled={deletingId === budget.id}
                                                    style={{ padding: '4px 8px', borderRadius: '6px', background: 'var(--accent-red-bg)', border: '1px solid var(--accent-red-border)', color: 'var(--accent-red)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                                                    {deletingId === budget.id ? '...' : 'Delete'}
                                                </button>
                                                <button onClick={() => setConfirmDeleteId(null)}
                                                    style={{ padding: '4px 8px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={() => setConfirmDeleteId(budget.id)} disabled={!!deletingId}
                                                style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: deletingId === budget.id ? 0.5 : 1, transition: 'all var(--transition-fast)' }}
                                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-red-bg)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)'; }}
                                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div style={{ height: '8px', background: 'var(--bg-border)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '4px', transition: 'width var(--transition-slow)', boxShadow: `0 0 8px ${barColor}60` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
