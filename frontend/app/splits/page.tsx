'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Sparkles, X, Check, Pencil } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { splitsAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { formatDate } from '@/lib/utils';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

const inputSt: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 10, fontSize: '0.875rem', fontFamily: 'var(--font-body)', outline: 'none' };

export default function SplitsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [splits,       setSplits]       = useState<any[]>([]);
    const [loading,      setLoading]      = useState(true);
    const [showModal,    setShowModal]    = useState(false);
    const [editingSplit, setEditingSplit] = useState<any | null>(null);
    const [deletingId,   setDeletingId]  = useState<string | null>(null);
    const [nlInput,      setNlInput]     = useState('');
    const [nlLoading,    setNlLoading]   = useState(false);
    const [form,         setForm]        = useState({ description: '', total_amount: '', participants: [{ name: '' }], date: new Date().toISOString().split('T')[0] });
    const [formLoading,  setFormLoading] = useState(false);
    const [formError,    setFormError]   = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchSplits = async () => {
        setLoading(true);
        try { const res = await splitsAPI.getAll(); setSplits(res.data.splits); }
        catch { setSplits([]); }
        finally { setLoading(false); }
    };
    useEffect(() => { if (user) fetchSplits(); }, [user]);

    // ── Handlers (all unchanged) ──────────────────────────────────────────────
    const handleNlParse = async () => {
        if (!nlInput.trim()) return;
        setNlLoading(true);
        try {
            const res = await aiAPI.parseSplit(nlInput);
            const p = res.data.parsed;
            if (p) setForm({ description: p.description || '', total_amount: p.total_amount ? String(p.total_amount) : '', participants: p.participants?.length ? p.participants : [{ name: '' }], date: new Date().toISOString().split('T')[0] });
        } catch { /* silent */ }
        finally { setNlLoading(false); }
    };

    const addParticipant    = () => setForm({ ...form, participants: [...form.participants, { name: '' }] });
    const removeParticipant = (i: number) => setForm({ ...form, participants: form.participants.filter((_, idx) => idx !== i) });
    const updateParticipant = (i: number, name: string) => { const updated = [...form.participants]; updated[i] = { name }; setForm({ ...form, participants: updated }); };

    const splitCount = form.participants.length + 1;
    const yourShare  = form.total_amount ? (parseFloat(form.total_amount) / splitCount) : 0;

    const openEdit = (split: any) => {
        setEditingSplit(split);
        setForm({ description: split.description, total_amount: String(parseFloat(split.total_amount)), participants: (split.participants || []).map((p: any) => ({ name: p.name })), date: split.date?.split('T')[0] || new Date().toISOString().split('T')[0] });
        setNlInput(''); setFormError(''); setShowModal(true);
    };

    const closeModal = () => { setShowModal(false); setEditingSplit(null); setNlInput(''); setForm({ description: '', total_amount: '', participants: [{ name: '' }], date: new Date().toISOString().split('T')[0] }); setFormError(''); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setFormError(''); setFormLoading(true);
        try {
            const validParticipants = form.participants.filter(p => p.name.trim());
            if (!validParticipants.length) { setFormError('Add at least one participant.'); setFormLoading(false); return; }
            if (editingSplit) await splitsAPI.update(editingSplit.id, { description: form.description, total_amount: parseFloat(form.total_amount), participants: validParticipants, date: form.date });
            else await splitsAPI.create({ description: form.description, total_amount: parseFloat(form.total_amount), participants: validParticipants, date: form.date });
            closeModal(); fetchSplits();
        } catch (err: any) { setFormError(err.response?.data?.error || (editingSplit ? 'Failed to update.' : 'Failed to create.')); }
        finally { setFormLoading(false); }
    };

    const handleSettle = async (splitId: string, idx: number) => {
        try { const res = await splitsAPI.settle(splitId, idx); setSplits(splits.map(s => s.id === splitId ? res.data.split : s)); }
        catch { /* silent */ }
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
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={64} style={{ marginBottom: '16px' }} />
            {[1, 2, 3].map(i => <SkeletonCard key={i} height={120} style={{ marginBottom: '12px' }} />)}
        </AppLayout>
    );

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Split Expenses</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                {splits.length > 0 ? `${splits.length} split${splits.length !== 1 ? 's' : ''}` : 'Track shared expenses and who owes you'}
                            </p>
                        </div>
                        <button type="button" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            <Plus size={14} /> Add Split
                        </button>
                    </div>
                </div>

                {/* ── AI PARSE STRIP ── */}
                <div style={{ background: 'color-mix(in srgb, var(--color-info) 8%, var(--bg-surface-1))', border: '1.5px solid color-mix(in srgb, var(--color-info) 20%, transparent)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                        <Sparkles size={14} color="var(--color-info)" />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-info)', fontFamily: 'var(--font-display)' }}>AI Parse Split</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="text" placeholder='"Dinner ₹2400 split 4 ways with Raj, Priya, Sam"'
                            value={nlInput} onChange={e => setNlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleNlParse()}
                            style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 9, fontSize: '13px', fontFamily: 'var(--font-body)', outline: 'none', transition: 'border-color var(--transition-fast)' }}
                            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                        />
                        <button type="button" onClick={handleNlParse} disabled={nlLoading || !nlInput.trim()}
                            style={{ padding: '9px 16px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 9, color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: nlLoading || !nlInput.trim() ? 'not-allowed' : 'pointer', opacity: nlLoading || !nlInput.trim() ? 0.6 : 1, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                            {nlLoading ? '…' : 'Parse'}
                        </button>
                    </div>
                </div>

                {/* ── SPLITS LIST ── */}
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {[1, 2, 3].map(i => <SkeletonCard key={i} height={120} />)}
                    </div>
                ) : splits.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                        <p style={{ fontSize: '40px', marginBottom: '10px' }}>🧾</p>
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>No splits yet</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 18px', fontFamily: 'var(--font-body)' }}>Add a split to track shared expenses and who owes you</p>
                        <button type="button" onClick={() => setShowModal(true)} style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Add first split</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {splits.map(split => {
                            const settled = allSettled(split);
                            return (
                                <div key={split.id} style={{ background: 'var(--bg-surface-1)', border: `1px solid ${settled ? 'color-mix(in srgb, var(--color-inc) 20%, transparent)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                    {/* Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px 10px', gap: '10px' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{split.description}</span>
                                                <Badge color={settled ? 'var(--color-inc)' : 'var(--color-warn)'} bg={settled ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-warn) 10%, transparent)'}>
                                                    {settled ? 'Settled' : 'Pending'}
                                                </Badge>
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(parseFloat(split.total_amount))}</span>
                                                <span style={{ fontSize: '12px', color: 'var(--color-inc)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>Your share: {fmt(parseFloat(split.your_share))}</span>
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{formatDate(split.date)}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                            <button type="button" onClick={() => openEdit(split)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer' }}
                                                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent-subtle)'; el.style.color = 'var(--accent)'; }}
                                                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                <Pencil size={13} />
                                            </button>
                                            <button type="button" onClick={() => handleDelete(split.id)} disabled={deletingId === split.id} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', opacity: deletingId === split.id ? 0.5 : 1 }}
                                                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'color-mix(in srgb, var(--color-exp) 10%, transparent)'; el.style.color = 'var(--color-exp)'; }}
                                                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'; }}>
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Participants */}
                                    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '8px 16px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {split.participants.map((p: any, i: number) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: p.settled ? 'color-mix(in srgb, var(--color-inc) 12%, transparent)' : 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: p.settled ? 'var(--color-inc)' : 'var(--text-secondary)', flexShrink: 0, fontFamily: 'var(--font-display)' }}>
                                                    {p.name?.[0]?.toUpperCase() || '?'}
                                                </div>
                                                <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{p.name}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(parseFloat(p.share))}</span>
                                                <button type="button" onClick={() => handleSettle(split.id, i)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: 6, border: `1px solid ${p.settled ? 'color-mix(in srgb, var(--color-inc) 25%, transparent)' : 'var(--border-subtle)'}`, background: p.settled ? 'color-mix(in srgb, var(--color-inc) 8%, transparent)' : 'transparent', color: p.settled ? 'var(--color-inc)' : 'var(--text-muted)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
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
            </div>

            {/* ── NEW/EDIT SPLIT MODAL ── */}
            <Modal isOpen={showModal} onClose={closeModal} title={editingSplit ? 'Edit Split' : 'New Split'} maxWidth="500px">
                {/* AI Parse */}
                <GCard style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <Sparkles size={13} color="var(--color-info)" />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-info)', fontFamily: 'var(--font-display)' }}>AI Parse</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="text" placeholder='"Dinner ₹2400 split 4 ways with Raj, Priya, Sam"'
                            value={nlInput} onChange={e => setNlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleNlParse()}
                            style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: '12px', fontFamily: 'var(--font-body)', outline: 'none' }} />
                        <button type="button" onClick={handleNlParse} disabled={nlLoading || !nlInput.trim()}
                            style={{ padding: '8px 14px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 8, color: 'var(--accent)', fontSize: '12px', fontWeight: 600, cursor: nlLoading || !nlInput.trim() ? 'not-allowed' : 'pointer', opacity: nlLoading || !nlInput.trim() ? 0.6 : 1, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                            {nlLoading ? '…' : 'Parse'}
                        </button>
                    </div>
                </GCard>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)' }}>Description</label>
                        <input type="text" placeholder="e.g. Dinner at restaurant" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required style={inputSt} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)' }}>Total Amount *</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>₹</span>
                                <input type="number" placeholder="2400" min="1" step="0.01" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} required style={{ ...inputSt, paddingLeft: 30, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }} />
                            </div>
                        </div>
                        <DatePicker label="Date" value={form.date} onChange={date => setForm({ ...form, date })} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)' }}>Participants (excl. you)</label>
                            <button type="button" onClick={addParticipant} style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>+ Add person</button>
                        </div>
                        {form.participants.map((p, i) => (
                            <div key={i} style={{ display: 'flex', gap: '8px' }}>
                                <input type="text" placeholder={`Person ${i + 1} name`} value={p.name} onChange={e => updateParticipant(i, e.target.value)} style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: '13px', fontFamily: 'var(--font-body)', outline: 'none' }} />
                                {form.participants.length > 1 && (
                                    <button type="button" onClick={() => removeParticipant(i)} style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={13} /></button>
                                )}
                            </div>
                        ))}
                    </div>
                    {form.total_amount && (
                        <GCard>
                            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                Split {splitCount} ways → <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-inc)', fontVariantNumeric: 'tabular-nums' }}>{fmt(yourShare)} each</strong>
                            </p>
                        </GCard>
                    )}
                    {formError && (
                        <div style={{ padding: '8px 12px', background: 'color-mix(in srgb, var(--color-exp) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 20%, transparent)', borderRadius: 8, fontSize: '13px', color: 'var(--color-exp)', fontFamily: 'var(--font-body)' }}>{formError}</div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <Button type="button" variant="secondary" size="lg" onClick={closeModal}>Cancel</Button>
                        <Button type="submit" size="lg" isLoading={formLoading}>{editingSplit ? 'Save Changes' : 'Create Split'}</Button>
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}
