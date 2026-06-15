'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, RefreshCw, Pause, Play, TrendingUp, TrendingDown, Sparkles, X, Pencil, Brain } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { recurringAPI, categoriesAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard, SkeletonCircle, Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const inputSt: React.CSSProperties = { padding: '10px 14px', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' };
const iconBt: React.CSSProperties = { width: '32px', height: '32px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--transition-fast)' };

export default function RecurringPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [recurring, setRecurring]         = useState<any[]>([]);
    const [categories, setCategories]       = useState<any[]>([]);
    const [loading, setLoading]             = useState(true);
    const [showForm, setShowForm]           = useState(false);
    const [deletingId, setDeletingId]       = useState<string | null>(null);
    const [togglingId, setTogglingId]       = useState<string | null>(null);
    const [form, setForm]                   = useState({ type: 'expense' as 'income' | 'expense', amount: '', description: '', frequency: 'monthly', day_of_month: '', category_id: '' });
    const [formLoading, setFormLoading]     = useState(false);
    const [formError, setFormError]         = useState('');
    const [editingId, setEditingId]         = useState<string | null>(null);
    const [editForm, setEditForm]           = useState({ type: 'expense' as 'income' | 'expense', amount: '', description: '', frequency: 'monthly', day_of_month: '', category_id: '' });
    const [editLoading, setEditLoading]     = useState(false);
    const [editError, setEditError]         = useState('');
    const [patterns, setPatterns]           = useState<any[]>([]);
    const [dismissedPatterns, setDismissedPatterns] = useState<Set<number>>(new Set());
    const [patternsLoading, setPatternsLoading]     = useState(false);
    const [addingPattern, setAddingPattern] = useState<number | null>(null);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchData = async () => {
        setLoading(true);
        try { const [recRes, catRes] = await Promise.all([recurringAPI.getAll(), categoriesAPI.getAll()]); setRecurring(recRes.data.recurring); setCategories(catRes.data.categories); }
        catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const fetchPatterns = async () => {
        setPatternsLoading(true);
        try { const res = await aiAPI.detectPatterns(); setPatterns(res.data.patterns || []); setDismissedPatterns(new Set()); }
        catch { setPatterns([]); }
        finally { setPatternsLoading(false); }
    };

    useEffect(() => { if (user) { fetchData(); fetchPatterns(); } }, [user]);

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
            await recurringAPI.update(editingId!, { type: editForm.type, amount: parseFloat(editForm.amount), description: editForm.description, frequency: editForm.frequency, day_of_month: editForm.day_of_month ? parseInt(editForm.day_of_month) : undefined, category_id: editForm.category_id || undefined });
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
            await recurringAPI.create({ type: 'expense', amount: pattern.amount, description: pattern.description || pattern.merchant, frequency: pattern.frequency });
            setDismissedPatterns(prev => new Set([...prev, idx])); fetchData();
        } catch { }
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

    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[1,2,3].map(i => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
                    <SkeletonCircle size={40} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <Skeleton width="50%" height={14} borderRadius={4} />
                        <Skeleton width="30%" height={12} borderRadius={4} />
                    </div>
                    <Skeleton width={72} height={20} borderRadius={6} />
                </div>)}
            </div>
        </AppLayout>
    );

    const TypeToggle = ({ value, onChange }: { value: string; onChange: (v: 'income' | 'expense') => void }) => (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {(['expense', 'income'] as const).map(t => (
                <button key={t} type="button" onClick={() => onChange(t)} style={{ padding: '8px', borderRadius: '8px', border: `1px solid ${value === t ? (t === 'income' ? 'color-mix(in srgb, var(--color-inc) 30%, transparent)' : 'color-mix(in srgb, var(--color-exp) 30%, transparent)') : 'var(--border-subtle)'}`, background: value === t ? (t === 'income' ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)') : 'var(--bg-surface-1)', color: value === t ? (t === 'income' ? 'var(--color-inc)' : 'var(--color-exp)') : 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize', fontFamily: 'var(--font-body)' }}>
                    {t}
                </button>
            ))}
        </div>
    );

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* Header */}
                <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Recurring</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                {recurring.length > 0 ? `${activeCount} active schedule${activeCount !== 1 ? 's' : ''}` : 'Automate your regular income and expenses'}
                            </p>
                        </div>
                        <Button onClick={() => setShowForm(!showForm)} size="md"><Plus size={16} />Add Recurring</Button>
                    </div>
                </div>

                {/* AI Detect Patterns strip */}
                {(patternsLoading || visiblePatterns.length > 0) && (
                    <div style={{ background: 'color-mix(in srgb, var(--color-info) 8%, var(--bg-surface-1))', border: '1.5px solid color-mix(in srgb, var(--color-info) 20%, transparent)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
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
                                            <div key={realIdx} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius-md)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
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
                                                    <button type="button" onClick={() => setDismissedPatterns(prev => new Set([...prev, realIdx]))} style={{ ...iconBt, border: '1px solid var(--border-subtle)' }}><X size={13} /></button>
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
                {showForm && (
                    <div style={{ background: 'var(--bg-surface-1)', border: '1px solid color-mix(in srgb, var(--color-inc) 20%, transparent)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>New Recurring Transaction</h3>
                        <form onSubmit={handleSubmit}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</label>
                                    <TypeToggle value={form.type} onChange={t => setForm({ ...form, type: t })} />
                                </div>
                                <Input label="Amount (₹)" type="number" placeholder="5000" min="1" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
                                <Input label="Description" type="text" placeholder="Monthly Salary" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Frequency</label>
                                    <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} style={inputSt}>
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                </div>
                                {form.frequency === 'monthly' && <Input label="Day of Month" type="number" placeholder="1" min="1" max="31" value={form.day_of_month} onChange={e => setForm({ ...form, day_of_month: e.target.value })} />}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category</label>
                                    <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} style={{ ...inputSt, color: form.category_id ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                        <option value="">Select category</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            {formError && <p style={{ fontSize: '12px', color: 'var(--color-exp)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>{formError}</p>}
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Button type="submit" isLoading={formLoading} size="md">Save</Button>
                                <Button type="button" variant="secondary" size="md" onClick={() => setShowForm(false)}>Cancel</Button>
                            </div>
                        </form>
                    </div>
                )}

                {/* List */}
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {[1,2,3].map(i => <SkeletonCard key={i} height={70} />)}
                    </div>
                ) : recurring.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                        <p style={{ fontSize: '40px', marginBottom: '10px' }}>🔄</p>
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>No recurring transactions</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 18px', fontFamily: 'var(--font-body)' }}>Schedule bills, subscriptions, and EMIs to track them automatically</p>
                        <button type="button" onClick={() => setShowForm(true)} style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Add your first one</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {recurring.map(r => {
                            const isIncome = r.type === 'income';
                            return (
                                <div key={r.id}>
                                    <div style={{ background: 'var(--bg-surface-1)', border: `1px solid ${r.is_active ? 'var(--border-subtle)' : 'var(--bg-surface-2)'}`, borderRadius: editingId === r.id ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)', padding: '14px 18px', opacity: r.is_active ? 1 : 0.55, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: isIncome ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                {isIncome ? <TrendingUp size={16} color="var(--color-inc)" /> : <TrendingDown size={16} color="var(--color-exp)" />}
                                            </div>
                                            <div>
                                                <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>{r.description}</p>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{freqLabel(r)}</span>
                                                    {r.category_name && <Badge color={r.category_color || 'var(--text-muted)'} bg={`${r.category_color || 'var(--bg-surface-2)'}20`}>{r.category_name}</Badge>}
                                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Next: {formatNextDate(r.next_due_date)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 600, color: isIncome ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{isIncome ? '+' : '−'}{fmt(parseFloat(r.amount))}</p>
                                            <button type="button" onClick={() => handleToggle(r.id)} disabled={togglingId === r.id} title={r.is_active ? 'Pause' : 'Resume'}
                                                style={{ ...iconBt, background: r.is_active ? 'color-mix(in srgb, var(--color-warn) 10%, transparent)' : 'color-mix(in srgb, var(--color-inc) 10%, transparent)', border: `1px solid ${r.is_active ? 'color-mix(in srgb, var(--color-warn) 20%, transparent)' : 'color-mix(in srgb, var(--color-inc) 20%, transparent)'}`, color: r.is_active ? 'var(--color-warn)' : 'var(--color-inc)', opacity: togglingId === r.id ? 0.5 : 1 }}>
                                                {r.is_active ? <Pause size={13} /> : <Play size={13} />}
                                            </button>
                                            <button type="button" onClick={() => { setEditingId(r.id); setEditForm({ type: r.type, amount: String(r.amount), description: r.description, frequency: r.frequency, day_of_month: r.day_of_month ? String(r.day_of_month) : '', category_id: r.category_id || '' }); setEditError(''); }} style={iconBt}
                                                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent-subtle)'; el.style.color = 'var(--accent)'; }}
                                                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                <Pencil size={14} />
                                            </button>
                                            <button type="button" onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} style={{ ...iconBt, opacity: deletingId === r.id ? 0.5 : 1 }}
                                                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'color-mix(in srgb, var(--color-exp) 10%, transparent)'; el.style.color = 'var(--color-exp)'; }}
                                                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    {editingId === r.id && (
                                        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', borderTop: 'none', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', padding: '20px' }}>
                                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>Edit Recurring Transaction</h3>
                                            <form onSubmit={handleEditSubmit}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</label>
                                                        <TypeToggle value={editForm.type} onChange={t => setEditForm({ ...editForm, type: t })} />
                                                    </div>
                                                    <Input label="Amount (₹)" type="number" placeholder="5000" min="1" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} required />
                                                    <Input label="Description" type="text" placeholder="Monthly Salary" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} required />
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Frequency</label>
                                                        <select value={editForm.frequency} onChange={e => setEditForm({ ...editForm, frequency: e.target.value })} style={inputSt}>
                                                            <option value="daily">Daily</option>
                                                            <option value="weekly">Weekly</option>
                                                            <option value="monthly">Monthly</option>
                                                        </select>
                                                    </div>
                                                    {editForm.frequency === 'monthly' && <Input label="Day of Month" type="number" placeholder="1" min="1" max="31" value={editForm.day_of_month} onChange={e => setEditForm({ ...editForm, day_of_month: e.target.value })} />}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category</label>
                                                        <select value={editForm.category_id} onChange={e => setEditForm({ ...editForm, category_id: e.target.value })} style={{ ...inputSt, color: editForm.category_id ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                            <option value="">Select category</option>
                                                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                                {editError && <p style={{ fontSize: '12px', color: 'var(--color-exp)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>{editError}</p>}
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
            </div>
        </AppLayout>
    );
}
