'use client';

import { useState, useEffect, useCallback } from 'react';
import { groupsAPI, transactionsAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { AppLayout } from '@/components/layout/AppLayout';
import { formatCurrency } from '@/lib/utils';
import {
    Plus, FolderOpen, Users, X, Check, ChevronRight,
    ArrowLeft, Trash2, PlusCircle, SplitSquareHorizontal,
    Wallet, TrendingDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Member { id?: number; name: string; email?: string }
interface Group {
    id: number; name: string; emoji: string; description?: string;
    budget?: number; currency: string;
    member_count: number; total_spent: number;
}
interface Transaction { id: number; description: string; amount: number; date: string; type: string; group_name?: string }
interface Share { id: number; member: string; amount: number; settled: boolean }
interface Split { id: number; description: string; total_amount: number; paid_by: string; date: string; shares: Share[] }
interface Settlement { from: string; to: string; amount: number }

const EMOJIS = ['👥','🏠','✈️','🎉','🍕','💼','🏋️','🎮','🛒','💊','📚','🌿'];

export default function GroupsPage() {
    const { user } = useAuthStore();
    const currency = user?.currency || 'INR';

    // List state
    const [groups, setGroups] = useState<Group[]>([]);
    const [loadingList, setLoadingList] = useState(true);

    // Detail state
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [splits, setSplits] = useState<Split[]>([]);
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [activeTab, setActiveTab] = useState<'transactions' | 'splits' | 'settle'>('transactions');
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Create/Edit modal
    const [showModal, setShowModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);
    const [formName, setFormName] = useState('');
    const [formEmoji, setFormEmoji] = useState('👥');
    const [formDesc, setFormDesc] = useState('');
    const [formBudget, setFormBudget] = useState('');
    const [formMembers, setFormMembers] = useState<Member[]>([{ name: '' }]);
    const [saving, setSaving] = useState(false);

    // Add Split modal
    const [showSplitModal, setShowSplitModal] = useState(false);
    const [splitDesc, setSplitDesc] = useState('');
    const [splitTotal, setSplitTotal] = useState('');
    const [splitPaidBy, setSplitPaidBy] = useState('');
    const [splitDate, setSplitDate] = useState(new Date().toISOString().split('T')[0]);
    const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
    const [splitCustom, setSplitCustom] = useState<Record<string, string>>({});
    const [savingSplit, setSavingSplit] = useState(false);

    // Add Transaction modal
    const [showTxModal, setShowTxModal] = useState(false);
    const [txSearch, setTxSearch] = useState('');
    const [txResults, setTxResults] = useState<Transaction[]>([]);
    const [linkingTx, setLinkingTx] = useState(false);

    // Load list
    const loadGroups = useCallback(async () => {
        setLoadingList(true);
        try {
            const res = await groupsAPI.getAll();
            setGroups(res.data.groups);
        } finally {
            setLoadingList(false);
        }
    }, []);

    useEffect(() => { loadGroups(); }, [loadGroups]);

    // Load detail
    const openGroup = useCallback(async (g: Group) => {
        setSelectedGroup(g);
        setActiveTab('transactions');
        setLoadingDetail(true);
        try {
            const res = await groupsAPI.get(String(g.id));
            setMembers(res.data.members);
            setTransactions(res.data.transactions);
            setSplits(res.data.splits);
        } finally {
            setLoadingDetail(false);
        }
    }, []);

    const loadSettlements = useCallback(async () => {
        if (!selectedGroup) return;
        const res = await groupsAPI.settlements(String(selectedGroup.id));
        setSettlements(res.data.settlements);
    }, [selectedGroup]);

    useEffect(() => {
        if (activeTab === 'settle') loadSettlements();
    }, [activeTab, loadSettlements]);

    // Open create modal
    const openCreate = () => {
        setEditingGroup(null);
        setFormName(''); setFormEmoji('👥'); setFormDesc(''); setFormBudget('');
        setFormMembers([{ name: '' }]);
        setShowModal(true);
    };

    // Open edit modal
    const openEdit = (g: Group, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingGroup(g);
        setFormName(g.name); setFormEmoji(g.emoji); setFormDesc(g.description || '');
        setFormBudget(g.budget ? String(g.budget) : '');
        setFormMembers(members.length ? [...members] : [{ name: '' }]);
        setShowModal(true);
    };

    const saveGroup = async () => {
        if (!formName.trim()) return;
        setSaving(true);
        const validMembers = formMembers.filter(m => m.name.trim());
        const payload = {
            name: formName.trim(), emoji: formEmoji,
            description: formDesc || undefined,
            budget: formBudget ? parseFloat(formBudget) : undefined,
            currency,
            members: validMembers,
        };
        try {
            if (editingGroup) {
                await groupsAPI.update(String(editingGroup.id), payload);
            } else {
                await groupsAPI.create(payload);
            }
            setShowModal(false);
            await loadGroups();
            if (selectedGroup && editingGroup?.id === selectedGroup.id) {
                await openGroup({ ...selectedGroup, ...payload } as Group);
            }
        } finally {
            setSaving(false);
        }
    };

    const deleteGroup = async (g: Group, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Delete "${g.name}"? Transactions will be unlinked.`)) return;
        await groupsAPI.delete(String(g.id));
        if (selectedGroup?.id === g.id) setSelectedGroup(null);
        await loadGroups();
    };

    // Add split
    const saveSplit = async () => {
        if (!selectedGroup || !splitDesc || !splitTotal || !splitPaidBy) return;
        setSavingSplit(true);
        const allMemberNames = [...members.map(m => m.name), 'Me'].filter(Boolean);
        let shares: { member: string; amount: number }[];
        if (splitMode === 'equal') {
            const each = parseFloat(splitTotal) / allMemberNames.length;
            shares = allMemberNames.map(m => ({ member: m, amount: parseFloat(each.toFixed(2)) }));
        } else {
            shares = allMemberNames.map(m => ({ member: m, amount: parseFloat(splitCustom[m] || '0') }));
        }
        try {
            await groupsAPI.addSplit(String(selectedGroup.id), {
                description: splitDesc, total_amount: parseFloat(splitTotal),
                paid_by: splitPaidBy, date: splitDate, shares,
            });
            setShowSplitModal(false);
            setSplitDesc(''); setSplitTotal(''); setSplitPaidBy(''); setSplitCustom({});
            await openGroup(selectedGroup);
        } finally {
            setSavingSplit(false);
        }
    };

    // Settle share
    const settleShare = async (split: Split, share: Share) => {
        if (!selectedGroup) return;
        await groupsAPI.settleShare(String(selectedGroup.id), String(split.id), String(share.id));
        await openGroup(selectedGroup);
        if (activeTab === 'settle') await loadSettlements();
    };

    // Link transaction
    const searchTx = async (q: string) => {
        setTxSearch(q);
        if (q.length < 2) { setTxResults([]); return; }
        const res = await transactionsAPI.search(q);
        setTxResults(res.data.transactions || []);
    };

    const linkTx = async (tx: Transaction) => {
        if (!selectedGroup) return;
        setLinkingTx(true);
        try {
            await groupsAPI.linkTransaction(String(selectedGroup.id), String(tx.id));
            setShowTxModal(false);
            setTxSearch(''); setTxResults([]);
            await openGroup(selectedGroup);
        } finally {
            setLinkingTx(false);
        }
    };

    const unlinkTx = async (tx: Transaction) => {
        if (!selectedGroup) return;
        await groupsAPI.unlinkTransaction(String(selectedGroup.id), String(tx.id));
        await openGroup(selectedGroup);
    };

    // ─── Shared styles ────────────────────────────────────────────────────────
    const card: React.CSSProperties = {
        background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
        borderRadius: '14px', padding: '20px',
    };
    const pill = (active: boolean): React.CSSProperties => ({
        padding: '6px 16px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 500,
        border: 'none', cursor: 'pointer',
        background: active ? 'var(--accent-blue)' : 'var(--bg-secondary)',
        color: active ? '#fff' : 'var(--text-secondary)',
        transition: 'all 0.15s',
    });

    // ─── List view ────────────────────────────────────────────────────────────
    if (!selectedGroup) {
        return (
            <AppLayout>
            <div style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 16px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Expense Groups</h1>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>Track shared expenses with friends &amp; family</p>
                    </div>
                    <button onClick={openCreate} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'var(--accent-blue)', color: '#fff',
                        border: 'none', borderRadius: '10px', padding: '9px 16px',
                        fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer',
                    }}>
                        <Plus size={15} /> New Group
                    </button>
                </div>

                {loadingList ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>Loading…</div>
                ) : groups.length === 0 ? (
                    <div style={{ ...card, textAlign: 'center', padding: '60px 20px' }}>
                        <FolderOpen size={40} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>No groups yet. Create one to start splitting expenses.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {groups.map(g => {
                            const pct = g.budget ? Math.min(100, (Number(g.total_spent) / Number(g.budget)) * 100) : null;
                            return (
                                <div key={g.id} onClick={() => openGroup(g)} style={{
                                    ...card, cursor: 'pointer', transition: 'border-color 0.15s',
                                    display: 'flex', alignItems: 'center', gap: '16px',
                                }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)'}
                                >
                                    <div style={{ fontSize: '2rem', lineHeight: '1', flexShrink: 0 }}>{g.emoji}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{g.name}</span>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '4px', padding: '1px 6px' }}>
                                                {g.member_count} member{Number(g.member_count) !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        {pct !== null && (
                                            <div style={{ marginBottom: '4px' }}>
                                                <div style={{ height: '4px', borderRadius: '2px', background: 'var(--bg-secondary)', overflow: 'hidden', marginBottom: '3px' }}>
                                                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: '2px', background: pct >= 90 ? 'var(--accent-red)' : pct >= 70 ? 'var(--accent-yellow)' : 'var(--accent-green)', transition: 'width 0.4s' }} />
                                                </div>
                                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                    {formatCurrency(Number(g.total_spent), currency)} / {formatCurrency(Number(g.budget), currency)} budget
                                                </span>
                                            </div>
                                        )}
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                            Spent: {formatCurrency(Number(g.total_spent), currency)}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                                        <button onClick={e => openEdit(g, e)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                                            Edit
                                        </button>
                                        <button onClick={e => deleteGroup(g, e)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--accent-red)', display: 'flex', alignItems: 'center' }}>
                                            <Trash2 size={13} />
                                        </button>
                                        <ChevronRight size={18} color="var(--text-muted)" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {showModal && (
                    <GroupModal
                        editing={editingGroup}
                        formName={formName} setFormName={setFormName}
                        formEmoji={formEmoji} setFormEmoji={setFormEmoji}
                        formDesc={formDesc} setFormDesc={setFormDesc}
                        formBudget={formBudget} setFormBudget={setFormBudget}
                        formMembers={formMembers} setFormMembers={setFormMembers}
                        saving={saving} onSave={saveGroup} onClose={() => setShowModal(false)}
                    />
                )}
            </div>
            </AppLayout>
        );
    }

    // ─── Detail view ──────────────────────────────────────────────────────────
    const allMemberNames = [...members.map(m => m.name), 'Me'];
    const totalSplits = splits.reduce((s, sp) => s + parseFloat(String(sp.total_amount)), 0);
    const unsettledCount = splits.reduce((s, sp) => s + sp.shares.filter(sh => !sh.settled).length, 0);

    return (
        <AppLayout>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }}>
            {/* Back + header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <button onClick={() => setSelectedGroup(null)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '7px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
                    <ArrowLeft size={18} />
                </button>
                <span style={{ fontSize: '1.8rem', lineHeight: '1' }}>{selectedGroup.emoji}</span>
                <div>
                    <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{selectedGroup.name}</h1>
                    {selectedGroup.description && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{selectedGroup.description}</p>}
                </div>
                <button onClick={e => openEdit(selectedGroup, e)} style={{ marginLeft: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Edit</button>
            </div>

            {/* 4 stat tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Members', value: String(members.length), icon: <Users size={16} /> },
                    { label: 'Transactions', value: String(transactions.length), icon: <Wallet size={16} /> },
                    { label: 'Total Splits', value: formatCurrency(totalSplits, currency), icon: <SplitSquareHorizontal size={16} /> },
                    { label: 'Unsettled', value: String(unsettledCount), icon: <TrendingDown size={16} />, accent: unsettledCount > 0 },
                ].map(t => (
                    <div key={t.label} style={{ ...card, padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ color: t.accent ? 'var(--accent-red)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}>
                            {t.icon} {t.label}
                        </div>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: t.accent ? 'var(--accent-red)' : 'var(--text-primary)' }}>{t.value}</span>
                    </div>
                ))}
            </div>

            {/* Budget bar */}
            {selectedGroup.budget && (
                <div style={{ ...card, marginBottom: '20px', padding: '14px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Budget</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatCurrency(Number(selectedGroup.total_spent), currency)} / {formatCurrency(Number(selectedGroup.budget), currency)}</span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100,(Number(selectedGroup.total_spent)/Number(selectedGroup.budget))*100)}%`, borderRadius: '3px', background: Number(selectedGroup.total_spent)/Number(selectedGroup.budget) >= 0.9 ? 'var(--accent-red)' : 'var(--accent-green)', transition: 'width 0.4s' }} />
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {(['transactions','splits','settle'] as const).map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} style={pill(activeTab === t)}>
                        {t === 'transactions' ? 'Transactions' : t === 'splits' ? 'Splits' : 'Settle Up'}
                    </button>
                ))}
            </div>

            {loadingDetail ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading…</div>
            ) : (
                <>
                    {/* Transactions tab */}
                    {activeTab === 'transactions' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                                <button onClick={() => setShowTxModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '9px', padding: '7px 14px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                    <PlusCircle size={14} /> Add Existing
                                </button>
                            </div>
                            {transactions.length === 0 ? (
                                <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No transactions linked. Add one above.</div>
                            ) : transactions.map(tx => (
                                <div key={tx.id} style={{ ...card, marginBottom: '8px', display: 'flex', alignItems: 'center', padding: '12px 16px' }}>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{tx.description}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{String(tx.date).split('T')[0]}</p>
                                    </div>
                                    <span style={{ fontWeight: 600, color: tx.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)', marginRight: '12px' }}>
                                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(Number(tx.amount), currency)}
                                    </span>
                                    <button onClick={() => unlinkTx(tx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Splits tab */}
                    {activeTab === 'splits' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                                <button onClick={() => setShowSplitModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent-blue)', border: 'none', borderRadius: '9px', padding: '7px 14px', fontSize: '0.8rem', cursor: 'pointer', color: '#fff', fontWeight: 600 }}>
                                    <Plus size={14} /> Add Split
                                </button>
                            </div>
                            {splits.length === 0 ? (
                                <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No splits yet.</div>
                            ) : splits.map(sp => (
                                <div key={sp.id} style={{ ...card, marginBottom: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <div>
                                            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>{sp.description}</p>
                                            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Paid by {sp.paid_by} · {String(sp.date).split('T')[0]}</p>
                                        </div>
                                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(Number(sp.total_amount), currency)}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {(sp.shares || []).map(sh => (
                                            <div key={sh.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                                <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{sh.member}</span>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-primary)' }}>{formatCurrency(Number(sh.amount), currency)}</span>
                                                <button onClick={() => settleShare(sp, sh)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: sh.settled ? 'rgba(52,211,153,0.1)' : 'var(--bg-hover)', border: 'none', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', color: sh.settled ? 'var(--accent-green)' : 'var(--text-muted)', fontSize: '0.72rem' }}>
                                                    {sh.settled ? <><Check size={11} /> Settled</> : 'Settle'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Settle Up tab */}
                    {activeTab === 'settle' && (
                        <div>
                            {settlements.length === 0 ? (
                                <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--accent-green)', fontSize: '0.9rem' }}>
                                    <Check size={28} style={{ marginBottom: '8px' }} />
                                    <p style={{ margin: 0, fontWeight: 600 }}>All settled up!</p>
                                </div>
                            ) : settlements.map((s, i) => (
                                <div key={i} style={{ ...card, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--accent-red)', fontSize: '0.9rem' }}>{s.from}</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>owes</span>
                                    <span style={{ fontWeight: 600, color: 'var(--accent-green)', fontSize: '0.9rem' }}>{s.to}</span>
                                    <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(s.amount, currency)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <GroupModal
                    editing={editingGroup}
                    formName={formName} setFormName={setFormName}
                    formEmoji={formEmoji} setFormEmoji={setFormEmoji}
                    formDesc={formDesc} setFormDesc={setFormDesc}
                    formBudget={formBudget} setFormBudget={setFormBudget}
                    formMembers={formMembers} setFormMembers={setFormMembers}
                    saving={saving} onSave={saveGroup} onClose={() => setShowModal(false)}
                />
            )}

            {/* Add Split Modal */}
            {showSplitModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
                    onClick={e => { if (e.target === e.currentTarget) setShowSplitModal(false); }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>Add Split</h3>
                            <button onClick={() => setShowSplitModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                        </div>
                        {([
                            { label: 'Description', value: splitDesc, set: setSplitDesc, placeholder: 'Dinner, Uber, etc.', type: 'text' },
                            { label: 'Total Amount', value: splitTotal, set: setSplitTotal, placeholder: '0.00', type: 'number' },
                            { label: 'Date', value: splitDate, set: setSplitDate, placeholder: '', type: 'date' },
                        ] as const).map(f => (
                            <div key={f.label} style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                                <input value={f.value} onChange={e => (f.set as (v: string) => void)(e.target.value)} type={f.type} placeholder={f.placeholder}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                            </div>
                        ))}
                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Paid By</label>
                            <select value={splitPaidBy} onChange={e => setSplitPaidBy(e.target.value)}
                                style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                <option value="">Select…</option>
                                {allMemberNames.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Split Mode</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {(['equal','custom'] as const).map(m => (
                                    <button key={m} onClick={() => setSplitMode(m)} style={pill(splitMode === m)}>
                                        {m === 'equal' ? 'Equal' : 'Custom'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {splitMode === 'custom' && (
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Custom Amounts</label>
                                {allMemberNames.map(n => (
                                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{n}</span>
                                        <input type="number" value={splitCustom[n] || ''} onChange={e => setSplitCustom(p => ({ ...p, [n]: e.target.value }))}
                                            placeholder="0.00" style={{ width: '90px', padding: '6px 10px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
                                    </div>
                                ))}
                            </div>
                        )}
                        <button onClick={saveSplit} disabled={savingSplit || !splitDesc || !splitTotal || !splitPaidBy}
                            style={{ width: '100%', padding: '11px', background: 'var(--accent-blue)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', opacity: savingSplit ? 0.6 : 1 }}>
                            {savingSplit ? 'Adding…' : 'Add Split'}
                        </button>
                    </div>
                </div>
            )}

            {/* Link Transaction Modal */}
            {showTxModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
                    onClick={e => { if (e.target === e.currentTarget) { setShowTxModal(false); setTxSearch(''); setTxResults([]); } }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '24px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>Link Transaction</h3>
                            <button onClick={() => { setShowTxModal(false); setTxSearch(''); setTxResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                        </div>
                        <input value={txSearch} onChange={e => searchTx(e.target.value)} placeholder="Search transactions…"
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box', marginBottom: '12px' }} />
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {txResults.map(tx => (
                                <div key={tx.id} onClick={() => !linkingTx && linkTx(tx)}
                                    style={{ padding: '10px 12px', borderRadius: '9px', cursor: 'pointer', marginBottom: '4px', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'}>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{tx.description}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{String(tx.date).split('T')[0]}</p>
                                    </div>
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: tx.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                        {formatCurrency(Number(tx.amount), currency)}
                                    </span>
                                </div>
                            ))}
                            {txSearch.length >= 2 && txResults.length === 0 && (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No results found.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
        </AppLayout>
    );
}

// ─── Group Create/Edit Modal ──────────────────────────────────────────────────
function GroupModal({ editing, formName, setFormName, formEmoji, setFormEmoji, formDesc, setFormDesc, formBudget, setFormBudget, formMembers, setFormMembers, saving, onSave, onClose }: {
    editing: Group | null;
    formName: string; setFormName: (v: string) => void;
    formEmoji: string; setFormEmoji: (v: string) => void;
    formDesc: string; setFormDesc: (v: string) => void;
    formBudget: string; setFormBudget: (v: string) => void;
    formMembers: Member[]; setFormMembers: (v: Member[]) => void;
    saving: boolean; onSave: () => void; onClose: () => void;
}) {
    const addMember = () => setFormMembers([...formMembers, { name: '' }]);
    const removeMember = (i: number) => setFormMembers(formMembers.filter((_, idx) => idx !== i));
    const updateMember = (i: number, field: keyof Member, val: string) => {
        const updated = [...formMembers];
        updated[i] = { ...updated[i], [field]: val };
        setFormMembers(updated);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>{editing ? 'Edit Group' : 'New Group'}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                </div>

                {/* Emoji picker */}
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Emoji</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {EMOJIS.map(em => (
                            <button key={em} onClick={() => setFormEmoji(em)} style={{
                                width: '36px', height: '36px', borderRadius: '8px', fontSize: '1.1rem',
                                border: formEmoji === em ? '2px solid var(--accent-blue)' : '1px solid var(--bg-border)',
                                background: formEmoji === em ? 'var(--bg-hover)' : 'var(--bg-secondary)', cursor: 'pointer',
                            }}>{em}</button>
                        ))}
                    </div>
                </div>

                {/* Name */}
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Name *</label>
                    <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Trip to Goa, Flat Expenses…"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>

                {/* Description */}
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Description</label>
                    <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Optional"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>

                {/* Budget */}
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Budget (optional)</label>
                    <input type="number" value={formBudget} onChange={e => setFormBudget(e.target.value)} placeholder="0.00"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>

                {/* Members */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Members</label>
                    {formMembers.map((m, i) => (
                        <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                            <input value={m.name} onChange={e => updateMember(i, 'name', e.target.value)} placeholder="Name"
                                style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
                            <input value={m.email || ''} onChange={e => updateMember(i, 'email', e.target.value)} placeholder="Email (opt)"
                                style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
                            {formMembers.length > 1 && (
                                <button onClick={() => removeMember(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
                            )}
                        </div>
                    ))}
                    <button onClick={addMember} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)', fontSize: '0.8rem', padding: '2px 0' }}>
                        <Plus size={13} /> Add member
                    </button>
                </div>

                <button onClick={onSave} disabled={saving || !formName.trim()} style={{ width: '100%', padding: '11px', background: 'var(--accent-blue)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Group'}
                </button>
            </div>
        </div>
    );
}
