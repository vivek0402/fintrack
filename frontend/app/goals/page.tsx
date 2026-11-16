'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Target } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { goalsAPI, aiAPI } from '@/lib/api';
import { useGoals, queryKeys } from '@/hooks/queries';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { MilestoneBurst } from '@/components/ui/MilestoneBurst';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction, Rows, Stat } from '@/components/ui/CardParts';
import { toast } from '@/store/toastStore';
import { fmt } from '@/lib/utils';
import { type, truncate } from '@/lib/typography';
import { CATEGORY_COLORS as GOAL_COLORS } from '@/lib/categoryColors';
import { haptics } from '@/lib/haptics';
import { daysLeft, deadlineLabel, groupGoals, goalsSummary, monthlyNeeded } from '@/lib/goals';

const NO_GOALS: any[] = [];

// Same wash as .glass-field, inlined since these fields live inside already-glass Modals/cards.
const inputSt: React.CSSProperties = { ...type.body, width: '100%', height: 40, background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', padding: '0 12px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' };
const labelSt: React.CSSProperties = { ...type.label, marginBottom: 6, display: 'block' };
const errSt: React.CSSProperties = { ...type.meta, color: 'var(--color-exp-text)', margin: '4px 0 0' };
const rupeeSt: React.CSSProperties = { ...type.num, color: 'var(--text-secondary)', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' };
const inset: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px var(--space-3)', padding: '6px var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)' };
const rowTop: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: 'var(--radius-md)' };
const tileSt: React.CSSProperties = { background: 'var(--glass-fill-1)', width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-title)', lineHeight: 1 };

const LIFE_EVENTS = [
    { type: 'wedding', emoji: '💍', label: 'Wedding' },
    { type: 'bike', emoji: '🏍️', label: 'Bike' },
    { type: 'vacation', emoji: '✈️', label: 'Vacation' },
    { type: 'home', emoji: '🏠', label: 'Home' },
    { type: 'baby', emoji: '👶', label: 'Baby' },
    { type: 'education', emoji: '🎓', label: 'Education' },
    { type: 'car', emoji: '🚗', label: 'Car' },
    { type: 'business', emoji: '💼', label: 'Business' },
    { type: 'emergency', emoji: '🛡️', label: 'Emergency' },
];

export default function GoalsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    // Cached: revisits show goals at once; the skeleton only shows on a cold
    // cache. Writes refresh it in the background instead of reloading the list.
    const queryClient = useQueryClient();
    const goalsQuery = useGoals();
    const goals: any[] = goalsQuery.data ?? NO_GOALS;
    const loading = goalsQuery.isPending;
    const goalsKey = queryKeys.goals(user?.id);
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
    const [editConfirmDelete, setEditConfirmDelete] = useState(false);
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

    // Goals feed the dashboard's health score and the transaction modal's
    // goal picker, which read the same ['goals'] query; the dashboard bundle
    // carries its own copy, so refresh that too.
    const fetchGoals = () => {
        queryClient.invalidateQueries({ queryKey: ['goals'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };
    useEffect(() => {
        if (goalsQuery.isError && !goalsQuery.data) toast.error('Failed to load goals');
    }, [goalsQuery.isError, goalsQuery.data]);

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
        const goal = goals.find(g => g.id === fundsGoalId);
        const amount = fundsType === 'add' ? parseFloat(fundsAmount) : -parseFloat(fundsAmount);
        // Move the progress bar now; roll back if the server says no.
        const before = queryClient.getQueryData<any[]>(goalsKey);
        queryClient.setQueryData<any[]>(goalsKey, list => (list ?? []).map(g =>
            g.id === fundsGoalId ? { ...g, saved_amount: String(parseFloat(g.saved_amount) + amount) } : g));
        try {
            await goalsAPI.addFunds(fundsGoalId, amount);
            setFundsGoalId(null); setFundsAmount(''); setFundsType('add'); fetchGoals();

            const wasComplete = goal && parseFloat(goal.saved_amount) >= parseFloat(goal.target_amount);
            const nowComplete = goal && parseFloat(goal.saved_amount) + amount >= parseFloat(goal.target_amount);
            haptics.success();
            if (fundsType === 'add' && goal && !wasComplete && nowComplete) {
                setShowBurst(true);
                toast.success(`🎯 "${goal.name}" goal reached — nicely done!`, 4500);
            } else {
                toast.success(fundsType === 'add' ? 'Funds added to goal' : 'Funds withdrawn from goal');
            }
        } catch {
            queryClient.setQueryData(goalsKey, before);
            toast.error('Failed to update goal funds');
        }
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
                // Out of the cache before un-hiding, so the card never flashes back.
                queryClient.setQueryData<any[]>(goalsKey, list => (list ?? []).filter(g => g.id !== id));
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

    // ── Openers ───────────────────────────────────────────────────────────────

    const openNewGoal = () => { setShowForm(true); setFormError(''); };
    const openLifeEvent = () => { setShowLifeEvent(true); setLifeEventResult(null); setLifeEventError(''); };
    const openFunds = (id: string) => { setFundsGoalId(id); setFundsType('add'); setFundsAmount(''); };
    const closeFunds = () => { setFundsGoalId(null); setFundsAmount(''); setFundsType('add'); };
    const openEdit = (goal: any) => {
        setEditingId(goal.id);
        setEditConfirmDelete(false);
        setEditForm({ name: goal.name, target_amount: String(goal.target_amount), deadline: goal.deadline ? goal.deadline.split('T')[0] : '', color: goal.color || '#2563eb' });
        setEditError('');
    };
    const closeEdit = () => { setEditingId(null); setEditError(''); setEditConfirmDelete(false); };
    const closeNewGoal = () => { setShowForm(false); setFormError(''); setFormErrors({}); };

    // ── Derived ───────────────────────────────────────────────────────────────

    const today = new Date();
    const visibleGoals = goals.filter(g => !pendingDelete.has(g.id));
    const filteredGoals = searchQuery.trim()
        ? visibleGoals.filter(g => (g.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
        : visibleGoals;
    const sum = goalsSummary(visibleGoals, today);
    const groups = groupGoals(filteredGoals, today);
    const activeCount = sum.count - sum.reachedCount;

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

    // ── Rows ──────────────────────────────────────────────────────────────────

    const tile = (goal: any) => (
        <div aria-hidden="true" style={tileSt}>{goal.icon || goal.emoji || '🎯'}</div>
    );

    const deleteConfirm = (goal: any) => (
        <div style={inset}>
            <span style={{ ...type.meta, flex: '1 1 160px', color: 'var(--text-primary)' }}>Delete the {goal.name} goal?</span>
            <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <TextAction tone="danger" disabled={deletingId === goal.id} onClick={() => handleDelete(goal.id)}>Delete goal</TextAction>
                <TextAction quiet onClick={() => setConfirmDeleteId(null)}>Keep it</TextAction>
            </span>
        </div>
    );

    const deleteButton = (goal: any) => (
        <button type="button" className="fin-icon-btn fin-row-hover-action" aria-label={`Delete ${goal.name}`}
            onClick={() => setConfirmDeleteId(goal.id)} disabled={!!deletingId}>
            <Trash2 size={14} />
        </button>
    );

    const onKeyActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
    };

    const renderGoal = (goal: any) => {
        const saved = parseFloat(goal.saved_amount) || 0;
        const target = parseFloat(goal.target_amount) || 0;
        const pct = target > 0 ? Math.min((saved / target) * 100, 100) : 0;
        const days = daysLeft(goal.deadline, today);
        const monthly = monthlyNeeded(goal, today);
        const confirming = confirmDeleteId === goal.id;
        const fundsOpen = fundsGoalId === goal.id;
        const edit = () => openEdit(goal);

        const deadlineText = days === null ? 'No deadline'
            : days < 0 ? 'Deadline passed'
            : days === 0 ? 'Due today'
            : `Due ${deadlineLabel(goal.deadline, today)} · ${days} ${days === 1 ? 'day' : 'days'} left`;
        const deadlineColor = days !== null && days < 0 ? 'var(--color-exp-text)'
            : days !== null && days > 0 && days <= 30 ? 'var(--color-warn-text)'
            : undefined;

        return (
            <div key={goal.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                    <div role="button" tabIndex={0} className="pressable" onClick={edit} onKeyDown={onKeyActivate(edit)} style={rowTop}>
                        {tile(goal)}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{goal.name}</p>
                            <p style={{ ...type.meta, ...truncate, margin: 0, color: deadlineColor ?? type.meta.color }}>{deadlineText}</p>
                            {monthly !== null && monthly > 0 && (
                                <p style={{ ...type.meta, ...truncate, margin: 0 }}>Save {fmt(monthly)} a month to make it</p>
                            )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ ...type.num, margin: 0 }}>{fmt(saved)}</p>
                            <p style={{ ...type.numSmall, margin: 0 }}>of {fmt(target)} · {Math.floor(pct)}%</p>
                        </div>
                    </div>
                    {deleteButton(goal)}
                </div>

                {confirming && deleteConfirm(goal)}

                <ProgressBar pct={pct} height={4} color={goal.color || 'var(--accent)'} />

                {!fundsOpen && (
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                        <TextAction onClick={() => openFunds(goal.id)}>Add funds</TextAction>
                    </div>
                )}

                {fundsOpen && (
                    <div style={{ ...inset, alignItems: 'flex-end', padding: 'var(--space-3)', gap: 'var(--space-3)' }}>
                        <div role="group" aria-label="Add or withdraw" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 'var(--radius-md)' }}>
                            {(['add', 'withdraw'] as const).map(t => (
                                <button key={t} type="button" aria-pressed={fundsType === t} onClick={() => setFundsType(t)}
                                    style={{ ...type.bodyStrong, height: 34, padding: '0 14px', border: 0, borderRadius: 'var(--radius-md)', cursor: 'pointer', background: fundsType === t ? 'var(--glass-fill-3)' : 'transparent', color: fundsType === t ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                    {t === 'add' ? 'Add' : 'Withdraw'}
                                </button>
                            ))}
                        </div>
                        <div style={{ width: 150 }}>
                            <label htmlFor={`funds-${goal.id}`} style={labelSt}>Amount</label>
                            <div style={{ position: 'relative' }}>
                                <span aria-hidden="true" style={rupeeSt}>₹</span>
                                <input id={`funds-${goal.id}`} type="number" min="1" placeholder="5000" autoFocus value={fundsAmount}
                                    onChange={e => setFundsAmount(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!fundsLoading) handleAddFunds(); } }}
                                    style={{ ...inputSt, ...type.num, paddingLeft: 30 }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 32 }}>
                            <Button size="sm" onClick={handleAddFunds} isLoading={fundsLoading} disabled={!fundsAmount}>
                                {fundsType === 'add' ? 'Add funds' : 'Withdraw'}
                            </Button>
                            <TextAction quiet onClick={closeFunds}>Cancel</TextAction>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderReached = (goal: any) => {
        const target = parseFloat(goal.target_amount) || 0;
        const confirming = confirmDeleteId === goal.id;
        const edit = () => openEdit(goal);
        return (
            <div key={goal.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                    <div role="button" tabIndex={0} className="pressable" onClick={edit} onKeyDown={onKeyActivate(edit)} style={rowTop}>
                        {tile(goal)}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{goal.name}</p>
                            <p style={{ ...type.numSmall, ...truncate, margin: 0 }}>Reached · {fmt(target)}</p>
                        </div>
                        <p style={{ ...type.num, margin: 0, flexShrink: 0, color: 'var(--color-inc-text)' }}>100%</p>
                    </div>
                    {deleteButton(goal)}
                </div>
                {confirming && deleteConfirm(goal)}
            </div>
        );
    };

    const nextDays = sum.next?.daysLeft ?? 0;
    const hasLeft = groups.attention.length > 0 || groups.progress.length > 0;
    const hasRight = groups.reached.length > 0;

    return (
        <>
            {showBurst && <MilestoneBurst onDone={() => setShowBurst(false)} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── PAGE HEADER ── */}
                <div className="fin-page-head">
                    <div style={{ minWidth: 0 }}>
                        <p style={{ ...type.meta, margin: 0 }}>
                            {activeCount} active goal{activeCount !== 1 ? 's' : ''}{sum.reachedCount > 0 ? ` · ${sum.reachedCount} reached` : ''}
                        </p>
                        <h1 style={{ ...type.heading, margin: 0 }}>Goals</h1>
                    </div>
                    <div className="fin-page-actions">
                        <Button variant="secondary" onClick={openLifeEvent}>Plan a life event</Button>
                        <Button onClick={openNewGoal}>New goal</Button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <SkeletonCard height={150} />
                        {[1, 2, 3].map(i => <SkeletonCard key={i} height={130} />)}
                    </div>
                ) : visibleGoals.length === 0 ? (
                    <EmptyState
                        icon={Target}
                        title="No goals yet"
                        subtitle="Set a savings target and track your progress"
                        action={<Button onClick={openNewGoal}>Create your first goal</Button>}
                    />
                ) : (
                    <>
                        {/* ── SUMMARY ── */}
                        <Card>
                            <p style={{ ...type.label, margin: 0 }}>Saved toward {fmt(sum.totalTarget)} in goals</p>
                            <p className="type-display" style={{ ...type.display, margin: '6px 0 12px' }}>{fmt(sum.totalSaved)}</p>
                            <ProgressBar pct={sum.pct} height={6} color="var(--text-secondary)" />
                            <div className="dash-stats">
                                <Stat className="dash-stat" label="To go" value={fmt(sum.toGo)} sub={`${sum.pct}% saved`} />
                                <Stat className="dash-stat" label="Needed a month"
                                    value={sum.neededMonthly > 0 ? fmt(sum.neededMonthly) : '—'}
                                    sub={sum.neededMonthly > 0 ? 'For goals with a deadline' : 'No deadlines set'} />
                                <Stat className="dash-stat" label="Next deadline"
                                    value={sum.next ? sum.next.label : '—'}
                                    sub={sum.next ? `${sum.next.name}, ${nextDays} ${nextDays === 1 ? 'day' : 'days'}` : 'Nothing due'}
                                    subTone={sum.next && nextDays <= 60 ? 'caution' : 'neutral'} />
                                <Stat className="dash-stat" label="Reached" value={sum.reachedCount}
                                    sub={`of ${sum.count} ${sum.count === 1 ? 'goal' : 'goals'}`} />
                            </div>
                        </Card>

                        {/* ── SEARCH ── */}
                        {goals.length > 5 && (
                            <input
                                type="text"
                                aria-label="Search goals"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search goals"
                                style={{ ...inputSt, height: 36 }}
                            />
                        )}

                        {/* ── GROUPS ── */}
                        {filteredGoals.length === 0 ? (
                            <EmptyState
                                icon={Target}
                                title="No goals match your search"
                                subtitle={`Nothing found for "${searchQuery}".`}
                                action={<Button variant="secondary" onClick={() => setSearchQuery('')}>Clear search</Button>}
                            />
                        ) : (
                            <div className={hasLeft && hasRight ? 'fin-two' : undefined}>
                                {hasLeft && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
                                        {groups.attention.length > 0 && (
                                            <Card>
                                                <CardHeader title="Needs attention" sub="Due within 60 days and under half saved" />
                                                <Rows>{groups.attention.map(renderGoal)}</Rows>
                                            </Card>
                                        )}
                                        {groups.progress.length > 0 && (
                                            <Card>
                                                <CardHeader title="In progress" sub="Soonest deadline first" />
                                                <Rows>{groups.progress.map(renderGoal)}</Rows>
                                            </Card>
                                        )}
                                    </div>
                                )}
                                {hasRight && (
                                    <div style={{ minWidth: 0 }}>
                                        <Card>
                                            <CardHeader title="Reached" sub="Fully funded" />
                                            <Rows>{groups.reached.map(renderReached)}</Rows>
                                        </Card>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

            </div>

            {/* ═══ MODALS ═══ */}

            {/* New goal */}
            <Modal isOpen={showForm} onClose={closeNewGoal} title="New goal" maxWidth="460px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Button type="button" variant="secondary" onClick={closeNewGoal}>Cancel</Button>
                        <Button type="submit" form="new-goal-form" isLoading={formLoading} disabled={formLoading || !form.name.trim() || !form.target_amount}>Create goal</Button>
                    </div>
                }
            >
                <form id="new-goal-form" onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label htmlFor="new-goal-name" style={labelSt}>Name</label>
                        <input id="new-goal-name" style={inputSt} value={form.name} onChange={e => handleFieldChange('name', e.target.value)} onBlur={() => handleFieldBlur('name')} placeholder="e.g. New laptop, Emergency fund" required />
                        {formErrors.name && <p style={errSt}>{formErrors.name}</p>}
                    </div>
                    <div>
                        <label htmlFor="new-goal-target" style={labelSt}>Target amount</label>
                        <div style={{ position: 'relative' }}>
                            <span aria-hidden="true" style={rupeeSt}>₹</span>
                            <input id="new-goal-target" type="number" min="1" placeholder="100000" value={form.target_amount} onChange={e => handleFieldChange('target_amount', e.target.value)} onBlur={() => handleFieldBlur('target_amount')} required style={{ ...inputSt, ...type.num, paddingLeft: 30 }} />
                        </div>
                        {formErrors.target_amount && <p style={errSt}>{formErrors.target_amount}</p>}
                    </div>
                    <DatePicker label="Target date (optional)" value={form.deadline} onChange={date => setForm({ ...form, deadline: date })} minDate={new Date().toISOString().split('T')[0]} />
                    <div>
                        <span style={labelSt}>Colour</span>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {GOAL_COLORS.map(color => (
                                <button key={color} type="button" aria-label={`Colour ${color}`} aria-pressed={form.color === color} onClick={() => setForm({ ...form, color })} style={{ width: 28, height: 28, borderRadius: '50%', background: color, border: form.color === color ? '3px solid var(--text-primary)' : '3px solid transparent', cursor: 'pointer' }} />
                            ))}
                        </div>
                    </div>
                    {formError && <p role="alert" style={{ ...type.meta, color: 'var(--color-exp-text)', margin: 0 }}>{formError}</p>}
                </form>
            </Modal>

            {/* Edit goal */}
            <Modal isOpen={!!editingId} onClose={closeEdit} title="Edit goal" maxWidth="460px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Button type="button" variant="secondary" onClick={closeEdit}>Cancel</Button>
                        <Button type="submit" form="edit-goal-form" isLoading={editLoading} disabled={editLoading}>Save changes</Button>
                    </div>
                }
            >
                <form id="edit-goal-form" onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label htmlFor="edit-goal-name" style={labelSt}>Name</label>
                        <input id="edit-goal-name" style={inputSt} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
                    </div>
                    <div>
                        <label htmlFor="edit-goal-target" style={labelSt}>Target amount</label>
                        <div style={{ position: 'relative' }}>
                            <span aria-hidden="true" style={rupeeSt}>₹</span>
                            <input id="edit-goal-target" type="number" min="1" value={editForm.target_amount} onChange={e => setEditForm({ ...editForm, target_amount: e.target.value })} required style={{ ...inputSt, ...type.num, paddingLeft: 30 }} />
                        </div>
                    </div>
                    <DatePicker label="Deadline (optional)" value={editForm.deadline} onChange={date => setEditForm({ ...editForm, deadline: date })} minDate={new Date().toISOString().split('T')[0]} />
                    <div>
                        <span style={labelSt}>Colour</span>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {GOAL_COLORS.map(color => (
                                <button key={color} type="button" aria-label={`Colour ${color}`} aria-pressed={editForm.color === color} onClick={() => setEditForm({ ...editForm, color })} style={{ width: 28, height: 28, borderRadius: '50%', background: color, border: editForm.color === color ? '3px solid var(--text-primary)' : '3px solid transparent', cursor: 'pointer' }} />
                            ))}
                        </div>
                    </div>
                    {editError && <p role="alert" style={{ ...type.meta, color: 'var(--color-exp-text)', margin: 0 }}>{editError}</p>}
                </form>
                <div style={{ marginTop: 'var(--space-4)' }}>
                    {editConfirmDelete ? (
                        <div style={inset}>
                            <span style={{ ...type.meta, flex: '1 1 160px', color: 'var(--text-primary)' }}>Delete this goal?</span>
                            <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                                <TextAction tone="danger" onClick={() => { const id = editingId!; closeEdit(); handleDelete(id); }}>Delete goal</TextAction>
                                <TextAction quiet onClick={() => setEditConfirmDelete(false)}>Keep it</TextAction>
                            </span>
                        </div>
                    ) : (
                        <TextAction tone="danger" onClick={() => setEditConfirmDelete(true)}>Delete goal</TextAction>
                    )}
                </div>
            </Modal>

            {/* Life event planner */}
            <Modal isOpen={showLifeEvent} onClose={() => setShowLifeEvent(false)} title="Plan a life event" maxWidth="500px">
                {!lifeEventResult ? (
                    <form onSubmit={handleLifeEvent} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <span style={labelSt}>Life event type</span>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                                {LIFE_EVENTS.map(ev => {
                                    const selected = lifeEventForm.event_type === ev.type;
                                    return (
                                        <button key={ev.type} type="button" aria-pressed={selected} onClick={() => setLifeEventForm({ ...lifeEventForm, event_type: ev.type })}
                                            className={selected ? undefined : 'glass-field'}
                                            style={{ padding: '12px 8px', borderRadius: 'var(--radius-md)', border: selected ? '1px solid var(--border-visible)' : undefined, background: selected ? 'var(--glass-fill-3)' : undefined, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                            <span aria-hidden="true" style={{ fontSize: 'var(--text-heading)', lineHeight: 1 }}>{ev.emoji}</span>
                                            <span style={{ ...type.label, color: selected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{ev.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label htmlFor="life-event-target" style={labelSt}>Target amount</label>
                                <div style={{ position: 'relative' }}>
                                    <span aria-hidden="true" style={rupeeSt}>₹</span>
                                    <input id="life-event-target" type="number" min="1" placeholder="500000" value={lifeEventForm.target_amount} onChange={e => setLifeEventForm({ ...lifeEventForm, target_amount: e.target.value })} required style={{ ...inputSt, ...type.num, paddingLeft: 30 }} />
                                </div>
                            </div>
                            <DatePicker label="Target date" value={lifeEventForm.target_date} onChange={date => setLifeEventForm({ ...lifeEventForm, target_date: date })} required minDate={new Date().toISOString().split('T')[0]} />
                        </div>
                        {lifeEventError && <p role="alert" style={{ ...type.meta, color: 'var(--color-exp-text)', margin: 0 }}>{lifeEventError}</p>}
                        <Button type="submit" isLoading={lifeEventLoading} size="lg">Generate plan</Button>
                    </form>
                ) : (
                    <div>
                        <div style={{ padding: 'var(--space-4)', background: 'var(--glass-fill-1)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
                            <p style={{ ...type.body, margin: '0 0 8px' }}>{lifeEventResult.plan?.summary}</p>
                            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'baseline' }}>
                                <span style={type.num}>{fmt(lifeEventResult.plan?.monthly_required || 0)} a month needed</span>
                                {lifeEventResult.plan?.difficulty && <span style={type.meta}>{lifeEventResult.plan.difficulty}</span>}
                            </div>
                        </div>
                        {lifeEventResult.plan?.milestones?.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <p style={{ ...type.label, margin: '0 0 8px' }}>Key milestones</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {lifeEventResult.plan.milestones.map((m: any, i: number) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)' }}>
                                            <span style={{ ...type.meta, minWidth: 60 }}>Month {m.month}</span>
                                            <span style={{ ...type.body, color: 'var(--text-primary)', flex: 1 }}>{m.label}</span>
                                            <span style={type.num}>{fmt(m.target_saved || 0)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {lifeEventResult.plan?.tips?.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <p style={{ ...type.label, margin: '0 0 8px' }}>Tips</p>
                                {lifeEventResult.plan.tips.map((tip: string, i: number) => (
                                    <p key={i} style={{ ...type.body, margin: '0 0 4px' }}>{tip}</p>
                                ))}
                            </div>
                        )}
                        <p style={{ ...type.meta, margin: '0 0 16px' }}>
                            Goal &quot;{lifeEventResult.goal?.name}&quot; has been created.
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button onClick={() => { setLifeEventResult(null); setLifeEventForm({ event_type: '', target_amount: '', target_date: '' }); }} variant="secondary" size="md">Plan another</Button>
                            <Button onClick={() => setShowLifeEvent(false)} size="md">Done</Button>
                        </div>
                    </div>
                )}
            </Modal>

        </>
    );
}
