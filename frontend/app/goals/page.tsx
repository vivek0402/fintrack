'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Target, Brain, ChevronRight, Pencil } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { goalsAPI, aiAPI } from '@/lib/api';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { MilestoneBurst } from '@/components/ui/MilestoneBurst';
import { useIsMobile } from '@/hooks/useWindowSize';
import { toast } from '@/store/toastStore';
import { fmt } from '@/lib/utils';
import { CATEGORY_COLORS as GOAL_COLORS } from '@/lib/categoryColors';

// Same wash as .glass-field, inlined since these fields live inside already-glass Modals/cards.
const inputSt: React.CSSProperties = { width: '100%', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' };
const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block', fontFamily: 'var(--font-body)' };
const errSt: React.CSSProperties = { fontSize: 11, color: 'var(--color-exp)', margin: '4px 0 0', fontFamily: 'var(--font-body)' };
const outlineBtn: React.CSSProperties = { padding: '6px 12px', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all var(--transition-fast)', display: 'flex', alignItems: 'center', gap: 4 };
const iconBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

function CircularProgress({ pct, color, size = 56 }: { pct: number; color: string; size?: number }) {
    const stroke = 5;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (Math.min(Math.max(pct, 0), 100) / 100) * c;
    return (
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 500ms cubic-bezier(0.22,1,0.36,1)' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: size >= 56 ? '13px' : '11px', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(pct)}%
                </span>
            </div>
        </div>
    );
}

export default function GoalsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const [goals, setGoals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Set<string>>(new Set());
    const [fundsGoalId, setFundsGoalId] = useState<string | null>(null);
    const [fundsAmount, setFundsAmount] = useState('');
    const [fundsType, setFundsType] = useState<'add' | 'withdraw'>('add');
    const [fundsLoading, setFundsLoading] = useState(false);
    const [form, setForm] = useState({ name: '', target_amount: '', deadline: '', color: '#2563eb' });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ name: '', target_amount: '', deadline: '', color: '#2563eb' });
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');
    const [showLifeEvent, setShowLifeEvent] = useState(false);
    const [lifeEventForm, setLifeEventForm] = useState({ event_type: '', target_amount: '', target_date: '' });
    const [lifeEventLoading, setLifeEventLoading] = useState(false);
    const [lifeEventResult, setLifeEventResult] = useState<any>(null);
    const [lifeEventError, setLifeEventError] = useState('');
    const [showBurst, setShowBurst] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchGoals = async () => {
        setLoading(true);
        try { const res = await goalsAPI.getAll(); setGoals(res.data.goals); }
        catch (err) { console.error(err); toast.error('Failed to load goals'); }
        finally { setLoading(false); }
    };
    useEffect(() => { if (user) fetchGoals(); }, [user]);

    // ── Handlers (logic unchanged) ────────────────────────────────────────────

    const validateField = (name: 'name' | 'target_amount', value: string): string => {
        if (name === 'name') return value.trim() ? '' : 'Name is required.';
        const amount = parseFloat(value);
        return !Number.isFinite(amount) || amount <= 0 ? 'Target amount must be greater than 0.' : '';
    };

    const handleFieldBlur = (name: 'name' | 'target_amount') => {
        setFormErrors(prev => ({ ...prev, [name]: validateField(name, form[name]) }));
    };

    const handleFieldChange = (name: 'name' | 'target_amount', value: string) => {
        setForm(prev => ({ ...prev, [name]: value }));
        setFormErrors(prev => (prev[name] ? { ...prev, [name]: validateField(name, value) } : prev));
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault(); setFormError(''); setFormLoading(true);
        const errors = { name: validateField('name', form.name), target_amount: validateField('target_amount', form.target_amount) };
        setFormErrors(errors);
        if (errors.name || errors.target_amount) { setFormLoading(false); return; }
        if (!navigator.onLine) { setFormError("You're offline — try again when connected"); setFormLoading(false); return; }
        try {
            await goalsAPI.create({ name: form.name, target_amount: parseFloat(form.target_amount), deadline: form.deadline || undefined, color: form.color });
            setForm({ name: '', target_amount: '', deadline: '', color: '#2563eb' });
            setFormErrors({});
            setShowForm(false); fetchGoals();
        } catch (err: any) { setFormError(err.response?.data?.error || 'Failed to create goal.'); }
        finally { setFormLoading(false); }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setEditError(''); setEditLoading(true);
        try {
            await goalsAPI.update(editingId!, { name: editForm.name, target_amount: parseFloat(editForm.target_amount), deadline: editForm.deadline || undefined, color: editForm.color });
            setEditingId(null); fetchGoals();
        } catch (err: any) { setEditError(err.response?.data?.error || 'Failed to update.'); }
        finally { setEditLoading(false); }
    };

    const handleAddFunds = async () => {
        if (!fundsGoalId || !fundsAmount) return;
        setFundsLoading(true);
        try {
            const goal = goals.find(g => g.id === fundsGoalId);
            const amount = fundsType === 'add' ? parseFloat(fundsAmount) : -parseFloat(fundsAmount);
            await goalsAPI.addFunds(fundsGoalId, amount);
            setFundsGoalId(null); setFundsAmount(''); setFundsType('add'); fetchGoals();

            const wasComplete = goal && parseFloat(goal.saved_amount) >= parseFloat(goal.target_amount);
            const nowComplete = goal && parseFloat(goal.saved_amount) + amount >= parseFloat(goal.target_amount);
            if (fundsType === 'add' && goal && !wasComplete && nowComplete) {
                setShowBurst(true);
                toast.success(`🎯 "${goal.name}" goal reached — nicely done!`, 4500);
            } else {
                toast.success(fundsType === 'add' ? 'Funds added to goal' : 'Funds withdrawn from goal');
            }
        } catch { toast.error('Failed to update goal funds'); }
        finally { setFundsLoading(false); }
    };

    const handleDelete = (id: string) => {
        // Optimistically hide the row, then give the user an undo window before
        // actually deleting — same pattern as TransactionList's delete.
        setPendingDelete(prev => new Set([...prev, id]));
        setConfirmDeleteId(null);

        let cancelled = false;
        toast.undo('Goal deleted', () => {
            cancelled = true;
            setPendingDelete(prev => { const s = new Set(prev); s.delete(id); return s; });
        });

        setTimeout(async () => {
            if (cancelled) return;
            setDeletingId(id);
            try {
                await goalsAPI.delete(id);
                setPendingDelete(prev => { const s = new Set(prev); s.delete(id); return s; });
                fetchGoals();
            } catch {
                toast.error('Failed to delete goal');
                setPendingDelete(prev => { const s = new Set(prev); s.delete(id); return s; });
            } finally {
                setDeletingId(null);
            }
        }, 4000);
    };

    const handleLifeEvent = async (e: React.FormEvent) => {
        e.preventDefault(); setLifeEventError(''); setLifeEventLoading(true);
        try {
            const res = await aiAPI.lifeEvent({ event_type: lifeEventForm.event_type, target_amount: parseFloat(lifeEventForm.target_amount), target_date: lifeEventForm.target_date });
            setLifeEventResult(res.data); fetchGoals();
        } catch (err: any) { setLifeEventError(err.response?.data?.error || 'Failed to create plan.'); }
        finally { setLifeEventLoading(false); }
    };

    const daysRemaining = (deadline?: string) => {
        if (!deadline) return null;
        return Math.ceil((new Date(deadline + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    };

    // ── Derived totals ────────────────────────────────────────────────────────

    const totalTargets   = goals.reduce((s, g) => s + parseFloat(g.target_amount), 0);
    const totalSaved     = goals.reduce((s, g) => s + parseFloat(g.saved_amount), 0);
    const totalRemaining = Math.max(totalTargets - totalSaved, 0);
    const overallPct     = totalTargets > 0 ? Math.min(Math.round((totalSaved / totalTargets) * 100), 100) : 0;
    const completed      = goals.filter(g => parseFloat(g.saved_amount) >= parseFloat(g.target_amount)).length;
    const visibleGoals   = goals.filter(g => !pendingDelete.has(g.id));
    const filteredGoals  = searchQuery.trim()
        ? visibleGoals.filter(g => (g.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
        : visibleGoals;
    const activeCount    = goals.length - completed;

    // ── Loading skeleton ──────────────────────────────────────────────────────

    if (isLoading || !user) return (
        <>
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={64} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2, 3].map(i => <SkeletonCard key={i} height={120} />)}
            </div>
        </>
    );

    return (
        <>
            {showBurst && <MilestoneBurst onDone={() => setShowBurst(false)} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div className="glass-surface" style={{ borderRadius: 'var(--radius-xl)', padding: '24px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                {activeCount} active goal{activeCount !== 1 ? 's' : ''}
                            </p>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: isMobile ? '28px' : '34px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                                Your Goals
                            </h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-inc)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalSaved)}</span> saved
                                <span style={{ margin: '0 6px', color: 'var(--border-subtle)' }}>·</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalRemaining)}</span> remaining
                            </p>
                        </div>
                        <button type="button" className="glass-field" onClick={() => { setShowForm(true); setFormError(''); }}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                            <Plus size={14} /> New Goal
                        </button>
                    </div>
                </div>

                {/* ── OVERALL PROGRESS ── */}
                {goals.length > 0 && (
                    <GCard>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Overall Progress</p>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 800, color: 'var(--accent)', margin: 0, fontVariantNumeric: 'tabular-nums', animation: 'numberReveal 400ms cubic-bezier(0.22,1,0.36,1) both' }}>
                                {overallPct}%
                            </p>
                        </div>
                        <ProgressBar pct={overallPct} height={6} />
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0', fontFamily: 'var(--font-body)' }}>
                            {completed} of {goals.length} goal{goals.length !== 1 ? 's' : ''} completed
                        </p>
                    </GCard>
                )}

                {/* ── AI LIFE EVENT STRIP ── */}
                <div
                    onClick={() => { setShowLifeEvent(true); setLifeEventResult(null); setLifeEventError(''); }}
                    className="glass-surface"
                    style={{ background: 'color-mix(in srgb, var(--color-info) 10%, var(--glass-surface))', borderColor: 'color-mix(in srgb, var(--color-info) 24%, var(--glass-border))', borderRadius: 'var(--radius-lg)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                >
                    <Brain size={18} color="var(--color-info)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>AI Life Event Planner</p>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                            Plan for weddings, travel, home, and more
                        </p>
                    </div>
                    <ChevronRight size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                </div>

                {/* ── SEARCH ── */}
                {!loading && goals.length > 0 && (
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search goals by name…"
                        style={inputSt}
                    />
                )}

                {/* ── GOAL CARDS ── */}
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {[1, 2, 3].map(i => <SkeletonCard key={i} height={130} />)}
                    </div>
                ) : goals.length === 0 ? (
                    <EmptyState
                        icon={Target}
                        title="No goals yet"
                        subtitle="Set a savings target and track your progress"
                        action={
                            <button type="button" onClick={() => setShowForm(true)} style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                Create your first goal
                            </button>
                        }
                    />
                ) : filteredGoals.length === 0 ? (
                    <EmptyState
                        icon={Target}
                        title="No goals match your search"
                        subtitle={`Nothing found for "${searchQuery}".`}
                        action={<button type="button" onClick={() => setSearchQuery('')} className="glass-field" style={{ padding: '10px 20px', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Clear search</button>}
                    />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {filteredGoals.map(goal => {
                            const saved     = parseFloat(goal.saved_amount);
                            const target    = parseFloat(goal.target_amount);
                            const pct       = Math.min((saved / target) * 100, 100);
                            const isComplete = saved >= target;
                            const days      = daysRemaining(goal.deadline);
                            const remaining = Math.max(target - saved, 0);
                            const monthly   = goal.deadline && days && days > 0 ? remaining / Math.max(days / 30, 1) : null;

                            const ringColor = isComplete ? 'var(--color-inc)' : (goal.color || 'var(--accent)');

                            return (
                                <div key={goal.id} className="glass-surface" style={{ borderColor: isComplete ? 'color-mix(in srgb, var(--color-inc) 25%, var(--glass-border))' : undefined, borderRadius: 'var(--radius-lg)', padding: '16px' }}>
                                    {/* Top row: ring | emoji + name + deadline */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                                        <CircularProgress pct={pct} color={ringColor} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                                                <span style={{ fontSize: '18px', lineHeight: 1, flexShrink: 0 }}>
                                                    {goal.icon || goal.emoji || '🎯'}
                                                </span>
                                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {goal.name}
                                                </span>
                                                {isComplete && (
                                                    <Badge color="var(--color-inc)" bg="color-mix(in srgb, var(--color-inc) 10%, transparent)">✓ Done</Badge>
                                                )}
                                            </div>
                                            {days !== null && (
                                                <span style={{ fontSize: '11px', color: days <= 30 && days > 0 ? 'var(--color-warn)' : 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                                    📅 {days > 0 ? `${days} days left` : days === 0 ? 'Due today' : 'Deadline passed'}
                                                </span>
                                            )}
                                            {monthly !== null && monthly > 0 && (
                                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>
                                                    Save {fmt(monthly)}/month to hit target
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                        <div>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                                Saved {fmt(saved)}
                                            </span>
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                                {' '}of {fmt(target)}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            {!isComplete && (
                                                <button type="button" onClick={() => { setFundsGoalId(goal.id); setFundsType('add'); }} style={outlineBtn}>
                                                    + Add Funds
                                                </button>
                                            )}
                                            <button type="button" onClick={() => { setEditingId(goal.id); setEditForm({ name: goal.name, target_amount: String(goal.target_amount), deadline: goal.deadline ? goal.deadline.split('T')[0] : '', color: goal.color || '#2563eb' }); setEditError(''); }} style={iconBtn}>
                                                <Pencil size={13} />
                                            </button>
                                            {confirmDeleteId === goal.id ? (
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button type="button" onClick={() => handleDelete(goal.id)} disabled={deletingId === goal.id} style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'color-mix(in srgb, var(--color-exp) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 20%, transparent)', color: 'var(--color-exp)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                                        {deletingId === goal.id ? '…' : 'Delete'}
                                                    </button>
                                                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="glass-field" style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button type="button" onClick={() => setConfirmDeleteId(goal.id)} disabled={!!deletingId} style={iconBtn}
                                                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'color-mix(in srgb, var(--color-exp) 10%, transparent)'; el.style.color = 'var(--color-exp)'; }}
                                                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

            </div>

            {/* ═══ MODALS ═══ */}

            {/* New Goal Modal */}
            <Modal isOpen={showForm} onClose={() => { setShowForm(false); setFormError(''); setFormErrors({}); }} title="New Goal" maxWidth="460px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button type="button" onClick={() => { setShowForm(false); setFormError(''); setFormErrors({}); }} className="glass-field" style={{ padding: 10, borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="submit" form="new-goal-form" disabled={formLoading || !form.name.trim() || !form.target_amount} style={{ padding: 10, background: formLoading || !form.name.trim() || !form.target_amount ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: formLoading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            {formLoading ? 'Creating…' : 'Create Goal'}
                        </button>
                    </div>
                }
            >
                <form id="new-goal-form" onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={labelSt}>Goal Name *</label>
                        <input style={inputSt} value={form.name} onChange={e => handleFieldChange('name', e.target.value)} onBlur={() => handleFieldBlur('name')} placeholder="e.g. New Laptop, Emergency Fund…" required />
                        {formErrors.name && <p style={errSt}>{formErrors.name}</p>}
                    </div>
                    <div>
                        <label style={labelSt}>Target Amount *</label>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 16 }}>₹</span>
                            <input type="number" min="1" placeholder="100000" value={form.target_amount} onChange={e => handleFieldChange('target_amount', e.target.value)} onBlur={() => handleFieldBlur('target_amount')} required style={{ ...inputSt, paddingLeft: 32, fontFamily: 'var(--font-mono)', fontSize: 15, fontVariantNumeric: 'tabular-nums' }} />
                        </div>
                        {formErrors.target_amount && <p style={errSt}>{formErrors.target_amount}</p>}
                    </div>
                    <DatePicker label="Target Date (optional)" value={form.deadline} onChange={date => setForm({ ...form, deadline: date })} minDate={new Date().toISOString().split('T')[0]} />
                    <div>
                        <label style={labelSt}>Color</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {GOAL_COLORS.map(color => (
                                <button key={color} type="button" onClick={() => setForm({ ...form, color })} style={{ width: 28, height: 28, borderRadius: '50%', background: color, border: form.color === color ? '3px solid var(--text-primary)' : '3px solid transparent', cursor: 'pointer' }} />
                            ))}
                        </div>
                    </div>
                    {formError && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{formError}</p>}
                </form>
            </Modal>

            {/* Edit Goal Modal */}
            <Modal isOpen={!!editingId} onClose={() => { setEditingId(null); setEditError(''); }} title="Edit Goal" maxWidth="460px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button type="button" onClick={() => { setEditingId(null); setEditError(''); }} className="glass-field" style={{ padding: 10, borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="submit" form="edit-goal-form" disabled={editLoading} style={{ padding: 10, background: editLoading ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: editLoading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            {editLoading ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                }
            >
                <form id="edit-goal-form" onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div><label style={labelSt}>Goal Name *</label><input style={inputSt} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required /></div>
                    <div>
                        <label style={labelSt}>Target Amount *</label>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 16 }}>₹</span>
                            <input type="number" min="1" value={editForm.target_amount} onChange={e => setEditForm({ ...editForm, target_amount: e.target.value })} required style={{ ...inputSt, paddingLeft: 32, fontFamily: 'var(--font-mono)', fontSize: 15, fontVariantNumeric: 'tabular-nums' }} />
                        </div>
                    </div>
                    <DatePicker label="Deadline (optional)" value={editForm.deadline} onChange={date => setEditForm({ ...editForm, deadline: date })} minDate={new Date().toISOString().split('T')[0]} />
                    <div>
                        <label style={labelSt}>Color</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {GOAL_COLORS.map(color => (
                                <button key={color} type="button" onClick={() => setEditForm({ ...editForm, color })} style={{ width: 28, height: 28, borderRadius: '50%', background: color, border: editForm.color === color ? '3px solid var(--text-primary)' : '3px solid transparent', cursor: 'pointer' }} />
                            ))}
                        </div>
                    </div>
                    {editError && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{editError}</p>}
                </form>
            </Modal>

            {/* Add Funds Modal */}
            <Modal isOpen={!!fundsGoalId} onClose={() => { setFundsGoalId(null); setFundsAmount(''); setFundsType('add'); }} title="Update Savings" maxWidth="360px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button type="button" onClick={() => { setFundsGoalId(null); setFundsAmount(''); }} className="glass-field" style={{ padding: 10, borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="button" onClick={handleAddFunds} disabled={fundsLoading || !fundsAmount} style={{ padding: 10, background: fundsLoading || !fundsAmount ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: fundsLoading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            {fundsLoading ? 'Saving…' : 'Confirm'}
                        </button>
                    </div>
                }
            >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                    {(['add', 'withdraw'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setFundsType(t)}
                            className={fundsType === t ? undefined : 'glass-field'}
                            style={{ padding: '10px', borderRadius: '10px', border: fundsType === t ? `1px solid ${t === 'add' ? 'color-mix(in srgb, var(--color-inc) 30%, transparent)' : 'color-mix(in srgb, var(--color-exp) 30%, transparent)'}` : undefined, background: fundsType === t ? (t === 'add' ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)') : undefined, color: fundsType === t ? (t === 'add' ? 'var(--color-inc)' : 'var(--color-exp)') : 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all var(--transition-fast)' }}>
                            {t === 'add' ? '+ Add Funds' : '− Withdraw'}
                        </button>
                    ))}
                </div>
                <Input label="Amount (₹)" type="number" placeholder="5000" min="1" value={fundsAmount} onChange={e => setFundsAmount(e.target.value)} />
            </Modal>

            {/* AI Life Event Modal */}
            <Modal isOpen={showLifeEvent} onClose={() => setShowLifeEvent(false)} title="Plan a Life Event" maxWidth="500px">
                {!lifeEventResult ? (
                    <form onSubmit={handleLifeEvent} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label style={labelSt}>Life Event Type</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                                {[
                                    { type: 'wedding', emoji: '💍', label: 'Wedding' },
                                    { type: 'bike', emoji: '🏍️', label: 'Bike' },
                                    { type: 'vacation', emoji: '✈️', label: 'Vacation' },
                                    { type: 'home', emoji: '🏠', label: 'Home' },
                                    { type: 'baby', emoji: '👶', label: 'Baby' },
                                    { type: 'education', emoji: '🎓', label: 'Education' },
                                    { type: 'car', emoji: '🚗', label: 'Car' },
                                    { type: 'business', emoji: '💼', label: 'Business' },
                                    { type: 'emergency', emoji: '🛡️', label: 'Emergency' },
                                ].map(ev => (
                                    <button key={ev.type} type="button" onClick={() => setLifeEventForm({ ...lifeEventForm, event_type: ev.type })}
                                        className={lifeEventForm.event_type === ev.type ? undefined : 'glass-field'}
                                        style={{ padding: '12px 8px', borderRadius: 12, border: lifeEventForm.event_type === ev.type ? '2px solid var(--accent)' : undefined, background: lifeEventForm.event_type === ev.type ? 'var(--accent-subtle)' : undefined, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.15s' }}>
                                        <span style={{ fontSize: '1.4rem' }}>{ev.emoji}</span>
                                        <span style={{ fontSize: '0.72rem', color: lifeEventForm.event_type === ev.type ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: lifeEventForm.event_type === ev.type ? 600 : 400, fontFamily: 'var(--font-body)' }}>{ev.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelSt}>Target Amount (₹)</label>
                                <div style={{ position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>₹</span>
                                    <input type="number" min="1" placeholder="500000" value={lifeEventForm.target_amount} onChange={e => setLifeEventForm({ ...lifeEventForm, target_amount: e.target.value })} required style={{ ...inputSt, paddingLeft: 30, fontFamily: 'var(--font-mono)' }} />
                                </div>
                            </div>
                            <DatePicker label="Target Date" value={lifeEventForm.target_date} onChange={date => setLifeEventForm({ ...lifeEventForm, target_date: date })} required minDate={new Date().toISOString().split('T')[0]} />
                        </div>
                        {lifeEventError && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{lifeEventError}</p>}
                        <Button type="submit" isLoading={lifeEventLoading} size="lg">✨ Generate Plan</Button>
                    </form>
                ) : (
                    <div>
                        <div style={{ padding: 16, background: lifeEventResult.plan?.is_achievable ? 'color-mix(in srgb, var(--color-inc) 10%, var(--glass-surface))' : 'color-mix(in srgb, var(--color-warn) 10%, var(--glass-surface))', borderColor: lifeEventResult.plan?.is_achievable ? 'color-mix(in srgb, var(--color-inc) 24%, var(--glass-border))' : 'color-mix(in srgb, var(--color-warn) 24%, var(--glass-border))', borderRadius: 12, marginBottom: 16 }} className="glass-surface">
                            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{lifeEventResult.plan?.summary}</p>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-inc)', fontVariantNumeric: 'tabular-nums' }}>{fmt(lifeEventResult.plan?.monthly_required || 0)}/month needed</span>
                                <Badge color="var(--text-muted)" bg="color-mix(in srgb, var(--text-primary) 8%, transparent)">{lifeEventResult.plan?.difficulty}</Badge>
                            </div>
                        </div>
                        {lifeEventResult.plan?.milestones?.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>Key Milestones</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {lifeEventResult.plan.milestones.map((m: any, i: number) => (
                                        <div key={i} className="glass-field" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8 }}>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 50, fontFamily: 'var(--font-body)' }}>Month {m.month}</span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', flex: 1, fontFamily: 'var(--font-body)' }}>{m.label}</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-inc)', fontVariantNumeric: 'tabular-nums' }}>{fmt(m.target_saved || 0)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {lifeEventResult.plan?.tips?.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>Tips</p>
                                {lifeEventResult.plan.tips.map((tip: string, i: number) => (
                                    <p key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>💡 {tip}</p>
                                ))}
                            </div>
                        )}
                        <p style={{ fontSize: '0.78rem', color: 'var(--color-inc)', margin: '0 0 16px', fontFamily: 'var(--font-body)' }}>
                            ✅ Goal "{lifeEventResult.goal?.name}" has been created automatically.
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button onClick={() => { setLifeEventResult(null); setLifeEventForm({ event_type: '', target_amount: '', target_date: '' }); }} variant="secondary" size="md">Plan Another</Button>
                            <Button onClick={() => setShowLifeEvent(false)} size="md">Done</Button>
                        </div>
                    </div>
                )}
            </Modal>

        </>
    );
}
