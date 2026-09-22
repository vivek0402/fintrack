'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, X, Plus, Star, Landmark, CreditCard as CreditCardIcon, Wallet as WalletIcon, ChevronDown, Check } from 'lucide-react';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { useAuthStore } from '@/store/authStore';
import { accountsAPI, creditCardsAPI, walletsAPI } from '@/lib/api';
import { useIsMobile } from '@/hooks/useWindowSize';
import { useCountUp } from '@/hooks/useCountUp';
import { fmt as fmtBase, formatDate } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BankAccount {
    id: number; name: string; icon: string; color: string;
    account_type: string; last_four: string | null;
    starting_balance: number; current_balance: number;
    is_default: boolean; balance_as_of: string | null;
}
interface CreditCard {
    id: number; bank_name: string; card_name: string; last_four: string | null;
    credit_limit: number; outstanding_balance: number; current_outstanding_balance: number;
    balance_as_of: string | null;
    billing_date: number | null; due_days: number; network: string; color: string;
    interest_rate_pct: number | null;
    // Additive billing-cycle breakdown -- null when billing_date isn't set,
    // since there's no statement close date to compute against. Doesn't
    // change what current_outstanding_balance means; see
    // backend/src/utils/creditCardBalance.js's fetchCreditCardsWithCycleBreakdown.
    statement_balance: number | null;
    new_charges_since_statement: number | null;
    last_statement_close_date: string | null;
    statement_due_date: string | null;
}
interface Wallet { id: number; name: string; emoji: string; balance: number; }
interface Cycle { start: string; end: string | null; label: string; total: string; is_current: boolean; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return fmtBase(Math.abs(n)); }

// Same calendar-grid builder as TransactionModal's own dateSheet -- kept as
// a local copy (that file doesn't export it) rather than a shared import,
// same "small enough to duplicate, not worth a new shared module" call the
// PAY_METHOD_ICONS copy above makes.
function buildCalDays(month: number, year: number) {
    const first = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev  = new Date(year, month, 0).getDate();
    const cells: { day: number; month: 'prev' | 'cur' | 'next' }[] = [];
    for (let i = first - 1; i >= 0; i--)  cells.push({ day: daysInPrev - i, month: 'prev' });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, month: 'cur' });
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++)   cells.push({ day: d, month: 'next' });
    return cells;
}
const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getDueDays(billingDate: number | null, dueDays: number): number | null {
    if (!billingDate) return null;
    const today = new Date();
    const billing = new Date(today.getFullYear(), today.getMonth(), billingDate);
    const due = new Date(billing); due.setDate(due.getDate() + dueDays);
    if (due < today) {
        const nextBilling = new Date(today.getFullYear(), today.getMonth() + 1, billingDate);
        const nextDue = new Date(nextBilling); nextDue.setDate(nextDue.getDate() + dueDays);
        return Math.round((nextDue.getTime() - today.getTime()) / 86400000);
    }
    return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = ['Savings', 'Current', 'Salary', 'FD'];
const NETWORKS      = ['Visa', 'Mastercard', 'Amex', 'RuPay'];
const CARD_COLORS   = ['#6366f1', '#00e5a0', '#f59e0b', '#ef4444', '#ec4899', '#0ea5e9'];
const WALLET_EMOJIS = ['👛', '💰', '📱', '🏧', '💳', '🪙', '💵', '🏦'];
// Same set + icons as the Add Transaction modal's payment method picker
// (components/transactions/TransactionModal.tsx) -- kept as a local copy
// since that file's map isn't exported, same "free-form but validated"
// convention the backend's PAYMENT_METHODS list documents.
const PAY_METHOD_ICONS: Record<string, string> = {
    'Cash': '💵', 'UPI': '📱', 'Credit Card': '💳', 'Debit Card': '🏧', 'Net Banking': '🏦', 'Wallet': '👛',
};
const PAY_METHODS = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Wallet'];

const emptyBankForm   = () => ({ name: '', account_type: 'Savings', last_four: '', starting_balance: '', balance_as_of: '' });
const emptyCardForm   = () => ({ bank_name: '', card_name: '', last_four: '', credit_limit: '', outstanding_balance: '0', balance_as_of: '', billing_date: '', due_days: '20', network: 'Visa', color: '#6366f1', interest_rate_pct: '' });
const emptyWalletForm = () => ({ name: '', emoji: '👛', balance: '' });

function SectionHead({ title, total, totalColor, onAdd }: { title: string; total: string; totalColor: string; onAdd: () => void }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 1px' }}>{title}</h2>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: totalColor, fontVariantNumeric: 'tabular-nums' }}>{total}</span>
            </div>
            <button type="button" onClick={onAdd} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <Plus size={14} /> Add
            </button>
        </div>
    );
}

// ── Shared modal style helpers ────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
    width: '100%', background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)',
    borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14,
    outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)',
};
const labelSt: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px',
    textTransform: 'uppercase', marginBottom: 6, display: 'block', fontFamily: 'var(--font-body)',
};
const outlineBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
    background: 'transparent', border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)',
    fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)',
    transition: 'all var(--transition-fast)',
};
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center' };

// ── Pay Bill modal style helpers ────────────────────────────────────────────
// Violet, not --accent -- matches Add Transaction's Transfer segment tint,
// since a bill payment is a transfer under the hood (POST /:id/pay inserts
// two linked transaction legs sharing a transfer_group_id).
const PAY_TINT = '#7c3aed';
const triggerSt: React.CSSProperties = {
    width: '100%', background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)',
    borderRadius: 10, padding: '11px 13px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: 8, cursor: 'pointer', boxSizing: 'border-box',
};
const tileSt: React.CSSProperties = {
    flex: 1, background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)',
    borderRadius: 12, padding: '10px 12px',
};
const tileKeySt: React.CSSProperties = { fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, fontFamily: 'var(--font-body)' };
const tileValSt: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' };
const tileDueSt: React.CSSProperties = { fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-body)' };
function cycleAmountColor(total: number) { return total > 0 ? 'var(--color-warn)' : total < 0 ? 'var(--color-inc)' : 'var(--text-muted)'; }
function fmtCycleAmount(total: number) { return `${total < 0 ? '−' : ''}${fmt(total)}`; }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AccountsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const [banks,   setBanks]   = useState<BankAccount[]>([]);
    const [cards,   setCards]   = useState<CreditCard[]>([]);
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [mounted, setMounted] = useState(false);
    const [dataLoading, setDataLoading] = useState(true);

    const [showBankModal,   setShowBankModal]   = useState(false);
    const [showCardModal,   setShowCardModal]   = useState(false);
    const [showWalletModal, setShowWalletModal] = useState(false);
    const [showPayModal,    setShowPayModal]    = useState(false);

    const [editingBank,   setEditingBank]   = useState<BankAccount | null>(null);
    const [editingCard,   setEditingCard]   = useState<CreditCard | null>(null);
    const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
    const [payingCard,    setPayingCard]    = useState<CreditCard | null>(null);

    const [bankForm,   setBankForm]   = useState(emptyBankForm());
    const [cardForm,   setCardForm]   = useState(emptyCardForm());
    const [walletForm, setWalletForm] = useState(emptyWalletForm());
    const [payForm,     setPayForm]   = useState({ bank_account_id: '', amount: '', date: new Date().toISOString().split('T')[0], payment_method: 'UPI' });
    const [payCycles,        setPayCycles]        = useState<Cycle[]>([]);
    const [selectedCycleKey, setSelectedCycleKey] = useState<string | null>(null);
    const [showCycleSheet,   setShowCycleSheet]   = useState(false);
    const [showPayMethodSheet, setShowPayMethodSheet] = useState(false);
    const [showPayAccountSheet, setShowPayAccountSheet] = useState(false);
    const [showPayDateSheet, setShowPayDateSheet] = useState(false);
    const [payCalMonth, setPayCalMonth] = useState(new Date().getMonth());
    const [payCalYear,  setPayCalYear]  = useState(new Date().getFullYear());

    const [editingWalletBalanceId,  setEditingWalletBalanceId] = useState<number | null>(null);
    const [walletBalanceInput,      setWalletBalanceInput]     = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'bank' | 'card' | 'wallet'; id: number; name: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [toast,  setToast]  = useState('');

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

    const fetchAll = useCallback(async () => {
        setDataLoading(true);
        const [banksRes, cardsRes, walletsRes] = await Promise.allSettled([
            accountsAPI.getAll(), creditCardsAPI.getAll(), walletsAPI.getAll(),
        ]);
        if (banksRes.status   === 'fulfilled') setBanks(banksRes.value.data.accounts);
        if (cardsRes.status   === 'fulfilled') setCards(cardsRes.value.data.cards);
        if (walletsRes.status === 'fulfilled') setWallets(walletsRes.value.data.wallets);
        setDataLoading(false);
    }, []);

    useEffect(() => { if (user) fetchAll(); }, [user, fetchAll]);

    const totalBanks   = banks.reduce((s, b) => s + Number(b.current_balance), 0);
    const totalCards   = cards.reduce((s, c) => s + Number(c.current_outstanding_balance), 0);
    const totalWallets = wallets.reduce((s, w) => s + Number(w.balance), 0);
    const netWorth     = totalBanks + totalWallets - totalCards;

    const animatedNetWorth = useCountUp(Math.abs(netWorth), 1000, mounted);
    const animatedBanks    = useCountUp(totalBanks,    900, mounted);
    const animatedCards    = useCountUp(totalCards,    900, mounted);
    const animatedWallets  = useCountUp(totalWallets,  900, mounted);

    // ── Bank handlers (logic unchanged) ──────────────────────────────────────

    const openAddBank = () => { setEditingBank(null); setBankForm(emptyBankForm()); setShowBankModal(true); };
    const openEditBank = (b: BankAccount) => {
        setEditingBank(b);
        setBankForm({ name: b.name, account_type: b.account_type || 'Savings', last_four: b.last_four || '', starting_balance: String(b.starting_balance), balance_as_of: b.balance_as_of ? String(b.balance_as_of).split('T')[0] : '' });
        setShowBankModal(true);
    };
    const saveBank = async () => {
        if (!bankForm.name.trim()) return;
        setSaving(true);
        try {
            const data = { name: bankForm.name.trim(), account_type: bankForm.account_type, last_four: bankForm.last_four || null, starting_balance: parseFloat(bankForm.starting_balance) || 0, balance_as_of: bankForm.balance_as_of || null };
            if (editingBank) await accountsAPI.update(editingBank.id, data); else await accountsAPI.create(data);
            if (user) localStorage.removeItem(`accounts-cache-${user.id}`);
            await fetchAll(); setShowBankModal(false); showToast(editingBank ? 'Account updated' : 'Account added');
        } catch { showToast('Failed to save account'); }
        setSaving(false);
    };

    // ── Credit card handlers (logic unchanged) ────────────────────────────────

    const openAddCard = () => { setEditingCard(null); setCardForm(emptyCardForm()); setShowCardModal(true); };
    const openEditCard = (c: CreditCard) => {
        setEditingCard(c);
        setCardForm({ bank_name: c.bank_name, card_name: c.card_name, last_four: c.last_four || '', credit_limit: String(c.credit_limit), outstanding_balance: String(c.outstanding_balance), balance_as_of: c.balance_as_of ? String(c.balance_as_of).split('T')[0] : '', billing_date: c.billing_date ? String(c.billing_date) : '', due_days: String(c.due_days), network: c.network, color: c.color, interest_rate_pct: c.interest_rate_pct != null ? String(c.interest_rate_pct) : '' });
        setShowCardModal(true);
    };
    const saveCard = async () => {
        if (!cardForm.bank_name.trim() || !cardForm.card_name.trim()) return;
        setSaving(true);
        try {
            const data = { bank_name: cardForm.bank_name.trim(), card_name: cardForm.card_name.trim(), last_four: cardForm.last_four || null, credit_limit: parseFloat(cardForm.credit_limit) || 0, outstanding_balance: parseFloat(cardForm.outstanding_balance) || 0, balance_as_of: cardForm.balance_as_of || null, billing_date: parseInt(cardForm.billing_date) || null, due_days: parseInt(cardForm.due_days) || 20, network: cardForm.network, color: cardForm.color, interest_rate_pct: cardForm.interest_rate_pct ? parseFloat(cardForm.interest_rate_pct) : null };
            if (editingCard) await creditCardsAPI.update(editingCard.id, data); else await creditCardsAPI.create(data);
            if (user) { localStorage.removeItem(`credit-utilization-cache-${user.id}`); localStorage.removeItem(`dti-cache-${user.id}`); }
            await fetchAll(); setShowCardModal(false); showToast(editingCard ? 'Card updated' : 'Card added');
        } catch { showToast('Failed to save card'); }
        setSaving(false);
    };

    const openPayCard = (c: CreditCard) => {
        setPayingCard(c);
        const today = new Date();
        setPayForm({ bank_account_id: banks.find(b => b.is_default)?.id ? String(banks.find(b => b.is_default)!.id) : (banks[0]?.id ? String(banks[0].id) : ''), amount: '', date: today.toISOString().split('T')[0], payment_method: 'UPI' });
        setPayCalMonth(today.getMonth());
        setPayCalYear(today.getFullYear());
        setPayCycles([]);
        setSelectedCycleKey(null);
        setShowPayModal(true);
        // A card with no billing_date returns [] here (same short-circuit
        // GET /:id/cycles already documents) -- the Cycle field just doesn't
        // render in that case, falling back to a manually-typed amount.
        creditCardsAPI.getCycles(c.id).then(res => {
            const cycles: Cycle[] = res.data?.cycles || [];
            setPayCycles(cycles);
            // Default to the most recent CLOSED cycle (index 1 -- index 0 is
            // always the still-open current one) when it's actually owed;
            // that's the same cycle current_outstanding_balance's
            // statement_balance already represents. Falls back to the
            // current cycle if there's no closed cycle yet.
            const defaultCycle = (cycles[1] && Number(cycles[1].total) > 0) ? cycles[1] : cycles[0];
            if (defaultCycle) {
                setSelectedCycleKey(defaultCycle.start);
                if (Number(defaultCycle.total) > 0) setPayForm(f => ({ ...f, amount: String(defaultCycle.total) }));
            }
        }).catch(() => setPayCycles([]));
    };
    const selectedCycle = payCycles.find(c => c.start === selectedCycleKey) || null;
    const selectedCycleIdx = payCycles.findIndex(c => c.start === selectedCycleKey);
    const pickCycle = (cycle: Cycle) => {
        setSelectedCycleKey(cycle.start);
        if (Number(cycle.total) > 0) setPayForm(f => ({ ...f, amount: String(cycle.total) }));
        setShowCycleSheet(false);
    };
    // idx === 1 is always the most recently CLOSED cycle (idx 0 is the
    // still-open current one) -- the same cycle current_outstanding_balance's
    // statement_due_date already represents, so it's the only one that gets
    // a real due date instead of a generic status.
    const cycleStatusLabel = (cycle: Cycle, idx: number) => {
        if (cycle.is_current) return 'Not yet billed';
        if (idx === 1 && payingCard?.statement_due_date) return `Due ${formatDate(payingCard.statement_due_date)}`;
        const t = Number(cycle.total);
        if (t === 0) return 'Paid in full';
        if (t < 0) return 'Overpaid · credit';
        return 'Closed';
    };

    // Quick chips + calendar grid for the Date sheet -- same pattern as
    // TransactionModal's own dateSheet, rendered through the shared Modal
    // (portals to document.body) rather than an inline dropdown, so it can
    // never get clipped by this modal's own scrolling body.
    const payQuickDates = ['Today', 'Yesterday', '2 days ago'].map((label, offset) => {
        const d = new Date(); d.setDate(d.getDate() - offset);
        return { label, value: d.toLocaleDateString('en-CA') };
    });
    const payTodayStr = new Date().toLocaleDateString('en-CA');
    const payDateLabel = (() => {
        const quick = payQuickDates.find(q => q.value === payForm.date);
        if (quick) return quick.label;
        const d = payForm.date ? new Date(payForm.date + 'T00:00:00') : null;
        return d ? `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}` : 'Select a date';
    })();
    const pickPayDate = (value: string) => {
        setPayForm(f => ({ ...f, date: value }));
        const d = new Date(value + 'T00:00:00');
        setPayCalMonth(d.getMonth()); setPayCalYear(d.getFullYear());
        setShowPayDateSheet(false);
    };
    const handlePayDayClick = (day: number, monthType: 'prev' | 'cur' | 'next') => {
        let m = payCalMonth, y = payCalYear;
        if (monthType === 'prev') { m--; if (m < 0)  { m = 11; y--; } }
        if (monthType === 'next') { m++; if (m > 11) { m = 0;  y++; } }
        pickPayDate(`${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    };
    const savePay = async () => {
        if (!payingCard || !payForm.bank_account_id || !payForm.amount || parseFloat(payForm.amount) <= 0) return;
        setSaving(true);
        try {
            await creditCardsAPI.payBill(payingCard.id, { bank_account_id: parseInt(payForm.bank_account_id), amount: parseFloat(payForm.amount), date: payForm.date, payment_method: payForm.payment_method });
            if (user) { localStorage.removeItem(`credit-utilization-cache-${user.id}`); localStorage.removeItem(`dti-cache-${user.id}`); }
            await fetchAll(); setShowPayModal(false); showToast('Payment recorded');
        } catch { showToast('Failed to record payment'); }
        setSaving(false);
    };

    // ── Wallet handlers (logic unchanged) ────────────────────────────────────

    const openAddWallet = () => { setEditingWallet(null); setWalletForm(emptyWalletForm()); setShowWalletModal(true); };
    const openEditWallet = (w: Wallet) => { setEditingWallet(w); setWalletForm({ name: w.name, emoji: w.emoji, balance: String(w.balance) }); setShowWalletModal(true); };
    const saveWallet = async () => {
        if (!walletForm.name.trim()) return;
        setSaving(true);
        try {
            const data = { name: walletForm.name.trim(), emoji: walletForm.emoji, balance: parseFloat(walletForm.balance) || 0 };
            if (editingWallet) await walletsAPI.update(editingWallet.id, data); else await walletsAPI.create(data);
            await fetchAll(); setShowWalletModal(false); showToast(editingWallet ? 'Wallet updated' : 'Wallet added');
        } catch { showToast('Failed to save wallet'); }
        setSaving(false);
    };
    const startWalletBalanceEdit = (w: Wallet) => { setEditingWalletBalanceId(w.id); setWalletBalanceInput(String(w.balance)); };
    const saveWalletBalance = async (w: Wallet) => {
        try { await walletsAPI.update(w.id, { name: w.name, emoji: w.emoji, balance: parseFloat(walletBalanceInput) || 0 }); await fetchAll(); }
        catch { showToast('Failed to update balance'); }
        setEditingWalletBalanceId(null);
    };
    const handleSetDefault = async (id: number) => {
        try {
            await accountsAPI.setDefault(id);
            if (user) localStorage.removeItem(`accounts-cache-${user.id}`);
            await fetchAll(); showToast('Default account updated');
        }
        catch { showToast('Failed to set default'); }
    };
    const confirmDelete = (type: 'bank' | 'card' | 'wallet', id: number, name: string) => setDeleteConfirm({ type, id, name });
    const executeDelete = async () => {
        if (!deleteConfirm) return;
        try {
            if (deleteConfirm.type === 'bank') {
                await accountsAPI.delete(deleteConfirm.id);
                if (user) localStorage.removeItem(`accounts-cache-${user.id}`);
            } else if (deleteConfirm.type === 'card') {
                await creditCardsAPI.delete(deleteConfirm.id);
                if (user) { localStorage.removeItem(`credit-utilization-cache-${user.id}`); localStorage.removeItem(`dti-cache-${user.id}`); }
            } else {
                await walletsAPI.delete(deleteConfirm.id);
            }
            await fetchAll(); showToast('Deleted');
        } catch { showToast('Failed to delete'); }
        setDeleteConfirm(null);
    };

    if (isLoading) return null;

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── Toast ── */}
                {toast && mounted && createPortal(
                    <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '10px 20px', borderRadius: 'var(--radius-md)', fontSize: 13, fontFamily: 'var(--font-body)', zIndex: 20000, whiteSpace: 'nowrap', boxShadow: 'var(--shadow-elevated)' }}>
                        {toast}
                    </div>,
                    document.body
                )}

                {/* ── NET WORTH HEADER ── */}
                <div className="glass-surface" style={{ borderRadius: 'var(--radius-xl)', padding: '24px 20px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'relative', zIndex: 1 }}>
                        <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 4px', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Net Worth</p>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? '32px' : '2.5rem', fontWeight: 800, color: netWorth >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: '20px', fontVariantNumeric: 'tabular-nums', animation: 'numberReveal 400ms cubic-bezier(0.22,1,0.36,1) both' }}>
                            {netWorth < 0 ? '−' : ''}₹{animatedNetWorth.toLocaleString('en-IN')}
                        </div>
                        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                            {[
                                { label: 'Bank Balance', value: animatedBanks,   color: 'var(--color-inc)' },
                                { label: 'CC Debt',      value: animatedCards,   color: 'var(--color-exp)' },
                                { label: 'Wallets',      value: animatedWallets, color: 'var(--color-inc)' },
                            ].map(pill => (
                                <div key={pill.label}>
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px', fontFamily: 'var(--font-body)' }}>{pill.label}</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: pill.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>₹{pill.value.toLocaleString('en-IN')}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── BANK ACCOUNTS ── */}
                <div>
                    <SectionHead title="Bank Accounts" total={fmt(totalBanks)} totalColor="var(--color-inc)" onAdd={openAddBank} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {dataLoading ? [1, 2].map(i => (
                            <div key={i} className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                <div className="glass-field" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <Skeleton width="120px" height={14} borderRadius={4} />
                                        <Skeleton width="80px" height={11} borderRadius={4} />
                                    </div>
                                    <Skeleton width={80} height={20} borderRadius={4} />
                                </div>
                                <div style={{ padding: '10px 16px' }}><Skeleton width="120px" height={10} borderRadius={4} /></div>
                            </div>
                        )) : banks.map(b => (
                            <div key={b.id} className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                {/* Coloured band */}
                                <div style={{ background: b.color || 'var(--accent)', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '16px' }}>{b.icon || '🏦'}</span>
                                            <span style={{ fontSize: '15px', fontWeight: 700, color: 'white', fontFamily: 'var(--font-display)' }}>{b.name}</span>
                                            {b.is_default && <Badge bg="rgba(255,255,255,0.22)" color="white">Default</Badge>}
                                        </div>
                                        {b.last_four && <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono)', margin: '0 0 2px' }}>••••&nbsp;&nbsp;{b.last_four}</p>}
                                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)', margin: 0 }}>{b.account_type || 'Savings'}</p>
                                    </div>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: 'white', margin: 0, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                        {fmt(b.current_balance)}
                                    </p>
                                </div>
                                {/* Action row */}
                                <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', borderTop: '1px solid var(--glass-border)' }}>
                                    <button type="button" onClick={() => router.push('/transactions')} style={outlineBtn}>History</button>
                                    <button type="button" onClick={() => openEditBank(b)} style={outlineBtn}><Pencil size={12} /> Edit</button>
                                    {!b.is_default && (
                                        <button type="button" onClick={() => handleSetDefault(b.id)} style={{ ...outlineBtn, marginLeft: 'auto' }} title="Set as default">
                                            <Star size={12} /> Default
                                        </button>
                                    )}
                                    <button type="button" onClick={() => confirmDelete('bank', b.id, b.name)} style={{ ...iconBtn, marginLeft: b.is_default ? 'auto' : 0 }}>
                                        <Trash2 size={14} color="var(--color-exp)" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {!dataLoading && banks.length === 0 && (
                            <EmptyState icon={Landmark} title="No bank accounts yet" subtitle="Add a bank account to start tracking your balances." />
                        )}
                        {!dataLoading && (
                            <button type="button" onClick={openAddBank} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: 'var(--font-body)' }}>
                                <Plus size={14} /> Add Bank Account
                            </button>
                        )}
                    </div>
                </div>

                {/* ── CREDIT CARDS ── */}
                <div>
                    <SectionHead title="Credit Cards" total={fmt(totalCards)} totalColor="var(--color-exp)" onAdd={openAddCard} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {dataLoading ? [1, 2].map(i => (
                            <div key={i} className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                <div className="glass-field" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between' }}>
                                    <Skeleton width="120px" height={14} borderRadius={4} />
                                    <Skeleton width={70} height={20} borderRadius={4} />
                                </div>
                                <div style={{ padding: '14px 16px' }}><Skeleton width="100%" height={5} borderRadius={999} /></div>
                            </div>
                        )) : cards.map(c => {
                            const dueDays = getDueDays(c.billing_date, c.due_days);
                            const utilPct = c.credit_limit > 0 ? Math.min(100, (Number(c.current_outstanding_balance) / Number(c.credit_limit)) * 100) : 0;
                            const utilColor = utilPct > 30 ? 'var(--color-warn)' : 'var(--accent)';
                            const dueUrgent = dueDays !== null && dueDays <= 7;
                            const dueLabel  = dueDays === null ? null : dueDays < 0 ? 'Overdue' : dueDays === 0 ? 'Due today' : `Due in ${dueDays}d`;

                            return (
                                <div key={c.id} className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                                    {/* Coloured panel */}
                                    <div style={{ background: c.color, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '14px', fontWeight: 700, color: 'white', fontFamily: 'var(--font-display)' }}>
                                                    {c.bank_name} {c.card_name}
                                                </span>
                                                <Badge bg="rgba(255,255,255,0.22)" color="white">{Math.round(utilPct)}% used</Badge>
                                            </div>
                                            {c.last_four && (
                                                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono)', margin: 0 }}>
                                                    {c.network} ••{c.last_four}
                                                </p>
                                            )}
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: 'white', margin: '0 0 4px', fontVariantNumeric: 'tabular-nums' }}>
                                                {fmt(c.current_outstanding_balance)}
                                            </p>
                                            {dueLabel && (
                                                <p style={{ fontSize: '11px', fontWeight: dueUrgent ? 700 : 400, color: dueUrgent ? 'var(--color-warn)' : 'rgba(255,255,255,0.65)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                                    {dueLabel}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {/* Details + utilisation */}
                                    <div style={{ padding: '14px 16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Limit: {fmt(c.credit_limit)}</span>
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Available: {fmt(Math.max(0, c.credit_limit - c.current_outstanding_balance))}</span>
                                        </div>
                                        <ProgressBar pct={utilPct} color={utilColor} height={5} />
                                        {c.statement_balance != null ? (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', flexWrap: 'wrap', gap: '4px' }}>
                                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                                    Statement: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(c.statement_balance)}</span>
                                                    {c.statement_due_date && <> · due {formatDate(c.statement_due_date)}</>}
                                                </span>
                                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                                    New charges: <span style={{ fontFamily: 'var(--font-mono)', color: (c.new_charges_since_statement ?? 0) > 0 ? 'var(--color-warn)' : 'var(--text-primary)' }}>
                                                        {(c.new_charges_since_statement ?? 0) >= 0 ? '+' : '−'}{fmt(c.new_charges_since_statement ?? 0)}
                                                    </span>
                                                </span>
                                            </div>
                                        ) : (
                                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', margin: '8px 0 0' }}>
                                                Set a billing date to see statement balance vs. new charges
                                            </p>
                                        )}
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                            <button type="button" onClick={() => router.push(`/transactions?credit_card_id=${c.id}`)} style={outlineBtn}>History</button>
                                            {c.statement_balance != null && (
                                                <button type="button" onClick={() => router.push(`/accounts/credit-cards/cycles?id=${c.id}`)} style={outlineBtn}>Cycles</button>
                                            )}
                                            <button type="button" onClick={() => openPayCard(c)} style={outlineBtn}>Pay Bill</button>
                                            <button type="button" onClick={() => openEditCard(c)} style={outlineBtn}><Pencil size={12} /> Edit</button>
                                            <button type="button" onClick={() => confirmDelete('card', c.id, `${c.bank_name} ${c.card_name}`)} style={{ ...iconBtn, marginLeft: 'auto' }}>
                                                <Trash2 size={14} color="var(--color-exp)" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {!dataLoading && cards.length === 0 && (
                            <EmptyState icon={CreditCardIcon} title="No cards yet" subtitle="Add a credit card to track balances and due dates." />
                        )}
                        {!dataLoading && (
                            <button type="button" onClick={openAddCard} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: 'var(--font-body)' }}>
                                <Plus size={14} /> Add Credit Card
                            </button>
                        )}
                    </div>
                </div>

                {/* ── WALLETS & UPI ── */}
                <div>
                    <SectionHead title="Wallets & UPI" total={fmt(totalWallets)} totalColor="var(--color-inc)" onAdd={openAddWallet} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {dataLoading ? [1, 2, 3, 4].map(i => (
                            <div key={i} className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', height: 100 }} />
                        )) : wallets.map(w => (
                            <GCard key={w.id} padding="var(--space-4)">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '24px', lineHeight: 1 }}>{w.emoji}</span>
                                    <div style={{ display: 'flex', gap: '2px' }}>
                                        <button type="button" style={iconBtn} onClick={() => openEditWallet(w)}><Pencil size={13} /></button>
                                        <button type="button" style={iconBtn} onClick={() => confirmDelete('wallet', w.id, w.name)}><Trash2 size={13} color="var(--color-exp)" /></button>
                                    </div>
                                </div>
                                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</p>
                                {editingWalletBalanceId === w.id ? (
                                    <input autoFocus type="number" value={walletBalanceInput}
                                        onChange={e => setWalletBalanceInput(e.target.value)}
                                        onBlur={() => saveWalletBalance(w)}
                                        onKeyDown={e => { if (e.key === 'Enter') saveWalletBalance(w); if (e.key === 'Escape') setEditingWalletBalanceId(null); }}
                                        style={{ width: '100%', background: 'var(--glass-fill-1)', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                ) : (
                                    <p onClick={() => startWalletBalanceEdit(w)} title="Tap to edit"
                                        style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', margin: 0, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>
                                        {fmt(w.balance)}
                                    </p>
                                )}
                            </GCard>
                        ))}
                    </div>
                    {!dataLoading && wallets.length === 0 && (
                        <EmptyState icon={WalletIcon} title="No wallets yet" subtitle="Add a wallet to track UPI apps, cash, or prepaid balances." />
                    )}
                    {!dataLoading && (
                        <button type="button" onClick={openAddWallet} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: 'var(--font-body)', marginTop: '10px' }}>
                            <Plus size={14} /> Add Wallet
                        </button>
                    )}
                </div>

            </div>

            {/* ═══ MODALS ═══ */}

            {/* Bank Account Modal */}
            {showBankModal && mounted && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowBankModal(false)}>
                    <div className="glass-surface glass-sheet" style={{ borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column', animation: 'springIn 380ms cubic-bezier(0.34,1.56,0.64,1) both', zIndex: 10000 }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{editingBank ? 'Edit Account' : 'Add Bank Account'}</span>
                            <button type="button" style={{ background: 'var(--glass-fill-2)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: '50%', display: 'flex' }} onClick={() => setShowBankModal(false)}><X size={16} /></button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div><label style={labelSt}>Account Name *</label><input style={inputSt} value={bankForm.name} onChange={e => setBankForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. HDFC Savings" /></div>
                            <div><label style={labelSt}>Account Type</label><select style={inputSt} value={bankForm.account_type} onChange={e => setBankForm(f => ({ ...f, account_type: e.target.value }))}>{ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            <div><label style={labelSt}>Last 4 Digits (optional)</label><input style={inputSt} value={bankForm.last_four} maxLength={4} placeholder="1234" onChange={e => setBankForm(f => ({ ...f, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) }))} /></div>
                            <div><label style={labelSt}>Current Balance (₹)</label><input style={{ ...inputSt, fontFamily: 'var(--font-mono)' }} type="number" value={bankForm.starting_balance} onChange={e => setBankForm(f => ({ ...f, starting_balance: e.target.value }))} placeholder="0" /></div>
                            <div><label style={labelSt}>Balance As Of (optional)</label><input style={inputSt} type="date" value={bankForm.balance_as_of} onChange={e => setBankForm(f => ({ ...f, balance_as_of: e.target.value }))} /></div>
                        </div>
                        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
                            <button type="button" onClick={() => setShowBankModal(false)} className="glass-field" style={{ flex: 1, padding: 10, borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button type="button" onClick={saveBank} disabled={saving || !bankForm.name.trim()} style={{ flex: 2, padding: 10, background: saving || !bankForm.name.trim() ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                                {saving ? 'Saving…' : editingBank ? 'Save Changes' : 'Add Account'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Credit Card Modal */}
            {showCardModal && mounted && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowCardModal(false)}>
                    <div className="glass-surface glass-sheet" style={{ borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column', animation: 'springIn 380ms cubic-bezier(0.34,1.56,0.64,1) both', zIndex: 10000 }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{editingCard ? 'Edit Card' : 'Add Credit Card'}</span>
                            <button type="button" style={{ background: 'var(--glass-fill-2)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: '50%', display: 'flex' }} onClick={() => setShowCardModal(false)}><X size={16} /></button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div><label style={labelSt}>Bank Name *</label><input style={inputSt} value={cardForm.bank_name} onChange={e => setCardForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="HDFC" /></div>
                                <div><label style={labelSt}>Card Name *</label><input style={inputSt} value={cardForm.card_name} onChange={e => setCardForm(f => ({ ...f, card_name: e.target.value }))} placeholder="Millennia" /></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div><label style={labelSt}>Last 4 Digits</label><input style={inputSt} value={cardForm.last_four} maxLength={4} placeholder="5678" onChange={e => setCardForm(f => ({ ...f, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) }))} /></div>
                                <div><label style={labelSt}>Network</label><select style={inputSt} value={cardForm.network} onChange={e => setCardForm(f => ({ ...f, network: e.target.value }))}>{NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div><label style={labelSt}>Credit Limit (₹)</label><input style={{ ...inputSt, fontFamily: 'var(--font-mono)' }} type="number" value={cardForm.credit_limit} onChange={e => setCardForm(f => ({ ...f, credit_limit: e.target.value }))} placeholder="100000" /></div>
                                <div><label style={labelSt}>Outstanding (₹)</label><input style={{ ...inputSt, fontFamily: 'var(--font-mono)' }} type="number" value={cardForm.outstanding_balance} onChange={e => setCardForm(f => ({ ...f, outstanding_balance: e.target.value }))} placeholder="0" /></div>
                            </div>
                            <div><label style={labelSt}>Balance As Of (optional)</label><input style={inputSt} type="date" value={cardForm.balance_as_of} onChange={e => setCardForm(f => ({ ...f, balance_as_of: e.target.value }))} /></div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div><label style={labelSt}>Billing Date (1–28)</label><input style={inputSt} type="number" min={1} max={28} value={cardForm.billing_date} onChange={e => setCardForm(f => ({ ...f, billing_date: e.target.value }))} placeholder="5" /></div>
                                <div><label style={labelSt}>Due Days After</label><input style={inputSt} type="number" value={cardForm.due_days} onChange={e => setCardForm(f => ({ ...f, due_days: e.target.value }))} placeholder="20" /></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div><label style={labelSt}>Interest Rate / APR (%)</label><input style={{ ...inputSt, fontFamily: 'var(--font-mono)' }} type="number" step="0.1" value={cardForm.interest_rate_pct} onChange={e => setCardForm(f => ({ ...f, interest_rate_pct: e.target.value }))} placeholder="42" /></div>
                                <div />
                            </div>
                            <div>
                                <label style={labelSt}>Card Color</label>
                                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                                    {CARD_COLORS.map(col => (
                                        <button type="button" key={col} onClick={() => setCardForm(f => ({ ...f, color: col }))} style={{ width: 28, height: 28, borderRadius: '50%', background: col, border: cardForm.color === col ? '3px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer' }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
                            <button type="button" onClick={() => setShowCardModal(false)} className="glass-field" style={{ flex: 1, padding: 10, borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button type="button" onClick={saveCard} disabled={saving || !cardForm.bank_name.trim() || !cardForm.card_name.trim()} style={{ flex: 2, padding: 10, background: saving || !cardForm.bank_name.trim() || !cardForm.card_name.trim() ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                                {saving ? 'Saving…' : editingCard ? 'Save Changes' : 'Add Card'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Pay Bill Modal -- same chrome as Add Transaction's shared <Modal>,
                a Cycle picker sourced from the existing GET /:id/cycles
                endpoint, and a Pay-by method matching Add Transaction's
                payment-method sheet. Still calls creditCardsAPI.payBill under
                the hood -- see the /:id/pay route comment for why this is
                already an atomic transfer, not a plain expense. */}
            {mounted && payingCard && (
                <Modal
                    isOpen={showPayModal}
                    onClose={() => setShowPayModal(false)}
                    title={`Pay ${payingCard.bank_name} ${payingCard.card_name}`}
                    footer={
                        <button type="button" onClick={savePay} disabled={saving || !payForm.bank_account_id || !payForm.amount || parseFloat(payForm.amount) <= 0}
                            style={{
                                width: '100%', height: 48, border: 'none', borderRadius: 'var(--radius-md)',
                                background: (saving || !payForm.bank_account_id || !payForm.amount || parseFloat(payForm.amount) <= 0) ? 'var(--border-subtle)' : PAY_TINT,
                                color: 'white', fontSize: '14.5px', fontWeight: 600, fontFamily: 'var(--font-body)',
                                cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
                                boxShadow: '0 12px 26px -10px rgba(124,58,237,0.6), inset 0 1px 0 rgba(255,255,255,0.25)',
                            }}>
                            {saving ? 'Recording…' : `Pay${payForm.amount ? ` ₹${Number(payForm.amount).toLocaleString('en-IN')}` : ''}`}
                        </button>
                    }
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <div style={tileSt}>
                                <div style={tileKeySt}>Outstanding</div>
                                <div style={tileValSt}>{fmt(payingCard.current_outstanding_balance)}</div>
                            </div>
                            {payingCard.statement_balance != null && (
                                <div style={tileSt}>
                                    <div style={tileKeySt}>Statement</div>
                                    <div style={tileValSt}>{fmt(payingCard.statement_balance)}</div>
                                    {payingCard.statement_due_date && <div style={tileDueSt}>due {formatDate(payingCard.statement_due_date)}</div>}
                                </div>
                            )}
                        </div>

                        {payCycles.length > 0 && (
                            <div>
                                <label style={labelSt}>Cycle</label>
                                <div onClick={() => setShowCycleSheet(true)} style={triggerSt}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {selectedCycle?.label || 'Select a cycle'}
                                        </div>
                                        {selectedCycle && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{cycleStatusLabel(selectedCycle, selectedCycleIdx)}</div>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                        {selectedCycle && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: cycleAmountColor(Number(selectedCycle.total)) }}>{fmtCycleAmount(Number(selectedCycle.total))}</span>}
                                        <ChevronDown size={14} color="var(--text-muted)" />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label style={labelSt}>Pay by</label>
                                <div onClick={() => setShowPayMethodSheet(true)} style={triggerSt}>
                                    <span style={{ fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {PAY_METHOD_ICONS[payForm.payment_method]} {payForm.payment_method}
                                    </span>
                                    <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                </div>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label style={labelSt}>Date</label>
                                <div onClick={() => setShowPayDateSheet(true)} style={triggerSt}>
                                    <span style={{ fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{payDateLabel}</span>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--text-muted)', flexShrink: 0 }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label style={labelSt}>Amount</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: PAY_TINT, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 20 }}>₹</span>
                                <input type="number" min="0.01" step="any" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0"
                                    style={{ width: '100%', padding: '14px 16px 14px 36px', background: 'var(--glass-fill-1)', border: `1px solid color-mix(in srgb, ${PAY_TINT} 30%, transparent)`, borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: PAY_TINT, boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' }} />
                            </div>
                            {banks.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-muted)', paddingTop: 6, fontFamily: 'var(--font-body)' }}>
                                    from <b style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{banks.find(b => String(b.id) === payForm.bank_account_id)?.name || 'account'}</b>
                                    {banks.length > 1 && (
                                        <>
                                            <span style={{ color: 'var(--border-visible)' }}>·</span>
                                            <span onClick={() => setShowPayAccountSheet(true)} style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>change</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </Modal>
            )}

            {/* Cycle picker sheet */}
            {mounted && payingCard && payCycles.length > 0 && (
                <Modal isOpen={showCycleSheet} onClose={() => setShowCycleSheet(false)} title="Which cycle?" maxWidth="360px" opaque forceDialog zIndexBase={10010}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {payCycles.map((cycle, idx) => {
                            const active = cycle.start === selectedCycleKey;
                            const total = Number(cycle.total);
                            const disabled = !cycle.is_current && total <= 0;
                            return (
                                <button key={cycle.start} type="button" disabled={disabled} onClick={() => pickCycle(cycle)}
                                    style={{
                                        display: 'flex', flexDirection: 'column', gap: 2, width: '100%', padding: '11px 14px',
                                        borderRadius: 'var(--radius-md)', border: 'none', textAlign: 'left', fontFamily: 'var(--font-body)',
                                        background: active ? 'var(--accent-subtle)' : 'transparent',
                                        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
                                    }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text-primary)' }}>{cycle.label}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: cycleAmountColor(total) }}>{fmtCycleAmount(total)}</span>
                                    </div>
                                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{cycleStatusLabel(cycle, idx)}</span>
                                </button>
                            );
                        })}
                    </div>
                </Modal>
            )}

            {/* Pay-by method sheet */}
            {mounted && (
                <Modal isOpen={showPayMethodSheet} onClose={() => setShowPayMethodSheet(false)} title="Pay by" maxWidth="360px" opaque forceDialog zIndexBase={10010}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {PAY_METHODS.map(m => {
                            const active = payForm.payment_method === m;
                            return (
                                <button key={m} type="button" onClick={() => { setPayForm(f => ({ ...f, payment_method: m })); setShowPayMethodSheet(false); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', border: 'none', background: active ? 'var(--accent-subtle)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-primary)', textAlign: 'left' }}>
                                    <span style={{ flexShrink: 0 }}>{PAY_METHOD_ICONS[m]}</span>
                                    <span style={{ flex: 1 }}>{m}</span>
                                    {active && <Check size={16} />}
                                </button>
                            );
                        })}
                    </div>
                </Modal>
            )}

            {/* Date sheet */}
            {mounted && (
                <Modal isOpen={showPayDateSheet} onClose={() => setShowPayDateSheet(false)} title="Date" maxWidth="360px" opaque forceDialog zIndexBase={10010}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                            {payQuickDates.map(q => {
                                const active = payForm.date === q.value;
                                return (
                                    <button key={q.value} type="button" onClick={() => pickPayDate(q.value)}
                                        style={{ padding: '7px 14px', borderRadius: 'var(--radius-full)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, background: active ? 'var(--accent-subtle)' : 'var(--glass-fill-1)', color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                                        {q.label}
                                    </button>
                                );
                            })}
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <button type="button" aria-label="Previous month" onClick={() => { let m = payCalMonth - 1, y = payCalYear; if (m < 0) { m = 11; y--; } setPayCalMonth(m); setPayCalYear(y); }}
                                    style={{ background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer', width: 34, height: 34, fontSize: 16, lineHeight: 1 }}>‹</button>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-display)' }}>{MONTHS[payCalMonth]} {payCalYear}</span>
                                <button type="button" aria-label="Next month" onClick={() => { let m = payCalMonth + 1, y = payCalYear; if (m > 11) { m = 0; y++; } setPayCalMonth(m); setPayCalYear(y); }}
                                    style={{ background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer', width: 34, height: 34, fontSize: 16, lineHeight: 1 }}>›</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
                                {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (<div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, padding: '4px 0', fontFamily: 'var(--font-body)' }}>{d}</div>))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                                {buildCalDays(payCalMonth, payCalYear).map((cell, i) => {
                                    const cy = cell.month === 'prev' ? (payCalMonth === 0 ? payCalYear - 1 : payCalYear) : cell.month === 'next' ? (payCalMonth === 11 ? payCalYear + 1 : payCalYear) : payCalYear;
                                    const cm = cell.month === 'prev' ? (payCalMonth === 0 ? 12 : payCalMonth) : cell.month === 'next' ? (payCalMonth === 11 ? 1 : payCalMonth + 2) : payCalMonth + 1;
                                    const dateStr = `${cy}-${String(cm).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`;
                                    const isSelected = payForm.date === dateStr;
                                    const isToday = payTodayStr === dateStr;
                                    const isOtherMonth = cell.month !== 'cur';
                                    return (
                                        <div key={i} onClick={() => handlePayDayClick(cell.day, cell.month)}
                                            style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, cursor: 'pointer', margin: '0 auto', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', backgroundColor: isSelected ? 'var(--accent)' : 'transparent', color: isSelected ? 'white' : 'var(--text-secondary)', opacity: isOtherMonth && !isSelected ? 0.4 : 1, outline: (!isSelected && isToday) ? '2px solid var(--accent)' : 'none', outlineOffset: '-2px' }}>
                                            {cell.day}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Pay-from account sheet -- an escape hatch, not a required field;
                only reachable via "change" (rendered only when banks.length > 1) */}
            {mounted && (
                <Modal isOpen={showPayAccountSheet} onClose={() => setShowPayAccountSheet(false)} title="Pay from" maxWidth="360px" opaque forceDialog zIndexBase={10010}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {banks.map(b => {
                            const active = payForm.bank_account_id === String(b.id);
                            return (
                                <button key={b.id} type="button" onClick={() => { setPayForm(f => ({ ...f, bank_account_id: String(b.id) })); setShowPayAccountSheet(false); }}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', border: 'none', background: active ? 'var(--accent-subtle)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-primary)', textAlign: 'left' }}>
                                    {b.name}
                                    {active && <Check size={16} />}
                                </button>
                            );
                        })}
                    </div>
                </Modal>
            )}

            {/* Wallet Modal */}
            {showWalletModal && mounted && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowWalletModal(false)}>
                    <div className="glass-surface glass-sheet" style={{ borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', animation: 'springIn 380ms cubic-bezier(0.34,1.56,0.64,1) both', zIndex: 10000 }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{editingWallet ? 'Edit Wallet' : 'Add Wallet'}</span>
                            <button type="button" style={{ background: 'var(--glass-fill-2)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: '50%', display: 'flex' }} onClick={() => setShowWalletModal(false)}><X size={16} /></button>
                        </div>
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={labelSt}>Emoji</label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                                    {WALLET_EMOJIS.map(em => (
                                        <button type="button" key={em} onClick={() => setWalletForm(f => ({ ...f, emoji: em }))} style={{ fontSize: 22, background: walletForm.emoji === em ? 'var(--accent-subtle)' : 'transparent', border: `2px solid ${walletForm.emoji === em ? 'var(--accent)' : 'transparent'}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>
                                            {em}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div><label style={labelSt}>Wallet Name *</label><input style={inputSt} value={walletForm.name} onChange={e => setWalletForm(f => ({ ...f, name: e.target.value }))} placeholder="PhonePe, Paytm, Cash…" /></div>
                            <div><label style={labelSt}>Balance (₹)</label><input style={{ ...inputSt, fontFamily: 'var(--font-mono)' }} type="number" value={walletForm.balance} onChange={e => setWalletForm(f => ({ ...f, balance: e.target.value }))} placeholder="0" /></div>
                        </div>
                        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
                            <button type="button" onClick={() => setShowWalletModal(false)} className="glass-field" style={{ flex: 1, padding: 10, borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button type="button" onClick={saveWallet} disabled={saving || !walletForm.name.trim()} style={{ flex: 2, padding: 10, background: saving || !walletForm.name.trim() ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
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
                    <div onClick={() => setDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }} />
                    <div className="glass-surface glass-sheet" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', borderRadius: 'var(--radius-xl)', padding: 28, zIndex: 10000, width: 340, maxWidth: '90vw' }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)' }}>Delete {deleteConfirm.name}?</p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>This action cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button type="button" onClick={() => setDeleteConfirm(null)} className="glass-field" style={{ flex: 1, borderRadius: 10, padding: 10, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
                            <button type="button" onClick={executeDelete} style={{ flex: 1, background: 'var(--color-exp)', border: 'none', borderRadius: 10, padding: 10, fontSize: 14, fontWeight: 600, color: 'white', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Delete</button>
                        </div>
                    </div>
                </>,
                document.body
            )}

        </>
    );
}
