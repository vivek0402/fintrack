'use client';

import { useState, useEffect, useCallback } from 'react';
import { groupsAPI, transactionsAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction, Rows, Stat, TONE_TEXT } from '@/components/ui/CardParts';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { toast } from '@/store/toastStore';
import { fmt } from '@/lib/utils';
import { type, truncate } from '@/lib/typography';
import { groupBalances, balanceSentence, sortSplitsPendingFirst, budgetPct as calcBudgetPct } from '@/lib/groups';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Member  { id?: number; name: string; email?: string }
interface Group   { id: number; name: string; emoji: string; description?: string; budget?: number; currency: string; member_count: number; total_spent: number; }
interface Transaction { id: number; description: string; amount: number; date: string; type: string; group_name?: string }
interface Share   { id: number; member: string; amount: number; settled: boolean }
interface Split   { id: number; description: string; total_amount: number; paid_by: string; date: string; shares: Share[] }
interface Settlement { from: string; to: string; amount: number }

// The group's own icon is a data choice, so these stay as emoji.
const EMOJIS = ['👥','🏠','✈️','🎉','🍕','💼','🏋️','🎮','🛒','💊','📚','🌿'];

const TABS_BASE = [
    { key: 'transactions', label: 'Transactions' },
    { key: 'splits', label: 'Splits' },
    { key: 'settle', label: 'Settle up' },
];

const selectStyle: React.CSSProperties = {
    ...type.body, color: 'var(--text-primary)', width: '100%', height: 40, padding: '0 var(--space-3)',
    background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
    outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
};

/** A labelled control the shared Input cannot render itself (select). */
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%' }}>
            <label htmlFor={htmlFor} style={type.label}>{label}</label>
            {children}
        </div>
    );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function GroupsPage() {
    const { user } = useAuthStore();
    const currency = user?.currency || 'INR';

    const [groups,          setGroups]          = useState<Group[]>([]);
    const [loadingList,     setLoadingList]     = useState(true);
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
    const [searchingTx,     setSearchingTx]     = useState(false);
    const [linkingTx,       setLinkingTx]       = useState(false);

    const customTotal  = Object.values(splitCustom).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    const splitTotalNum = parseFloat(splitTotal) || 0;
    const customDiff   = splitTotalNum - customTotal;
    const customTallyOk = Math.abs(customDiff) < 0.01;

    // ── Data loading ─────────────────────────────────────────────────────────
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

    // ── Group CRUD ────────────────────────────────────────────────────────────
    const openCreate = () => { setEditingGroup(null); setFormName(''); setFormEmoji('👥'); setFormDesc(''); setFormBudget(''); setFormMembers([{ name: '' }]); setShowModal(true); };
    const openEdit = (g: Group, e?: React.MouseEvent) => { e?.stopPropagation(); setEditingGroup(g); setFormName(g.name); setFormEmoji(g.emoji); setFormDesc(g.description || ''); setFormBudget(g.budget ? String(g.budget) : ''); setFormMembers(members.length ? [...members] : [{ name: '' }]); setShowModal(true); };
    const saveGroup = async () => {
        if (!formName.trim()) return; setSaving(true);
        const validMembers = formMembers.filter(m => m.name.trim());
        const payload = { name: formName.trim(), emoji: formEmoji, description: formDesc || undefined, budget: formBudget ? parseFloat(formBudget) : undefined, currency, members: validMembers };
        try { if (editingGroup) await groupsAPI.update(String(editingGroup.id), payload); else await groupsAPI.create(payload); setShowModal(false); await loadGroups(); if (selectedGroup && editingGroup?.id === selectedGroup.id) await openGroup({ ...selectedGroup, ...payload } as Group); }
        finally { setSaving(false); }
    };
    // Returns true when the group was deleted (the confirm was accepted).
    const deleteGroup = async (g: Group, e?: React.MouseEvent): Promise<boolean> => { e?.stopPropagation(); if (!confirm(`Delete "${g.name}"? Transactions will be unlinked.`)) return false; await groupsAPI.delete(String(g.id)); if (selectedGroup?.id === g.id) setSelectedGroup(null); await loadGroups(); return true; };

    // ── Split CRUD ────────────────────────────────────────────────────────────
    const openAddSplit = () => { setEditingSplit(null); setSplitDesc(''); setSplitTotal(''); setSplitPaidBy(''); setSplitCustom({}); setSplitDate(new Date().toISOString().split('T')[0]); setSplitMode('equal'); setShowSplitModal(true); };
    const openEditSplit = (sp: Split) => {
        setEditingSplit(sp); setSplitDesc(sp.description); setSplitTotal(String(sp.total_amount)); setSplitPaidBy(sp.paid_by); setSplitDate(String(sp.date).split('T')[0]);
        const amounts = sp.shares.map(s => s.amount); const allEqual = amounts.every(a => Math.abs(a - amounts[0]) < 0.01); setSplitMode(allEqual ? 'equal' : 'custom');
        const customMap: Record<string, string> = {}; sp.shares.forEach(s => { customMap[s.member] = String(s.amount); }); setSplitCustom(customMap); setShowSplitModal(true);
    };
    const closeSplit = () => { setShowSplitModal(false); setEditingSplit(null); };
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
    const searchTx = async (q: string) => {
        setTxSearch(q);
        if (q.length < 2) { setTxResults([]); return; }
        setSearchingTx(true);
        try { const res = await transactionsAPI.search(q); setTxResults(res.data.transactions || []); }
        finally { setSearchingTx(false); }
    };
    const closeTxModal = () => { setShowTxModal(false); setTxSearch(''); setTxResults([]); };
    const linkTx = async (tx: Transaction) => { if (!selectedGroup) return; setLinkingTx(true); try { await groupsAPI.linkTransaction(String(selectedGroup.id), String(tx.id)); setShowTxModal(false); setTxSearch(''); setTxResults([]); await openGroup(selectedGroup); } finally { setLinkingTx(false); } };
    const unlinkTx = async (tx: Transaction) => {
        if (!selectedGroup) return;
        if (!confirm('Unlink this transaction from the group? Settlement totals will be recalculated.')) return;
        await groupsAPI.unlinkTransaction(String(selectedGroup.id), String(tx.id));
        await openGroup(selectedGroup);
    };

    // ── Dialogs (shared by the list and the detail view) ──────────────────────
    const addMember    = () => setFormMembers([...formMembers, { name: '' }]);
    const removeMember = (i: number) => setFormMembers(formMembers.filter((_, idx) => idx !== i));
    const updateMember = (i: number, field: keyof Member, val: string) => { const updated = [...formMembers]; updated[i] = { ...updated[i], [field]: val }; setFormMembers(updated); };

    const allMemberNames = [...members.map(m => m.name), 'Me'];

    const groupDialog = (
        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingGroup ? 'Edit group' : 'New group'} maxWidth="480px"
            footer={
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                    <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
                    <Button type="button" onClick={saveGroup} isLoading={saving} disabled={!formName.trim()}>{editingGroup ? 'Save changes' : 'Create group'}</Button>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <p style={{ ...type.label, margin: 0 }}>Icon</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                        {EMOJIS.map(em => (
                            <button key={em} type="button" onClick={() => setFormEmoji(em)} aria-pressed={formEmoji === em} aria-label={`Icon ${em}`}
                                style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', fontSize: 'var(--text-title)', border: 'none', background: 'var(--glass-fill-1)', boxShadow: formEmoji === em ? 'inset 0 0 0 2px var(--text-primary)' : 'none', cursor: 'pointer' }}>
                                {em}
                            </button>
                        ))}
                    </div>
                </div>
                <Input label="Group name" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Trip to Goa, Flat expenses" />
                <Input label="Description (optional)" value={formDesc} onChange={e => setFormDesc(e.target.value)} />
                <Input label="Budget (optional)" type="number" value={formBudget} onChange={e => setFormBudget(e.target.value)} placeholder="0" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <p style={{ ...type.label, margin: 0 }}>Members</p>
                    {formMembers.map((m, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                            <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                                <Input aria-label="Member name" value={m.name} onChange={e => updateMember(i, 'name', e.target.value)} placeholder="Name" />
                            </div>
                            <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                                <Input aria-label="Member email" value={m.email || ''} onChange={e => updateMember(i, 'email', e.target.value)} placeholder="Email (optional)" />
                            </div>
                            {formMembers.length > 1 && <TextAction quiet onClick={() => removeMember(i)} aria-label={`Remove member ${m.name || i + 1}`}>Remove</TextAction>}
                        </div>
                    ))}
                    <div><TextAction onClick={addMember}>Add a member</TextAction></div>
                </div>
                {editingGroup && (
                    <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-4)' }}>
                        <TextAction quiet tone="danger" onClick={async () => { if (await deleteGroup(editingGroup)) setShowModal(false); }}>Delete this group</TextAction>
                        <p style={{ ...type.meta, margin: 0 }}>Removes the group and its splits. Linked transactions stay in your transactions.</p>
                    </div>
                )}
            </div>
        </Modal>
    );

    const splitDisabled = !splitDesc || !splitTotal || !splitPaidBy || (splitMode === 'custom' && !customTallyOk && customTotal > 0);

    const splitDialog = (
        <Modal isOpen={showSplitModal} onClose={closeSplit} title={editingSplit ? 'Edit split' : 'Add split'} maxWidth="480px"
            footer={
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                    <Button type="button" variant="secondary" onClick={closeSplit}>Cancel</Button>
                    <Button type="button" onClick={saveSplit} isLoading={savingSplit} disabled={splitDisabled}>{editingSplit ? 'Save changes' : 'Add split'}</Button>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <Input label="Description" value={splitDesc} onChange={e => setSplitDesc(e.target.value)} placeholder="Dinner, Uber, etc." />
                <Input label="Total amount" type="number" value={splitTotal} onChange={e => setSplitTotal(e.target.value)} placeholder="0.00" />
                <Input label="Date" type="date" value={splitDate} onChange={e => setSplitDate(e.target.value)} />
                <Field label="Paid by" htmlFor="split-paid-by">
                    <select id="split-paid-by" value={splitPaidBy} onChange={e => setSplitPaidBy(e.target.value)} style={selectStyle}>
                        <option value="">Select</option>
                        {allMemberNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </Field>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <p style={{ ...type.label, margin: 0 }}>How to split</p>
                    <Tabs tabs={[{ key: 'equal', label: 'Equal' }, { key: 'custom', label: 'Custom' }]} active={splitMode} onChange={k => setSplitMode(k as 'equal' | 'custom')} />
                </div>
                {splitMode === 'custom' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {allMemberNames.map(n => (
                            <Input key={n} label={n} type="number" value={splitCustom[n] || ''} onChange={e => setSplitCustom(p => ({ ...p, [n]: e.target.value }))} placeholder="0.00" />
                        ))}
                        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                            <span style={type.label}>Sum of shares</span>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                <span style={{ ...type.num, color: customTallyOk && customTotal > 0 ? TONE_TEXT.good : customTotal > 0 ? TONE_TEXT.bad : 'var(--text-primary)' }}>
                                    {fmt(customTotal)}{splitTotalNum > 0 && ` / ${fmt(splitTotalNum)}`}
                                </span>
                                {customTallyOk && splitTotalNum > 0 && <span style={{ ...type.meta, color: TONE_TEXT.good }}>Balanced</span>}
                                {!customTallyOk && customTotal > 0 && splitTotalNum > 0 && (
                                    <span style={{ ...type.meta, color: customDiff > 0 ? TONE_TEXT.caution : TONE_TEXT.bad }}>
                                        {customDiff > 0 ? `${fmt(customDiff)} unallocated` : `${fmt(-customDiff)} over total`}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );

    const txDialog = (
        <Modal isOpen={showTxModal} onClose={closeTxModal} title="Add an existing transaction" maxWidth="480px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <Input label="Search transactions" value={txSearch} onChange={e => searchTx(e.target.value)} placeholder="Description or merchant" />
                {txSearch.length < 2 ? (
                    <p style={{ ...type.meta, margin: 0 }}>Type at least two characters to search.</p>
                ) : searchingTx && txResults.length === 0 ? (
                    <p style={{ ...type.meta, margin: 0 }}>Searching.</p>
                ) : txResults.length === 0 ? (
                    <p style={{ ...type.meta, margin: 0 }}>No results.</p>
                ) : (
                    <Rows>
                        {txResults.map(tx => (
                            <div key={tx.id}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{tx.description}</p>
                                    <p style={{ ...type.meta, margin: 0 }}>{String(tx.date).split('T')[0]}</p>
                                </div>
                                <span style={{ ...type.num, flexShrink: 0, color: tx.type === 'income' ? TONE_TEXT.good : 'var(--text-primary)' }}>{fmt(Number(tx.amount))}</span>
                                <TextAction onClick={() => linkTx(tx)} disabled={linkingTx} aria-label={`Add ${tx.description}`}>Add</TextAction>
                            </div>
                        ))}
                    </Rows>
                )}
            </div>
        </Modal>
    );

    // ── LIST VIEW ─────────────────────────────────────────────────────────────
    if (!selectedGroup) {
        return (
            <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-6)', animation: 'fadeUp 200ms ease forwards' }}>

                    <div className="fin-page-head">
                        <div style={{ minWidth: 0 }}>
                            <p style={{ ...type.meta, margin: 0 }}>
                                {groups.length > 0 ? plural(groups.length, 'group') : 'Track shared expenses with friends and family'}
                            </p>
                            <h1 style={{ ...type.heading, margin: 0 }}>Groups</h1>
                        </div>
                        <div className="fin-page-actions">
                            <Button type="button" onClick={openCreate}>New group</Button>
                        </div>
                    </div>

                    {loadingList ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            {[1, 2, 3].map(i => <SkeletonCard key={i} height={90} />)}
                        </div>
                    ) : groups.length === 0 ? (
                        <Card>
                            <CardHeader title="No groups yet" sub="Create a group to split expenses with friends or family" action={<Button type="button" onClick={openCreate}>New group</Button>} flush />
                        </Card>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            {groups.map(g => {
                                const pct = calcBudgetPct(Number(g.total_spent), Number(g.budget));
                                return (
                                    <div key={g.id} role="button" tabIndex={0}
                                        style={{ borderRadius: 'var(--radius-lg)' }}
                                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGroup(g); } }}>
                                        <Card onClick={() => openGroup(g)}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                                                <span aria-hidden="true" style={{ fontSize: 'var(--text-figure)', lineHeight: 1, flexShrink: 0 }}>{g.emoji}</span>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{g.name}</p>
                                                    <p style={{ ...type.meta, margin: 0 }}>{plural(Number(g.member_count), 'member')}</p>
                                                    {pct !== null ? (
                                                        <div style={{ marginTop: 'var(--space-2)' }}>
                                                            <ProgressBar pct={pct} height={4} color="var(--text-secondary)" />
                                                            <p style={{ ...type.meta, margin: 'var(--space-1) 0 0' }}>{fmt(Number(g.total_spent))} of {fmt(Number(g.budget))} budget</p>
                                                        </div>
                                                    ) : (
                                                        <p style={{ ...type.meta, margin: 'var(--space-1) 0 0' }}>{fmt(Number(g.total_spent))} spent</p>
                                                    )}
                                                </div>
                                            </div>
                                        </Card>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {groupDialog}
            </>
        );
    }

    // ── DETAIL VIEW ───────────────────────────────────────────────────────────
    const { youOwe, owedToYou, unsettledCount } = groupBalances(splits);
    const net = owedToYou - youOwe;
    const pct = calcBudgetPct(Number(selectedGroup.total_spent), Number(selectedGroup.budget));
    const tabs = TABS_BASE.map(t => t.key === 'splits' ? { ...t, label: `Splits${unsettledCount > 0 ? ` (${unsettledCount})` : ''}` } : t);

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-6)', animation: 'fadeUp 200ms ease forwards' }}>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                    <div><TextAction quiet onClick={() => setSelectedGroup(null)}>Groups</TextAction></div>
                    <div className="fin-page-head">
                        <div style={{ minWidth: 0 }}>
                            <p style={{ ...type.meta, margin: 0 }}>
                                {plural(members.length, 'member')}{selectedGroup.budget ? ` · Budget ${fmt(Number(selectedGroup.budget))}` : ''}
                            </p>
                            <h1 style={{ ...type.heading, ...truncate, margin: 0 }}>{selectedGroup.emoji} {selectedGroup.name}</h1>
                        </div>
                        <div className="fin-page-actions">
                            <Button type="button" variant="secondary" onClick={() => openEdit(selectedGroup)}>Edit group</Button>
                        </div>
                    </div>
                </div>

                {loadingDetail ? (
                    <SkeletonCard height={180} />
                ) : (
                    <Card>
                        <p style={{ ...type.label, margin: 0 }}>Your balance in this group</p>
                        <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{fmt(Math.abs(net))}</p>
                        <p style={{ ...type.meta, margin: '6px 0 0' }}>{balanceSentence(net, youOwe, owedToYou)}</p>
                        <div className="dash-stats">
                            <Stat className="dash-stat" label="You owe" value={youOwe > 0 ? fmt(youOwe) : 'None'} />
                            <Stat className="dash-stat" label="Owed to you" value={owedToYou > 0 ? fmt(owedToYou) : 'None'} />
                            <Stat className="dash-stat" label="Spent so far" value={fmt(Number(selectedGroup.total_spent))} sub={pct !== null ? `${Math.round(pct)}% of the budget` : 'No budget set'} />
                        </div>
                        {pct !== null && (
                            <div style={{ marginTop: 'var(--space-4)' }}>
                                <ProgressBar pct={pct} height={6} color="var(--text-secondary)" />
                            </div>
                        )}
                    </Card>
                )}

                <Tabs tabs={tabs} active={activeTab} onChange={k => setActiveTab(k as 'transactions' | 'splits' | 'settle')} />

                {loadingDetail ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {[1, 2].map(i => <SkeletonCard key={i} height={80} />)}
                    </div>
                ) : (
                    <>
                        {/* Transactions tab */}
                        {activeTab === 'transactions' && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button type="button" variant="secondary" onClick={() => setShowTxModal(true)}>Add existing</Button>
                                </div>
                                {transactions.length === 0 ? (
                                    <Card><p style={{ ...type.meta, margin: 0 }}>No transactions linked. Add one above.</p></Card>
                                ) : (
                                    <Card>
                                        <CardHeader title="Linked transactions" />
                                        <Rows>
                                            {transactions.map(tx => (
                                                <div key={tx.id}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{tx.description}</p>
                                                        <p style={{ ...type.meta, margin: 0 }}>{String(tx.date).split('T')[0]}</p>
                                                    </div>
                                                    <span style={{ ...type.num, flexShrink: 0, color: tx.type === 'income' ? TONE_TEXT.good : 'var(--text-primary)' }}>
                                                        {tx.type === 'income' ? '+' : '−'}{fmt(Number(tx.amount))}
                                                    </span>
                                                    <button type="button" className="fin-link fin-link-quiet fin-row-hover-action fin-row-hover-action-touch" aria-label={`Remove ${tx.description} from this group`} onClick={() => unlinkTx(tx)}>Remove</button>
                                                </div>
                                            ))}
                                        </Rows>
                                    </Card>
                                )}
                            </>
                        )}

                        {/* Splits tab */}
                        {activeTab === 'splits' && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button type="button" onClick={openAddSplit}>Add split</Button>
                                </div>
                                {splits.length === 0 ? (
                                    <Card><p style={{ ...type.meta, margin: 0 }}>No splits yet.</p></Card>
                                ) : sortSplitsPendingFirst(splits).map(sp => {
                                    const isSettled = sp.shares.every(sh => sh.settled);
                                    const perPerson = sp.shares.length > 0 ? sp.total_amount / sp.shares.length : 0;
                                    return (
                                        <Card key={sp.id}>
                                            <CardHeader
                                                title={sp.description}
                                                sub={<>Paid by {sp.paid_by} · {fmt(perPerson)} each · {isSettled ? 'Settled' : <span style={{ color: TONE_TEXT.caution }}>Pending</span>}</>}
                                                action={<>
                                                    <span style={type.num}>{fmt(sp.total_amount)}</span>
                                                    <TextAction onClick={() => openEditSplit(sp)} aria-label={`Edit ${sp.description}`}>Edit</TextAction>
                                                </>}
                                            />
                                            <Rows>
                                                {sp.shares.map(sh => (
                                                    <div key={sh.id}>
                                                        <p style={{ ...type.bodyStrong, ...truncate, flex: 1, margin: 0 }}>{sh.member}</p>
                                                        <span style={{ ...type.num, flexShrink: 0 }}>{fmt(sh.amount)}</span>
                                                        <div style={{ minWidth: 64, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                                                            {sh.settled ? (
                                                                <span style={type.meta}>Settled</span>
                                                            ) : (
                                                                <TextAction onClick={() => settleShare(sp, sh)} aria-label={`Settle up ${sh.member}`}>Settle up</TextAction>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </Rows>
                                        </Card>
                                    );
                                })}
                            </>
                        )}

                        {/* Settle up tab */}
                        {activeTab === 'settle' && (
                            settlements.length === 0 ? (
                                <Card><p style={{ ...type.meta, margin: 0 }}>All settled up.</p></Card>
                            ) : (
                                <Card>
                                    <CardHeader title="Who pays whom" sub="The fewest payments that clear every pending split" />
                                    <Rows>
                                        {settlements.map((s, i) => (
                                            <div key={i}>
                                                <p style={{ ...type.bodyStrong, ...truncate, flex: 1, margin: 0 }}>{s.from} pays {s.to}</p>
                                                <span style={{ ...type.num, flexShrink: 0 }}>{fmt(s.amount)}</span>
                                            </div>
                                        ))}
                                    </Rows>
                                </Card>
                            )
                        )}
                    </>
                )}
            </div>

            {groupDialog}
            {splitDialog}
            {txDialog}
        </>
    );
}
