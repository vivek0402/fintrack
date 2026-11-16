'use client';

import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, ChevronDown, Check, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CardHeader, TextAction, Rows, Stat, TONE_TEXT, type Tone } from '@/components/ui/CardParts';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { useAuthStore } from '@/store/authStore';
import { accountsAPI, creditCardsAPI, walletsAPI } from '@/lib/api';
import { toast } from '@/store/toastStore';
import { type, truncate } from '@/lib/typography';
import { cardUsedPct, totalUsedPct, nextCardBill, sortCardsByDue, daysUntilDue, statementAmountOwed } from '@/lib/accounts';
import { CountUp } from '@/components/ui/CountUp';
import { useQueryClient } from '@tanstack/react-query';
import { useUserQuery } from '@/hooks/queries';
import { fmt as fmtBase, formatDate } from '@/lib/utils';
import { cycleSuggestedAmount, defaultPayCycleIdx, payCycleRow, OLDER_STATEMENTS_NOTE, type PayCycle, type StatusTone, olderUnpaidShares, pastPaymentDate, OLDER_UNPAID_NOTE, unpaidStatementIdxs, statementPaymentWindow, closeDateOf } from '@/lib/cardStatement';
import { getNotPaid, setNotPaid as saveNotPaid } from '@/lib/cardNotPaid';
import { CardUnpaidNote } from '@/components/accounts/CardUnpaidNote';

const inr = (n: number) => n.toLocaleString('en-IN');

// A bank debit that looks like a card bill payment (GET /:id/payment-candidates).
// account_name is null for an imported debit with no bank account set.
interface PaymentCandidate { id: string; amount: number; date: string; description: string; account_name: string | null; score: number; reason: string }
const candidateFrom = (c: PaymentCandidate) => c.account_name ?? 'your bank (imported)';
// What Undo needs to reverse one recorded payment.
interface RecordedPayment { cardTxId: string; unlinkId?: string }
// Pre-select a found debit when it has the same amount AND card wording
// (score >= 4); "Record all" links without asking only on the strongest
// (same amount + this card named, 5). See backend utils/cardPaymentMatch.js.
const LINK_DEFAULT_SCORE = 4;
const LINK_AUTO_SCORE = 5;
const NO_BANKS: never[] = [];
const NO_CARDS: never[] = [];
const NO_WALLETS: never[] = [];

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
    // What the last statement actually billed (statement_balance minus
    // blocked EMI principal), bill payments recorded since it closed, and
    // max(0, due - paid). Null when billing_date isn't set.
    statement_amount_due?: number | null;
    statement_paid?: number | null;
    statement_remaining?: number | null;
}
interface Wallet { id: number; name: string; emoji: string; balance: number; }
type Cycle = PayCycle;

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

// ── Shared modal style helpers ────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
    ...type.body, width: '100%', height: 40, background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius-md)', padding: '0 12px', color: 'var(--text-primary)',
    outline: 'none', boxSizing: 'border-box',
};
const numInputSt: React.CSSProperties = { ...inputSt, ...type.num };
const labelSt: React.CSSProperties = { ...type.label, display: 'block', marginBottom: 6 };
// An inset panel inside a row: actions or a delete confirm.
const inset: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px var(--space-4)', padding: '6px var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)' };

// ── Pay Bill modal style helpers ────────────────────────────────────────────
const triggerSt: React.CSSProperties = {
    width: '100%', background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius-md)', padding: '11px 13px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: 8, cursor: 'pointer', boxSizing: 'border-box',
};
const tileSt: React.CSSProperties = {
    flex: 1, background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius-md)', padding: '10px 12px',
};
const tileKeySt: React.CSSProperties = { ...type.label, marginBottom: 4 };
const tileValSt: React.CSSProperties = { ...type.num };
const tileDueSt: React.CSSProperties = { ...type.meta, marginTop: 2 };
// Status colours in dialogs use the text-safe variants of the tones.
const CYCLE_TONE_TEXT: Record<StatusTone, string> = { warn: 'var(--color-warn-text)', inc: 'var(--color-inc-text)', muted: 'var(--text-muted)' };
function cycleAmountTone(total: number): StatusTone { return total > 0 ? 'warn' : total < 0 ? 'inc' : 'muted'; }
function fmtCycleAmount(total: number | null) { return total == null ? '—' : `${total < 0 ? '−' : ''}${fmt(total)}`; }
// A picker row: the open one sits on glass-fill-3, never an accent fill.
const sheetRowSt = (active: boolean): React.CSSProperties => ({
    ...(active ? type.bodyStrong : type.body), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 9, width: '100%', padding: '12px 14px',
    borderRadius: 'var(--radius-md)', cursor: 'pointer', border: 'none', textAlign: 'left',
    background: active ? 'var(--glass-fill-3)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
});

// ── Credit card row helpers ───────────────────────────────────────────────────

// The due line under a card: the statement's own due date when there is one,
// else the next one worked out from the billing date.
function cardDueInfo(c: CreditCard, today: Date): { text: string; tone: Tone } | null {
    if (c.statement_due_date) {
        // Nothing left on the statement: say so, instead of reading its (past) due date as overdue.
        const owed = statementAmountOwed(c);
        if (owed !== null && owed <= 0) return { text: 'Statement paid', tone: 'good' };
        const days = daysUntilDue(c.statement_due_date, today);
        const date = formatDate(c.statement_due_date);
        if (days < 0) return { text: `Due ${date} · Overdue`, tone: 'bad' };
        if (days === 0) return { text: 'Due today', tone: 'caution' };
        return { text: `Due ${date} · in ${days} day${days === 1 ? '' : 's'}`, tone: days <= 7 ? 'caution' : 'neutral' };
    }
    const d = getDueDays(c.billing_date, c.due_days);
    if (d === null) return null;
    if (d === 0) return { text: 'Due today', tone: 'caution' };
    return { text: `Due in ${d} day${d === 1 ? '' : 's'}`, tone: d <= 7 ? 'caution' : 'neutral' };
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AccountsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    // Banks, cards and wallets from the shared cache: revisits show balances
    // at once and refresh in the background. Each list keeps its last value
    // if its own request fails, as before.
    const queryClient = useQueryClient();
    const accountsPageQuery = useUserQuery('accounts-page', [], async () => {
        const prev = queryClient.getQueryData<{ banks: BankAccount[]; cards: CreditCard[]; wallets: Wallet[] }>(['accounts-page', user?.id]);
        const [banksRes, cardsRes, walletsRes] = await Promise.allSettled([
            accountsAPI.getAll(), creditCardsAPI.getAll(), walletsAPI.getAll(),
        ]);
        return {
            banks:   banksRes.status   === 'fulfilled' ? banksRes.value.data.accounts as BankAccount[] : prev?.banks ?? [],
            cards:   cardsRes.status   === 'fulfilled' ? cardsRes.value.data.cards as CreditCard[]     : prev?.cards ?? [],
            wallets: walletsRes.status === 'fulfilled' ? walletsRes.value.data.wallets as Wallet[]     : prev?.wallets ?? [],
        };
    });
    const banks: BankAccount[] = accountsPageQuery.data?.banks ?? NO_BANKS;
    const cards: CreditCard[]  = accountsPageQuery.data?.cards ?? NO_CARDS;
    const wallets: Wallet[]    = accountsPageQuery.data?.wallets ?? NO_WALLETS;
    const [mounted, setMounted] = useState(false);
    const dataLoading = accountsPageQuery.isPending;

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
    // Recording a bill paid outside the app. payChoice: where the money came
    // from -- 'link:<txId>' (a bank debit already in the app, found by
    // matching), 'new' (record the bank side too) or 'card' (card side only).
    const [payChoice, setPayChoice] = useState<string>('new');
    const [payCandidates, setPayCandidates] = useState<PaymentCandidate[] | null>(null);
    // "Record all": the strong bank match found for each statement, if any.
    const [allMatches, setAllMatches] = useState<Record<number, PaymentCandidate | null>>({});
    // Statements the user said really weren't paid (per card, this device).
    const [notPaid, setNotPaid] = useState<Set<string>>(new Set());
    // Bumped when "not paid" changes, so the cards' unpaid notes re-read it.
    const [notPaidTick, setNotPaidTick] = useState(0);
    const selectedKeyRef = useRef<string | null>(null);
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
    const [showAddChooser, setShowAddChooser] = useState(false);
    // The one row whose actions are open: 'card-3', 'bank-1'.
    const [expandedKey, setExpandedKey] = useState<string | null>(null);

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    // Everything goes through the shared toast store. A message with an action
    // (Undo, Retry) becomes an undo-style toast with that action's button.
    const showToast = (msg: string, action?: { label: string; run: () => void }) => {
        if (action) toast.undo(msg, action.run, action.label);
        else if (/^(Failed|Could not)/i.test(msg)) toast.error(msg);
        else toast.success(msg);
    };

    // /accounts?review=<cardId> (from a card's Billing Cycles page): open Pay
    // Bill on that card's oldest unpaid statement once the cards are loaded.
    const reviewHandled = useRef(false);
    useEffect(() => {
        if (reviewHandled.current || dataLoading) return;
        const id = new URLSearchParams(window.location.search).get('review');
        if (!id) return;
        reviewHandled.current = true;
        const card = cards.find(c => String(c.id) === id);
        if (card) openPayCard(card, { review: true });
        window.history.replaceState(null, '', window.location.pathname);
    });

    // After a write: balances feed the dashboard, net worth, the transaction
    // form's pickers and more, so refresh every cached query. Awaited so the
    // success toast lands with the new numbers already on screen.
    const fetchAll = useCallback(async () => {
        await queryClient.invalidateQueries();
    }, [queryClient]);

    const totalBanks   = banks.reduce((s, b) => s + Number(b.current_balance), 0);
    const totalCards   = cards.reduce((s, c) => s + Number(c.current_outstanding_balance), 0);
    const totalWallets = wallets.reduce((s, w) => s + Number(w.balance), 0);
    const netWorth     = totalBanks + totalWallets - totalCards;
    const now          = new Date();
    const sortedCards  = sortCardsByDue(cards, now);
    const usedPct      = totalUsedPct(cards);
    const bill         = nextCardBill(cards, now);


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

    const openPayCard = (c: CreditCard, opts: { review?: boolean } = {}) => {
        setPayingCard(c);
        const today = new Date();
        setPayForm({ bank_account_id: banks.find(b => b.is_default)?.id ? String(banks.find(b => b.is_default)!.id) : (banks[0]?.id ? String(banks[0].id) : ''), amount: '', date: today.toISOString().split('T')[0], payment_method: 'UPI' });
        setPayCalMonth(today.getMonth());
        setPayCalYear(today.getFullYear());
        setPayCycles([]);
        setSelectedCycleKey(null);
        setPayChoice('new');
        setPayCandidates(null);
        setAllMatches({});
        setNotPaid(getNotPaid(c.id));
        setShowPayModal(true);
        // A card with no billing_date returns [] here (same short-circuit
        // GET /:id/cycles already documents) -- the Cycle field just doesn't
        // render in that case, falling back to a manually-typed amount.
        creditCardsAPI.getCycles(c.id).then(res => {
            const cycles: Cycle[] = res.data?.cycles || [];
            setPayCycles(cycles);
            // "Review" (from the card's unpaid note): open on the oldest
            // statement that looks unpaid.
            if (opts.review) {
                const oldest = unpaidStatementIdxs(cycles, getNotPaid(c.id))[0];
                if (oldest != null) { pickCycleIn(cycles, oldest, c); return; }
            }
            // Default to the most recent CLOSED cycle (index 1 -- index 0 is
            // always the still-open current one) when something is still
            // owed on that statement, pre-filling what's left to pay
            // (c.statement_remaining), not the cycle's net total. Falls back
            // to the current cycle otherwise. See lib/cardStatement.ts.
            const idx = defaultPayCycleIdx(cycles, c);
            const defaultCycle = cycles[idx];
            if (defaultCycle) {
                setSelectedCycleKey(defaultCycle.start);
                const amount = cycleSuggestedAmount(defaultCycle, idx, c);
                if (amount != null) setPayForm(f => ({ ...f, amount }));
            }
        }).catch(() => setPayCycles([]));
    };
    useEffect(() => { selectedKeyRef.current = selectedCycleKey; }, [selectedCycleKey]);
    const selectedCycle = payCycles.find(c => c.start === selectedCycleKey) || null;
    const selectedCycleIdx = payCycles.findIndex(c => c.start === selectedCycleKey);
    // Older statements that look unpaid (a bill paid outside the app and never
    // recorded): each one's own share, and their indexes oldest first --
    // minus any the user said really weren't paid.
    const unpaidShares = useMemo(() => olderUnpaidShares(payCycles), [payCycles]);
    const unpaidIdxs = useMemo(() => unpaidStatementIdxs(payCycles, notPaid), [payCycles, notPaid]);
    const unpaidTotal = Math.round(unpaidIdxs.reduce((s, i) => s + unpaidShares[i], 0) * 100) / 100;
    const RECORD_ALL = '__record-all__';
    const recordingAll = selectedCycleKey === RECORD_ALL;
    const recordingPast = recordingAll || selectedCycleIdx >= 2;
    const todayStr = () => new Date().toLocaleDateString('en-CA');

    // Look for the bank debit that paid an older statement.
    const findCandidates = async (card: CreditCard, cycle: Cycle, amount: number): Promise<PaymentCandidate[]> => {
        const { from, to, due } = statementPaymentWindow(cycle, card.due_days);
        if (from > to) return [];
        try {
            const res = await creditCardsAPI.paymentCandidates(card.id, { from, to, amount, due });
            return res.data?.candidates ?? [];
        } catch {
            return [];
        }
    };

    function pickCycleIn(cycles: Cycle[], idx: number, card: CreditCard | null) {
        const cycle = cycles[idx];
        setSelectedCycleKey(cycle.start);
        selectedKeyRef.current = cycle.start;
        const share = olderUnpaidShares(cycles)[idx];
        const amount = cycleSuggestedAmount(cycle, idx, card, share);
        // An older statement is recorded on its own due date, not today.
        const date = idx >= 2 && card ? pastPaymentDate(cycle, card.due_days) : todayStr();
        setPayForm(f => ({ ...f, ...(amount != null ? { amount } : {}), date }));
        setShowCycleSheet(false);
        setPayCandidates(null);
        setPayChoice('new');
        if (idx >= 2 && card && share > 0) {
            const forKey = cycle.start;
            findCandidates(card, cycle, share).then(found => {
                // Ignore a late answer for a statement no longer selected.
                if (selectedKeyRef.current !== forKey) return;
                setPayCandidates(found);
                if (found[0] && found[0].score >= LINK_DEFAULT_SCORE) setPayChoice(`link:${found[0].id}`);
            });
        }
    }
    const pickCycle = (cycle: Cycle, idx: number) => pickCycleIn(payCycles, idx, payingCard);
    const pickRecordAll = () => {
        setSelectedCycleKey(RECORD_ALL);
        setPayForm(f => ({ ...f, amount: String(unpaidTotal), date: todayStr() }));
        setShowCycleSheet(false);
        setPayChoice('new');
        setAllMatches({});
        if (!payingCard) return;
        const card = payingCard;
        // Only strong matches are linked automatically in "Record all": the
        // same amount AND the card in the description.
        Promise.all(unpaidIdxs.map(async idx => {
            const found = await findCandidates(card, payCycles[idx], unpaidShares[idx]);
            return [idx, found[0] && found[0].score >= LINK_AUTO_SCORE ? found[0] : null] as const;
        })).then(pairs => setAllMatches(Object.fromEntries(pairs)));
    };
    const toggleNotPaid = (cycle: Cycle) => {
        if (!payingCard) return;
        const close = closeDateOf(cycle);
        setNotPaid(saveNotPaid(payingCard.id, close, !notPaid.has(close)));
        setNotPaidTick(t => t + 1);
        if (cycle.start === selectedCycleKey) setSelectedCycleKey(null);
    };
    // One description per row -- amount, caption, status, selectable --
    // shared by the sheet rows and the Cycle trigger so they always agree.
    // idx 0 = current cycle (new charges), idx 1 = latest statement (what's
    // left on it), idx 2+ = older statements (pickable when they look
    // unpaid; see lib/cardStatement.ts). A statement the user marked "not
    // paid" reads as carried over and can't be picked.
    const cycleRow = (cycle: Cycle, idx: number) => {
        const row = payCycleRow(cycle, idx, payingCard, formatDate, fmt, unpaidShares[idx]);
        if (idx >= 2 && notPaid.has(closeDateOf(cycle)) && (unpaidShares[idx] ?? 0) > 0) {
            return { ...row, status: 'You said not paid · carried over', statusTone: 'muted' as const, selectable: false };
        }
        return row;
    };
    const selectedRow = recordingAll
        ? { amount: unpaidTotal, caption: 'their own shares', status: 'Paid outside the app', statusTone: 'inc' as const, selectable: true }
        : selectedCycle ? cycleRow(selectedCycle, selectedCycleIdx) : null;
    const selectedLabel = recordingAll ? `${unpaidIdxs.length} older statements` : selectedCycle?.label;

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
    const linkId = payChoice.startsWith('link:') ? payChoice.slice(5) : null;
    const cardOnly = recordingPast && payChoice === 'card';
    const needsBank = !cardOnly && !linkId;
    const payDisabled = saving || (needsBank && !payForm.bank_account_id) || !payForm.amount || parseFloat(payForm.amount) <= 0;

    // Record one payment and return what Undo needs to reverse it.
    const recordPayment = async (card: CreditCard, body: Parameters<typeof creditCardsAPI.payBill>[1]): Promise<RecordedPayment> => {
        const res = await creditCardsAPI.payBill(card.id, body);
        const legs: { id: string; credit_card_id?: number | null }[] = res.data?.transactions ?? [];
        const cardLeg = legs.find(t => t.credit_card_id != null) ?? legs[legs.length - 1];
        return { cardTxId: String(cardLeg?.id), unlinkId: res.data?.linked_transaction_id ? String(res.data.linked_transaction_id) : undefined };
    };

    const undoPayments = async (card: CreditCard, recorded: RecordedPayment[]) => {
        try {
            for (const r of [...recorded].reverse()) {
                await creditCardsAPI.undoPay(card.id, { card_transaction_id: r.cardTxId, ...(r.unlinkId ? { unlink_transaction_id: r.unlinkId } : {}) });
            }
            showToast('Undone');
        } catch {
            showToast('Could not undo. Check the card\'s history.');
        }
        await fetchAll();
    };

    // "Record all": one payment per statement, oldest first, each on its own
    // due date, so every statement in between clears in turn. Strong bank
    // matches are linked; the rest follow the chosen option. Stops at the
    // first failure and offers Retry for what's left.
    const recordStatements = async (card: CreditCard, idxs: number[], restChoice: string, matches: Record<number, PaymentCandidate | null>, already: RecordedPayment[] = []) => {
        const recorded = [...already];
        let failedAt = -1;
        for (let n = 0; n < idxs.length; n++) {
            const idx = idxs[n];
            const match = matches[idx];
            try {
                recorded.push(await recordPayment(card, match
                    ? { link_transaction_id: match.id, payment_method: payForm.payment_method }
                    : {
                        ...(restChoice === 'card' ? { card_only: true } : { bank_account_id: parseInt(payForm.bank_account_id) }),
                        amount: unpaidShares[idx], date: pastPaymentDate(payCycles[idx], card.due_days), payment_method: payForm.payment_method,
                    }));
            } catch {
                failedAt = n;
                break;
            }
        }
        await fetchAll();
        if (failedAt === -1) {
            showToast(`Recorded ${recorded.length} payment${recorded.length === 1 ? '' : 's'}`, { label: 'Undo', run: () => undoPayments(card, recorded) });
            return true;
        }
        const rest = idxs.slice(failedAt);
        showToast(`Recorded ${recorded.length - already.length} of ${idxs.length}. The rest didn't save.`, {
            label: 'Retry',
            run: () => { void recordStatements(card, rest, restChoice, matches, recorded); },
        });
        return false;
    };

    const savePay = async () => {
        if (!payingCard || payDisabled) return;
        const card = payingCard;
        setSaving(true);
        try {
            if (recordingAll) {
                await recordStatements(card, unpaidIdxs, payChoice, allMatches);
            } else {
                const recorded = await recordPayment(card, linkId
                    ? { link_transaction_id: linkId, payment_method: payForm.payment_method }
                    : {
                        ...(cardOnly ? { card_only: true } : { bank_account_id: parseInt(payForm.bank_account_id) }),
                        amount: parseFloat(payForm.amount), date: payForm.date, payment_method: payForm.payment_method,
                    });
                await fetchAll();
                showToast(recordingPast ? (linkId ? 'Linked and recorded as paid' : 'Recorded as paid') : 'Payment recorded',
                    { label: 'Undo', run: () => undoPayments(card, [recorded]) });
            }
            if (user) { localStorage.removeItem(`credit-utilization-cache-${user.id}`); localStorage.removeItem(`dti-cache-${user.id}`); }
            setShowPayModal(false);
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
    // Opens the inline confirm under the row; any open row actions fold away.
    const confirmDelete = (kind: 'bank' | 'card' | 'wallet', id: number, name: string) => { setExpandedKey(null); setDeleteConfirm({ type: kind, id, name }); };
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

    // Signing-in check still running: a skeleton, like every other page,
    // instead of a blank screen.
    if (isLoading) return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Skeleton height={180} borderRadius={24} />
            <Skeleton height={120} borderRadius={16} />
            <Skeleton height={120} borderRadius={16} />
        </div>
    );

    // ── Rows ─────────────────────────────────────────────────────────────────

    const rowSt: React.CSSProperties = { flexDirection: 'column', alignItems: 'stretch', gap: 10 };
    const colSt: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 };
    const spacer = <span style={{ flex: 1 }} />;
    const toggleRow = (key: string) => setExpandedKey(k => (k === key ? null : key));
    // A row's tappable top line: Enter / Space act on the line itself, never on
    // something inside it (an input, the balance button).
    const lineProps = (key: string | null, onActivate: () => void) => ({
        role: 'button' as const, tabIndex: 0, className: 'pressable',
        ...(key ? { 'aria-expanded': expandedKey === key } : {}),
        onClick: onActivate,
        onKeyDown: (e: React.KeyboardEvent) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); }
        },
    });
    const lineSt: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', cursor: 'pointer', borderRadius: 'var(--radius-md)', minWidth: 0 };

    // The inline delete confirm, under the row it belongs to.
    const renderDeleteConfirm = (kind: 'bank' | 'card' | 'wallet', id: number) => (
        deleteConfirm && deleteConfirm.type === kind && deleteConfirm.id === id ? (
            <div style={inset}>
                <span style={{ ...type.meta, flex: '1 1 160px', color: 'var(--text-primary)' }}>Delete {deleteConfirm.name}?</span>
                <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <TextAction tone="danger" onClick={executeDelete}>Delete</TextAction>
                    <TextAction quiet onClick={() => setDeleteConfirm(null)}>Keep it</TextAction>
                </span>
            </div>
        ) : null
    );

    const renderCardRow = (c: CreditCard) => {
        const key = `card-${c.id}`;
        const open = expandedKey === key;
        const utilPct = cardUsedPct(c);
        const due = cardDueInfo(c, now);
        const meta = [c.last_four ? `••${c.last_four}` : null, `limit ${fmt(c.credit_limit)}`, `${utilPct}% used`].filter(Boolean).join(' · ');
        const charges = c.new_charges_since_statement ?? 0;
        const confirming = deleteConfirm?.type === 'card' && deleteConfirm.id === c.id;
        return (
            <div key={c.id} style={rowSt}>
                <div {...lineProps(key, () => toggleRow(key))} style={lineSt}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{c.bank_name} {c.card_name}</p>
                        <p style={{ ...type.numSmall, ...truncate, margin: 0 }}>{meta}</p>
                        {due && <p style={{ ...type.meta, margin: 0, color: TONE_TEXT[due.tone] }}>{due.text}</p>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ ...type.num, margin: 0 }}>{fmt(c.current_outstanding_balance)}</p>
                        <p style={{ ...type.meta, margin: 0 }}>owed</p>
                    </div>
                </div>
                <ProgressBar pct={utilPct} height={4} color={utilPct > 30 ? 'var(--color-warn)' : 'var(--text-secondary)'} />
                {c.statement_balance != null ? (
                    <p style={{ ...type.numSmall, margin: 0 }}>
                        Statement {fmt(c.statement_amount_due ?? c.statement_balance)}{c.statement_due_date ? ` due ${formatDate(c.statement_due_date)}` : ''} · new charges {charges >= 0 ? '+' : '−'}{fmt(charges)} · {fmt(Math.max(0, c.credit_limit - c.current_outstanding_balance))} available
                    </p>
                ) : (
                    <p style={{ ...type.meta, margin: 0 }}>Set a billing date to see the statement and new charges</p>
                )}
                {c.statement_balance != null && (
                    <CardUnpaidNote cardId={c.id} notPaidTick={notPaidTick} onReview={() => openPayCard(c, { review: true })} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                    <TextAction onClick={() => openPayCard(c)}>Pay bill</TextAction>
                </div>
                {open && !confirming && (
                    <div style={inset}>
                        <TextAction onClick={() => router.push(`/transactions?credit_card_id=${c.id}`)}>History</TextAction>
                        {c.statement_balance != null && (
                            <TextAction onClick={() => router.push(`/accounts/credit-cards/cycles?id=${c.id}`)}>Cycles</TextAction>
                        )}
                        <TextAction onClick={() => openEditCard(c)}>Edit details</TextAction>
                        {spacer}
                        <TextAction tone="danger" onClick={() => confirmDelete('card', c.id, `${c.bank_name} ${c.card_name}`)}>Delete card</TextAction>
                    </div>
                )}
                {renderDeleteConfirm('card', c.id)}
            </div>
        );
    };

    const renderBankRow = (b: BankAccount) => {
        const key = `bank-${b.id}`;
        const open = expandedKey === key;
        const meta = [b.account_type || 'Savings', b.last_four ? `••${b.last_four}` : null, b.is_default ? 'Default' : null].filter(Boolean).join(' · ');
        const confirming = deleteConfirm?.type === 'bank' && deleteConfirm.id === b.id;
        return (
            <div key={b.id} style={rowSt}>
                <div {...lineProps(key, () => toggleRow(key))} style={{ ...lineSt, alignItems: 'center' }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: b.color || 'var(--accent)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{b.name}</p>
                        <p style={{ ...type.numSmall, ...truncate, margin: 0 }}>{meta}</p>
                    </div>
                    <p style={{ ...type.num, margin: 0, flexShrink: 0 }}>{fmt(b.current_balance)}</p>
                </div>
                {open && !confirming && (
                    <div style={inset}>
                        <TextAction onClick={() => router.push('/transactions')}>History</TextAction>
                        <TextAction onClick={() => openEditBank(b)}>Edit details</TextAction>
                        {!b.is_default && <TextAction onClick={() => handleSetDefault(b.id)}>Make default</TextAction>}
                        {spacer}
                        <TextAction tone="danger" onClick={() => confirmDelete('bank', b.id, b.name)}>Delete account</TextAction>
                    </div>
                )}
                {renderDeleteConfirm('bank', b.id)}
            </div>
        );
    };

    const renderWalletRow = (w: Wallet) => {
        const editingBalance = editingWalletBalanceId === w.id;
        return (
            <div key={w.id} style={rowSt}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                    <div {...lineProps(null, () => openEditWallet(w))} style={{ ...lineSt, alignItems: 'center', flex: 1 }}>
                        <span aria-hidden="true" style={{ width: 32, height: 32, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)', fontSize: 'var(--text-title)' }}>{w.emoji}</span>
                        <p style={{ ...type.bodyStrong, ...truncate, flex: 1, minWidth: 0, margin: 0 }}>{w.name}</p>
                        {editingBalance ? (
                            <input autoFocus type="number" aria-label={`${w.name} balance`} value={walletBalanceInput}
                                onChange={e => setWalletBalanceInput(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                onBlur={() => saveWalletBalance(w)}
                                onKeyDown={e => { if (e.key === 'Enter') saveWalletBalance(w); if (e.key === 'Escape') setEditingWalletBalanceId(null); }}
                                style={{ ...type.num, width: 120, flexShrink: 0, padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-visible)', background: 'var(--glass-fill-1)', outline: 'none', boxSizing: 'border-box' }}
                            />
                        ) : (
                            <button type="button" title="Tap to edit" onClick={e => { e.stopPropagation(); startWalletBalanceEdit(w); }}
                                style={{ ...type.num, flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                                {fmt(w.balance)}
                            </button>
                        )}
                    </div>
                    <button type="button" className="fin-icon-btn fin-row-hover-action" aria-label={`Delete ${w.name}`}
                        onClick={() => confirmDelete('wallet', w.id, w.name)}>
                        <Trash2 size={14} />
                    </button>
                </div>
                {renderDeleteConfirm('wallet', w.id)}
            </div>
        );
    };

    const skeletonRows = (
        <Rows>
            {[1, 2].map(i => (
                <div key={i}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <Skeleton width="120px" height={14} borderRadius={4} />
                        <Skeleton width="80px" height={11} borderRadius={4} />
                    </div>
                    <Skeleton width={80} height={18} borderRadius={4} />
                </div>
            ))}
        </Rows>
    );

    const addOptions = [
        { label: 'Bank account', hint: 'Balances and your default account', open: openAddBank },
        { label: 'Credit card',  hint: 'Limit, billing date and bills',     open: openAddCard },
        { label: 'Wallet',       hint: 'UPI apps, cash or prepaid balances', open: openAddWallet },
    ];

    const closeBank   = () => setShowBankModal(false);
    const closeCard   = () => setShowCardModal(false);
    const closeWallet = () => setShowWalletModal(false);
    const footerSt: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
    const pairSt: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── PAGE HEADER: title, then the page's actions ── */}
                <div className="fin-page-head">
                    <div style={{ minWidth: 0 }}>
                        <p style={{ ...type.meta, margin: 0 }}>
                            {plural(banks.length, 'bank account')} · {plural(cards.length, 'card')} · {plural(wallets.length, 'wallet')}
                        </p>
                        <h1 style={{ ...type.heading, margin: 0 }}>Accounts</h1>
                    </div>
                    <div className="fin-page-actions">
                        <Button onClick={() => setShowAddChooser(true)}>Add account</Button>
                    </div>
                </div>

                {/* ── NET WORTH: every total in one card ── */}
                {dataLoading ? <SkeletonCard height={190} /> : (
                    <Card>
                        <p style={{ ...type.label, margin: 0 }}>Net worth</p>
                        <p className="type-display" style={{ ...type.display, margin: '6px 0 0', color: netWorth < 0 ? 'var(--color-exp-text)' : 'var(--text-primary)' }}>
                            {netWorth < 0 ? '−' : ''}₹<CountUp value={Math.abs(netWorth)} duration={1000} enabled={mounted} format={inr} />
                        </p>
                        <div className="dash-stats">
                            <Stat className="dash-stat" label="In banks" value={fmt(totalBanks)} sub={plural(banks.length, 'account')} />
                            <Stat className="dash-stat" label="Owed on cards" value={fmt(totalCards)}
                                sub={usedPct != null ? `${usedPct}% of your limits` : cards.length === 0 ? 'No cards' : '—'} />
                            <Stat className="dash-stat" label="In wallets" value={fmt(totalWallets)} sub={plural(wallets.length, 'wallet')} />
                            <Stat className="dash-stat" label="Next card bill" value={bill ? fmt(bill.amount) : '—'}
                                sub={bill ? (bill.days < 0 ? `${bill.cardName}, overdue` : `${bill.cardName}, due ${formatDate(bill.dueDate)}`) : 'No bill due'}
                                subTone={bill ? (bill.days < 0 ? 'bad' : bill.days <= 7 ? 'caution' : 'neutral') : 'neutral'} />
                        </div>
                    </Card>
                )}

                <div className="fin-two">
                    <div style={colSt}>
                        {/* ── CREDIT CARDS, soonest bill first ── */}
                        <Card>
                            <CardHeader title="Credit cards" sub={cards.length >= 2 ? 'Soonest bill first' : 'Bills and limits'}
                                action={<TextAction onClick={openAddCard}>Add card</TextAction>} />
                            {dataLoading ? skeletonRows : cards.length === 0 ? (
                                <p style={{ ...type.body, margin: 0 }}>No cards yet. Add one to track balances and due dates.</p>
                            ) : (
                                <Rows>{sortedCards.map(renderCardRow)}</Rows>
                            )}
                        </Card>

                        {/* ── BANK ACCOUNTS ── */}
                        <Card>
                            <CardHeader title="Bank accounts" sub={dataLoading ? undefined : `${fmt(totalBanks)} across ${plural(banks.length, 'account')}`}
                                action={<TextAction onClick={openAddBank}>Add account</TextAction>} />
                            {dataLoading ? skeletonRows : banks.length === 0 ? (
                                <p style={{ ...type.body, margin: 0 }}>No bank accounts yet. Add one to start tracking balances.</p>
                            ) : (
                                <Rows>{banks.map(renderBankRow)}</Rows>
                            )}
                        </Card>
                    </div>

                    <div style={colSt}>
                        {/* ── WALLETS & UPI ── */}
                        <Card>
                            <CardHeader title="Wallets and UPI" sub={dataLoading ? undefined : `${fmt(totalWallets)} in ${plural(wallets.length, 'wallet')}`}
                                action={<TextAction onClick={openAddWallet}>Add wallet</TextAction>} />
                            {dataLoading ? skeletonRows : wallets.length === 0 ? (
                                <p style={{ ...type.body, margin: 0 }}>No wallets yet. Add one to track UPI apps, cash or prepaid balances.</p>
                            ) : (
                                <Rows>{wallets.map(renderWalletRow)}</Rows>
                            )}
                        </Card>
                    </div>
                </div>

            </div>

            {/* ═══ DIALOGS ═══ */}

            {/* Add chooser */}
            <Modal isOpen={showAddChooser} onClose={() => setShowAddChooser(false)} title="Add account" maxWidth="360px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {addOptions.map(o => (
                        <button key={o.label} type="button" className="pressable" onClick={() => { setShowAddChooser(false); o.open(); }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', width: '100%', padding: 'var(--space-3)', background: 'var(--glass-fill-1)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left' }}>
                            <span style={{ ...type.bodyStrong, flexShrink: 0 }}>{o.label}</span>
                            <span style={{ ...type.meta, ...truncate, minWidth: 0, textAlign: 'right' }}>{o.hint}</span>
                        </button>
                    ))}
                </div>
            </Modal>

            {/* Bank account dialog */}
            <Modal isOpen={showBankModal} onClose={closeBank} title={editingBank ? 'Edit bank account' : 'Add bank account'} maxWidth="440px"
                footer={
                    <div style={footerSt}>
                        <Button type="button" variant="secondary" onClick={closeBank}>Cancel</Button>
                        <Button type="submit" form="bank-form" disabled={saving || !bankForm.name.trim()}>
                            {saving ? 'Saving…' : editingBank ? 'Save changes' : 'Add account'}
                        </Button>
                    </div>
                }>
                <form id="bank-form" onSubmit={e => { e.preventDefault(); saveBank(); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div><label style={labelSt}>Name</label><input style={inputSt} value={bankForm.name} onChange={e => setBankForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. HDFC Savings" /></div>
                    <div><label style={labelSt}>Account type</label><select style={inputSt} value={bankForm.account_type} onChange={e => setBankForm(f => ({ ...f, account_type: e.target.value }))}>{ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div><label style={labelSt}>Last 4 digits (optional)</label><input style={inputSt} value={bankForm.last_four} maxLength={4} placeholder="1234" onChange={e => setBankForm(f => ({ ...f, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) }))} /></div>
                    <div><label style={labelSt}>Current balance</label><input style={numInputSt} type="number" value={bankForm.starting_balance} onChange={e => setBankForm(f => ({ ...f, starting_balance: e.target.value }))} placeholder="0" /></div>
                    <div><label style={labelSt}>Balance as of (optional)</label><input style={inputSt} type="date" value={bankForm.balance_as_of} onChange={e => setBankForm(f => ({ ...f, balance_as_of: e.target.value }))} /></div>
                </form>
            </Modal>

            {/* Credit card dialog */}
            <Modal isOpen={showCardModal} onClose={closeCard} title={editingCard ? 'Edit credit card' : 'Add credit card'} maxWidth="440px"
                footer={
                    <div style={footerSt}>
                        <Button type="button" variant="secondary" onClick={closeCard}>Cancel</Button>
                        <Button type="submit" form="card-form" disabled={saving || !cardForm.bank_name.trim() || !cardForm.card_name.trim()}>
                            {saving ? 'Saving…' : editingCard ? 'Save changes' : 'Add card'}
                        </Button>
                    </div>
                }>
                <form id="card-form" onSubmit={e => { e.preventDefault(); saveCard(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={pairSt}>
                        <div><label style={labelSt}>Bank name</label><input style={inputSt} value={cardForm.bank_name} onChange={e => setCardForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="HDFC" /></div>
                        <div><label style={labelSt}>Card name</label><input style={inputSt} value={cardForm.card_name} onChange={e => setCardForm(f => ({ ...f, card_name: e.target.value }))} placeholder="Millennia" /></div>
                    </div>
                    <div style={pairSt}>
                        <div><label style={labelSt}>Last 4 digits</label><input style={inputSt} value={cardForm.last_four} maxLength={4} placeholder="5678" onChange={e => setCardForm(f => ({ ...f, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) }))} /></div>
                        <div><label style={labelSt}>Network</label><select style={inputSt} value={cardForm.network} onChange={e => setCardForm(f => ({ ...f, network: e.target.value }))}>{NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                    </div>
                    <div style={pairSt}>
                        <div><label style={labelSt}>Credit limit</label><input style={numInputSt} type="number" value={cardForm.credit_limit} onChange={e => setCardForm(f => ({ ...f, credit_limit: e.target.value }))} placeholder="100000" /></div>
                        <div><label style={labelSt}>Outstanding</label><input style={numInputSt} type="number" value={cardForm.outstanding_balance} onChange={e => setCardForm(f => ({ ...f, outstanding_balance: e.target.value }))} placeholder="0" /></div>
                    </div>
                    <div><label style={labelSt}>Balance as of (optional)</label><input style={inputSt} type="date" value={cardForm.balance_as_of} onChange={e => setCardForm(f => ({ ...f, balance_as_of: e.target.value }))} /></div>
                    <div style={pairSt}>
                        <div><label style={labelSt}>Billing date (1 to 28)</label><input style={numInputSt} type="number" min={1} max={28} value={cardForm.billing_date} onChange={e => setCardForm(f => ({ ...f, billing_date: e.target.value }))} placeholder="5" /></div>
                        <div><label style={labelSt}>Due days after billing</label><input style={numInputSt} type="number" value={cardForm.due_days} onChange={e => setCardForm(f => ({ ...f, due_days: e.target.value }))} placeholder="20" /></div>
                    </div>
                    <div style={pairSt}>
                        <div><label style={labelSt}>Interest rate (APR, %)</label><input style={numInputSt} type="number" step="0.1" value={cardForm.interest_rate_pct} onChange={e => setCardForm(f => ({ ...f, interest_rate_pct: e.target.value }))} placeholder="42" /></div>
                        <div />
                    </div>
                    <div>
                        <label style={labelSt}>Colour</label>
                        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                            {CARD_COLORS.map(col => (
                                <button type="button" key={col} aria-label={`Colour ${col}`} aria-pressed={cardForm.color === col} onClick={() => setCardForm(f => ({ ...f, color: col }))}
                                    style={{ width: 28, height: 28, borderRadius: '50%', background: col, border: cardForm.color === col ? '2px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer' }} />
                            ))}
                        </div>
                    </div>
                </form>
            </Modal>

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
                        <Button type="button" onClick={savePay} disabled={payDisabled} style={{ width: '100%', height: 48 }}>
                            {saving ? 'Recording…'
                                : linkId ? 'Link and record as paid'
                                : recordingPast ? `Record${payForm.amount ? ` ₹${Number(payForm.amount).toLocaleString('en-IN')}` : ''} as paid`
                                : `Pay${payForm.amount ? ` ₹${Number(payForm.amount).toLocaleString('en-IN')}` : ''}`}
                        </Button>
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
                                    <div style={tileValSt}>{fmt(payingCard.statement_amount_due ?? payingCard.statement_balance)}</div>
                                    {payingCard.statement_due_date && <div style={tileDueSt}>due {formatDate(payingCard.statement_due_date)}</div>}
                                </div>
                            )}
                        </div>

                        {/* Old statements that look unpaid: probably paid outside the app
                            and never recorded, which inflates every figure after them. */}
                        {unpaidIdxs.length > 0 && !recordingPast && (
                            <button type="button" data-testid="unpaid-nudge" onClick={() => pickCycle(payCycles[unpaidIdxs[0]], unpaidIdxs[0])}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', padding: '11px 12px', borderRadius: 'var(--radius-md)', textAlign: 'left', cursor: 'pointer',
                                    background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)' }}>
                                <AlertTriangle size={16} color="var(--color-warn-text)" style={{ flexShrink: 0, marginTop: 1 }} />
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ ...type.bodyStrong, display: 'block' }}>
                                        {unpaidIdxs.length} older statement{unpaidIdxs.length > 1 ? 's look' : ' looks'} unpaid
                                    </span>
                                    <span style={{ ...type.meta, display: 'block' }}>
                                        Paid {unpaidIdxs.length > 1 ? 'them' : 'it'} outside the app? Record {unpaidIdxs.length > 1 ? 'them' : 'it'} so your balance is right.
                                    </span>
                                </span>
                                <span style={{ ...type.label, color: 'var(--color-warn-text)', alignSelf: 'center', whiteSpace: 'nowrap' }}>Review ›</span>
                            </button>
                        )}

                        {payCycles.length > 0 && (
                            <div>
                                <label style={labelSt}>Cycle</label>
                                <div onClick={() => setShowCycleSheet(true)} style={triggerSt}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ ...type.bodyStrong, ...truncate }}>
                                            {selectedLabel || 'Select a cycle'}
                                        </div>
                                        {selectedRow && <div style={{ ...type.meta, color: CYCLE_TONE_TEXT[selectedRow.statusTone], marginTop: 2 }}>{selectedRow.status}</div>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                        {selectedRow && (
                                            <div data-testid="cycle-trigger-amount" style={{ textAlign: 'right' }}>
                                                <div style={{ ...type.num, color: CYCLE_TONE_TEXT[cycleAmountTone(selectedRow.amount ?? 0)] }}>{fmtCycleAmount(selectedRow.amount)}</div>
                                                <div style={{ ...type.meta, marginTop: 1 }}>{selectedRow.caption}</div>
                                            </div>
                                        )}
                                        <ChevronDown size={14} color="var(--text-muted)" />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label style={labelSt}>Pay by</label>
                                <div onClick={() => setShowPayMethodSheet(true)} style={triggerSt}>
                                    <span style={{ ...type.body, color: 'var(--text-primary)', ...truncate }}>
                                        {PAY_METHOD_ICONS[payForm.payment_method]} {payForm.payment_method}
                                    </span>
                                    <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                </div>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label style={labelSt}>Date</label>
                                <div onClick={() => setShowPayDateSheet(true)} style={triggerSt}>
                                    <span style={{ ...type.body, color: 'var(--text-primary)', ...truncate }}>{recordingAll ? 'Each on its due date' : payDateLabel}</span>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--text-muted)', flexShrink: 0 }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label style={labelSt}>Amount</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ ...type.figure, color: 'var(--text-secondary)', position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }}>₹</span>
                                <input type="number" min="0.01" step="any" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0"
                                    style={{ ...type.figure, width: '100%', padding: '14px 16px 14px 36px', background: 'var(--glass-fill-1)', border: '1px solid var(--border-visible)', borderRadius: 'var(--radius-md)', boxSizing: 'border-box' }} />
                            </div>
                            {(cardOnly || linkId) && (
                                <div style={{ ...type.meta, paddingTop: 6 }}>
                                    {linkId ? 'Uses the linked bank debit\'s amount and date.' : 'Card side only. Your bank balance in the app won\'t change.'}
                                </div>
                            )}
                            {needsBank && banks.length > 0 && (
                                <div style={{ ...type.meta, display: 'flex', alignItems: 'center', gap: 6, paddingTop: 6 }}>
                                    from <span style={{ ...type.label, color: 'var(--text-primary)' }}>{banks.find(b => String(b.id) === payForm.bank_account_id)?.name || 'account'}</span>
                                    {banks.length > 1 && (
                                        <>
                                            <span style={{ color: 'var(--border-visible)' }}>·</span>
                                            <button type="button" className="fin-link" onClick={() => setShowPayAccountSheet(true)} style={{ padding: 0 }}>change</button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        {recordingPast && (
                            <>
                                {(() => {
                                    const bankName = banks.find(b => String(b.id) === payForm.bank_account_id)?.name || 'your bank account';
                                    const option = (value: string, title: React.ReactNode, desc: React.ReactNode, testId: string) => {
                                        const on = payChoice === value;
                                        return (
                                            <button key={value} type="button" role="radio" aria-checked={on} data-testid={testId} onClick={() => setPayChoice(value)}
                                                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', textAlign: 'left', cursor: 'pointer',
                                                    background: on ? 'var(--glass-fill-3)' : 'var(--glass-fill-1)',
                                                    border: '1px solid var(--glass-border)' }}>
                                                <span aria-hidden style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 2, display: 'grid', placeItems: 'center',
                                                    border: `2px solid ${on ? 'var(--accent)' : 'var(--text-muted)'}` }}>
                                                    {on && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
                                                </span>
                                                <span style={{ minWidth: 0 }}>
                                                    <span style={{ ...type.bodyStrong, display: 'block' }}>{title}</span>
                                                    <span style={{ ...type.meta, display: 'block' }}>{desc}</span>
                                                </span>
                                            </button>
                                        );
                                    };
                                    if (recordingAll) {
                                        const found = unpaidIdxs.filter(i => allMatches[i]);
                                        const rest = unpaidIdxs.length - found.length;
                                        return (
                                            <div role="radiogroup" aria-label="Where the money came from" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {found.length > 0 && (
                                                    <div data-testid="record-all-found" style={{ ...type.meta, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)' }}>
                                                        <span style={{ ...type.label, color: 'var(--text-primary)' }}>Found the bank payment for {found.length} of {unpaidIdxs.length}.</span> {found.length > 1 ? 'They' : 'It'} will be linked, not added again:
                                                        {found.map(i => (
                                                            <div key={i} style={{ ...type.numSmall, marginTop: 3 }}>
                                                                {fmt(allMatches[i]!.amount)} · {candidateFrom(allMatches[i]!)} · {formatDate(String(allMatches[i]!.date))}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {rest > 0 && (
                                                    <>
                                                        <span style={{ ...type.bodyStrong }}>
                                                            {found.length ? `The other ${rest}:` : 'Where did the money come from?'}
                                                        </span>
                                                        {option('new', `Add as new payments from ${bankName}`, 'Records the bank side too.', 'choice-new')}
                                                        {option('card', 'Card side only', "They're in my bank account in the app already.", 'choice-card')}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    }
                                    return (
                                        <div role="radiogroup" aria-label="Where the money came from" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <span style={{ ...type.bodyStrong }}>
                                                {payCandidates === null ? 'Looking for the bank payment…'
                                                    : payCandidates.length ? 'We found what looks like this payment' : 'Where did the money come from?'}
                                            </span>
                                            {(payCandidates ?? []).map((c, n) => option(`link:${c.id}`,
                                                <>{fmt(c.amount)} from {candidateFrom(c)}{n === 0 && c.score >= LINK_DEFAULT_SCORE && (
                                                    <span style={{ ...type.label, marginLeft: 6, color: 'var(--color-inc-text)' }}>Best match</span>
                                                )}</>,
                                                <>{formatDate(String(c.date))} · &ldquo;{c.description}&rdquo;<br /><span style={{ ...type.numSmall, color: 'var(--text-muted)' }}>{c.reason}</span></>,
                                                `choice-link-${c.id}`))}
                                            {option('new', `Add it as a new payment from ${bankName}`,
                                                payCandidates?.length ? 'Only if the one above is something else.' : 'Records the bank side too.', 'choice-new')}
                                            {option('card', 'Card side only', "It's in my bank account in the app already, but not listed here.", 'choice-card')}
                                        </div>
                                    );
                                })()}
                                {(() => {
                                    const amt = parseFloat(payForm.amount) || 0;
                                    const due = Number(payingCard.statement_remaining ?? payingCard.statement_amount_due ?? 0);
                                    const out = Number(payingCard.current_outstanding_balance) || 0;
                                    return amt > 0 && (
                                        <div data-testid="pay-effect" style={{ ...type.meta, padding: '10px 12px', borderRadius: 'var(--radius-md)', display: 'grid', gap: 4, background: 'var(--glass-fill-1)' }}>
                                            <span style={{ ...type.label, color: 'var(--text-primary)' }}>Saving fixes:</span>
                                            {payingCard.statement_due_date && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                    <span>Latest statement due</span>
                                                    <span style={{ ...type.numSmall, color: 'var(--text-primary)' }}>{fmt(due)} → {fmt(Math.max(0, due - amt))}</span>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                <span>Outstanding</span>
                                                <span style={{ ...type.numSmall, color: 'var(--text-primary)' }}>{fmt(out)} → {fmt(out - amt)}</span>
                                            </div>
                                            {(linkId || (recordingAll && unpaidIdxs.some(i => allMatches[i]))) && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                    <span>Linked bank debit</span>
                                                    <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>Counted as a card payment, not spending</span>
                                                </div>
                                            )}
                                            {recordingAll && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                    <span>Payments recorded</span>
                                                    <span style={{ color: 'var(--text-primary)' }}>{unpaidIdxs.length}, one per statement</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </>
                        )}
                    </div>
                </Modal>
            )}

            {/* Cycle picker sheet */}
            {mounted && payingCard && payCycles.length > 0 && (
                <Modal isOpen={showCycleSheet} onClose={() => setShowCycleSheet(false)} title="Which cycle?" maxWidth="360px" opaque forceDialog zIndexBase={10010}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {payCycles.map((cycle, idx) => {
                            // Before the first older statement: one tap to record every
                            // unpaid one (one payment each, oldest first, on its due date).
                            const recordAll = idx === 2 && unpaidIdxs.length >= 2 ? (
                                <button key="record-all" type="button" data-testid="record-all" onClick={pickRecordAll}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, width: '100%', margin: '6px 0 4px', padding: '11px 14px',
                                        borderRadius: 'var(--radius-md)', textAlign: 'left', cursor: 'pointer',
                                        background: recordingAll ? 'var(--glass-fill-3)' : 'var(--glass-fill-1)',
                                        border: '1px dashed var(--border-visible)' }}>
                                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <span style={{ ...type.bodyStrong }}>Record all {unpaidIdxs.length} as paid</span>
                                        <span style={{ ...type.meta }}>One payment per statement, each on its due date</span>
                                    </span>
                                    <span style={{ ...type.num }}>{fmt(unpaidTotal)}</span>
                                </button>
                            ) : null;
                            // An older statement that billed nothing and saw no activity is just noise.
                            const skip = idx >= 2 && Number(cycle.statement_balance ?? 0) === 0 && Number(cycle.total) === 0;
                            const active = cycle.start === selectedCycleKey;
                            const row = cycleRow(cycle, idx);
                            const disabled = !row.selectable;
                            return (
                                <Fragment key={cycle.start}>
                                {recordAll}
                                {!skip && (
                                <button type="button" disabled={disabled} onClick={() => pickCycle(cycle, idx)}
                                    data-testid={`cycle-row-${idx}`}
                                    style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, width: '100%', padding: '11px 14px',
                                        borderRadius: 'var(--radius-md)', border: 'none', textAlign: 'left',
                                        background: active ? 'var(--glass-fill-3)' : 'transparent',
                                        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
                                    }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                                        <span style={{ ...type.bodyStrong }}>{cycle.label}</span>
                                        <span style={{ ...type.meta, color: disabled ? 'var(--text-muted)' : CYCLE_TONE_TEXT[row.statusTone] }}>{row.status}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                                        <span style={{ ...type.num, color: disabled ? 'var(--text-muted)' : CYCLE_TONE_TEXT[cycleAmountTone(row.amount ?? 0)] }}>{fmtCycleAmount(row.amount)}</span>
                                        <span style={{ ...type.meta }}>{row.caption}</span>
                                    </div>
                                </button>
                                )}
                                {!skip && idx >= 2 && (unpaidShares[idx] ?? 0) > 0 && (
                                    <button type="button" data-testid={`not-paid-${idx}`} onClick={() => toggleNotPaid(cycle)}
                                        style={{ ...type.meta, alignSelf: 'flex-start', margin: '-4px 0 6px 14px', padding: '4px 9px', borderRadius: 999, background: 'none', cursor: 'pointer',
                                            border: '1px solid var(--glass-border)' }}>
                                        {notPaid.has(closeDateOf(cycle)) ? 'Ask me again' : 'Not paid'}
                                    </button>
                                )}
                                </Fragment>
                            );
                        })}
                        {payCycles.length > 2 && (
                            <p style={{ ...type.meta, margin: 0, padding: '10px 14px 2px', color: 'var(--text-muted)' }}>
                                {unpaidIdxs.length > 0 ? OLDER_UNPAID_NOTE : OLDER_STATEMENTS_NOTE}
                            </p>
                        )}
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
                                    style={sheetRowSt(active)}>
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
                                        style={{ ...type.label, padding: '7px 14px', borderRadius: 'var(--radius-full)', cursor: 'pointer', border: `1px solid ${active ? 'var(--border-visible)' : 'var(--border-subtle)'}`, background: active ? 'var(--glass-fill-3)' : 'var(--glass-fill-1)', color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                        {q.label}
                                    </button>
                                );
                            })}
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <button type="button" aria-label="Previous month" onClick={() => { let m = payCalMonth - 1, y = payCalYear; if (m < 0) { m = 11; y--; } setPayCalMonth(m); setPayCalYear(y); }}
                                    style={{ ...type.num, background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer', width: 34, height: 34, lineHeight: 1 }}>‹</button>
                                <span style={{ ...type.title }}>{MONTHS[payCalMonth]} {payCalYear}</span>
                                <button type="button" aria-label="Next month" onClick={() => { let m = payCalMonth + 1, y = payCalYear; if (m > 11) { m = 0; y++; } setPayCalMonth(m); setPayCalYear(y); }}
                                    style={{ ...type.num, background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer', width: 34, height: 34, lineHeight: 1 }}>›</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
                                {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (<div key={d} style={{ ...type.meta, textAlign: 'center', color: 'var(--text-muted)', padding: '4px 0' }}>{d}</div>))}
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
                                            style={{ ...type.num, width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', margin: '0 auto', backgroundColor: isSelected ? 'var(--glass-fill-3)' : 'transparent', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)', opacity: isOtherMonth && !isSelected ? 0.4 : 1, outline: (!isSelected && isToday) ? '2px solid var(--text-secondary)' : 'none', outlineOffset: '-2px' }}>
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
                                    style={sheetRowSt(active)}>
                                    {b.name}
                                    {active && <Check size={16} />}
                                </button>
                            );
                        })}
                    </div>
                </Modal>
            )}

            {/* Wallet dialog */}
            <Modal isOpen={showWalletModal} onClose={closeWallet} title={editingWallet ? 'Edit wallet' : 'Add wallet'} maxWidth="440px"
                footer={
                    <div style={footerSt}>
                        <Button type="button" variant="secondary" onClick={closeWallet}>Cancel</Button>
                        <Button type="submit" form="wallet-form" disabled={saving || !walletForm.name.trim()}>
                            {saving ? 'Saving…' : editingWallet ? 'Save changes' : 'Add wallet'}
                        </Button>
                    </div>
                }>
                <form id="wallet-form" onSubmit={e => { e.preventDefault(); saveWallet(); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <label style={labelSt}>Emoji</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                            {WALLET_EMOJIS.map(em => (
                                <button type="button" key={em} aria-pressed={walletForm.emoji === em} onClick={() => setWalletForm(f => ({ ...f, emoji: em }))}
                                    style={{ fontSize: 'var(--text-heading)', background: walletForm.emoji === em ? 'var(--glass-fill-3)' : 'transparent', border: `2px solid ${walletForm.emoji === em ? 'var(--text-primary)' : 'transparent'}`, borderRadius: 'var(--radius-md)', padding: '4px 8px', cursor: 'pointer' }}>
                                    {em}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div><label style={labelSt}>Wallet name</label><input style={inputSt} value={walletForm.name} onChange={e => setWalletForm(f => ({ ...f, name: e.target.value }))} placeholder="PhonePe, Paytm, Cash…" /></div>
                    <div><label style={labelSt}>Balance</label><input style={numInputSt} type="number" value={walletForm.balance} onChange={e => setWalletForm(f => ({ ...f, balance: e.target.value }))} placeholder="0" /></div>
                </form>
                {editingWallet && (
                    <div style={{ marginTop: 'var(--space-4)' }}>
                        <TextAction tone="danger" onClick={() => { const w = editingWallet; setShowWalletModal(false); confirmDelete('wallet', w.id, w.name); }}>Delete wallet</TextAction>
                    </div>
                )}
            </Modal>

        </>
    );
}
