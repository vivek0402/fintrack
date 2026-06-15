'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { milestoneAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/StatTile';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { toast } from '@/store/toastStore';
import { Plus, Pencil, Trash2, Flag, AlertTriangle, CheckCircle2 } from 'lucide-react';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

const labelSt: React.CSSProperties = { fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', display: 'block', marginBottom: '6px' };
const inputSt: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '14px', boxSizing: 'border-box' as const };

interface Feasibility {
    days_remaining: number;
    months_remaining: number;
    amount_remaining?: number;
    monthly_needed?: number;
    is_on_track?: boolean;
}

interface Milestone {
    id: string;
    name: string;
    description: string | null;
    target_date: string;
    target_amount: number | null;
    current_amount: number;
    parent_id: string | null;
    parent_name: string | null;
    priority: number;
    status: string;
    feasibility: Feasibility;
    overdue?: boolean;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
    not_started: { label: 'Not Started', color: 'var(--text-muted)', bg: 'var(--bg-surface-2)' },
    in_progress: { label: 'In Progress', color: 'var(--color-info)', bg: 'color-mix(in srgb, var(--color-info) 10%, transparent)' },
    achieved: { label: 'Achieved', color: 'var(--color-inc)', bg: 'color-mix(in srgb, var(--color-inc) 10%, transparent)' },
    missed: { label: 'Missed', color: 'var(--color-exp)', bg: 'color-mix(in srgb, var(--color-exp) 10%, transparent)' },
};

const STATUS_OPTIONS = ['not_started', 'in_progress', 'achieved', 'missed'];

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface FormState {
    name: string;
    target_date: string;
    description: string;
    target_amount: string;
    current_amount: string;
    parent_id: string;
    priority: string;
}

const EMPTY_FORM: FormState = { name: '', target_date: '', description: '', target_amount: '', current_amount: '0', parent_id: '', priority: '0' };

export default function MilestonesPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [loading, setLoading] = useState(true);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const [formOpen, setFormOpen] = useState(false);
    const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<Milestone | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [progressEditId, setProgressEditId] = useState<string | null>(null);
    const [progressAmount, setProgressAmount] = useState('');
    const [progressStatus, setProgressStatus] = useState('');
    const [progressSaving, setProgressSaving] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => { if (user) fetchMilestones(); }, [user]);

    function fetchMilestones() {
        setLoading(true);
        milestoneAPI.getAll()
            .then(res => setMilestones(res.data.milestones || []))
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => setLoading(false));
    }

    function toggleExpand(id: string) {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function openAddForm(parentId?: string) {
        setEditingMilestone(null);
        setForm({ ...EMPTY_FORM, parent_id: parentId || '' });
        setFormOpen(true);
    }

    function openEditForm(m: Milestone) {
        setEditingMilestone(m);
        setForm({
            name: m.name,
            target_date: m.target_date.slice(0, 10),
            description: m.description || '',
            target_amount: m.target_amount !== null ? String(m.target_amount) : '',
            current_amount: String(m.current_amount ?? 0),
            parent_id: m.parent_id || '',
            priority: String(m.priority ?? 0),
        });
        setFormOpen(true);
    }

    function submitForm() {
        if (!form.name.trim() || !form.target_date) {
            toast.error('Name and target date are required.');
            return;
        }
        const payload: any = {
            name: form.name.trim(),
            target_date: form.target_date,
            description: form.description.trim() || undefined,
            target_amount: form.target_amount !== '' ? Number(form.target_amount) : undefined,
            current_amount: form.current_amount !== '' ? Number(form.current_amount) : undefined,
            priority: form.priority !== '' ? Number(form.priority) : undefined,
        };
        if (editingMilestone) {
            payload.parent_id = form.parent_id || null;
        } else if (form.parent_id) {
            payload.parent_id = form.parent_id;
        }

        setSaving(true);
        const req = editingMilestone
            ? milestoneAPI.update(editingMilestone.id, payload)
            : milestoneAPI.create(payload);

        req.then(() => {
            toast.success(editingMilestone ? 'Milestone updated.' : 'Milestone added.');
            setFormOpen(false);
            fetchMilestones();
        })
            .catch((err: any) => toast.error(err.response?.data?.error || 'Failed to save milestone.'))
            .finally(() => setSaving(false));
    }

    function confirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        milestoneAPI.delete(deleteTarget.id)
            .then(() => {
                toast.success('Milestone deleted.');
                setDeleteTarget(null);
                fetchMilestones();
            })
            .catch(() => toast.error('Failed to delete milestone.'))
            .finally(() => setDeleting(false));
    }

    function openProgressPanel(m: Milestone) {
        setProgressEditId(m.id);
        setProgressAmount(String(m.current_amount ?? 0));
        setProgressStatus(m.status);
    }

    function saveProgress(id: string) {
        setProgressSaving(true);
        milestoneAPI.updateProgress(id, { current_amount: Number(progressAmount), status: progressStatus })
            .then(() => {
                toast.success('Progress updated.');
                setProgressEditId(null);
                fetchMilestones();
            })
            .catch((err: any) => toast.error(err.response?.data?.error || 'Failed to update progress.'))
            .finally(() => setProgressSaving(false));
    }

    if (isLoading || !user || loading) {
        return (
            <AppLayout>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {[1, 2, 3].map(i => <SkeletonCard key={i} height={100} />)}
                </div>
            </AppLayout>
        );
    }

    const totalCount = milestones.length;
    const onTrackCount = milestones.filter(m => m.status !== 'achieved' && m.feasibility?.is_on_track).length;
    const achievedCount = milestones.filter(m => m.status === 'achieved').length;

    const childrenOf = (id: string | null) => milestones.filter(m => (m.parent_id || null) === id);
    const roots = childrenOf(null);

    const childCountOf = (id: string) => milestones.filter(m => m.parent_id === id).length;

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                            Life Milestones
                        </h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                            Plan and track the big moments
                        </p>
                    </div>
                    <Button variant="primary" onClick={() => openAddForm()}>
                        <Plus size={16} /> Add Milestone
                    </Button>
                </div>

                {/* ── SUMMARY ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                    <StatTile label="Total Milestones" value={String(totalCount)} icon={<Flag size={14} />} />
                    <StatTile label="On Track" value={String(onTrackCount)} accentColor="var(--color-inc)" icon={<CheckCircle2 size={14} />} />
                    <StatTile label="Achieved" value={String(achievedCount)} accentColor="var(--color-inc)" />
                </div>

                {/* ── MILESTONE TREE ── */}
                {milestones.length === 0 ? (
                    <Card>
                        <EmptyState
                            icon={Flag}
                            title="No milestones yet"
                            subtitle="Track your financial journey from emergency fund to retirement — every step counts."
                            action={<Button variant="primary" onClick={() => openAddForm()}><Plus size={16} /> Add Milestone</Button>}
                        />
                    </Card>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {roots.map(m => (
                            <MilestoneNode
                                key={m.id}
                                milestone={m}
                                childrenOf={childrenOf}
                                childCountOf={childCountOf}
                                expanded={expanded}
                                toggleExpand={toggleExpand}
                                onEdit={openEditForm}
                                onDelete={setDeleteTarget}
                                progressEditId={progressEditId}
                                progressAmount={progressAmount}
                                progressStatus={progressStatus}
                                setProgressAmount={setProgressAmount}
                                setProgressStatus={setProgressStatus}
                                onOpenProgress={openProgressPanel}
                                onCancelProgress={() => setProgressEditId(null)}
                                onSaveProgress={saveProgress}
                                progressSaving={progressSaving}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── ADD / EDIT MODAL ── */}
            <Modal
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                title={editingMilestone ? 'Edit Milestone' : 'Add Milestone'}
                footer={
                    <Button variant="primary" onClick={submitForm} isLoading={saving} style={{ width: '100%' }}>
                        {editingMilestone ? 'Save Changes' : 'Add Milestone'}
                    </Button>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={labelSt}>Name *</label>
                        <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputSt} />
                    </div>
                    <div>
                        <label style={labelSt}>Target date *</label>
                        <input type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} style={inputSt} />
                    </div>
                    <div>
                        <label style={labelSt}>Description</label>
                        <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={inputSt} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                        <div>
                            <label style={labelSt}>Target amount (₹)</label>
                            <input type="number" value={form.target_amount} onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} style={inputSt} />
                        </div>
                        <div>
                            <label style={labelSt}>Current amount (₹)</label>
                            <input type="number" value={form.current_amount} onChange={e => setForm(f => ({ ...f, current_amount: e.target.value }))} style={inputSt} />
                        </div>
                    </div>
                    <div>
                        <label style={labelSt}>Depends on</label>
                        <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))} style={inputSt}>
                            <option value="">None</option>
                            {milestones.filter(m => !editingMilestone || m.id !== editingMilestone.id).map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelSt}>Priority</label>
                        <input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inputSt} />
                    </div>
                </div>
            </Modal>

            {/* ── DELETE CONFIRMATION ── */}
            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Milestone"
                footer={
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)} style={{ flex: 1 }}>Cancel</Button>
                        <Button variant="danger" onClick={confirmDelete} isLoading={deleting} style={{ flex: 1 }}>Delete</Button>
                    </div>
                }
            >
                {deleteTarget && (
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
                        {childCountOf(deleteTarget.id) > 0
                            ? `Deleting "${deleteTarget.name}" will unlink ${childCountOf(deleteTarget.id)} child milestone${childCountOf(deleteTarget.id) === 1 ? '' : 's'}. They will become independent milestones. Continue?`
                            : `Are you sure you want to delete "${deleteTarget.name}"?`}
                    </p>
                )}
            </Modal>
        </AppLayout>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Milestone tree node
// ─────────────────────────────────────────────────────────────────────────

interface MilestoneNodeProps {
    milestone: Milestone;
    childrenOf: (id: string | null) => Milestone[];
    childCountOf: (id: string) => number;
    expanded: Set<string>;
    toggleExpand: (id: string) => void;
    onEdit: (m: Milestone) => void;
    onDelete: (m: Milestone) => void;
    progressEditId: string | null;
    progressAmount: string;
    progressStatus: string;
    setProgressAmount: (v: string) => void;
    setProgressStatus: (v: string) => void;
    onOpenProgress: (m: Milestone) => void;
    onCancelProgress: () => void;
    onSaveProgress: (id: string) => void;
    progressSaving: boolean;
}

function MilestoneNode({
    milestone, childrenOf, childCountOf, expanded, toggleExpand, onEdit, onDelete,
    progressEditId, progressAmount, progressStatus, setProgressAmount, setProgressStatus,
    onOpenProgress, onCancelProgress, onSaveProgress, progressSaving,
}: MilestoneNodeProps) {
    const isExpanded = expanded.has(milestone.id);
    const statusMeta = STATUS_META[milestone.status] || STATUS_META.not_started;
    const children = childrenOf(milestone.id);
    const { feasibility, overdue, status } = milestone;
    const targetAmount = milestone.target_amount !== null ? Number(milestone.target_amount) : null;
    const currentAmount = Number(milestone.current_amount || 0);
    const pct = targetAmount && targetAmount > 0 ? Math.min(100, (currentAmount / targetAmount) * 100) : 0;

    let feasibilityChip: React.ReactNode = null;
    if (overdue && status !== 'achieved') {
        feasibilityChip = <Badge color="var(--color-exp)" bg="color-mix(in srgb, var(--color-exp) 10%, transparent)"><AlertTriangle size={11} style={{ marginRight: 4 }} />Overdue</Badge>;
    } else if (status === 'in_progress' && feasibility?.is_on_track) {
        feasibilityChip = <Badge color="var(--color-inc)" bg="color-mix(in srgb, var(--color-inc) 10%, transparent)">On track</Badge>;
    } else if (status !== 'achieved' && feasibility?.is_on_track === false) {
        feasibilityChip = <Badge color="var(--color-warn)" bg="color-mix(in srgb, var(--color-warn) 10%, transparent)">Behind — needs {fmt(feasibility.monthly_needed || 0)}/mo more</Badge>;
    }

    return (
        <div>
            <Card onClick={() => toggleExpand(milestone.id)} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{milestone.name}</span>
                            <Badge color={statusMeta.color} bg={statusMeta.bg}>{statusMeta.label}</Badge>
                            {feasibilityChip}
                        </div>
                        {!isExpanded && milestone.description && (
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {milestone.description}
                            </p>
                        )}
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                            Target: {formatDate(milestone.target_date)}
                            {targetAmount !== null && ` · ${fmt(targetAmount)}`}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(milestone); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px', display: 'flex' }} aria-label="Edit milestone">
                            <Pencil size={15} />
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(milestone); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px', display: 'flex' }} aria-label="Delete milestone">
                            <Trash2 size={15} />
                        </button>
                    </div>
                </div>

                {targetAmount !== null && targetAmount > 0 && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                            <span>{fmt(currentAmount)} / {fmt(targetAmount)}</span>
                            <span>{pct.toFixed(0)}%</span>
                        </div>
                        <ProgressBar pct={pct} color={status === 'achieved' ? 'var(--color-inc)' : 'var(--accent)'} />
                    </div>
                )}

                {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {milestone.description && (
                            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
                                {milestone.description}
                            </p>
                        )}
                        {feasibility?.monthly_needed !== undefined && status !== 'achieved' && (
                            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                Monthly savings needed to stay on track: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(feasibility.monthly_needed)}</strong>
                            </p>
                        )}

                        {progressEditId === milestone.id ? (
                            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                                    <div>
                                        <label style={labelSt}>Current amount (₹)</label>
                                        <input type="number" value={progressAmount} onChange={e => setProgressAmount(e.target.value)} style={inputSt} />
                                    </div>
                                    <div>
                                        <label style={labelSt}>Status</label>
                                        <select value={progressStatus} onChange={e => setProgressStatus(e.target.value)} style={inputSt}>
                                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Button variant="primary" size="sm" onClick={() => onSaveProgress(milestone.id)} isLoading={progressSaving}>Save</Button>
                                    <Button variant="secondary" size="sm" onClick={onCancelProgress}>Cancel</Button>
                                </div>
                            </div>
                        ) : (
                            <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); onOpenProgress(milestone); }} style={{ alignSelf: 'flex-start' }}>
                                Log progress
                            </Button>
                        )}
                    </div>
                )}
            </Card>

            {children.length > 0 && (
                <div style={{ marginLeft: '28px', paddingLeft: '20px', borderLeft: '2px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                    {children.map(child => (
                        <div key={child.id} style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', left: '-20px', top: '24px', width: '20px', height: '2px', background: 'var(--border-subtle)' }} />
                            <MilestoneNode
                                milestone={child}
                                childrenOf={childrenOf}
                                childCountOf={childCountOf}
                                expanded={expanded}
                                toggleExpand={toggleExpand}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                progressEditId={progressEditId}
                                progressAmount={progressAmount}
                                progressStatus={progressStatus}
                                setProgressAmount={setProgressAmount}
                                setProgressStatus={setProgressStatus}
                                onOpenProgress={onOpenProgress}
                                onCancelProgress={onCancelProgress}
                                onSaveProgress={onSaveProgress}
                                progressSaving={progressSaving}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
