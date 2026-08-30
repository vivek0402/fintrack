'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { FileText, ChevronDown } from 'lucide-react';
import { transactionsAPI, categoriesAPI, accountsAPI, creditCardsAPI, marketDataAPI, goalsAPI } from '@/lib/api';
import { addToQueue } from '@/lib/txQueue';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { CategoryField, CategoryIcon, findCategory } from '@/components/categories/CategoryPickerDialog';
import { useCategories } from '@/hooks/useCategories';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import { INVESTMENT_TYPES, GROUP_LABELS, MfSearchResult } from '@/types/investments';
import { randomCategoryColor } from '@/lib/categoryColors';

// ─── Calendar grid helper ────────────────────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    onOfflineSave?: (tx: any) => void;
    transaction?: any;
    prefill?: any;
    defaultDate?: string;
    pastTransactions?: any[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TransactionModal({ isOpen, onClose, onSuccess, onOfflineSave, transaction, prefill, defaultDate, pastTransactions }: Props) {
    const isEditing = !!transaction;
    const { user } = useAuthStore();
    const [form, setForm] = useState({
        type: 'expense' as 'income' | 'expense' | 'transfer',
        amount: '', description: '', notes: '',
        date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        category_id: '', tags: [] as string[],
        payment_method: 'Cash',
        account_id: null as number | null,
        to_account_id: null as number | null,
        credit_card_id: null as number | null,
        goal_id: null as string | null,
        investment: {
            type: 'mutual_fund' as string,
            name: '', ticker_or_folio: '', units: '', price_per_unit: '',
            scheme_code: '', account_label: '',
        },
    });
    const [tagInput, setTagInput] = useState('');
    const { categories, refresh: refreshCategories, addLocal: addLocalCategory } = useCategories();
    const [accounts, setAccounts]     = useState<any[]>([]);
    const [cards, setCards]           = useState<any[]>([]);
    const [goals, setGoals]           = useState<any[]>([]);
    const [loading, setLoading]       = useState(false);
    const [error, setError]           = useState('');

    const [mfResults, setMfResults]       = useState<MfSearchResult[]>([]);
    const [mfDropdownOpen, setMfDropdownOpen] = useState(false);
    const [mfLoading, setMfLoading]       = useState(false);
    const mfSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [pendingNewCategory, setPendingNewCategory]         = useState('');
    const [showNewCategoryPrompt, setShowNewCategoryPrompt]   = useState(false);
    const [approvingCat, setApprovingCat]                     = useState(false);
    const [dupWarning, setDupWarning] = useState<any>(null);
    const dupBypassRef = useRef<boolean>(false);

    const [calOpen, setCalOpen]   = useState(false);
    const [calMonth, setCalMonth] = useState(new Date().getMonth());
    const [calYear, setCalYear]   = useState(new Date().getFullYear());

    // Four fields by default (amount, description, category, date) --
    // payment method, card, investment details, goal, tags and notes
    // collapse behind "More details" instead of always showing 8-14 groups.
    const [showMore, setShowMore] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        accountsAPI.getAll().then(res => setAccounts(res.data.accounts || [])).catch(() => setAccounts([]));
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        creditCardsAPI.getAll().then(res => setCards(res.data.cards || [])).catch(() => setCards([]));
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        goalsAPI.getAll().then(res => setGoals(res.data.goals || [])).catch(() => setGoals([]));
    }, [isOpen]);

    // Populate form
     
    const blankInvestment = { type: 'mutual_fund', name: '', ticker_or_folio: '', units: '', price_per_unit: '', scheme_code: '', account_label: '' };

    useEffect(() => {
        if (transaction) {
            const rawDate = (transaction.date || '').split('T')[0];
            setForm({ type: transaction.type, amount: transaction.amount, description: transaction.description, notes: transaction.notes || '', date: rawDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), category_id: transaction.category_id || '', tags: Array.isArray(transaction.tags) ? transaction.tags : [], payment_method: transaction.payment_method || 'Cash', account_id: transaction.account_id ?? null, to_account_id: null, credit_card_id: transaction.credit_card_id ?? null, goal_id: transaction.goal_id ?? null, investment: blankInvestment });
        } else if (prefill) {
            setForm({ type: prefill.type === 'income' ? 'income' : 'expense', amount: prefill.amount ? String(prefill.amount) : '', description: prefill.description || '', notes: prefill.notes || '', date: prefill.date || defaultDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), category_id: '', tags: [], payment_method: 'Cash', account_id: null, to_account_id: null, credit_card_id: null, goal_id: null, investment: blankInvestment });
            setTagInput('');
        } else {
            setForm({ type: 'expense', amount: '', description: '', notes: '', date: defaultDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), category_id: '', tags: [], payment_method: 'Cash', account_id: null, to_account_id: null, credit_card_id: null, goal_id: null, investment: blankInvestment });
            setTagInput('');
        }
        setError('');
        setShowNewCategoryPrompt(false);
        setPendingNewCategory('');
        setDupWarning(null);
        dupBypassRef.current = false;
        setMfResults([]);
        setMfDropdownOpen(false);
        // Editing an existing transaction defaults open -- its payment method,
        // tags or notes may already be filled in, and collapsing them behind a
        // toggle the instant you open to edit would read as data going missing.
        setShowMore(!!transaction);
    }, [transaction, isOpen, defaultDate, prefill]);

    // Default account
    useEffect(() => {
        if (!isOpen || accounts.length === 0 || isEditing) return;
        const defaultAccountId = accounts.find((a: any) => a.is_default)?.id ?? accounts[0]?.id ?? null;
        setForm(prev => prev.account_id === null ? { ...prev, account_id: defaultAccountId } : prev);
    }, [accounts, isOpen, isEditing]);

    // Credit card selection: auto-pick when there's only one card, clear whenever
    // payment method moves away from 'Credit Card' so a stale card id never gets
    // submitted alongside a different payment method.
    useEffect(() => {
        if (!isOpen) return;
        if (form.payment_method !== 'Credit Card') {
            if (form.credit_card_id !== null) setForm(prev => ({ ...prev, credit_card_id: null }));
            return;
        }
        if (cards.length === 1 && form.credit_card_id === null) {
            setForm(prev => ({ ...prev, credit_card_id: cards[0].id }));
        }
    }, [form.payment_method, cards, isOpen]);

    const suggestedCats = useMemo(() => {
        const desc = form.description.trim().toLowerCase();
        if (desc.length < 3 || !categories.length) return [];
        const words = desc.split(/\s+/).filter((w: string) => w.length >= 3);
        const scored = categories
            .filter((c: any) => !form.category_id || String(c.id) !== form.category_id)
            .map((c: any) => {
                const cn = c.name.toLowerCase();
                let score = 0;
                if (cn === desc) score = 100;
                else if (cn.includes(desc) || desc.includes(cn)) score = 50;
                else for (const w of words) { if (cn.includes(w)) score += 10; }
                return { ...c, score };
            })
            .filter((c: any) => c.score > 0)
            .sort((a: any, b: any) => b.score - a.score || (Number(b.usage_count) || 0) - (Number(a.usage_count) || 0));
        return scored.slice(0, 2);
    }, [form.description, form.category_id, categories]);

    useEffect(() => {
        if (!prefill?.category || !categories.length) return;
        const matched = findCategory(categories, prefill.category);
        if (matched) setForm(prev => ({ ...prev, category_id: String(matched.id) }));
    }, [prefill, categories]);

    const applyParsed = (parsed: any) => {
        if (!parsed) return;
        setForm(prev => ({ ...prev, amount: parsed.amount ? String(parsed.amount) : prev.amount, description: parsed.description || parsed.merchant || prev.description, date: parsed.date || prev.date, type: parsed.type === 'income' ? 'income' : 'expense', notes: parsed.notes || prev.notes }));
        const matched = findCategory(categories, parsed.category || '');
        if (matched) {
            setForm(prev => ({ ...prev, category_id: String(matched.id) }));
        } else if (parsed.category) {
            setPendingNewCategory(parsed.category);
            setShowNewCategoryPrompt(true);
        }
    };

    const handleApproveNewCategory = async () => {
        if (!pendingNewCategory) return;
        setApprovingCat(true);
        try {
            const color = randomCategoryColor();
            const res = await categoriesAPI.create({ name: pendingNewCategory, color, icon: '📦' });
            const newCat = res.data.category;
            addLocalCategory(newCat);
            setForm(prev => ({ ...prev, category_id: String(newCat.id) }));
            setShowNewCategoryPrompt(false);
            setPendingNewCategory('');
        } catch {
            setShowNewCategoryPrompt(false);
        } finally {
            setApprovingCat(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setLoading(true);
        if (!isEditing && !dupBypassRef.current && (pastTransactions?.length ?? 0) > 0) {
            const amount = parseFloat(form.amount);
            const txDate = new Date((form.date || '').split('T')[0] + 'T00:00:00');
            const dup = (pastTransactions || []).find((t: any) => {
                if (t.type !== form.type) return false;
                const tAmt = parseFloat(t.amount);
                if (Math.abs(tAmt - amount) / Math.max(amount, 0.01) > 0.01) return false;
                const tDate = new Date((t.date || '').split('T')[0] + 'T00:00:00');
                return Math.abs(txDate.getTime() - tDate.getTime()) <= 48 * 3600 * 1000;
            });
            if (dup) { setDupWarning(dup); setLoading(false); return; }
        }
        dupBypassRef.current = false;
        if (isTransfer) {
            if (!form.account_id || !form.to_account_id) { setError('Select both From and To accounts.'); setLoading(false); return; }
            if (form.account_id === form.to_account_id) { setError('From and To accounts must differ.'); setLoading(false); return; }
            const amount = parseFloat(form.amount);
            const transferTags = [...(form.tags.length > 0 ? form.tags : []), 'transfer'];
            const base = { amount, description: form.description, notes: form.notes || undefined, date: form.date, tags: transferTags };
            try {
                await transactionsAPI.create({ ...base, type: 'expense', account_id: form.account_id });
                await transactionsAPI.create({ ...base, type: 'income',  account_id: form.to_account_id });
                toast.success('Transfer recorded');
                onSuccess(); onClose();
            } catch { setError('Transfer failed. Please try again.'); }
            finally { setLoading(false); }
            return;
        }
        const investmentDetails = (isInvestmentCategory && !isEditing && form.investment.units && form.investment.price_per_unit && form.investment.name)
            ? {
                type: form.investment.type,
                name: form.investment.name,
                ticker_or_folio: form.investment.ticker_or_folio || undefined,
                units: parseFloat(form.investment.units),
                price_per_unit: parseFloat(form.investment.price_per_unit),
                scheme_code: form.investment.scheme_code || undefined,
                account_label: form.investment.account_label || undefined,
            }
            : undefined;
        const payload = { type: form.type as 'income' | 'expense', amount: parseFloat(form.amount), description: form.description, notes: form.notes || undefined, date: form.date, category_id: form.category_id || undefined, tags: form.tags.length > 0 ? form.tags : undefined, payment_method: form.type === 'expense' ? (form.payment_method || 'Cash') : undefined, account_id: form.account_id ?? undefined, credit_card_id: (form.type === 'expense' && form.payment_method === 'Credit Card') ? form.credit_card_id : null, goal_id: form.goal_id, investment_details: investmentDetails };
        let createdInvestment: { is_new_holding: boolean } | undefined;
        try {
            if (isEditing) await transactionsAPI.update(transaction.id, payload);
            else { const res = await transactionsAPI.create(payload); createdInvestment = res.data.investment; }
            if (user) {
                const now = new Date(); const cm = now.getMonth() + 1; const cy = now.getFullYear();
                localStorage.removeItem(`dashboard-cache-${user.id}-${cm}-${cy}`);
                localStorage.removeItem(`analytics-cache-${user.id}-${cm}-${cy}`);
                if (form.date) {
                    const [txYear, txMonth] = form.date.split('-');
                    const tm = parseInt(txMonth); const ty = parseInt(txYear);
                    if (tm !== cm || ty !== cy) {
                        localStorage.removeItem(`dashboard-cache-${user.id}-${tm}-${ty}`);
                        localStorage.removeItem(`analytics-cache-${user.id}-${tm}-${ty}`);
                    }
                }
            }
            // Invalidate forecast cache since spending data changed
            try {
                const now = new Date();
                const fKey = `forecast-cache-${user?.id}-${now.getFullYear()}-${now.getMonth() + 1}`;
                localStorage.removeItem(fKey);
            } catch { /* silent */ }
            if (createdInvestment) toast.success(createdInvestment.is_new_holding ? 'Transaction added — new holding tracked' : 'Transaction added — holding updated');
            else toast.success(isEditing ? 'Transaction updated' : 'Transaction added');
            onSuccess(); onClose();
        } catch (err: any) {
            const isNetworkErr = !err.response;
            if (isNetworkErr && !isEditing) {
                try {
                    const tempId = await addToQueue('create', payload as Record<string, any>);
                    toast.info('Saved offline — will sync when reconnected');
                    onOfflineSave?.({ ...(payload as Record<string, any>), id: tempId, _pending: true });
                    onClose();
                } catch {
                    setError('Something went wrong. Please try again.');
                }
            } else {
                setError(err.response?.data?.error || 'Something went wrong.');
            }
        } finally { setLoading(false); }
    };

    const addTag = () => {
        const tag = tagInput.trim().replace('#', '');
        if (tag && !form.tags.includes(tag)) setForm({ ...form, tags: [...form.tags, tag] });
        setTagInput('');
    };

    const handleMfNameChange = (value: string) => {
        setForm(prev => ({ ...prev, investment: { ...prev.investment, name: value, scheme_code: '' } }));
        if (mfSearchTimer.current) clearTimeout(mfSearchTimer.current);
        if (value.trim().length < 2) { setMfResults([]); setMfDropdownOpen(false); return; }
        mfSearchTimer.current = setTimeout(async () => {
            setMfLoading(true);
            try {
                const res = await marketDataAPI.searchMutualFunds(value.trim());
                setMfResults(res.data.results || []);
                setMfDropdownOpen(true);
            } catch {
                setMfResults([]);
                setMfDropdownOpen(false);
                toast.error('Fund search failed — try again');
            } finally { setMfLoading(false); }
        }, 300);
    };

    const handleMfSelect = async (result: MfSearchResult) => {
        setForm(prev => ({ ...prev, investment: { ...prev.investment, name: result.schemeName, scheme_code: result.schemeCode } }));
        setMfDropdownOpen(false);
        try {
            const res = await marketDataAPI.getLatestNav(result.schemeCode);
            const nav = res.data.nav?.nav;
            if (nav) setForm(prev => ({ ...prev, investment: { ...prev.investment, price_per_unit: String(nav) } }));
        } catch { /* soft-fail: price stays manual */ }
    };

    const isIncome = form.type === 'income';
    const isTransfer = form.type === 'transfer';
    // A transfer is neither a gain nor a loss — colouring it red read as a loss.
    const amountColor = isTransfer ? 'var(--accent)' : isIncome ? 'var(--color-inc)' : 'var(--color-exp)';
    // Ordering, grouping and search all live in CategoryPickerDialog now.
    const safeCats = categories || [];
    const selectedCat = safeCats.find(c => String(c.id) === form.category_id);
    const isInvestmentCategory = !isTransfer && !!selectedCat?.is_investment_category;

    // Investment fields live inside "More details" like everything else non-
    // essential, but hiding them behind a collapsed toggle right after the
    // user deliberately picked an investment category would just be
    // confusing -- so picking one auto-opens the section.
    useEffect(() => { if (isInvestmentCategory) setShowMore(true); }, [isInvestmentCategory]);

    const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const selectedDate = form.date ? new Date(form.date + 'T00:00:00') : null;
    const todayStr     = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const handleDayClick = (day: number, monthType: 'prev' | 'cur' | 'next') => {
        let m = calMonth, y = calYear;
        if (monthType === 'prev') { m--; if (m < 0)  { m = 11; y--; } }
        if (monthType === 'next') { m++; if (m > 11) { m = 0;  y++; } }
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        setForm((prev: any) => ({ ...prev, date: dateStr }));
        setCalMonth(m); setCalYear(y); setCalOpen(false);
    };

    // Most entries are today or yesterday — these skip the grid entirely.
    const quickDates = useMemo(() => {
        const mk = (offset: number, label: string) => {
            const d = new Date();
            d.setDate(d.getDate() - offset);
            return { label, value: d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) };
        };
        return [mk(0, 'Today'), mk(1, 'Yesterday'), mk(2, '2 days ago')];
    }, []);

    const dateLabel = (() => {
        if (!selectedDate) return 'Select a date';
        const quick = quickDates.find(q => q.value === form.date);
        if (quick) return quick.label;
        return `${selectedDate.getDate()} ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
    })();

    const pickDate = (value: string) => {
        setForm((prev: any) => ({ ...prev, date: value }));
        const d = new Date(value + 'T00:00:00');
        setCalMonth(d.getMonth()); setCalYear(d.getFullYear());
        setCalOpen(false);
    };

    const labelStyle: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-body)' };
    // Glass field -- a light theme-adaptive wash (color-mix keeps it correct
    // in both themes without a second token) plus the shared glass border,
    // matching the approved mockup's fields rather than the opaque surfaces
    // the rest of the app's routine forms use.
    const inputBase: React.CSSProperties  = { background: 'var(--glass-fill-1)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'var(--font-body)', outline: 'none' };
    // Per-type tint for the active segment and the transfer swap/CTA --
    // violet has no semantic token in the app yet, so this reuses the same
    // hardcoded #8b5cf6 AdvancedSearchBar already uses for tag pills.
    const typeTint: Record<'expense' | 'income' | 'transfer', { fg: string; bg: string; border: string }> = {
        expense:  { fg: '#f87171', bg: 'var(--color-exp-subtle)', border: 'color-mix(in srgb, var(--color-exp) 30%, transparent)' },
        income:   { fg: '#4ade80', bg: 'var(--color-inc-subtle)', border: 'color-mix(in srgb, var(--color-inc) 30%, transparent)' },
        transfer: { fg: '#a78bfa', bg: 'rgba(139,92,246,0.12)',   border: 'rgba(139,92,246,0.3)' },
    };

    // Rendered alongside the main sheet rather than inside the form, so it
    // portals to the body and can never be clipped by the form's own scroll.
    const dateSheet = (
        <Modal isOpen={calOpen} onClose={() => setCalOpen(false)} title="Date" maxWidth="360px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {quickDates.map(q => {
                        const active = form.date === q.value;
                        return (
                            <button key={q.value} type="button" onClick={() => pickDate(q.value)}
                                style={{ padding: '7px 14px', borderRadius: 'var(--radius-full)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, background: active ? 'var(--accent-subtle)' : 'var(--glass-fill-1)', color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                                {q.label}
                            </button>
                        );
                    })}
                </div>

                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <button type="button" aria-label="Previous month" onClick={() => { let m = calMonth - 1, y = calYear; if (m < 0) { m = 11; y--; } setCalMonth(m); setCalYear(y); }}
                            style={{ background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer', width: 34, height: 34, fontSize: '16px', lineHeight: 1 }}>‹</button>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '14px', fontFamily: 'var(--font-display)' }}>{MONTHS[calMonth]} {calYear}</span>
                        <button type="button" aria-label="Next month" onClick={() => { let m = calMonth + 1, y = calYear; if (m > 11) { m = 0; y++; } setCalMonth(m); setCalYear(y); }}
                            style={{ background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer', width: 34, height: 34, fontSize: '16px', lineHeight: 1 }}>›</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: '4px' }}>
                        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (<div key={d} style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, padding: '4px 0', fontFamily: 'var(--font-body)' }}>{d}</div>))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>
                        {buildCalDays(calMonth, calYear).map((cell, i) => {
                            const cy = cell.month === 'prev' ? (calMonth === 0 ? calYear - 1 : calYear) : cell.month === 'next' ? (calMonth === 11 ? calYear + 1 : calYear) : calYear;
                            const cm = cell.month === 'prev' ? (calMonth === 0 ? 12 : calMonth) : cell.month === 'next' ? (calMonth === 11 ? 1 : calMonth + 2) : calMonth + 1;
                            const dateStr  = `${cy}-${String(cm).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`;
                            const isSelected = form.date === dateStr;
                            const isToday    = todayStr === dateStr;
                            const isOtherMonth = cell.month !== 'cur';
                            return (
                                <div key={i} onClick={() => handleDayClick(cell.day, cell.month)}
                                    style={{ width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', cursor: 'pointer', margin: '0 auto', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', backgroundColor: isSelected ? 'var(--accent)' : 'transparent', color: isSelected ? 'white' : 'var(--text-secondary)', opacity: isOtherMonth && !isSelected ? 0.4 : 1, outline: (!isSelected && isToday) ? '2px solid var(--accent)' : 'none', outlineOffset: '-2px', transition: 'background-color 0.1s' }}
                                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--glass-fill-2)'; }}
                                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                                >{cell.day}</div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </Modal>
    );

    // Shared between the Category+Date row (expense/income) and the
    // standalone Date field (transfer) -- the two are mutually exclusive per
    // render.
    const dateTrigger = (
        <div style={{ width: '100%' }}>
            <div onClick={() => setCalOpen(true)} role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCalOpen(true); } }}
                style={{ ...inputBase, padding: '10px 12px', color: selectedDate ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box', userSelect: 'none', width: '100%' }}>
                <span>{dateLabel}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--text-secondary)', flexShrink: 0 }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
            </div>
        </div>
    );

    const ctaLabel = isEditing
        ? 'Save changes'
        : isTransfer
            ? `Transfer${form.amount ? ` ₹${Number(form.amount).toLocaleString('en-IN')}` : ''}`
            : `Add${form.amount ? ` ₹${Number(form.amount).toLocaleString('en-IN')}` : ''} ${isIncome ? 'income' : 'expense'}`;

    return (
      <>
        {dateSheet}
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? 'Edit Transaction' : isTransfer ? 'Transfer Between Accounts' : 'Add Transaction'}
            footer={
                <button type="submit" form="transaction-form" disabled={loading}
                    style={{
                        width: '100%', height: '48px', border: 'none', borderRadius: 'var(--radius-md)',
                        background: isTransfer ? '#8b5cf6' : 'var(--accent)', color: 'white',
                        fontSize: '14.5px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: 'var(--font-body)',
                        boxShadow: isTransfer
                            ? '0 12px 26px -10px rgba(139,92,246,0.7), inset 0 1px 0 rgba(255,255,255,0.25)'
                            : '0 12px 26px -10px rgba(37,99,235,0.7), inset 0 1px 0 rgba(255,255,255,0.25)',
                    }}>
                    {loading ? 'Saving…' : ctaLabel}
                </button>
            }
        >
            {/* Duplicate transaction warning */}
            {dupWarning && (
                <div style={{ background: 'color-mix(in srgb, var(--color-warn) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warn) 25%, transparent)', borderRadius: 10, padding: '12px 14px', marginBottom: 4 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-warn)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>⚠️ Possible duplicate</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px', fontFamily: 'var(--font-body)' }}>
                        Similar: <strong>{dupWarning.description}</strong>, ₹{Math.round(parseFloat(dupWarning.amount)).toLocaleString('en-IN')} on {new Date((dupWarning.date || '').split('T')[0] + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" onClick={() => { dupBypassRef.current = true; setDupWarning(null); (document.getElementById('transaction-form') as HTMLFormElement | null)?.requestSubmit?.(); }}
                            style={{ padding: '5px 12px', background: 'var(--color-warn)', border: 'none', borderRadius: 6, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Save anyway</button>
                        <button type="button" onClick={() => setDupWarning(null)}
                            style={{ padding: '5px 12px', background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Go back</button>
                    </div>
                </div>
            )}

            {/* AI new-category prompt */}
            {showNewCategoryPrompt && (
                <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>✨ New category detected</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>AI suggested: <strong>"{pendingNewCategory}"</strong></div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button type="button" onClick={handleApproveNewCategory} disabled={approvingCat}
                            style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: approvingCat ? 'wait' : 'pointer', fontWeight: 600, opacity: approvingCat ? 0.7 : 1, fontFamily: 'var(--font-body)' }}>
                            {approvingCat ? '…' : 'Add it'}
                        </button>
                        <button type="button" onClick={() => setShowNewCategoryPrompt(false)}
                            style={{ background: 'var(--glass-fill-1)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            Skip
                        </button>
                    </div>
                </div>
            )}

            <form id="transaction-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* ── Type toggle — translucent segmented control, per-type tint on the active segment ── */}
                <div>
                    <label style={labelStyle}>Type</label>
                    <div style={{ display: 'flex', gap: '4px', padding: '3px', background: 'var(--glass-fill-1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                        {(['expense', 'income', 'transfer'] as const).map(t => {
                            const active = form.type === t;
                            const tint = typeTint[t];
                            const label = t === 'income' ? '↑ Income' : t === 'transfer' ? '⇄ Transfer' : '↓ Expense';
                            return (
                                <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                                    style={{
                                        flex: 1, padding: '9px 0', borderRadius: '9px', fontSize: '0.8rem', fontWeight: active ? 600 : 400,
                                        cursor: 'pointer', transition: 'all var(--transition-fast)', fontFamily: 'var(--font-body)',
                                        background: active ? tint.bg : 'transparent',
                                        border: `1px solid ${active ? tint.border : 'transparent'}`,
                                        color: active ? tint.fg : 'var(--text-muted)',
                                    }}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Amount ── */}
                <div>
                    <label style={labelStyle}>Amount</label>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: amountColor, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.2rem' }}>₹</span>
                        <input type="number" placeholder="0" min="0.01" step="any" value={form.amount === '0' ? '' : form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required
                            style={{ width: '100%', padding: '14px 16px 14px 36px', ...inputBase, fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: amountColor, boxSizing: 'border-box', border: `1px solid color-mix(in srgb, ${amountColor} 30%, transparent)`, fontVariantNumeric: 'tabular-nums', transition: 'border-color var(--transition-fast)' }}
                        />
                    </div>
                </div>

                {/* ── Transfer accounts — sits with the amount, since for a transfer
                       these three fields are the whole transaction ── */}
                {isTransfer && accounts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div>
                            <label style={labelStyle}>From account</label>
                            <select value={form.account_id ?? ''} onChange={e => setForm({ ...form, account_id: e.target.value ? Number(e.target.value) : null })}
                                style={{ width: '100%', padding: '10px 12px', ...inputBase, cursor: 'pointer', boxSizing: 'border-box' as const }}>
                                <option value="">Select account</option>
                                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', margin: '-6px 0' }}>
                            <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
                            </span>
                        </div>
                        <div>
                            <label style={labelStyle}>To account</label>
                            <select value={form.to_account_id ?? ''} onChange={e => setForm({ ...form, to_account_id: e.target.value ? Number(e.target.value) : null })}
                                style={{ width: '100%', padding: '10px 12px', ...inputBase, cursor: 'pointer', boxSizing: 'border-box' as const }}>
                                <option value="">Select account</option>
                                {accounts.filter((a: any) => a.id !== form.account_id).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                    </div>
                )}

                <Input
                    label={isTransfer ? 'What is this transfer for?' : 'Description'}
                    type="text"
                    placeholder={isTransfer ? 'e.g. Monthly SIP, moving to savings' : 'e.g. Swiggy order, Monthly salary'}
                    icon={<FileText size={15} />}
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    required
                    style={{ background: inputBase.background, border: `1px solid var(--glass-border)` }}
                />

                {/* Auto-category suggestions */}
                {suggestedCats.length > 0 && !isTransfer && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '-4px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Suggested:</span>
                        {suggestedCats.map((c: any) => (
                            <button key={c.id} type="button" onClick={() => { setForm(prev => ({ ...prev, category_id: String(c.id) })); }}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '20px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                <CategoryIcon name={c.icon} size={11} color="currentColor" />
                                {c.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* ── Category + Date (two-col, always visible — the other two of the four core fields) ── */}
                {!isTransfer && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={labelStyle} htmlFor="tx-category">Category</label>
                            <CategoryField
                                id="tx-category"
                                value={form.category_id}
                                onChange={v => setForm(prev => ({ ...prev, category_id: v }))}
                                categories={safeCats}
                                allowCreate
                                onCreated={() => { void refreshCategories(); }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={labelStyle}>Date</label>
                            {dateTrigger}
                        </div>
                    </div>
                )}

                {/* ── Date — transfer's own, standalone (no category to pair it with) ── */}
                {isTransfer && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={labelStyle}>Date</label>
                        {dateTrigger}
                    </div>
                )}

                {/* ── More details — everything else collapses behind this. Deliberately
                    not adaptive (no rearranging based on guessed habits): unpredictable
                    beats one extra tap. ── */}
                {!isTransfer && (
                    <button type="button" onClick={() => setShowMore(v => !v)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: showMore ? '11px 2px 2px' : '2px', marginTop: showMore ? '2px' : 0, borderTop: showMore ? '1px solid var(--glass-border)' : 'none', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', background: 'none', cursor: 'pointer', color: showMore ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-body)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ChevronDown size={14} style={{ transform: showMore ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                            More details
                        </span>
                        {!showMore && <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>payment · tags · notes · goal</span>}
                    </button>
                )}

                {showMore && !isTransfer && (
                <>
                    {/* ── Payment Method (expense only) ── */}
                    {!isIncome && (
                        <div>
                            <label style={labelStyle}>How did you pay?</label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Wallet'].map(m => (
                                    <button key={m} type="button" onClick={() => setForm({ ...form, payment_method: m })}
                                        style={{ padding: '6px 11px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s', border: `1px solid ${form.payment_method === m ? 'var(--accent-border)' : 'var(--glass-border)'}`, background: form.payment_method === m ? 'var(--accent-subtle)' : 'var(--glass-fill-1)', color: form.payment_method === m ? 'var(--accent)' : 'var(--text-muted)' }}>
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Which card? (only when there's more than one) ── */}
                    {!isIncome && form.payment_method === 'Credit Card' && cards.length > 1 && (
                        <div>
                            <label style={labelStyle}>Which card?</label>
                            <select value={form.credit_card_id ?? ''} onChange={e => setForm({ ...form, credit_card_id: e.target.value ? Number(e.target.value) : null })}
                                style={{ width: '100%', padding: '10px 12px', ...inputBase, cursor: 'pointer', boxSizing: 'border-box' as const }}>
                                <option value="">Select card</option>
                                {cards.map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.bank_name} {c.card_name}{c.last_four ? ` ••${c.last_four}` : ''}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* ── Investment details (shown when Investments category is selected) ── */}
                    {isInvestmentCategory && !isEditing && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: 'var(--glass-fill-1)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                            <label style={labelStyle}>Fund / Asset details (optional)</label>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-warn)', margin: '-4px 0 0', fontFamily: 'var(--font-body)', lineHeight: 1.4 }}>
                                Without these details, this transaction won't be tracked as an investment asset — it'll only be excluded from your spending totals.
                            </p>
                            <div>
                                <select value={form.investment.type}
                                    onChange={e => setForm(prev => ({ ...prev, investment: { ...prev.investment, type: e.target.value, name: '', ticker_or_folio: '', scheme_code: '' } }))}
                                    style={{ width: '100%', padding: '10px 12px', ...inputBase, cursor: 'pointer', boxSizing: 'border-box' as const }}>
                                    {INVESTMENT_TYPES.map(t => <option key={t} value={t}>{GROUP_LABELS[t]}</option>)}
                                </select>
                            </div>

                            {form.investment.type === 'mutual_fund' ? (
                                <div style={{ position: 'relative' }}>
                                    <input style={{ width: '100%', padding: '10px 12px', ...inputBase, boxSizing: 'border-box' as const }}
                                        value={form.investment.name}
                                        onChange={e => handleMfNameChange(e.target.value)}
                                        placeholder="Search fund name, e.g. Axis Bluechip" />
                                    {mfDropdownOpen && (mfLoading || mfResults.length > 0) && (
                                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--glass-sheet-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', boxShadow: 'var(--glass-edge)', border: '1px solid var(--glass-border)', borderRadius: '10px', zIndex: 60, maxHeight: '200px', overflowY: 'auto' }}>
                                            {mfLoading ? (
                                                <div style={{ padding: '10px 14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Searching…</div>
                                            ) : mfResults.map(r => (
                                                <div key={r.schemeCode} onClick={() => handleMfSelect(r)}
                                                    style={{ padding: '9px 14px', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--glass-fill-2)'}
                                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                                    {r.schemeName}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <input style={{ width: '100%', padding: '10px 12px', ...inputBase, boxSizing: 'border-box' as const }}
                                        value={form.investment.name}
                                        onChange={e => setForm(prev => ({ ...prev, investment: { ...prev.investment, name: e.target.value } }))}
                                        placeholder="e.g. Reliance, SBI FD…" />
                                    <input style={{ width: '100%', padding: '10px 12px', ...inputBase, boxSizing: 'border-box' as const }}
                                        value={form.investment.ticker_or_folio}
                                        onChange={e => setForm(prev => ({ ...prev, investment: { ...prev.investment, ticker_or_folio: e.target.value } }))}
                                        placeholder="Ticker / Folio (optional)" />
                                </>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <input type="number" min="0" step="any" style={{ width: '100%', padding: '10px 12px', ...inputBase, boxSizing: 'border-box' as const }}
                                    value={form.investment.units}
                                    onChange={e => setForm(prev => ({ ...prev, investment: { ...prev.investment, units: e.target.value } }))}
                                    placeholder="Units" />
                                <input type="number" min="0" step="any" style={{ width: '100%', padding: '10px 12px', ...inputBase, boxSizing: 'border-box' as const }}
                                    value={form.investment.price_per_unit}
                                    onChange={e => setForm(prev => ({ ...prev, investment: { ...prev.investment, price_per_unit: e.target.value } }))}
                                    placeholder="Price / unit" />
                            </div>
                            <input style={{ width: '100%', padding: '10px 12px', ...inputBase, boxSizing: 'border-box' as const }}
                                value={form.investment.account_label}
                                onChange={e => setForm(prev => ({ ...prev, investment: { ...prev.investment, account_label: e.target.value } }))}
                                placeholder="Account label, e.g. Zerodha (optional)" />
                            {form.investment.units && form.investment.price_per_unit && (
                                <button type="button"
                                    onClick={() => setForm(prev => ({ ...prev, amount: (parseFloat(prev.investment.units) * parseFloat(prev.investment.price_per_unit)).toFixed(2) }))}
                                    style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', cursor: 'pointer', padding: '2px 0', fontFamily: 'var(--font-body)' }}>
                                    Use units × price (₹{(parseFloat(form.investment.units) * parseFloat(form.investment.price_per_unit)).toFixed(2)}) as amount
                                </button>
                            )}
                        </div>
                    )}

                    {/* ── Goal contribution (optional) ── */}
                    {goals.length > 0 && (
                        <div>
                            <label style={labelStyle}>Add to a goal (optional)</label>
                            <select value={form.goal_id ?? ''} onChange={e => setForm({ ...form, goal_id: e.target.value || null })}
                                style={{ width: '100%', padding: '10px 12px', ...inputBase, cursor: 'pointer', boxSizing: 'border-box' as const }}>
                                <option value="">— None —</option>
                                {goals.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                        </div>
                    )}

                    {/* ── Tags ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={labelStyle}>Tags (optional)</label>
                        {form.tags.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {form.tags.map(tag => (
                                    <span key={tag} onClick={() => setForm({ ...form, tags: form.tags.filter(t => t !== tag) })}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--accent)', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', padding: '3px 10px', borderRadius: '20px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        #{tag} ×
                                    </span>
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" placeholder="Add tag (press Enter)" value={tagInput} onChange={e => setTagInput(e.target.value.replace(/\s/g, ''))} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                                style={{ flex: 1, padding: '10px 16px', ...inputBase }} />
                            <button type="button" onClick={addTag} style={{ padding: '10px 16px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: '10px', color: 'var(--accent)', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500, fontFamily: 'var(--font-body)' }}>Add</button>
                        </div>
                    </div>

                    {/* ── Notes ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={labelStyle}>Notes (optional)</label>
                        <textarea placeholder="Any additional notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                            style={{ width: '100%', padding: '10px 16px', ...inputBase, resize: 'vertical', boxSizing: 'border-box' }} />
                    </div>
                </>
                )}

                {error && (
                    <div style={{ padding: '10px 14px', background: 'color-mix(in srgb, var(--color-exp) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--color-exp)', fontFamily: 'var(--font-body)' }}>
                        {error}
                    </div>
                )}
            </form>
        </Modal>
      </>
    );
}
