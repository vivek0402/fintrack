'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, RefreshCw, Pause, Play, TrendingUp, TrendingDown, Sparkles, X, Pencil } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { recurringAPI, categoriesAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard, SkeletonCircle } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import PageHelp from '@/components/ui/PageHelp';

export default function RecurringPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [recurring, setRecurring] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [form, setForm] = useState({ type: 'expense' as 'income' | 'expense', amount: '', description: '', frequency: 'monthly', day_of_month: '', category_id: '' });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ type: 'expense' as 'income' | 'expense', amount: '', description: '', frequency: 'monthly', day_of_month: '', category_id: '' });
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');

    // AI patterns state
    const [patterns, setPatterns] = useState<any[]>([]);
    const [dismissedPatterns, setDismissedPatterns] = useState<Set<number>>(new Set());
    const [patternsLoading, setPatternsLoading] = useState(false);
    const [addingPattern, setAddingPattern] = useState<number | null>(null);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [recRes, catRes] = await Promise.all([recurringAPI.getAll(), categoriesAPI.getAll()]);
            setRecurring(recRes.data.recurring);
            setCategories(catRes.data.categories);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const fetchPatterns = async () => {
        setPatternsLoading(true);
        try {
            const res = await aiAPI.detectPatterns();
            setPatterns(res.data.patterns || []);
            setDismissedPatterns(new Set());
        } catch { setPatterns([]); }
        finally { setPatternsLoading(false); }
    };

    useEffect(() => {
        if (user) {
            fetchData();
            fetchPatterns();
        }
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setFormError(''); setFormLoading(true);
        try {
            await recurringAPI.create({ type: form.type, amount: parseFloat(form.amount), description: form.description, frequency: form.frequency, day_of_month: form.day_of_month ? parseInt(form.day_of_month) : undefined, category_id: form.category_id || undefined });
            setForm({ type: 'expense', amount: '', description: '', frequency: 'monthly', day_of_month: '', category_id: '' });
            setShowForm(false); fetchData();
        } catch (err: any) { setFormError(err.response?.data?.error || 'Failed to save.'); }
        finally { setFormLoading(false); }
    };

    const handleToggle = async (id: string) => {
        setTogglingId(id);
        try { await recurringAPI.toggle(id); fetchData(); }
        finally { setTogglingId(null); }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setEditError(''); setEditLoading(true);
        try {
            await recurringAPI.update(editingId!, {
                type: editForm.type,
                amount: parseFloat(editForm.amount),
                description: editForm.description,
                frequency: editForm.frequency,
                day_of_month: editForm.day_of_month ? parseInt(editForm.day_of_month) : undefined,
                category_id: editForm.category_id || undefined,
            });
            setEditingId(null); fetchData();
        } catch (err: any) { setEditError(err.response?.data?.error || 'Failed to update.'); }
        finally { setEditLoading(false); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this recurring transaction?')) return;
        setDeletingId(id);
        try { await recurringAPI.delete(id); fetchData(); }
        finally { setDeletingId(null); }
    };

    const handleAddPattern = async (pattern: any, idx: number) => {
        setAddingPattern(idx);
        try {
            await recurringAPI.create({
                type: 'expense',
                amount: pattern.amount,
                description: pattern.description || pattern.merchant,
                frequency: pattern.frequency,
            });
            setDismissedPatterns(prev => new Set([...prev, idx]));
            fetchData();
        } catch { /* silent */ }
        finally { setAddingPattern(null); }
    };

    const formatNextDate = (dateStr: string) => {
        if (!dateStr) return 'Not set';
        try {
            const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
            const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${day} ${months[month]} ${year}`;
        } catch { return 'Not set'; }
    };

    const freqLabel = (r: any) => {
        if (r.frequency === 'monthly' && r.day_of_month) {
            const s = r.day_of_month === 1 ? 'st' : r.day_of_month === 2 ? 'nd' : r.day_of_month === 3 ? 'rd' : 'th';
            return `Monthly on the ${r.day_of_month}${s}`;
        }
        return r.frequency.charAt(0).toUpperCase() + r.frequency.slice(1);
    };

    const visiblePatterns = patterns.filter((_, i) => !dismissedPatterns.has(i));

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1,2,3,4,5].map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '12px' }}>
                        <SkeletonCircle size={40} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <Skeleton width="50%" height={14} borderRadius={4} />
                            <Skeleton width="30%" height={12} borderRadius={4} />
                        </div>
                        <Skeleton width={72} height={20} borderRadius={6} />
                    </div>
                ))}
            </div>
        </AppLayout>
    );

    return (
        <AppLayout>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Recurring Transactions</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>Automate your regular income and expenses</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Button onClick={() => setShowForm(!showForm)} size="md"><Plus size={16} />Add Recurring</Button>
                    <PageHelp title="Recurring" sections={[
                        { icon: '🔄', heading: 'What is this page?', body: 'Manage recurring transactions like monthly salary, rent, subscriptions, and EMIs that happen on a regular schedule.' },
                        { icon: '🤖', heading: 'Auto-detection', body: "FinTrack's AI scans your transaction history and suggests recurring patterns it detects — like a monthly Netflix charge or rent payment." },
                        { icon: '➕', heading: 'Adding recurring items', body: "Tap '+ Add Recurring' to manually set up a recurring transaction with amount, category, frequency, and next due date." },
                    ]} />
                </div>
            </div>

            {/* AI Detected Patterns Banner */}
            {(patternsLoading || visiblePatterns.length > 0) && (
                <div style={{ marginBottom: '20px' }}>
                    {patternsLoading ? (
                        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '14px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Sparkles size={16} color="var(--accent-blue)" />
                            <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>AI is scanning your transactions for recurring patterns…</span>
                            <div style={{ width: '14px', height: '14px', border: '2px solid var(--accent-blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginLeft: 'auto' }} />
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                <Sparkles size={16} color="var(--accent-blue)" />
                                <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    AI found {visiblePatterns.length} potential recurring transaction{visiblePatterns.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {visiblePatterns.map((p, i) => {
                                    const realIdx = patterns.indexOf(p);
                                    return (
                                        <div key={realIdx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderLeft: '3px solid var(--accent-blue)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>{p.merchant || p.description}</span>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 7px', borderRadius: '20px', background: p.confidence === 'high' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: p.confidence === 'high' ? '#10b981' : '#f59e0b', border: `1px solid ${p.confidence === 'high' ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
                                                        {p.confidence}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '10px', marginTop: '3px' }}>
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>₹{p.amount?.toLocaleString('en-IN')}</span>
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{p.frequency}</span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                                <button
                                                    onClick={() => handleAddPattern(p, realIdx)}
                                                    disabled={addingPattern === realIdx}
                                                    style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', color: '#10b981', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', opacity: addingPattern === realIdx ? 0.6 : 1 }}
                                                >
                                                    {addingPattern === realIdx ? 'Adding…' : '+ Add'}
                                                </button>
                                                <button
                                                    onClick={() => setDismissedPatterns(prev => new Set([...prev, realIdx]))}
                                                    style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--bg-border)', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer' }}
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

            {showForm && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>New Recurring Transaction</h3>
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Type</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                    {(['expense', 'income'] as const).map(t => (
                                        <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                                            style={{ padding: '8px', borderRadius: '8px', border: form.type === t ? `1px solid ${t === 'income' ? '#10b981' : '#f43f5e'}` : '1px solid var(--bg-border)', background: form.type === t ? t === 'income' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)' : 'var(--bg-card)', color: form.type === t ? t === 'income' ? '#10b981' : '#f43f5e' : 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
                                    ))}
                                </div>
                            </div>
                            <Input label="Amount (₹)" type="number" placeholder="5000" min="1" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
                            <Input label="Description" type="text" placeholder="Monthly Salary" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Frequency</label>
                                <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}
                                    style={{ padding: '10px 14px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer' }}>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                            </div>
                            {form.frequency === 'monthly' && <Input label="Day of Month" type="number" placeholder="1" min="1" max="31" value={form.day_of_month} onChange={e => setForm({ ...form, day_of_month: e.target.value })} />}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Category</label>
                                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                                    style={{ padding: '10px 14px', background: 'var(--bg-card)', color: form.category_id ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer' }}>
                                    <option value="">Select category</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>
                        {formError && <p style={{ fontSize: '0.8rem', color: '#f87171', margin: '0 0 12px 0' }}>{formError}</p>}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button type="submit" isLoading={formLoading} size="md">Save</Button>
                            <Button type="button" variant="secondary" size="md" onClick={() => setShowForm(false)}>Cancel</Button>
                        </div>
                    </form>
                </div>
            )}

            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
            ) : recurring.length === 0 ? (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '60px', textAlign: 'center' }}>
                    <RefreshCw size={32} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 16px 0' }}>No recurring transactions yet</p>
                    <Button onClick={() => setShowForm(true)} size="sm">Add your first one</Button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {recurring.map(r => {
                        const isIncome = r.type === 'income';
                        return (
                            <div key={r.id}>
                                <div style={{ background: 'var(--bg-secondary)', border: `1px solid ${r.is_active ? 'var(--bg-border)' : 'var(--bg-card)'}`, borderRadius: editingId === r.id ? '14px 14px 0 0' : '14px', padding: '16px 20px', opacity: r.is_active ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: isIncome ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            {isIncome ? <TrendingUp size={16} color="#10b981" /> : <TrendingDown size={16} color="#f43f5e" />}
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>{r.description}</p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{freqLabel(r)}</span>
                                                {r.category_name && <span style={{ fontSize: '0.7rem', color: r.category_color || 'var(--text-muted)', background: `${r.category_color}20`, padding: '1px 6px', borderRadius: '4px' }}>{r.category_name}</span>}
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Next: {formatNextDate(r.next_due_date)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: isIncome ? '#10b981' : '#f43f5e', margin: 0 }}>{isIncome ? '+' : '-'}{formatCurrency(parseFloat(r.amount), user.currency)}</p>
                                        <button onClick={() => handleToggle(r.id)} disabled={togglingId === r.id} title={r.is_active ? 'Pause' : 'Resume'}
                                            style={{ width: '32px', height: '32px', borderRadius: '8px', background: r.is_active ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)', border: r.is_active ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(16,185,129,0.2)', color: r.is_active ? '#f59e0b' : '#10b981', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: togglingId === r.id ? 0.5 : 1 }}>
                                            {r.is_active ? <Pause size={13} /> : <Play size={13} />}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setEditingId(r.id);
                                                setEditForm({
                                                    type: r.type,
                                                    amount: String(r.amount),
                                                    description: r.description,
                                                    frequency: r.frequency,
                                                    day_of_month: r.day_of_month ? String(r.day_of_month) : '',
                                                    category_id: r.category_id || '',
                                                });
                                                setEditError('');
                                            }}
                                            title="Edit"
                                            style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.1)'; (e.currentTarget as HTMLElement).style.color = '#3b82f6'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                            <Pencil size={14} />
                                        </button>
                                        <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}
                                            style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: deletingId === r.id ? 0.5 : 1 }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(244,63,94,0.1)'; (e.currentTarget as HTMLElement).style.color = '#f43f5e'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                {editingId === r.id && (
                                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(59,130,246,0.2)', borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '20px' }}>
                                        <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Edit Recurring Transaction</h3>
                                        <form onSubmit={handleEditSubmit}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Type</label>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                                        {(['expense', 'income'] as const).map(t => (
                                                            <button key={t} type="button" onClick={() => setEditForm({ ...editForm, type: t })}
                                                                style={{ padding: '8px', borderRadius: '8px', border: editForm.type === t ? `1px solid ${t === 'income' ? '#10b981' : '#f43f5e'}` : '1px solid var(--bg-border)', background: editForm.type === t ? t === 'income' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)' : 'var(--bg-card)', color: editForm.type === t ? t === 'income' ? '#10b981' : '#f43f5e' : 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <Input label="Amount (₹)" type="number" placeholder="5000" min="1" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} required />
                                                <Input label="Description" type="text" placeholder="Monthly Salary" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} required />
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Frequency</label>
                                                    <select value={editForm.frequency} onChange={e => setEditForm({ ...editForm, frequency: e.target.value })}
                                                        style={{ padding: '10px 14px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer' }}>
                                                        <option value="daily">Daily</option>
                                                        <option value="weekly">Weekly</option>
                                                        <option value="monthly">Monthly</option>
                                                    </select>
                                                </div>
                                                {editForm.frequency === 'monthly' && <Input label="Day of Month" type="number" placeholder="1" min="1" max="31" value={editForm.day_of_month} onChange={e => setEditForm({ ...editForm, day_of_month: e.target.value })} />}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Category</label>
                                                    <select value={editForm.category_id} onChange={e => setEditForm({ ...editForm, category_id: e.target.value })}
                                                        style={{ padding: '10px 14px', background: 'var(--bg-card)', color: editForm.category_id ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer' }}>
                                                        <option value="">Select category</option>
                                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            {editError && <p style={{ fontSize: '0.8rem', color: '#f87171', margin: '0 0 12px 0' }}>{editError}</p>}
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <Button type="submit" isLoading={editLoading} size="md">Save</Button>
                                                <Button type="button" variant="secondary" size="md" onClick={() => { setEditingId(null); setEditError(''); }}>Cancel</Button>
                                            </div>
                                        </form>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
