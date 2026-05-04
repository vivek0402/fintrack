'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Receipt, Sparkles, X, Check, Pencil } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/store/authStore';
import { splitsAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { formatDate } from '@/lib/utils';
import PageHelp from '@/components/ui/PageHelp';

export default function SplitsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [splits, setSplits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingSplit, setEditingSplit] = useState<any | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Form state
    const [nlInput, setNlInput] = useState('');
    const [nlLoading, setNlLoading] = useState(false);
    const [form, setForm] = useState({ description: '', total_amount: '', participants: [{ name: '' }], date: new Date().toISOString().split('T')[0] });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchSplits = async () => {
        setLoading(true);
        try {
            const res = await splitsAPI.getAll();
            setSplits(res.data.splits);
        } catch { setSplits([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { if (user) fetchSplits(); }, [user]);

    const handleNlParse = async () => {
        if (!nlInput.trim()) return;
        setNlLoading(true);
        try {
            const res = await aiAPI.parseSplit(nlInput);
            const p = res.data.parsed;
            if (p) {
                setForm({
                    description: p.description || '',
                    total_amount: p.total_amount ? String(p.total_amount) : '',
                    participants: p.participants?.length ? p.participants : [{ name: '' }],
                    date: new Date().toISOString().split('T')[0],
                });
            }
        } catch { /* silent */ }
        finally { setNlLoading(false); }
    };

    const addParticipant = () => setForm({ ...form, participants: [...form.participants, { name: '' }] });
    const removeParticipant = (i: number) => setForm({ ...form, participants: form.participants.filter((_, idx) => idx !== i) });
    const updateParticipant = (i: number, name: string) => {
        const updated = [...form.participants];
        updated[i] = { name };
        setForm({ ...form, participants: updated });
    };

    const splitCount = form.participants.length + 1;
    const yourShare = form.total_amount ? (parseFloat(form.total_amount) / splitCount) : 0;

    const openEdit = (split: any) => {
        setEditingSplit(split);
        setForm({
            description: split.description,
            total_amount: String(parseFloat(split.total_amount)),
            participants: (split.participants || []).map((p: any) => ({ name: p.name })),
            date: split.date?.split('T')[0] || new Date().toISOString().split('T')[0],
        });
        setNlInput('');
        setFormError('');
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingSplit(null);
        setNlInput('');
        setForm({ description: '', total_amount: '', participants: [{ name: '' }], date: new Date().toISOString().split('T')[0] });
        setFormError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(''); setFormLoading(true);
        try {
            const validParticipants = form.participants.filter(p => p.name.trim());
            if (!validParticipants.length) { setFormError('Add at least one participant.'); setFormLoading(false); return; }
            if (editingSplit) {
                await splitsAPI.update(editingSplit.id, { description: form.description, total_amount: parseFloat(form.total_amount), participants: validParticipants, date: form.date });
            } else {
                await splitsAPI.create({ description: form.description, total_amount: parseFloat(form.total_amount), participants: validParticipants, date: form.date });
            }
            closeModal();
            fetchSplits();
        } catch (err: any) { setFormError(err.response?.data?.error || (editingSplit ? 'Failed to update split.' : 'Failed to create split.')); }
        finally { setFormLoading(false); }
    };

    const handleSettle = async (splitId: string, idx: number) => {
        try {
            const res = await splitsAPI.settle(splitId, idx);
            setSplits(splits.map(s => s.id === splitId ? res.data.split : s));
        } catch { /* silent */ }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this split?')) return;
        setDeletingId(id);
        try { await splitsAPI.delete(id); fetchSplits(); }
        finally { setDeletingId(null); }
    };

    const allSettled = (split: any) => split.participants.every((p: any) => p.settled);

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={120} />
        </AppLayout>
    );

    return (
        <AppLayout>
        <PageShell
            title="Split Expenses"
            subtitle={splits.length > 0 ? `${splits.length} split${splits.length !== 1 ? 's' : ''}` : 'Track shared expenses and who owes you'}
            headerRight={
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Button onClick={() => setShowModal(true)} size="md"><Plus size={16} />Add Split</Button>
                    <PageHelp title="Splits" sections={[
                        { icon: '👥', heading: 'What is this page?', body: "Split bills and shared expenses with friends. Track who owes what and settle up easily." },
                        { icon: '➕', heading: 'Creating a split', body: "Tap '+ New Group' to create a split group (e.g. 'Goa Trip'). Add the total amount and list of people. FinTrack calculates each person's share." },
                        { icon: '⚡', heading: 'Settlement', body: 'FinTrack uses a minimum-transactions algorithm — it tells you the fewest payments needed to settle the group completely.' },
                    ]} />
                </div>
            }
        >

            {/* Modal */}
            <Modal isOpen={showModal} onClose={closeModal} title={editingSplit ? 'Edit Split' : 'New Split'} maxWidth="500px">

                        {/* Natural language input */}
                        <div style={{ marginBottom: '16px', padding: '14px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <Sparkles size={14} color="var(--accent-blue)" />
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-blue)' }}>AI Parse</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    placeholder='e.g. "Dinner ₹2400 split 4 ways with Raj, Priya, Sam"'
                                    value={nlInput}
                                    onChange={e => setNlInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleNlParse()}
                                    style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '8px', fontSize: '0.82rem', fontFamily: 'DM Sans, sans-serif', outline: 'none' }}
                                />
                                <button onClick={handleNlParse} disabled={nlLoading || !nlInput.trim()}
                                    style={{ padding: '8px 14px', background: 'var(--accent-blue-bg)', border: '1px solid var(--bg-border)', borderRadius: '8px', color: 'var(--accent-blue)', fontSize: '0.78rem', fontWeight: 600, cursor: nlLoading || !nlInput.trim() ? 'not-allowed' : 'pointer', opacity: nlLoading || !nlInput.trim() ? 0.6 : 1, fontFamily: 'DM Sans, sans-serif' }}>
                                    {nlLoading ? '…' : 'Parse'}
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Description</label>
                                <input type="text" placeholder="e.g. Dinner at restaurant" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required
                                    style={{ padding: '10px 14px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Total Amount (₹)</label>
                                    <input type="number" placeholder="2400" min="1" step="0.01" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} required
                                        style={{ padding: '10px 14px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none' }} />
                                </div>
                                <DatePicker
                                    label="Date"
                                    value={form.date}
                                    onChange={date => setForm({ ...form, date })}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Participants (excluding you)</label>
                                    <button type="button" onClick={addParticipant} style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>+ Add person</button>
                                </div>
                                {form.participants.map((p, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '8px' }}>
                                        <input type="text" placeholder={`Person ${i + 1} name`} value={p.name} onChange={e => updateParticipant(i, e.target.value)}
                                            style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '8px', fontSize: '0.84rem', fontFamily: 'DM Sans, sans-serif', outline: 'none' }} />
                                        {form.participants.length > 1 && (
                                            <button type="button" onClick={() => removeParticipant(i)} style={{ width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--bg-border)', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={13} /></button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {form.total_amount && (
                                <div style={{ padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                    Split {splitCount} ways → <strong style={{ color: 'var(--accent-green)' }}>₹{yourShare.toLocaleString('en-IN', { maximumFractionDigits: 2 })} each</strong>
                                </div>
                            )}

                            {formError && <div style={{ padding: '8px 12px', background: 'var(--accent-red-bg)', border: '1px solid var(--accent-red-border)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--accent-red)' }}>{formError}</div>}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <Button type="button" variant="secondary" size="lg" onClick={closeModal}>Cancel</Button>
                                <Button type="submit" size="lg" isLoading={formLoading}>{editingSplit ? 'Save Changes' : 'Create Split'}</Button>
                            </div>
                        </form>
            </Modal>

            {/* Splits list */}
            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
            ) : splits.length === 0 ? (
                <EmptyState
                    icon={Receipt}
                    title="No splits yet"
                    subtitle="Add a split to track shared expenses and who owes you"
                    action={<Button onClick={() => setShowModal(true)} size="sm">Add first split</Button>}
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {splits.map(split => {
                        const settled = allSettled(split);
                        return (
                            <div key={split.id} style={{ background: 'var(--bg-secondary)', border: `1px solid ${settled ? 'rgba(16,185,129,0.2)' : 'var(--bg-border)'}`, borderRadius: '16px', padding: '16px 20px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{split.description}</span>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: settled ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.08)', color: settled ? '#10b981' : '#f59e0b', border: `1px solid ${settled ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
                                                {settled ? 'Settled' : 'Pending'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Total: ₹{parseFloat(split.total_amount).toLocaleString('en-IN')}</span>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--accent-green)' }}>Your share: ₹{parseFloat(split.your_share).toLocaleString('en-IN')}</span>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{formatDate(split.date)}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                        <button onClick={() => openEdit(split)}
                                            style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid transparent', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer' }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.1)'; (e.currentTarget as HTMLElement).style.color = '#3b82f6'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                            <Pencil size={13} />
                                        </button>
                                        <button onClick={() => handleDelete(split.id)} disabled={deletingId === split.id}
                                            style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid transparent', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer', opacity: deletingId === split.id ? 0.5 : 1 }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(244,63,94,0.1)'; (e.currentTarget as HTMLElement).style.color = '#f43f5e'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>

                                {/* Participants */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {split.participants.map((p: any, i: number) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--bg-card)', border: `1px solid ${p.settled ? 'rgba(16,185,129,0.2)' : 'var(--bg-border)'}`, borderRadius: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: p.settled ? 'rgba(16,185,129,0.12)' : 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: p.settled ? '#10b981' : 'var(--text-secondary)' }}>
                                                    {p.name?.[0]?.toUpperCase() || '?'}
                                                </div>
                                                <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>{p.name}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>₹{parseFloat(p.share).toLocaleString('en-IN')}</span>
                                            </div>
                                            <button
                                                onClick={() => handleSettle(split.id, i)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', border: `1px solid ${p.settled ? 'rgba(16,185,129,0.25)' : 'var(--bg-border)'}`, background: p.settled ? 'rgba(16,185,129,0.08)' : 'transparent', color: p.settled ? '#10b981' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                                            >
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
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </PageShell>
        </AppLayout>
    );
}
