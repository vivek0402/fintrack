'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { groupsAPI, transactionsAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/store/toastStore';
import { fmt } from '@/lib/utils';
import {
    Plus, Users, X, Check, ChevronRight,
    ArrowLeft, Trash2, PlusCircle, SplitSquareHorizontal,
    Wallet, TrendingDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Member  { id?: number; name: string; email?: string }
interface Group   { id: number; name: string; emoji: string; description?: string; budget?: number; currency: string; member_count: number; total_spent: number; }
interface Transaction { id: number; description: string; amount: number; date: string; type: string; group_name?: string }
interface Share   { id: number; member: string; amount: number; settled: boolean }
interface Split   { id: number; description: string; total_amount: number; paid_by: string; date: string; shares: Share[] }
interface Settlement { from: string; to: string; amount: number }

const EMOJIS = ['👥','🏠','✈️','🎉','🍕','💼','🏋️','🎮','🛒','💊','📚','🌿'];

const inputSt: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box', fontFamily: 'var(--font-body)', outline: 'none' };
const labelSt: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'var(--font-body)' };
const iconBt: React.CSSProperties  = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '4px' };
const glassTileStyle: React.CSSProperties = { background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', boxShadow: 'var(--glass-edge)' };

export default function GroupsPage() {
    const { user } = useAuthStore();
    const currency = user?.currency || 'INR';

    const [groups,          setGroups]          = useState<Group[]>([]);
    const [loadingList,     setLoadingList]     = useState(true);
    const [mounted,         setMounted]         = useState(false);
    const [selectedGroup,   setSelectedGroup]   = useState<Group | null>(null);
    const [members,         setMembers]         = useState<Member[]>([]);
    const [transactions,    setTransactions]    = useState<Transaction[]>([]);
    const [splits,          setSplits]          = useState<Split[]>([]);
    const [settlements,     setSettlements]     = useState<Settlement[]>([]);
    const [activeTab,       setActiveTab]       = useState<'transactions' | 'splits' | 'settle'>('transactions');
    const [loadingDetail,   setLoadingDetail]   = useState(false);
    const [showModal,       setShowModal]       = useState(false);
    const [editingGroup,    setEditingGroup]    = useState<Group | null>(null);
    const [formName,        setFormName]        = useState('');
    const [formEmoji,       setFormEmoji]       = useState('👥');
    const [formDesc,        setFormDesc]        = useState('');
    const [formBudget,      setFormBudget]      = useState('');
    const [formMembers,     setFormMembers]     = useState<Member[]>([{ name: '' }]);
    const [saving,          setSaving]          = useState(false);
    const [showSplitModal,  setShowSplitModal]  = useState(false);
    const [editingSplit,    setEditingSplit]     = useState<Split | null>(null);
    const [splitDesc,       setSplitDesc]       = useState('');
    const [splitTotal,      setSplitTotal]      = useState('');
    const [splitPaidBy,     setSplitPaidBy]     = useState('');
    const [splitDate,       setSplitDate]       = useState(new Date().toISOString().split('T')[0]);
    const [splitMode,       setSplitMode]       = useState<'equal' | 'custom'>('equal');
    const [splitCustom,     setSplitCustom]     = useState<Record<string, string>>({});
    const [savingSplit,     setSavingSplit]      = useState(false);
    const [showTxModal,     setShowTxModal]     = useState(false);
    const [txSearch,        setTxSearch]        = useState('');
    const [txResults,       setTxResults]       = useState<Transaction[]>([]);
    const [linkingTx,       setLinkingTx]       = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const customTotal  = Object.values(splitCustom).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    const splitTotalNum = parseFloat(splitTotal) || 0;
    const customDiff   = splitTotalNum - customTotal;
    const customTallyOk = Math.abs(customDiff) < 0.01;

    // ── Data loading (all unchanged) ─────────────────────────────────────────
    const loadGroups = useCallback(async () => {
        setLoadingList(true);
        try { const res = await groupsAPI.getAll(); setGroups(res.data.groups); }
        finally { setLoadingList(false); }
    }, []);
    useEffect(() => { loadGroups(); }, [loadGroups]);

    const openGroup = useCallback(async (g: Group) => {
        setSelectedGroup(g); setActiveTab('transactions'); setLoadingDetail(true);
        try { const res = await groupsAPI.get(String(g.id)); setMembers(res.data.members); setTransactions(res.data.transactions); setSplits(res.data.splits); }
        finally { setLoadingDetail(false); }
    }, []);

    const loadSettlements = useCallback(async () => {
        if (!selectedGroup) return;
        const res = await groupsAPI.settlements(String(selectedGroup.id));
        setSettlements(res.data.settlements);
    }, [selectedGroup]);
    useEffect(() => { if (activeTab === 'settle') loadSettlements(); }, [activeTab, loadSettlements]);

    // ── Group CRUD (all unchanged) ────────────────────────────────────────────
    const openCreate = () => { setEditingGroup(null); setFormName(''); setFormEmoji('👥'); setFormDesc(''); setFormBudget(''); setFormMembers([{ name: '' }]); setShowModal(true); };
    const openEdit = (g: Group, e: React.MouseEvent) => { e.stopPropagation(); setEditingGroup(g); setFormName(g.name); setFormEmoji(g.emoji); setFormDesc(g.description || ''); setFormBudget(g.budget ? String(g.budget) : ''); setFormMembers(members.length ? [...members] : [{ name: '' }]); setShowModal(true); };
    const saveGroup = async () => {
        if (!formName.trim()) return; setSaving(true);
        const validMembers = formMembers.filter(m => m.name.trim());
        const payload = { name: formName.trim(), emoji: formEmoji, description: formDesc || undefined, budget: formBudget ? parseFloat(formBudget) : undefined, currency, members: validMembers };
        try { if (editingGroup) await groupsAPI.update(String(editingGroup.id), payload); else await groupsAPI.create(payload); setShowModal(false); await loadGroups(); if (selectedGroup && editingGroup?.id === selectedGroup.id) await openGroup({ ...selectedGroup, ...payload } as Group); }
        finally { setSaving(false); }
    };
    const deleteGroup = async (g: Group, e: React.MouseEvent) => { e.stopPropagation(); if (!confirm(`Delete "${g.name}"? Transactions will be unlinked.`)) return; await groupsAPI.delete(String(g.id)); if (selectedGroup?.id === g.id) setSelectedGroup(null); await loadGroups(); };

    // ── Split CRUD (all unchanged) ────────────────────────────────────────────
    const openEditSplit = (sp: Split) => {
        setEditingSplit(sp); setSplitDesc(sp.description); setSplitTotal(String(sp.total_amount)); setSplitPaidBy(sp.paid_by); setSplitDate(String(sp.date).split('T')[0]);
        const amounts = sp.shares.map(s => s.amount); const allEqual = amounts.every(a => Math.abs(a - amounts[0]) < 0.01); setSplitMode(allEqual ? 'equal' : 'custom');
        const customMap: Record<string, string> = {}; sp.shares.forEach(s => { customMap[s.member] = String(s.amount); }); setSplitCustom(customMap); setShowSplitModal(true);
    };
    const saveSplit = async () => {
        if (!selectedGroup || !splitDesc || !splitTotal || !splitPaidBy) return; setSavingSplit(true);
        const allMemberNames = [...members.map(m => m.name), 'Me'].filter(Boolean);
        let shares: { member: string; amount: number }[];
        if (splitMode === 'equal') { const total = parseFloat(splitTotal); const rounded = parseFloat((total / allMemberNames.length).toFixed(2)); const baseSum = parseFloat((rounded * (allMemberNames.length - 1)).toFixed(2)); shares = allMemberNames.map((m, idx) => ({ member: m, amount: idx === allMemberNames.length - 1 ? parseFloat((total - baseSum).toFixed(2)) : rounded })); }
        else { shares = allMemberNames.map(m => ({ member: m, amount: parseFloat(splitCustom[m] || '0') })); }
        try {
            if (editingSplit) await groupsAPI.updateSplit(String(selectedGroup.id), String(editingSplit.id), { description: splitDesc, total_amount: parseFloat(splitTotal), paid_by: splitPaidBy, date: splitDate, shares });
            else await groupsAPI.addSplit(String(selectedGroup.id), { description: splitDesc, total_amount: parseFloat(splitTotal), paid_by: splitPaidBy, date: splitDate, shares });
            setShowSplitModal(false); setEditingSplit(null); setSplitDesc(''); setSplitTotal(''); setSplitPaidBy(''); setSplitCustom({}); await openGroup(selectedGroup);
        } finally { setSavingSplit(false); }
    };
    const settleShare = async (split: Split, share: Share) => {
        if (!selectedGroup) return;
        try { await groupsAPI.settleShare(String(selectedGroup.id), String(split.id), String(share.id)); await openGroup(selectedGroup); if (activeTab === 'settle') await loadSettlements(); toast.success(`${share.member}'s share marked as settled`); }
        catch { toast.error('Failed to settle share'); }
    };
    const searchTx = async (q: string) => { setTxSearch(q); if (q.length < 2) { setTxResults([]); return; } const res = await transactionsAPI.search(q); setTxResults(res.data.transactions || []); };
    const linkTx = async (tx: Transaction) => { if (!selectedGroup) return; setLinkingTx(true); try { await groupsAPI.linkTransaction(String(selectedGroup.id), String(tx.id)); setShowTxModal(false); setTxSearch(''); setTxResults([]); await openGroup(selectedGroup); } finally { setLinkingTx(false); } };
    const unlinkTx = async (tx: Transaction) => {
        if (!selectedGroup) return;
        if (!confirm('Unlink this transaction from the group? Settlement totals will be recalculated.')) return;
        await groupsAPI.unlinkTransaction(String(selectedGroup.id), String(tx.id));
        await openGroup(selectedGroup);
    };

    const tabStyle = (active: boolean): React.CSSProperties => ({ padding: '6px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: active ? 600 : 400, border: 'none', background: active ? 'var(--accent)' : undefined, color: active ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s' });

    // ── LIST VIEW ─────────────────────────────────────────────────────────────
    if (!selectedGroup) {
        return (
            <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                    {/* Header */}
                    <div className="glass-surface" style={{ borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Groups</h1>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                    {groups.length > 0 ? `${groups.length} group${groups.length !== 1 ? 's' : ''}` : 'Track shared expenses with friends & family'}
                                </p>
                            </div>
                            <button type="button" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                <Plus size={14} /> New Group
                            </button>
                        </div>
                    </div>

                    {/* Group cards */}
                    {loadingList ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {[1, 2, 3].map(i => <SkeletonCard key={i} height={90} />)}
                        </div>
                    ) : groups.length === 0 ? (
                        <EmptyState
                            icon={Users}
                            title="No groups yet"
                            subtitle="Create a group to split expenses with friends or family"
                            action={
                                <button type="button" onClick={openCreate} style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>New Group</button>
                            }
                        />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {groups.map(g => {
                                const budgetPct = g.budget ? (Number(g.total_spent) / Number(g.budget)) * 100 : null;
                                return (
                                    <div key={g.id} onClick={() => openGroup(g)} className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', transition: 'border-color var(--transition-fast)' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-border)'}>
                                        <div style={{ fontSize: '2rem', lineHeight: 1, flexShrink: 0 }}>{g.emoji}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>{g.name}</span>
                                                <Badge>{g.member_count} member{Number(g.member_count) !== 1 ? 's' : ''}</Badge>
                                            </div>
                                            {budgetPct !== null ? (
                                                <div>
                                                    <ProgressBar pct={budgetPct} height={4} />
                                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '3px 0 0', fontFamily: 'var(--font-body)', fontVariantNumeric: 'tabular-nums' }}>
                                                        {fmt(Number(g.total_spent))} / {fmt(Number(g.budget))} budget
                                                    </p>
                                                </div>
                                            ) : (
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                                    Spent: <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmt(Number(g.total_spent))}</span>
                                                </p>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                                            <button type="button" onClick={e => openEdit(g, e)} className="glass-field" style={{ padding: '5px 10px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font-body)' }}>Edit</button>
                                            <button type="button" onClick={e => deleteGroup(g, e)} className="glass-field" style={{ padding: '5px 7px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-exp)', display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
                                            <ChevronRight size={16} color="var(--text-muted)" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {showModal && (<GroupModal editing={editingGroup} formName={formName} setFormName={setFormName} formEmoji={formEmoji} setFormEmoji={setFormEmoji} formDesc={formDesc} setFormDesc={setFormDesc} formBudget={formBudget} setFormBudget={setFormBudget} formMembers={formMembers} setFormMembers={setFormMembers} saving={saving} onSave={saveGroup} onClose={() => setShowModal(false)} />)}
            </>
        );
    }

    // ── DETAIL VIEW ───────────────────────────────────────────────────────────
    const allMemberNames = [...members.map(m => m.name), 'Me'];
    const totalSplits  = splits.reduce((s, sp) => s + parseFloat(String(sp.total_amount)), 0);
    const unsettledCount = splits.reduce((s, sp) => s + sp.shares.filter(sh => !sh.settled).length, 0);
    const youOwe = splits.reduce((sum, sp) => {
        const myShare = sp.shares.find(sh => sh.member === 'Me');
        if (myShare && !myShare.settled && sp.paid_by !== 'Me') sum += myShare.amount;
        return sum;
    }, 0);
    const owedToYou = splits.reduce((sum, sp) => {
        if (sp.paid_by === 'Me') sum += sp.shares.filter(sh => sh.member !== 'Me' && !sh.settled).reduce((s, sh) => s + sh.amount, 0);
        return sum;
    }, 0);
    const budgetPct = selectedGroup.budget ? (Number(selectedGroup.total_spent) / Number(selectedGroup.budget)) * 100 : null;

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* Back + header */}
                <div className="glass-surface" style={{ borderRadius: 'var(--radius-xl)', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button type="button" onClick={() => setSelectedGroup(null)} className="glass-field" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                            <ArrowLeft size={14} /> Groups
                        </button>
                        <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{selectedGroup.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{selectedGroup.name}</h1>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>
                                {members.length} member{members.length !== 1 ? 's' : ''}
                                {selectedGroup.budget && <span> · Budget {fmt(Number(selectedGroup.budget))}</span>}
                            </p>
                        </div>
                        <button type="button" onClick={e => openEdit(selectedGroup, e)} className="glass-field" style={{ padding: '6px 12px', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font-body)', flexShrink: 0 }}>Edit</button>
                    </div>
                </div>

                {/* You owe / Owed to you GCards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <GCard style={glassTileStyle}>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>You Owe</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: youOwe > 0 ? 'var(--color-exp)' : 'var(--text-muted)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                            {youOwe > 0 ? fmt(youOwe) : '—'}
                        </p>
                    </GCard>
                    <GCard style={glassTileStyle}>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Owed to You</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: owedToYou > 0 ? 'var(--color-inc)' : 'var(--text-muted)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                            {owedToYou > 0 ? fmt(owedToYou) : '—'}
                        </p>
                    </GCard>
                </div>

                {/* Budget bar */}
                {budgetPct !== null && (
                    <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Group Budget</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(Number(selectedGroup.total_spent))} / {fmt(Number(selectedGroup.budget))}</span>
                        </div>
                        <ProgressBar pct={budgetPct} height={6} />
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    {(['transactions', 'splits', 'settle'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setActiveTab(t)} className={activeTab === t ? undefined : 'glass-field'} style={tabStyle(activeTab === t)}>
                            {t === 'transactions' ? 'Transactions' : t === 'splits' ? `Splits${unsettledCount > 0 ? ` (${unsettledCount})` : ''}` : 'Settle Up'}
                        </button>
                    ))}
                </div>

                {loadingDetail ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {[1, 2].map(i => <SkeletonCard key={i} height={80} />)}
                    </div>
                ) : (
                    <>
                        {/* Transactions tab */}
                        {activeTab === 'transactions' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                                    <button type="button" onClick={() => setShowTxModal(true)} className="glass-field" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '13px', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                        <PlusCircle size={13} /> Add Existing
                                    </button>
                                </div>
                                {transactions.length === 0 ? (
                                    <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-body)' }}>No transactions linked. Add one above.</div>
                                ) : transactions.map(tx => (
                                    <div key={tx.id} className="glass-surface" style={{ borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)' }}>{tx.description}</p>
                                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{String(tx.date).split('T')[0]}</p>
                                        </div>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: tx.type === 'income' ? 'var(--color-inc)' : 'var(--color-exp)', marginRight: '12px', fontVariantNumeric: 'tabular-nums' }}>
                                            {tx.type === 'income' ? '+' : '−'}{fmt(Number(tx.amount))}
                                        </span>
                                        <button type="button" onClick={() => unlinkTx(tx)} style={iconBt}><X size={14} /></button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Splits tab */}
                        {activeTab === 'splits' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                                    <button type="button" onClick={() => { setEditingSplit(null); setSplitDesc(''); setSplitTotal(''); setSplitPaidBy(''); setSplitCustom({}); setSplitDate(new Date().toISOString().split('T')[0]); setSplitMode('equal'); setShowSplitModal(true); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '13px', cursor: 'pointer', color: 'white', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                                        <Plus size={13} /> Add Split
                                    </button>
                                </div>
                                {splits.length === 0 ? (
                                    <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-body)' }}>No splits yet.</div>
                                ) : splits.map(sp => {
                                    const isSettled = sp.shares.every(sh => sh.settled);
                                    const perPerson = sp.shares.length > 0 ? sp.total_amount / sp.shares.length : 0;
                                    return (
                                        <div key={sp.id} className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', marginBottom: '10px', overflow: 'hidden' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px 10px' }}>
                                                <div>
                                                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-display)' }}>{sp.description}</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                                        Paid by {sp.paid_by} · {fmt(perPerson)}/person
                                                    </p>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(sp.total_amount)}</span>
                                                    <Badge color={isSettled ? 'var(--color-inc)' : 'var(--color-warn)'} bg={isSettled ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-warn) 10%, transparent)'}>
                                                        {isSettled ? 'Settled' : 'Pending'}
                                                    </Badge>
                                                    <button type="button" onClick={() => openEditSplit(sp)} className="glass-field" style={{ padding: '4px 10px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>Edit</button>
                                                </div>
                                            </div>
                                            <div style={{ borderTop: '1px solid var(--glass-border)', padding: '8px 16px 12px' }}>
                                                {sp.shares.map(sh => (
                                                    <div key={sh.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--glass-border)' }}>
                                                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: sh.settled ? 'color-mix(in srgb, var(--color-inc) 12%, transparent)' : 'color-mix(in srgb, var(--text-primary) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: sh.settled ? 'var(--color-inc)' : 'var(--text-secondary)', flexShrink: 0, fontFamily: 'var(--font-display)' }}>
                                                            {sh.member[0]?.toUpperCase() || '?'}
                                                        </div>
                                                        <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{sh.member}</span>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(sh.amount)}</span>
                                                        {sh.settled ? (
                                                            <Badge color="var(--color-inc)" bg="color-mix(in srgb, var(--color-inc) 10%, transparent)"><Check size={10} /></Badge>
                                                        ) : (
                                                            <button type="button" onClick={() => settleShare(sp, sh)} style={{ padding: '4px 10px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                                                Settle Up
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Settle Up tab */}
                        {activeTab === 'settle' && (
                            <div>
                                {settlements.length === 0 ? (
                                    <div className="glass-surface" style={{ border: '1px solid color-mix(in srgb, var(--color-inc) 20%, transparent)', borderRadius: 'var(--radius-lg)', padding: '32px', textAlign: 'center' }}>
                                        <Check size={28} color="var(--color-inc)" style={{ marginBottom: '8px' }} />
                                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-inc)', fontFamily: 'var(--font-display)' }}>All settled up!</p>
                                    </div>
                                ) : settlements.map((s, i) => (
                                    <div key={i} className="glass-surface" style={{ borderRadius: 'var(--radius-md)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--color-exp)', fontSize: '14px', fontFamily: 'var(--font-display)' }}>{s.from}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-body)' }}>owes</span>
                                        <span style={{ fontWeight: 600, color: 'var(--color-inc)', fontSize: '14px', fontFamily: 'var(--font-display)' }}>{s.to}</span>
                                        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(s.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Group Modal */}
            {showModal && (<GroupModal editing={editingGroup} formName={formName} setFormName={setFormName} formEmoji={formEmoji} setFormEmoji={setFormEmoji} formDesc={formDesc} setFormDesc={setFormDesc} formBudget={formBudget} setFormBudget={setFormBudget} formMembers={formMembers} setFormMembers={setFormMembers} saving={saving} onSave={saveGroup} onClose={() => setShowModal(false)} />)}

            {/* Add Split Modal */}
            {showSplitModal && mounted && createPortal(
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
                    onClick={e => { if (e.target === e.currentTarget) setShowSplitModal(false); }}>
                    <div className="glass-surface glass-sheet" style={{ borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: '420px', padding: '24px', maxHeight: '90vh', overflowY: 'auto', animation: 'springIn 380ms cubic-bezier(0.34,1.56,0.64,1) both' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{editingSplit ? 'Edit Split' : 'Add Split'}</h3>
                            <button type="button" onClick={() => { setShowSplitModal(false); setEditingSplit(null); }} style={iconBt}><X size={18} /></button>
                        </div>
                        {([
                            { label: 'Description', value: splitDesc, set: setSplitDesc, placeholder: 'Dinner, Uber, etc.', type: 'text' },
                            { label: 'Total Amount', value: splitTotal, set: setSplitTotal, placeholder: '0.00', type: 'number' },
                            { label: 'Date', value: splitDate, set: setSplitDate, placeholder: '', type: 'date' },
                        ] as const).map(f => (
                            <div key={f.label} style={{ marginBottom: '14px' }}>
                                <label style={labelSt}>{f.label}</label>
                                <input value={f.value} onChange={e => (f.set as (v: string) => void)(e.target.value)} type={f.type} placeholder={f.placeholder} style={inputSt} />
                            </div>
                        ))}
                        <div style={{ marginBottom: '14px' }}>
                            <label style={labelSt}>Paid By</label>
                            <select value={splitPaidBy} onChange={e => setSplitPaidBy(e.target.value)} style={inputSt}>
                                <option value="">Select…</option>
                                {allMemberNames.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ ...labelSt, marginBottom: 6 }}>Split Mode</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {(['equal', 'custom'] as const).map(m => (
                                    <button key={m} type="button" onClick={() => setSplitMode(m)} className={splitMode === m ? undefined : 'glass-field'} style={{ padding: '6px 16px', borderRadius: '999px', fontSize: '13px', border: 'none', background: splitMode === m ? 'var(--accent)' : undefined, color: splitMode === m ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        {m === 'equal' ? 'Equal' : 'Custom'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {splitMode === 'custom' && (
                            <div style={{ marginBottom: '14px' }}>
                                <label style={labelSt}>Custom Amounts</label>
                                {allMemberNames.map(n => (
                                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{n}</span>
                                        <input type="number" value={splitCustom[n] || ''} onChange={e => setSplitCustom(p => ({ ...p, [n]: e.target.value }))} placeholder="0.00" style={{ width: '90px', padding: '6px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)' }} />
                                    </div>
                                ))}
                                <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: 9, background: customTallyOk ? 'color-mix(in srgb, var(--color-inc) 8%, transparent)' : customTotal > 0 ? 'color-mix(in srgb, var(--color-exp) 8%, transparent)' : 'color-mix(in srgb, var(--text-primary) 5%, transparent)', border: `1px solid ${customTallyOk ? 'color-mix(in srgb, var(--color-inc) 25%, transparent)' : customTotal > 0 ? 'color-mix(in srgb, var(--color-exp) 25%, transparent)' : 'var(--glass-border)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Sum of shares</span>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: customTallyOk ? 'var(--color-inc)' : customTotal > 0 ? 'var(--color-exp)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(customTotal)}{splitTotalNum > 0 && ` / ${fmt(splitTotalNum)}`}</span>
                                        {customTallyOk && splitTotalNum > 0 && <span style={{ fontSize: '11px', color: 'var(--color-inc)', fontFamily: 'var(--font-body)' }}>✓ Balanced</span>}
                                        {!customTallyOk && customTotal > 0 && splitTotalNum > 0 && <span style={{ fontSize: '11px', color: customDiff > 0 ? 'var(--color-warn)' : 'var(--color-exp)', fontFamily: 'var(--font-body)' }}>{customDiff > 0 ? `${fmt(customDiff)} unallocated` : `${fmt(-customDiff)} over total`}</span>}
                                    </div>
                                </div>
                            </div>
                        )}
                        <button type="button" onClick={saveSplit} disabled={savingSplit || !splitDesc || !splitTotal || !splitPaidBy || (splitMode === 'custom' && !customTallyOk && customTotal > 0)}
                            style={{ width: '100%', padding: '11px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-body)', opacity: (savingSplit || (splitMode === 'custom' && !customTallyOk && customTotal > 0)) ? 0.6 : 1 }}>
                            {savingSplit ? (editingSplit ? 'Saving…' : 'Adding…') : (editingSplit ? 'Save Changes' : 'Add Split')}
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {/* Link Transaction Modal */}
            {showTxModal && mounted && createPortal(
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
                    onClick={e => { if (e.target === e.currentTarget) { setShowTxModal(false); setTxSearch(''); setTxResults([]); } }}>
                    <div className="glass-surface glass-sheet" style={{ borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: '420px', padding: '24px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Link Transaction</h3>
                            <button type="button" onClick={() => { setShowTxModal(false); setTxSearch(''); setTxResults([]); }} style={iconBt}><X size={18} /></button>
                        </div>
                        <input value={txSearch} onChange={e => searchTx(e.target.value)} placeholder="Search transactions…" style={{ ...inputSt, marginBottom: '12px' }} />
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {txResults.map(tx => (
                                <div key={tx.id} onClick={() => !linkingTx && linkTx(tx)} className="glass-field" style={{ padding: '10px 12px', borderRadius: 9, cursor: 'pointer', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--text-primary) 10%, transparent)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--text-primary) 5%, transparent)'}>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{tx.description}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{String(tx.date).split('T')[0]}</p>
                                    </div>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '13px', color: tx.type === 'income' ? 'var(--color-inc)' : 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>{fmt(Number(tx.amount))}</span>
                                </div>
                            ))}
                            {txSearch.length >= 2 && txResults.length === 0 && (<p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-body)' }}>No results.</p>)}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

// ─── Group Create/Edit Modal ──────────────────────────────────────────────────
function GroupModal({ editing, formName, setFormName, formEmoji, setFormEmoji, formDesc, setFormDesc, formBudget, setFormBudget, formMembers, setFormMembers, saving, onSave, onClose }: {
    editing: Group | null; formName: string; setFormName: (v: string) => void; formEmoji: string; setFormEmoji: (v: string) => void; formDesc: string; setFormDesc: (v: string) => void; formBudget: string; setFormBudget: (v: string) => void; formMembers: Member[]; setFormMembers: (v: Member[]) => void; saving: boolean; onSave: () => void; onClose: () => void;
}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    const addMember    = () => setFormMembers([...formMembers, { name: '' }]);
    const removeMember = (i: number) => setFormMembers(formMembers.filter((_, idx) => idx !== i));
    const updateMember = (i: number, field: keyof Member, val: string) => { const updated = [...formMembers]; updated[i] = { ...updated[i], [field]: val }; setFormMembers(updated); };
    const inputSt: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box', fontFamily: 'var(--font-body)', outline: 'none' };
    const labelSt: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'var(--font-body)' };
    if (!mounted) return null;
    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="glass-surface glass-sheet" style={{ borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: '420px', padding: '24px', maxHeight: '90vh', overflowY: 'auto', animation: 'springIn 380ms cubic-bezier(0.34,1.56,0.64,1) both' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{editing ? 'Edit Group' : 'New Group'}</h3>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                </div>
                <div style={{ marginBottom: '14px' }}>
                    <label style={labelSt}>Emoji</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {EMOJIS.map(em => (<button key={em} type="button" onClick={() => setFormEmoji(em)} className={formEmoji === em ? undefined : 'glass-field'} style={{ width: 36, height: 36, borderRadius: 8, fontSize: '1.1rem', border: formEmoji === em ? '2px solid var(--accent)' : 'none', background: formEmoji === em ? 'var(--accent-subtle)' : undefined, cursor: 'pointer' }}>{em}</button>))}
                    </div>
                </div>
                <div style={{ marginBottom: 14 }}><label style={labelSt}>Name *</label><input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Trip to Goa, Flat Expenses…" style={inputSt} /></div>
                <div style={{ marginBottom: 14 }}><label style={labelSt}>Description</label><input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Optional" style={inputSt} /></div>
                <div style={{ marginBottom: 14 }}><label style={labelSt}>Budget (optional)</label><input type="number" value={formBudget} onChange={e => setFormBudget(e.target.value)} placeholder="0" style={inputSt} /></div>
                <div style={{ marginBottom: 20 }}>
                    <label style={labelSt}>Members</label>
                    {formMembers.map((m, i) => (
                        <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                            <input value={m.name} onChange={e => updateMember(i, 'name', e.target.value)} placeholder="Name" style={{ flex: 1, padding: '7px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'var(--font-body)', outline: 'none' }} />
                            <input value={m.email || ''} onChange={e => updateMember(i, 'email', e.target.value)} placeholder="Email (opt)" style={{ flex: 1, padding: '7px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'var(--font-body)', outline: 'none' }} />
                            {formMembers.length > 1 && (<button type="button" onClick={() => removeMember(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-exp)', display: 'flex', alignItems: 'center' }}><X size={14} /></button>)}
                        </div>
                    ))}
                    <button type="button" onClick={addMember} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '13px', padding: '2px 0', fontFamily: 'var(--font-body)' }}>
                        <Plus size={13} /> Add member
                    </button>
                </div>
                <button type="button" onClick={onSave} disabled={saving || !formName.trim()} style={{ width: '100%', padding: '11px', background: saving || !formName.trim() ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontWeight: 600, fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)' }}>
                    {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Group'}
                </button>
            </div>
        </div>,
        document.body
    );
}
