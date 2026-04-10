'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, ChevronDown, ChevronUp, X, Plus } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { accountsAPI, creditCardsAPI, walletsAPI } from '@/lib/api';
import { useIsMobile } from '@/hooks/useWindowSize';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BankAccount {
    id: number;
    name: string;
    icon: string;
    color: string;
    account_type: string;
    last_four: string | null;
    starting_balance: number;
    current_balance: number;
    is_default: boolean;
    balance_as_of: string | null;
}

interface CreditCard {
    id: number;
    bank_name: string;
    card_name: string;
    last_four: string | null;
    credit_limit: number;
    outstanding_balance: number;
    billing_date: number | null;
    due_days: number;
    network: string;
    color: string;
}

interface Wallet {
    id: number;
    name: string;
    emoji: string;
    balance: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
    return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function getDueDays(billingDate: number | null, dueDays: number): number | null {
    if (!billingDate) return null;
    const today = new Date();
    const billing = new Date(today.getFullYear(), today.getMonth(), billingDate);
    const due = new Date(billing);
    due.setDate(due.getDate() + dueDays);
    if (due < today) {
        const nextBilling = new Date(today.getFullYear(), today.getMonth() + 1, billingDate);
        const nextDue = new Date(nextBilling);
        nextDue.setDate(nextDue.getDate() + dueDays);
        return Math.round((nextDue.getTime() - today.getTime()) / 86400000);
    }
    return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = ['Savings', 'Current', 'Salary', 'FD'];
const NETWORKS      = ['Visa', 'Mastercard', 'Amex', 'RuPay'];
const CARD_COLORS   = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
const WALLET_EMOJIS = ['👛', '💰', '📱', '🏧', '💳', '🪙', '💵', '🏦'];

const emptyBankForm   = () => ({ name: '', account_type: 'Savings', last_four: '', starting_balance: '', balance_as_of: '' });
const emptyCardForm   = () => ({ bank_name: '', card_name: '', last_four: '', credit_limit: '', outstanding_balance: '0', billing_date: '', due_days: '20', network: 'Visa', color: '#6366f1' });
const emptyWalletForm = () => ({ name: '', emoji: '👛', balance: '' });

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AccountsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const [banks,   setBanks]   = useState<BankAccount[]>([]);
    const [cards,   setCards]   = useState<CreditCard[]>([]);
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [mounted, setMounted] = useState(false);

    const [showBankModal,   setShowBankModal]   = useState(false);
    const [showCardModal,   setShowCardModal]   = useState(false);
    const [showWalletModal, setShowWalletModal] = useState(false);

    const [editingBank,   setEditingBank]   = useState<BankAccount | null>(null);
    const [editingCard,   setEditingCard]   = useState<CreditCard | null>(null);
    const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);

    const [bankForm,   setBankForm]   = useState(emptyBankForm());
    const [cardForm,   setCardForm]   = useState(emptyCardForm());
    const [walletForm, setWalletForm] = useState(emptyWalletForm());

    const [expandedCardId,         setExpandedCardId]         = useState<number | null>(null);
    const [editingWalletBalanceId,  setEditingWalletBalanceId] = useState<number | null>(null);
    const [walletBalanceInput,      setWalletBalanceInput]     = useState('');
    const [deleteConfirm,           setDeleteConfirm]          = useState<{ type: 'bank' | 'card' | 'wallet'; id: number; name: string } | null>(null);
    const [saving,  setSaving]  = useState(false);
    const [toast,   setToast]   = useState('');

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(''), 2500);
    };

    const fetchAll = useCallback(async () => {
        const [banksRes, cardsRes, walletsRes] = await Promise.allSettled([
            accountsAPI.getAll(),
            creditCardsAPI.getAll(),
            walletsAPI.getAll(),
        ]);
        if (banksRes.status   === 'fulfilled') setBanks(banksRes.value.data.accounts);
        if (cardsRes.status   === 'fulfilled') setCards(cardsRes.value.data.cards);
        if (walletsRes.status === 'fulfilled') setWallets(walletsRes.value.data.wallets);
    }, []);

    useEffect(() => { if (user) fetchAll(); }, [user, fetchAll]);

    const totalBanks   = banks.reduce((s, b) => s + Number(b.current_balance), 0);
    const totalCards   = cards.reduce((s, c) => s + Number(c.outstanding_balance), 0);
    const totalWallets = wallets.reduce((s, w) => s + Number(w.balance), 0);
    const netWorth     = totalBanks + totalWallets - totalCards;

    // ── Bank handlers ───────────────────────────────────────────────────────

    const openAddBank = () => {
        setEditingBank(null);
        setBankForm(emptyBankForm());
        setShowBankModal(true);
    };

    const openEditBank = (b: BankAccount) => {
        setEditingBank(b);
        setBankForm({
            name:             b.name,
            account_type:     b.account_type || 'Savings',
            last_four:        b.last_four || '',
            starting_balance: String(b.starting_balance),
            balance_as_of:    b.balance_as_of ? String(b.balance_as_of).split('T')[0] : '',
        });
        setShowBankModal(true);
    };

    const saveBank = async () => {
        if (!bankForm.name.trim()) return;
        setSaving(true);
        try {
            const data = {
                name:             bankForm.name.trim(),
                account_type:     bankForm.account_type,
                last_four:        bankForm.last_four || null,
                starting_balance: parseFloat(bankForm.starting_balance) || 0,
                balance_as_of:    bankForm.balance_as_of || null,
            };
            if (editingBank) {
                await accountsAPI.update(editingBank.id, data);
            } else {
                await accountsAPI.create(data);
            }
            await fetchAll();
            setShowBankModal(false);
            showToast(editingBank ? 'Account updated' : 'Account added');
        } catch { showToast('Failed to save account'); }
        setSaving(false);
    };

    // ── Credit card handlers ────────────────────────────────────────────────

    const openAddCard = () => {
        setEditingCard(null);
        setCardForm(emptyCardForm());
        setShowCardModal(true);
    };

    const openEditCard = (c: CreditCard) => {
        setEditingCard(c);
        setCardForm({
            bank_name:           c.bank_name,
            card_name:           c.card_name,
            last_four:           c.last_four || '',
            credit_limit:        String(c.credit_limit),
            outstanding_balance: String(c.outstanding_balance),
            billing_date:        c.billing_date ? String(c.billing_date) : '',
            due_days:            String(c.due_days),
            network:             c.network,
            color:               c.color,
        });
        setShowCardModal(true);
    };

    const saveCard = async () => {
        if (!cardForm.bank_name.trim() || !cardForm.card_name.trim()) return;
        setSaving(true);
        try {
            const data = {
                bank_name:           cardForm.bank_name.trim(),
                card_name:           cardForm.card_name.trim(),
                last_four:           cardForm.last_four || null,
                credit_limit:        parseFloat(cardForm.credit_limit) || 0,
                outstanding_balance: parseFloat(cardForm.outstanding_balance) || 0,
                billing_date:        parseInt(cardForm.billing_date) || null,
                due_days:            parseInt(cardForm.due_days) || 20,
                network:             cardForm.network,
                color:               cardForm.color,
            };
            if (editingCard) {
                await creditCardsAPI.update(editingCard.id, data);
            } else {
                await creditCardsAPI.create(data);
            }
            await fetchAll();
            setShowCardModal(false);
            showToast(editingCard ? 'Card updated' : 'Card added');
        } catch { showToast('Failed to save card'); }
        setSaving(false);
    };

    // ── Wallet handlers ─────────────────────────────────────────────────────

    const openAddWallet = () => {
        setEditingWallet(null);
        setWalletForm(emptyWalletForm());
        setShowWalletModal(true);
    };

    const openEditWallet = (w: Wallet) => {
        setEditingWallet(w);
        setWalletForm({ name: w.name, emoji: w.emoji, balance: String(w.balance) });
        setShowWalletModal(true);
    };

    const saveWallet = async () => {
        if (!walletForm.name.trim()) return;
        setSaving(true);
        try {
            const data = {
                name:    walletForm.name.trim(),
                emoji:   walletForm.emoji,
                balance: parseFloat(walletForm.balance) || 0,
            };
            if (editingWallet) {
                await walletsAPI.update(editingWallet.id, data);
            } else {
                await walletsAPI.create(data);
            }
            await fetchAll();
            setShowWalletModal(false);
            showToast(editingWallet ? 'Wallet updated' : 'Wallet added');
        } catch { showToast('Failed to save wallet'); }
        setSaving(false);
    };

    const startWalletBalanceEdit = (w: Wallet) => {
        setEditingWalletBalanceId(w.id);
        setWalletBalanceInput(String(w.balance));
    };

    const saveWalletBalance = async (w: Wallet) => {
        try {
            await walletsAPI.update(w.id, { name: w.name, emoji: w.emoji, balance: parseFloat(walletBalanceInput) || 0 });
            await fetchAll();
        } catch { showToast('Failed to update balance'); }
        setEditingWalletBalanceId(null);
    };

    // ── Delete ──────────────────────────────────────────────────────────────

    const confirmDelete = (type: 'bank' | 'card' | 'wallet', id: number, name: string) => {
        setDeleteConfirm({ type, id, name });
    };

    const executeDelete = async () => {
        if (!deleteConfirm) return;
        try {
            if      (deleteConfirm.type === 'bank')   await accountsAPI.delete(deleteConfirm.id);
            else if (deleteConfirm.type === 'card')   await creditCardsAPI.delete(deleteConfirm.id);
            else                                       await walletsAPI.delete(deleteConfirm.id);
            await fetchAll();
            showToast('Deleted');
        } catch { showToast('Failed to delete'); }
        setDeleteConfirm(null);
    };

    // ── Shared inline styles ────────────────────────────────────────────────

    const inputStyle: React.CSSProperties = {
        width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)',
        borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14,
        outline: 'none', boxSizing: 'border-box', fontFamily: "'Satoshi', 'DM Sans', sans-serif",
    };
    const labelStyle: React.CSSProperties = {
        fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px',
        textTransform: 'uppercase', marginBottom: 6, display: 'block',
    };
    const sectionHead: React.CSSProperties = {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
    };
    const sectionTitle: React.CSSProperties = {
        fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif",
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--text-primary)',
    };
    const modalOverlay: React.CSSProperties = {
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    };
    const modalBox: React.CSSProperties = {
        background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)',
        width: '100%', maxWidth: 480, maxHeight: '90vh', display: 'flex',
        animation: 'scaleIn 200ms ease forwards',
        flexDirection: 'column', zIndex: 10000,
    };
    const modalHeader: React.CSSProperties = {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 24px', borderBottom: '1px solid var(--bg-border)', flexShrink: 0,
    };
    const modalFooter: React.CSSProperties = {
        padding: '16px 24px', borderTop: '1px solid var(--bg-border)', display: 'flex', gap: 8,
    };
    const cancelBtn: React.CSSProperties = {
        flex: 1, padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)',
        borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14,
        fontFamily: "'Satoshi', 'DM Sans', sans-serif", cursor: 'pointer', fontWeight: 600,
    };
    const iconBtn: React.CSSProperties = {
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', padding: 4, display: 'flex',
    };

    if (isLoading) return null;

    return (
        <AppLayout>
            <div style={{ animation: 'fadeUp 200ms ease forwards' }}>

                {/* Toast */}
                {toast && mounted && createPortal(
                    <div style={{
                        position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
                        background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
                        color: 'var(--text-primary)', padding: '10px 20px', borderRadius: 10,
                        fontSize: 13, fontFamily: "'Satoshi', 'DM Sans', sans-serif",
                        zIndex: 20000, whiteSpace: 'nowrap',
                    }}>
                        {toast}
                    </div>,
                    document.body
                )}

                <PageShell title="Accounts" subtitle="Banks · Cards · Wallets">

                {/* ── Header — Net Worth Hero ── */}
                <div style={{
                    background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-primary))',
                    borderRadius: 'var(--radius-xl)',
                    border: '1px solid var(--bg-border)',
                    padding: 'var(--space-8) var(--space-6)',
                    marginBottom: 'var(--space-8)',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, background: 'radial-gradient(circle,rgba(59,130,246,0.08),transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
                    <h1 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 var(--space-1)', fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Net Worth
                    </h1>
                    <div style={{
                        fontSize: isMobile ? '32px' : '2.5rem', fontFamily: "'DM Mono', monospace", fontWeight: 700,
                        color: netWorth >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                        letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 'var(--space-3)',
                    }}>
                        {netWorth < 0 ? '-' : ''}{fmt(netWorth)}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Banks</div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-green)' }}>{fmt(totalBanks)}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Credit Debt</div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-red)' }}>{fmt(totalCards)}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Wallets</div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-green)' }}>{fmt(totalWallets)}</div>
                        </div>
                    </div>
                </div>

                {/* ── Bank Accounts ── */}
                <div style={{ marginBottom: 36 }}>
                    <div style={sectionHead}>
                        <span style={sectionTitle}>Bank Accounts</span>
                        <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: 'var(--accent-green)' }}>
                            {fmt(totalBanks)}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {banks.map(b => (
                            <div key={b.id} style={{
                                display: 'flex', alignItems: 'center',
                                background: 'var(--surface-1)', border: '1px solid var(--bg-border)',
                                borderRadius: 'var(--radius-md)', overflow: 'hidden',
                                borderLeft: `4px solid ${b.color || 'var(--accent-blue)'}`,
                            }}>
                                <div style={{ flex: 1, padding: '14px 16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Satoshi', 'DM Sans', sans-serif" }}>
                                            {b.name}
                                        </span>
                                        <span style={{
                                            fontSize: 10, padding: '2px 7px',
                                            background: 'var(--bg-hover)', borderRadius: 4,
                                            color: 'var(--text-secondary)',
                                            fontFamily: "'Satoshi', 'DM Sans', sans-serif", fontWeight: 500,
                                        }}>
                                            {b.account_type || 'Savings'}
                                        </span>
                                    </div>
                                    {b.last_four && (
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                                            ••••&nbsp;&nbsp;{b.last_four}
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' }}>
                                    <span style={{ fontSize: 15, fontFamily: 'DM Mono, monospace', fontWeight: 500, color: 'var(--text-primary)' }}>
                                        {fmt(b.current_balance)}
                                    </span>
                                    <button style={iconBtn} onClick={() => openEditBank(b)}><Pencil size={14} /></button>
                                    <button style={iconBtn} onClick={() => confirmDelete('bank', b.id, b.name)}><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <Button variant="ghost" onClick={openAddBank} style={{ width: '100%', justifyContent: 'center', border: '1px dashed var(--bg-border-strong)' }}>
                            <Plus size={14} />Add Bank Account
                        </Button>
                    </div>
                </div>

                {/* ── Credit Cards ── */}
                <div style={{ marginBottom: 36 }}>
                    <div style={sectionHead}>
                        <span style={sectionTitle}>Credit Cards</span>
                        <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: 'var(--accent-red)' }}>
                            {fmt(totalCards)}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {cards.map(c => {
                            const dueDays  = getDueDays(c.billing_date, c.due_days);
                            const utilPct  = c.credit_limit > 0
                                ? Math.min(100, (Number(c.outstanding_balance) / Number(c.credit_limit)) * 100)
                                : 0;
                            const isExpanded = expandedCardId === c.id;

                            const pillColor = dueDays === null ? 'var(--text-muted)'
                                : dueDays > 7  ? 'var(--accent-green)'
                                : dueDays >= 3 ? 'var(--accent-yellow)'
                                :                'var(--accent-red)';
                            const pillBg = dueDays === null ? 'var(--bg-hover)'
                                : dueDays > 7  ? 'var(--accent-mint-bg)'
                                : dueDays >= 3 ? 'var(--accent-amber-bg)'
                                :                'var(--accent-rose-bg)';

                            return (
                                <div key={c.id} style={{
                                    background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
                                    borderRadius: 12, overflow: 'hidden',
                                    borderLeft: `4px solid ${c.color}`,
                                }}>
                                    <div
                                        style={{ display: 'flex', alignItems: 'center', padding: '14px 14px 8px', cursor: 'pointer' }}
                                        onClick={() => setExpandedCardId(isExpanded ? null : c.id)}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Satoshi', 'DM Sans', sans-serif" }}>
                                                    {c.bank_name} {c.card_name}
                                                </span>
                                                {c.last_four && (
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                                                        ••{c.last_four}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 15, fontFamily: 'DM Mono, monospace', fontWeight: 500, color: 'var(--accent-red)' }}>
                                                    {fmt(c.outstanding_balance)}
                                                </span>
                                                {dueDays !== null && (
                                                    <span style={{
                                                        fontSize: 10, padding: '2px 7px', borderRadius: 999,
                                                        background: pillBg, color: pillColor,
                                                        fontFamily: "'Satoshi', 'DM Sans', sans-serif", fontWeight: 600,
                                                    }}>
                                                        {dueDays < 0 ? 'Overdue' : dueDays === 0 ? 'Due today' : `Due in ${dueDays}d`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <button
                                                style={iconBtn}
                                                onClick={e => { e.stopPropagation(); openEditCard(c); }}
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                style={iconBtn}
                                                onClick={e => { e.stopPropagation(); confirmDelete('card', c.id, `${c.bank_name} ${c.card_name}`); }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                            {isExpanded
                                                ? <ChevronUp size={14} color="var(--text-muted)" />
                                                : <ChevronDown size={14} color="var(--text-muted)" />
                                            }
                                        </div>
                                    </div>

                                    {/* Utilization bar */}
                                    <div style={{ height: 3, background: 'var(--bg-hover)', margin: '0 14px 10px' }}>
                                        <div style={{
                                            height: '100%', width: `${utilPct}%`,
                                            background: 'var(--accent-red)', borderRadius: 2,
                                            transition: 'width 0.3s ease',
                                        }} />
                                    </div>

                                    {/* Expanded details */}
                                    {isExpanded && (
                                        <div style={{ padding: '8px 14px 14px', borderTop: '1px solid var(--bg-border)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: "'Satoshi', 'DM Sans', sans-serif" }}>Credit Limit</span>
                                                <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)' }}>{fmt(c.credit_limit)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: "'Satoshi', 'DM Sans', sans-serif" }}>Utilization</span>
                                                <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: utilPct > 70 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                                                    {utilPct.toFixed(0)}%
                                                </span>
                                            </div>
                                            <Button
                                                variant="secondary"
                                                onClick={() => openEditCard(c)}
                                                style={{ width: '100%' }}
                                            >
                                                Update Outstanding
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <Button variant="ghost" onClick={openAddCard} style={{ width: '100%', justifyContent: 'center', border: '1px dashed var(--bg-border-strong)' }}>
                            <Plus size={14} />Add Credit Card
                        </Button>
                    </div>
                </div>

                {/* ── Wallets ── */}
                <div style={{ marginBottom: 36 }}>
                    <div style={sectionHead}>
                        <span style={sectionTitle}>Wallets & UPI</span>
                        <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: 'var(--accent-green)' }}>
                            {fmt(totalWallets)}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {wallets.map(w => (
                            <div key={w.id} style={{
                                display: 'flex', alignItems: 'center',
                                background: 'var(--surface-1)', border: '1px solid var(--bg-border)',
                                borderRadius: 'var(--radius-md)', padding: 'var(--space-4)',
                            }}>
                                <span style={{ fontSize: 22, marginRight: 12 }}>{w.emoji}</span>
                                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: "'Satoshi', 'DM Sans', sans-serif" }}>
                                    {w.name}
                                </span>
                                {editingWalletBalanceId === w.id ? (
                                    <input
                                        autoFocus
                                        type="number"
                                        value={walletBalanceInput}
                                        onChange={e => setWalletBalanceInput(e.target.value)}
                                        onBlur={() => saveWalletBalance(w)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter')  saveWalletBalance(w);
                                            if (e.key === 'Escape') setEditingWalletBalanceId(null);
                                        }}
                                        style={{
                                            width: 100, textAlign: 'right',
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--accent-blue)',
                                            borderRadius: 6, padding: '4px 8px',
                                            color: 'var(--text-primary)', fontSize: 14,
                                            fontFamily: 'DM Mono, monospace', outline: 'none',
                                        }}
                                    />
                                ) : (
                                    <span
                                        onClick={() => startWalletBalanceEdit(w)}
                                        title="Tap to edit balance"
                                        style={{
                                            fontSize: 15, fontFamily: 'DM Mono, monospace',
                                            fontWeight: 500, color: 'var(--text-primary)',
                                            cursor: 'pointer', padding: '2px 4px', borderRadius: 4,
                                        }}
                                    >
                                        {fmt(w.balance)}
                                    </span>
                                )}
                                <button style={{ ...iconBtn, marginLeft: 8 }} onClick={() => openEditWallet(w)}><Pencil size={14} /></button>
                                <button style={iconBtn} onClick={() => confirmDelete('wallet', w.id, w.name)}><Trash2 size={14} /></button>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <Button variant="ghost" onClick={openAddWallet} style={{ width: '100%', justifyContent: 'center', border: '1px dashed var(--bg-border-strong)' }}>
                            <Plus size={14} />Add Wallet
                        </Button>
                    </div>
                </div>

                </PageShell>

                {/* ═══════════════════ MODALS ═══════════════════ */}

                {/* Bank Account Modal */}
                {showBankModal && mounted && createPortal(
                    <div style={modalOverlay} onClick={() => setShowBankModal(false)}>
                        <div style={modalBox} onClick={e => e.stopPropagation()}>
                            <div style={modalHeader}>
                                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Cabinet Grotesk, Sora, sans-serif' }}>
                                    {editingBank ? 'Edit Account' : 'Add Bank Account'}
                                </span>
                                <button style={{ background: 'var(--bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, display: 'flex' }} onClick={() => setShowBankModal(false)}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <label style={labelStyle}>Account Name *</label>
                                    <input style={inputStyle} value={bankForm.name} onChange={e => setBankForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. HDFC Savings" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Account Type</label>
                                    <select style={inputStyle} value={bankForm.account_type} onChange={e => setBankForm(f => ({ ...f, account_type: e.target.value }))}>
                                        {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Last 4 Digits (optional)</label>
                                    <input style={inputStyle} value={bankForm.last_four} maxLength={4} placeholder="1234"
                                        onChange={e => setBankForm(f => ({ ...f, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Current Balance (₹)</label>
                                    <input style={inputStyle} type="number" value={bankForm.starting_balance} onChange={e => setBankForm(f => ({ ...f, starting_balance: e.target.value }))} placeholder="0" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Balance As Of (optional)</label>
                                    <input style={inputStyle} type="date" value={bankForm.balance_as_of} onChange={e => setBankForm(f => ({ ...f, balance_as_of: e.target.value }))} />
                                </div>
                            </div>
                            <div style={modalFooter}>
                                <button style={cancelBtn} onClick={() => setShowBankModal(false)}>Cancel</button>
                                <button
                                    onClick={saveBank}
                                    disabled={saving || !bankForm.name.trim()}
                                    style={{ flex: 2, padding: 10, background: saving || !bankForm.name.trim() ? 'var(--bg-border)' : 'var(--accent-blue)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontFamily: "'Satoshi', 'DM Sans', sans-serif", cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                                >
                                    {saving ? 'Saving…' : editingBank ? 'Save Changes' : 'Add Account'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Credit Card Modal */}
                {showCardModal && mounted && createPortal(
                    <div style={modalOverlay} onClick={() => setShowCardModal(false)}>
                        <div style={modalBox} onClick={e => e.stopPropagation()}>
                            <div style={modalHeader}>
                                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Cabinet Grotesk, Sora, sans-serif' }}>
                                    {editingCard ? 'Edit Card' : 'Add Credit Card'}
                                </span>
                                <button style={{ background: 'var(--bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, display: 'flex' }} onClick={() => setShowCardModal(false)}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Bank Name *</label>
                                        <input style={inputStyle} value={cardForm.bank_name} onChange={e => setCardForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="HDFC" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Card Name *</label>
                                        <input style={inputStyle} value={cardForm.card_name} onChange={e => setCardForm(f => ({ ...f, card_name: e.target.value }))} placeholder="Millennia" />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Last 4 Digits</label>
                                        <input style={inputStyle} value={cardForm.last_four} maxLength={4} placeholder="5678"
                                            onChange={e => setCardForm(f => ({ ...f, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Network</label>
                                        <select style={inputStyle} value={cardForm.network} onChange={e => setCardForm(f => ({ ...f, network: e.target.value }))}>
                                            {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Credit Limit (₹)</label>
                                        <input style={inputStyle} type="number" value={cardForm.credit_limit} onChange={e => setCardForm(f => ({ ...f, credit_limit: e.target.value }))} placeholder="100000" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Outstanding (₹)</label>
                                        <input style={inputStyle} type="number" value={cardForm.outstanding_balance} onChange={e => setCardForm(f => ({ ...f, outstanding_balance: e.target.value }))} placeholder="0" />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Billing Date (1–28)</label>
                                        <input style={inputStyle} type="number" min={1} max={28} value={cardForm.billing_date} onChange={e => setCardForm(f => ({ ...f, billing_date: e.target.value }))} placeholder="5" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Due Days After</label>
                                        <input style={inputStyle} type="number" value={cardForm.due_days} onChange={e => setCardForm(f => ({ ...f, due_days: e.target.value }))} placeholder="20" />
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Card Color</label>
                                    <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                                        {CARD_COLORS.map(col => (
                                            <button
                                                key={col}
                                                onClick={() => setCardForm(f => ({ ...f, color: col }))}
                                                style={{ width: 28, height: 28, borderRadius: '50%', background: col, border: cardForm.color === col ? '3px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer' }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div style={modalFooter}>
                                <button style={cancelBtn} onClick={() => setShowCardModal(false)}>Cancel</button>
                                <button
                                    onClick={saveCard}
                                    disabled={saving || !cardForm.bank_name.trim() || !cardForm.card_name.trim()}
                                    style={{ flex: 2, padding: 10, background: saving || !cardForm.bank_name.trim() || !cardForm.card_name.trim() ? 'var(--bg-border)' : 'var(--accent-blue)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontFamily: "'Satoshi', 'DM Sans', sans-serif", cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                                >
                                    {saving ? 'Saving…' : editingCard ? 'Save Changes' : 'Add Card'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Wallet Modal */}
                {showWalletModal && mounted && createPortal(
                    <div style={modalOverlay} onClick={() => setShowWalletModal(false)}>
                        <div style={{ ...modalBox, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
                            <div style={modalHeader}>
                                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Cabinet Grotesk, Sora, sans-serif' }}>
                                    {editingWallet ? 'Edit Wallet' : 'Add Wallet'}
                                </span>
                                <button style={{ background: 'var(--bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, display: 'flex' }} onClick={() => setShowWalletModal(false)}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <label style={labelStyle}>Emoji</label>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                                        {WALLET_EMOJIS.map(em => (
                                            <button
                                                key={em}
                                                onClick={() => setWalletForm(f => ({ ...f, emoji: em }))}
                                                style={{ fontSize: 22, background: walletForm.emoji === em ? 'var(--bg-hover)' : 'transparent', border: `2px solid ${walletForm.emoji === em ? 'var(--accent-blue)' : 'transparent'}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}
                                            >
                                                {em}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Wallet Name *</label>
                                    <input style={inputStyle} value={walletForm.name} onChange={e => setWalletForm(f => ({ ...f, name: e.target.value }))} placeholder="PhonePe, Paytm, Cash…" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Balance (₹)</label>
                                    <input style={inputStyle} type="number" value={walletForm.balance} onChange={e => setWalletForm(f => ({ ...f, balance: e.target.value }))} placeholder="0" />
                                </div>
                            </div>
                            <div style={modalFooter}>
                                <button style={cancelBtn} onClick={() => setShowWalletModal(false)}>Cancel</button>
                                <button
                                    onClick={saveWallet}
                                    disabled={saving || !walletForm.name.trim()}
                                    style={{ flex: 2, padding: 10, background: saving || !walletForm.name.trim() ? 'var(--bg-border)' : 'var(--accent-blue)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontFamily: "'Satoshi', 'DM Sans', sans-serif", cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                                >
                                    {saving ? 'Saving…' : editingWallet ? 'Save Changes' : 'Add Wallet'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Delete Confirm */}
                {deleteConfirm && mounted && createPortal(
                    <>
                        <div onClick={() => setDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)' }} />
                        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 14, padding: 28, zIndex: 10000, width: 340, maxWidth: '90vw' }}>
                            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: 'Cabinet Grotesk, Sora, sans-serif' }}>
                                Delete {deleteConfirm.name}?
                            </p>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: "'Satoshi', 'DM Sans', sans-serif" }}>
                                This action cannot be undone.
                            </p>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: 10, padding: 10, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: "'Satoshi', 'DM Sans', sans-serif" }}>Cancel</button>
                                <button onClick={executeDelete} style={{ flex: 1, background: 'var(--accent-red)', border: 'none', borderRadius: 10, padding: 10, fontSize: 14, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: "'Satoshi', 'DM Sans', sans-serif" }}>Delete</button>
                            </div>
                        </div>
                    </>,
                    document.body
                )}

            </div>
        </AppLayout>
    );
}
