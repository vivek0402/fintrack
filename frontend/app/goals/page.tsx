'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Target, CheckCircle, Sparkles, X as XIcon, Pencil } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { goalsAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonTitle, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { formatCurrency } from '@/lib/utils';
import PageHelp from '@/components/ui/PageHelp';
import { FadeIn } from '@/components/ui/FadeIn';

const GOAL_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e', '#06b6d4'];

export default function GoalsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const [goals, setGoals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [fundsGoalId, setFundsGoalId] = useState<string | null>(null);
    const [fundsAmount, setFundsAmount] = useState('');
    const [fundsType, setFundsType] = useState<'add' | 'withdraw'>('add');
    const [fundsLoading, setFundsLoading] = useState(false);
    const [form, setForm] = useState({ name: '', target_amount: '', deadline: '', color: '#10b981' });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ name: '', target_amount: '', deadline: '', color: '#10b981' });
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');

    // Life event state
    const [showLifeEvent, setShowLifeEvent] = useState(false);
    const [lifeEventForm, setLifeEventForm] = useState({ event_type: '', target_amount: '', target_date: '' });
    const [lifeEventLoading, setLifeEventLoading] = useState(false);
    const [lifeEventResult, setLifeEventResult] = useState<any>(null);
    const [lifeEventError, setLifeEventError] = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchGoals = async () => {
        setLoading(true);
        try { const res = await goalsAPI.getAll(); setGoals(res.data.goals); }
        catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { if (user) fetchGoals(); }, [user]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault(); setFormError(''); setFormLoading(true);
        try {
            await goalsAPI.create({ name: form.name, target_amount: parseFloat(form.target_amount), deadline: form.deadline || undefined, color: form.color });
            setForm({ name: '', target_amount: '', deadline: '', color: '#10b981' });
            setShowForm(false); fetchGoals();
        } catch (err: any) { setFormError(err.response?.data?.error || 'Failed to create goal.'); }
        finally { setFormLoading(false); }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setEditError(''); setEditLoading(true);
        try {
            await goalsAPI.update(editingId!, {
                name: editForm.name,
                target_amount: parseFloat(editForm.target_amount),
                deadline: editForm.deadline || undefined,
                color: editForm.color,
            });
            setEditingId(null); fetchGoals();
        } catch (err: any) { setEditError(err.response?.data?.error || 'Failed to update.'); }
        finally { setEditLoading(false); }
    };

    const handleAddFunds = async () => {
        if (!fundsGoalId || !fundsAmount) return;
        setFundsLoading(true);
        try {
            const amount = fundsType === 'add' ? parseFloat(fundsAmount) : -parseFloat(fundsAmount);
            await goalsAPI.addFunds(fundsGoalId, amount);
            setFundsGoalId(null); setFundsAmount(''); fetchGoals();
        } catch (err) { console.error(err); }
        finally { setFundsLoading(false); }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try { await goalsAPI.delete(id); fetchGoals(); }
        finally { setDeletingId(null); setConfirmDeleteId(null); }
    };

    const handleLifeEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        setLifeEventError(''); setLifeEventLoading(true);
        try {
            const res = await aiAPI.lifeEvent({
                event_type: lifeEventForm.event_type,
                target_amount: parseFloat(lifeEventForm.target_amount),
                target_date: lifeEventForm.target_date,
            });
            setLifeEventResult(res.data);
            fetchGoals();
        } catch (err: any) {
            setLifeEventError(err.response?.data?.error || 'Failed to create plan.');
        } finally {
            setLifeEventLoading(false);
        }
    };

    const daysRemaining = (deadline?: string) => {
        if (!deadline) return null;
        const diff = Math.ceil((new Date(deadline + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return diff;
    };

    const totalTargets = goals.reduce((s, g) => s + parseFloat(g.target_amount), 0);
    const totalSaved = goals.reduce((s, g) => s + parseFloat(g.saved_amount), 0);
    const completed = goals.filter(g => parseFloat(g.saved_amount) >= parseFloat(g.target_amount)).length;

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                {[1,2,3,4].map(i => <SkeletonCard key={i} height={140} />)}
            </div>
        </AppLayout>
    );

    return (
        <AppLayout>
        <PageShell
            title="Goals"
            subtitle={`${goals.length} ${goals.length === 1 ? 'goal' : 'goals'} · ${completed} completed`}
            headerRight={
                <>
                    <Button variant="secondary" onClick={() => { setShowLifeEvent(true); setLifeEventResult(null); setLifeEventError(''); }} size="md"><Sparkles size={16} />Plan Life Event</Button>
                    <Button onClick={() => setShowForm(!showForm)} size="md"><Plus size={16} />New Goal</Button>
                    <PageHelp title="Goals" sections={[
                        { icon: '🏁', heading: 'What is this page?', body: 'Set savings goals with a target amount and deadline. Track your progress as you save towards each goal.' },
                        { icon: '💰', heading: 'Creating a goal', body: "Tap '+ New Goal' and enter a name, target amount, and target date. FinTrack calculates how much you need to save each month." },
                        { icon: '📊', heading: 'Progress tracking', body: 'Each goal shows a progress bar and the amount remaining. Update your saved amount anytime by tapping the goal.' },
                    ]} />
                </>
            }
        >

            {/* Life Event Modal */}
            <Modal isOpen={showLifeEvent} onClose={() => setShowLifeEvent(false)} title="Plan a Life Event" maxWidth="500px">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                            <Sparkles size={18} color="var(--accent-blue)" />
                            <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Plan a Life Event</h2>
                        </div>

                        {!lifeEventResult ? (
                            <form onSubmit={handleLifeEvent} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: '8px' }}>Life Event Type</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                                        {[
                                            { type: 'wedding', emoji: '💍', label: 'Wedding' },
                                            { type: 'bike', emoji: '🏍️', label: 'Bike' },
                                            { type: 'vacation', emoji: '✈️', label: 'Vacation' },
                                            { type: 'home', emoji: '🏠', label: 'Home' },
                                            { type: 'baby', emoji: '👶', label: 'Baby' },
                                            { type: 'education', emoji: '🎓', label: 'Education' },
                                            { type: 'car', emoji: '🚗', label: 'Car' },
                                            { type: 'business', emoji: '💼', label: 'Business' },
                                            { type: 'emergency', emoji: '🛡️', label: 'Emergency Fund' },
                                        ].map(ev => (
                                            <button key={ev.type} type="button" onClick={() => setLifeEventForm({ ...lifeEventForm, event_type: ev.type })}
                                                style={{ padding: '12px 8px', borderRadius: '12px', border: lifeEventForm.event_type === ev.type ? '2px solid var(--accent-blue)' : '1px solid var(--bg-border)', background: lifeEventForm.event_type === ev.type ? 'var(--accent-blue-bg)' : 'var(--bg-card)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
                                                <span style={{ fontSize: '1.4rem' }}>{ev.emoji}</span>
                                                <span style={{ fontSize: '0.72rem', color: lifeEventForm.event_type === ev.type ? 'var(--accent-blue)' : 'var(--text-secondary)', fontWeight: lifeEventForm.event_type === ev.type ? 600 : 400 }}>{ev.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Target Amount (₹)</label>
                                        <input type="number" min="1" placeholder="500000" value={lifeEventForm.target_amount} onChange={e => setLifeEventForm({ ...lifeEventForm, target_amount: e.target.value })} required
                                            style={{ padding: '10px 14px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none' }} />
                                    </div>
                                    <DatePicker
                                        label="Target Date"
                                        value={lifeEventForm.target_date}
                                        onChange={date => setLifeEventForm({ ...lifeEventForm, target_date: date })}
                                        required
                                        minDate={new Date().toISOString().split('T')[0]}
                                    />
                                </div>
                                {lifeEventError && <p style={{ fontSize: '0.8rem', color: 'var(--accent-red)', margin: 0 }}>{lifeEventError}</p>}
                                <Button type="submit" isLoading={lifeEventLoading} size="lg">✨ Generate Plan</Button>
                            </form>
                        ) : (
                            <div>
                                <div style={{ padding: '16px', background: lifeEventResult.plan?.is_achievable ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${lifeEventResult.plan?.is_achievable ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: '12px', marginBottom: '16px' }}>
                                    <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0 0 8px 0', lineHeight: 1.6 }}>{lifeEventResult.plan?.summary}</p>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#10b981' }}>₹{lifeEventResult.plan?.monthly_required?.toLocaleString('en-IN')}/month needed</span>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '2px 8px', background: 'var(--bg-card)', borderRadius: '6px' }}>{lifeEventResult.plan?.difficulty}</span>
                                    </div>
                                </div>
                                {lifeEventResult.plan?.milestones?.length > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>Key Milestones</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {lifeEventResult.plan.milestones.map((m: any, i: number) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: '50px' }}>Month {m.month}</span>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', flex: 1 }}>{m.label}</span>
                                                    <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.82rem', fontWeight: 600, color: '#10b981' }}>₹{m.target_saved?.toLocaleString('en-IN')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {lifeEventResult.plan?.tips?.length > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>Tips</p>
                                        {lifeEventResult.plan.tips.map((tip: string, i: number) => (
                                            <p key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>💡 {tip}</p>
                                        ))}
                                    </div>
                                )}
                                <p style={{ fontSize: '0.78rem', color: 'var(--accent-green)', margin: '0 0 16px 0' }}>✅ Goal "{lifeEventResult.goal?.name}" has been created automatically.</p>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Button onClick={() => { setLifeEventResult(null); setLifeEventForm({ event_type: '', target_amount: '', target_date: '' }); }} variant="secondary" size="md">Plan Another</Button>
                                    <Button onClick={() => setShowLifeEvent(false)} size="md">Done</Button>
                                </div>
                            </div>
                        )}
            </Modal>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Total Targets', value: formatCurrency(totalTargets, user.currency), color: 'var(--accent-blue)' },
                    { label: 'Total Saved', value: formatCurrency(totalSaved, user.currency), color: 'var(--accent-green)' },
                    { label: 'Completed', value: `${completed} / ${goals.length}`, color: 'var(--accent-yellow)' },
                ].map(card => (
                    <div key={card.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '14px', padding: '16px 20px' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>{card.label}</p>
                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.2rem', fontWeight: 600, color: card.color, margin: 0 }}>{card.value}</p>
                    </div>
                ))}
            </div>

            {showForm && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent-green-border)', borderRadius: '16px', padding: '24px', marginBottom: '20px' }}>
                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 20px 0' }}>Create New Goal</h3>
                    <form onSubmit={handleCreate}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                            <Input label="Goal Name" type="text" placeholder="e.g. New Laptop" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                            <Input label="Target Amount (₹)" type="number" placeholder="100000" min="1" value={form.target_amount} onChange={e => setForm({ ...form, target_amount: e.target.value })} required />
                            <DatePicker
                                label="Deadline (optional)"
                                value={form.deadline}
                                onChange={date => setForm({ ...form, deadline: date })}
                                minDate={new Date().toISOString().split('T')[0]}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Color</label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {GOAL_COLORS.map(color => (
                                        <button key={color} type="button" onClick={() => setForm({ ...form, color })}
                                            style={{ width: '28px', height: '28px', borderRadius: '50%', background: color, border: form.color === color ? '3px solid var(--text-primary)' : '3px solid transparent', cursor: 'pointer' }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                        {formError && <p style={{ fontSize: '0.8rem', color: 'var(--accent-red)', margin: '0 0 12px 0' }}>{formError}</p>}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button type="submit" isLoading={formLoading} size="md">Create Goal</Button>
                            <Button type="button" variant="secondary" size="md" onClick={() => setShowForm(false)}>Cancel</Button>
                        </div>
                    </form>
                </div>
            )}

            {/* Add Funds Modal */}
            <Modal isOpen={!!fundsGoalId} onClose={() => { setFundsGoalId(null); setFundsAmount(''); }} title="Update Savings" maxWidth="360px">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                            {(['add', 'withdraw'] as const).map(t => (
                                <button key={t} type="button" onClick={() => setFundsType(t)}
                                    style={{ padding: '10px', borderRadius: '10px', border: fundsType === t ? `1px solid ${t === 'add' ? 'var(--accent-green-border)' : 'var(--accent-red-border)'}` : '1px solid var(--bg-border)', background: fundsType === t ? t === 'add' ? 'var(--accent-green-bg)' : 'var(--accent-red-bg)' : 'var(--bg-card)', color: fundsType === t ? t === 'add' ? 'var(--accent-green)' : 'var(--accent-red)' : 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', transition: 'all var(--transition-fast)' }}>
                                    {t === 'add' ? '+ Add Funds' : '− Withdraw'}
                                </button>
                            ))}
                        </div>
                        <Input label="Amount (₹)" type="number" placeholder="5000" min="1" value={fundsAmount} onChange={e => setFundsAmount(e.target.value)} />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                            <Button onClick={handleAddFunds} isLoading={fundsLoading} size="md" style={{ flex: 1 }}>Confirm</Button>
                            <Button variant="secondary" size="md" onClick={() => { setFundsGoalId(null); setFundsAmount(''); }}>Cancel</Button>
                        </div>
            </Modal>

            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
            ) : goals.length === 0 ? (
                <EmptyState
                    icon={Target}
                    title="No goals yet"
                    subtitle="Set a savings target and track your progress"
                    action={<Button onClick={() => setShowForm(true)} size="sm">Create your first goal</Button>}
                />
            ) : (
                <FadeIn>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {goals.map(goal => {
                        const saved = parseFloat(goal.saved_amount);
                        const target = parseFloat(goal.target_amount);
                        const pct = Math.min((saved / target) * 100, 100);
                        const isComplete = saved >= target;
                        const days = daysRemaining(goal.deadline);
                        const remaining = Math.max(target - saved, 0);
                        const monthly = goal.deadline && days && days > 0 ? remaining / Math.max(days / 30, 1) : null;
                        const isConfirmDelete = confirmDeleteId === goal.id;

                        return (
                            <div key={goal.id}>
                            <div className="fintrack-card" style={{ background: 'var(--bg-secondary)', border: `1px solid ${isComplete ? 'var(--accent-green-border)' : 'var(--bg-border)'}`, borderRadius: '16px', padding: '20px 24px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${goal.color}18`, border: `1px solid ${goal.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            {isComplete ? <CheckCircle size={20} color={goal.color} /> : <Target size={20} color={goal.color} />}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{goal.name}</h3>
                                                {isComplete && <span style={{ fontSize: '0.7rem', color: 'var(--accent-green)', background: 'var(--accent-green-bg)', border: '1px solid var(--accent-green-border)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>Completed</span>}
                                            </div>
                                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                                                <span style={{ color: goal.color, fontWeight: 600 }}>{formatCurrency(saved, user.currency)}</span> saved of <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(target, user.currency)}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                                        {!isComplete && (
                                            <button onClick={() => { setFundsGoalId(goal.id); setFundsType('add'); }}
                                                style={{ padding: '6px 12px', borderRadius: '8px', background: `${goal.color}15`, border: `1px solid ${goal.color}30`, color: goal.color, fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', transition: 'all var(--transition-fast)' }}>
                                                + Add
                                            </button>
                                        )}
                                        <button onClick={() => {
                                            setEditingId(goal.id);
                                            setEditForm({
                                                name: goal.name,
                                                target_amount: String(goal.target_amount),
                                                deadline: goal.deadline ? goal.deadline.split('T')[0] : '',
                                                color: goal.color || '#10b981',
                                            });
                                            setEditError('');
                                        }}
                                            style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--transition-fast)' }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-blue-bg)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-blue)'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                            <Pencil size={14} />
                                        </button>
                                        {isConfirmDelete ? (
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button onClick={() => handleDelete(goal.id)} disabled={deletingId === goal.id}
                                                    style={{ padding: '4px 8px', borderRadius: '6px', background: 'var(--accent-red-bg)', border: '1px solid var(--accent-red-border)', color: 'var(--accent-red)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                                                    {deletingId === goal.id ? '...' : 'Delete'}
                                                </button>
                                                <button onClick={() => setConfirmDeleteId(null)}
                                                    style={{ padding: '4px 8px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={() => setConfirmDeleteId(goal.id)} disabled={!!deletingId}
                                                style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: deletingId === goal.id ? 0.5 : 1, transition: 'all var(--transition-fast)' }}
                                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-red-bg)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)'; }}
                                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div style={{ marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{pct.toFixed(1)}% saved</span>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatCurrency(remaining, user.currency)} remaining</span>
                                    </div>
                                    <div style={{ height: '8px', background: 'var(--bg-border)', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${pct}%`, background: isComplete ? 'var(--accent-green)' : goal.color, borderRadius: '4px', transition: 'width var(--transition-slow)', boxShadow: `0 0 8px ${goal.color}60` }} />
                                    </div>
                                </div>
                                {!isComplete && (
                                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                        {days !== null && <span style={{ fontSize: '0.72rem', color: days <= 30 ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>📅 {days > 0 ? `${days} days left` : 'Deadline passed'}</span>}
                                        {monthly !== null && monthly > 0 && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📊 Save {formatCurrency(monthly, user.currency)}/month to hit target</span>}
                                    </div>
                                )}
                            </div>
                            {editingId === goal.id && (
                                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent-green-border)', borderRadius: '16px', padding: '24px', marginTop: '8px' }}>
                                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 20px 0' }}>Edit Goal</h3>
                                    <form onSubmit={handleEditSubmit}>
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                                            <Input label="Goal Name" type="text" placeholder="e.g. New Laptop" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
                                            <Input label="Target Amount (₹)" type="number" placeholder="100000" min="1" value={editForm.target_amount} onChange={e => setEditForm({ ...editForm, target_amount: e.target.value })} required />
                                            <DatePicker
                                                label="Deadline (optional)"
                                                value={editForm.deadline}
                                                onChange={date => setEditForm({ ...editForm, deadline: date })}
                                                minDate={new Date().toISOString().split('T')[0]}
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Color</label>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    {GOAL_COLORS.map(color => (
                                                        <button key={color} type="button" onClick={() => setEditForm({ ...editForm, color })}
                                                            style={{ width: '28px', height: '28px', borderRadius: '50%', background: color, border: editForm.color === color ? '3px solid var(--text-primary)' : '3px solid transparent', cursor: 'pointer' }} />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        {editError && <p style={{ fontSize: '0.8rem', color: 'var(--accent-red)', margin: '0 0 12px 0' }}>{editError}</p>}
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <Button type="submit" isLoading={editLoading} size="md">Save Changes</Button>
                                            <Button type="button" variant="secondary" size="md" onClick={() => { setEditingId(null); setEditError(''); }}>Cancel</Button>
                                        </div>
                                    </form>
                                </div>
                            )}
                            </div>
                        );
                    })}
                </div>
                </FadeIn>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </PageShell>
        </AppLayout>
    );
}
