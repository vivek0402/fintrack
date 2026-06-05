'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
    FileText, ChevronDown,
    Utensils, Car, ShoppingBag, Film, HeartPulse, BookOpen,
    Zap, Home, Briefcase, TrendingUp, Sparkles, Users, Plane,
    Repeat, Gift, CircleDot, Laptop, Package,
} from 'lucide-react';
import { transactionsAPI, categoriesAPI, accountsAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';

// ─── Category icon helpers ────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
    'utensils': Utensils, 'car': Car, 'shopping-bag': ShoppingBag,
    'film': Film, 'heart-pulse': HeartPulse, 'book-open': BookOpen,
    'zap': Zap, 'home': Home, 'briefcase': Briefcase, 'trending-up': TrendingUp,
    'sparkles': Sparkles, 'users': Users, 'plane': Plane, 'repeat': Repeat,
    'gift': Gift, 'circle-dot': CircleDot, 'laptop': Laptop, 'package': Package,
};

const CategoryIcon = ({ name, size = 14, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
    if (!name) return <span style={{ fontSize: size }}>📦</span>;
    const Icon = ICON_MAP[name];
    if (Icon) return <Icon size={size} color={color} />;
    return <span style={{ fontSize: size, lineHeight: 1 }}>{name}</span>;
};

// ─── Category dropdown option ────────────────────────────────────────────────

function CatOption({ cat, selected, onSelect, onDelete }: { cat: any; selected: boolean; onSelect: () => void; onDelete: () => void }) {
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        const msg = cat.is_default
            ? `Delete "${cat.name}"? This is a default category. Existing transactions using it will become uncategorized.`
            : `Delete "${cat.name}"? Existing transactions using it will become uncategorized.`;
        if (window.confirm(msg)) onDelete();
    };

    return (
        <div
            onClick={onSelect}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', cursor: 'pointer', background: selected ? 'var(--bg-hover)' : 'transparent', transition: 'background 0.1s' }}
            onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
            <CategoryIcon name={cat.icon} size={14} color={cat.color} />
            <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{cat.name}</span>
            {Number(cat.usage_count) > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{cat.usage_count}×</span>
            )}
            <button type="button" onClick={handleDelete}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px', borderRadius: '4px', fontSize: '11px', lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center', transition: 'color 0.1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-exp)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
                title="Delete category"
            >✕</button>
        </div>
    );
}

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
    transaction?: any;
    prefill?: any;
    defaultDate?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TransactionModal({ isOpen, onClose, onSuccess, transaction, prefill, defaultDate }: Props) {
    const isEditing = !!transaction;
    const { user } = useAuthStore();
    const [form, setForm] = useState({
        type: 'expense' as 'income' | 'expense',
        amount: '', description: '', notes: '',
        date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        category_id: '', tags: [] as string[],
        payment_method: 'Cash',
        account_id: null as number | null,
    });
    const [tagInput, setTagInput] = useState('');
    const [categories, setCategories] = useState<any[]>([]);
    const [accounts, setAccounts]     = useState<any[]>([]);
    const [loading, setLoading]       = useState(false);
    const [error, setError]           = useState('');

    const [catDropdownOpen, setCatDropdownOpen]   = useState(false);
    const catDropdownRef = useRef<HTMLDivElement>(null);

    const [showAddCat, setShowAddCat]         = useState(false);
    const [newCatName, setNewCatName]         = useState('');
    const [newCatColor, setNewCatColor]       = useState('#6366f1');
    const [addCatLoading, setAddCatLoading]   = useState(false);

    const [pendingNewCategory, setPendingNewCategory]         = useState('');
    const [showNewCategoryPrompt, setShowNewCategoryPrompt]   = useState(false);
    const [approvingCat, setApprovingCat]                     = useState(false);

    const [calOpen, setCalOpen]   = useState(false);
    const [calMonth, setCalMonth] = useState(new Date().getMonth());
    const [calYear, setCalYear]   = useState(new Date().getFullYear());
    const dateRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        categoriesAPI.getAll().then(res => setCategories(res.data.categories || [])).catch(() => setCategories([]));
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        accountsAPI.getAll().then(res => setAccounts(res.data.accounts || [])).catch(() => setAccounts([]));
    }, [isOpen]);

    useEffect(() => {
        if (!catDropdownOpen) return;
        const handler = (e: MouseEvent) => { if (catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node)) setCatDropdownOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [catDropdownOpen]);

    useEffect(() => {
        if (!calOpen) return;
        const handler = (e: MouseEvent) => { if (dateRef.current && !dateRef.current.contains(e.target as Node)) setCalOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [calOpen]);

    // Populate form
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (transaction) {
            const rawDate = (transaction.date || '').split('T')[0];
            setForm({ type: transaction.type, amount: transaction.amount, description: transaction.description, notes: transaction.notes || '', date: rawDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), category_id: transaction.category_id || '', tags: Array.isArray(transaction.tags) ? transaction.tags : [], payment_method: transaction.payment_method || 'Cash', account_id: transaction.account_id ?? null });
        } else if (prefill) {
            setForm({ type: prefill.type === 'income' ? 'income' : 'expense', amount: prefill.amount ? String(prefill.amount) : '', description: prefill.description || '', notes: prefill.notes || '', date: prefill.date || defaultDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), category_id: '', tags: [], payment_method: 'Cash', account_id: null });
            setTagInput('');
        } else {
            setForm({ type: 'expense', amount: '', description: '', notes: '', date: defaultDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), category_id: '', tags: [], payment_method: 'Cash', account_id: null });
            setTagInput('');
        }
        setError('');
        setCatDropdownOpen(false);
        setShowAddCat(false);
        setShowNewCategoryPrompt(false);
        setPendingNewCategory('');
    }, [transaction, isOpen, defaultDate, prefill]);

    // Default account
    useEffect(() => {
        if (!isOpen || accounts.length === 0 || isEditing) return;
        const defaultAccountId = accounts.find((a: any) => a.is_default)?.id ?? accounts[0]?.id ?? null;
        setForm(prev => prev.account_id === null ? { ...prev, account_id: defaultAccountId } : prev);
    }, [accounts, isOpen, isEditing]);

    const findCategory = (cats: any[], aiCat: string) => {
        if (!aiCat || !cats.length) return null;
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        const ai = norm(aiCat);
        let m = cats.find(c => norm(c.name) === ai);
        if (m) return m;
        m = cats.find(c => { const db = norm(c.name); return db.includes(ai) || ai.includes(db); });
        if (m) return m;
        const aiWords = new Set(ai.split(' ').filter(w => w.length > 2));
        m = cats.find(c => norm(c.name).split(' ').some((w: string) => w.length > 2 && aiWords.has(w)));
        return m || null;
    };

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
            const colors = ['#f59e0b', '#6366f1', '#ec4899', '#a855f7', '#00e5a0', '#06b6d4', '#f97316', '#8b5cf6', '#059669', '#f43f5e'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const res = await categoriesAPI.create({ name: pendingNewCategory, color, icon: '📦' });
            const newCat = res.data.category;
            setCategories(prev => [...prev, { ...newCat, usage_count: 0, last_used: null }]);
            setForm(prev => ({ ...prev, category_id: String(newCat.id) }));
            setShowNewCategoryPrompt(false);
            setPendingNewCategory('');
        } catch {
            setShowNewCategoryPrompt(false);
        } finally {
            setApprovingCat(false);
        }
    };

    const handleDeleteCategory = async (cat: any) => {
        setCategories(prev => prev.filter(c => c.id !== cat.id));
        if (form.category_id === String(cat.id)) setForm(prev => ({ ...prev, category_id: '' }));
        try { await categoriesAPI.delete(String(cat.id)); } catch { setCategories(prev => [...prev, cat]); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setLoading(true);
        try {
            const payload = { type: form.type, amount: parseFloat(form.amount), description: form.description, notes: form.notes || undefined, date: form.date, category_id: form.category_id || undefined, tags: form.tags.length > 0 ? form.tags : undefined, payment_method: form.type === 'expense' ? (form.payment_method || 'Cash') : undefined, account_id: form.account_id ?? undefined };
            if (isEditing) await transactionsAPI.update(transaction.id, payload);
            else await transactionsAPI.create(payload);
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
            toast.success(isEditing ? 'Transaction updated' : 'Transaction added');
            onSuccess(); onClose();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Something went wrong.');
        } finally { setLoading(false); }
    };

    const addTag = () => {
        const tag = tagInput.trim().replace('#', '');
        if (tag && !form.tags.includes(tag)) setForm({ ...form, tags: [...form.tags, tag] });
        setTagInput('');
    };

    const handleAddCategory = async () => {
        if (!newCatName.trim()) return;
        setAddCatLoading(true);
        try {
            const res = await categoriesAPI.create({ name: newCatName.trim(), color: newCatColor, icon: '📦' });
            const fresh = await categoriesAPI.getAll();
            setCategories(fresh.data.categories || []);
            setForm(prev => ({ ...prev, category_id: String(res.data.category.id) }));
            setNewCatName(''); setNewCatColor('#6366f1'); setShowAddCat(false);
        } catch { } finally { setAddCatLoading(false); }
    };

    const isIncome = form.type === 'income';
    const safeCats = categories || [];
    const sortedCategories = useMemo(() => {
        if (!safeCats.length) return [];
        return [...safeCats].sort((a, b) => {
            const countDiff = (Number(b.usage_count) || 0) - (Number(a.usage_count) || 0);
            if (countDiff !== 0) return countDiff;
            if (a.last_used && b.last_used) return new Date(b.last_used).getTime() - new Date(a.last_used).getTime();
            if (a.last_used) return -1; if (b.last_used) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [safeCats]);
    const frequentCats  = sortedCategories.filter(c => Number(c.usage_count) > 0);
    const neverUsedCats = sortedCategories.filter(c => !Number(c.usage_count));
    const selectedCat   = safeCats.find(c => String(c.id) === form.category_id);

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

    const labelStyle: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-body)' };
    const inputBase: React.CSSProperties  = { background: 'var(--bg-alt)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'var(--font-body)', outline: 'none' };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? 'Edit Transaction' : 'Add Transaction'}
            footer={
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <Button type="button" variant="secondary" size="lg" onClick={onClose}>Cancel</Button>
                    <Button type="submit" form="transaction-form" size="lg" isLoading={loading}>{isEditing ? 'Save Changes' : 'Add Transaction'}</Button>
                </div>
            }
        >
            {/* AI new-category prompt */}
            {showNewCategoryPrompt && (
                <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
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
                            style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            Skip
                        </button>
                    </div>
                </div>
            )}

            <form id="transaction-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* ── Type toggle — dark pill ── */}
                <div>
                    <label style={labelStyle}>Type</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', padding: '4px', background: 'var(--bg-alt)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                        {(['expense', 'income'] as const).map(t => (
                            <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                                style={{
                                    padding: '10px', borderRadius: '9px', border: 'none',
                                    background: form.type === t
                                        ? (t === 'income' ? 'var(--color-inc)' : 'var(--text-primary)')
                                        : 'transparent',
                                    color: form.type === t ? (t === 'income' ? 'white' : 'var(--bg-card)') : 'var(--text-muted)',
                                    fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
                                    transition: 'all var(--transition-fast)', fontFamily: 'var(--font-body)',
                                }}>
                                {t === 'income' ? '↑ Income' : '↓ Expense'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Amount ── */}
                <div>
                    <label style={labelStyle}>Amount</label>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: isIncome ? 'var(--color-inc)' : 'var(--color-exp)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.2rem' }}>₹</span>
                        <input type="number" placeholder="0" min="0.01" step="any" value={form.amount === '0' ? '' : form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required
                            style={{ width: '100%', padding: '14px 16px 14px 36px', ...inputBase, fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: isIncome ? 'var(--color-inc)' : 'var(--color-exp)', boxSizing: 'border-box', border: `1px solid ${isIncome ? 'color-mix(in srgb, var(--color-inc) 30%, transparent)' : 'color-mix(in srgb, var(--color-exp) 30%, transparent)'}`, fontVariantNumeric: 'tabular-nums', transition: 'border-color var(--transition-fast)' }}
                        />
                    </div>
                </div>

                {/* ── Payment Method (expense only) ── */}
                {!isIncome && (
                    <div>
                        <label style={labelStyle}>How did you pay?</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Wallet'].map(m => (
                                <button key={m} type="button" onClick={() => setForm({ ...form, payment_method: m })}
                                    style={{ padding: '7px 14px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s', border: `1px solid ${form.payment_method === m ? 'var(--accent)' : 'var(--border)'}`, background: form.payment_method === m ? 'var(--accent-light)' : 'var(--bg-card)', color: form.payment_method === m ? 'var(--accent)' : 'var(--text-muted)' }}>
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <Input label="Description" type="text" placeholder="e.g. Swiggy order, Monthly salary" icon={<FileText size={15} />} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />

                {/* ── Category dropdown ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={labelStyle}>Category</label>
                    <div ref={catDropdownRef} style={{ position: 'relative' }}>
                        <button type="button" onClick={() => setCatDropdownOpen(v => !v)}
                            style={{ width: '100%', padding: '10px 14px', ...inputBase, border: `1px solid ${catDropdownOpen ? 'var(--accent)' : 'var(--border)'}`, color: selectedCat ? 'var(--text-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'border-color 0.15s' }}>
                            {selectedCat ? (
                                <><CategoryIcon name={selectedCat.icon} size={14} color={selectedCat.color} /><span style={{ flex: 1, textAlign: 'left' }}>{selectedCat.name}</span></>
                            ) : (
                                <span style={{ flex: 1, textAlign: 'left' }}>Select a category</span>
                            )}
                            <ChevronDown size={14} style={{ transform: catDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                        </button>
                        {catDropdownOpen && (
                            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', zIndex: 60, maxHeight: '220px', overflowY: 'auto', boxShadow: 'var(--shadow-elevated)' }}>
                                {sortedCategories.length === 0 ? (
                                    <div style={{ padding: '12px 14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading…</div>
                                ) : (
                                    <>
                                        {frequentCats.length > 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '6px 12px 2px', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)' }}>Frequently Used</div>}
                                        {frequentCats.map(cat => (<CatOption key={cat.id} cat={cat} selected={form.category_id === String(cat.id)} onSelect={() => { setForm(prev => ({ ...prev, category_id: String(cat.id) })); setCatDropdownOpen(false); }} onDelete={() => handleDeleteCategory(cat)} />))}
                                        {neverUsedCats.length > 0 && frequentCats.length > 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '6px 12px 2px', borderTop: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4, fontFamily: 'var(--font-body)' }}>All Categories</div>}
                                        {neverUsedCats.map(cat => (<CatOption key={cat.id} cat={cat} selected={form.category_id === String(cat.id)} onSelect={() => { setForm(prev => ({ ...prev, category_id: String(cat.id) })); setCatDropdownOpen(false); }} onDelete={() => handleDeleteCategory(cat)} />))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    {!showAddCat ? (
                        <button type="button" onClick={() => setShowAddCat(true)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', cursor: 'pointer', padding: '2px 0', fontFamily: 'var(--font-body)' }}>
                            + Add category
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                            <input type="text" placeholder="Category name" value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }} autoFocus
                                style={{ flex: 1, padding: '7px 12px', ...inputBase, fontSize: '0.8rem' }} />
                            <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} style={{ width: '32px', height: '32px', padding: '2px', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', background: 'none' }} />
                            <button type="button" onClick={handleAddCategory} disabled={addCatLoading || !newCatName.trim()} style={{ padding: '7px 12px', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: 'white', fontSize: '0.8rem', cursor: addCatLoading || !newCatName.trim() ? 'not-allowed' : 'pointer', opacity: addCatLoading || !newCatName.trim() ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>{addCatLoading ? '…' : 'Add'}</button>
                            <button type="button" onClick={() => { setShowAddCat(false); setNewCatName(''); }} style={{ padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}>×</button>
                        </div>
                    )}
                </div>

                {/* ── Date picker ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={labelStyle}>Date</label>
                    <div ref={dateRef} style={{ position: 'relative', width: '100%' }}>
                        <div onClick={() => setCalOpen(o => !o)}
                            style={{ ...inputBase, padding: '10px 12px', color: selectedDate ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box', userSelect: 'none', width: '100%' }}>
                            <span>{selectedDate ? `${selectedDate.getDate()} ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}` : 'Select a date'}</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--text-secondary)', flexShrink: 0 }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                        </div>
                        {calOpen && (
                            <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: '100%', minWidth: '300px', zIndex: 9999, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px', boxShadow: 'var(--shadow-modal)', boxSizing: 'border-box' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <button type="button" onClick={() => { let m = calMonth - 1, y = calYear; if (m < 0) { m = 11; y--; } setCalMonth(m); setCalYear(y); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px', padding: '0 8px', lineHeight: 1 }}>‹</button>
                                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', fontFamily: 'var(--font-head)' }}>{MONTHS[calMonth]} {calYear}</span>
                                    <button type="button" onClick={() => { let m = calMonth + 1, y = calYear; if (m > 11) { m = 0; y++; } setCalMonth(m); setCalYear(y); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px', padding: '0 8px', lineHeight: 1 }}>›</button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: '4px' }}>
                                    {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (<div key={d} style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, padding: '4px 0' }}>{d}</div>))}
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
                                                style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', cursor: 'pointer', margin: '0 auto', backgroundColor: isSelected ? 'var(--accent)' : 'transparent', color: isSelected ? 'white' : 'var(--text-secondary)', opacity: isOtherMonth && !isSelected ? 0.4 : 1, outline: (!isSelected && isToday) ? '2px solid var(--accent)' : 'none', outlineOffset: '-2px', transition: 'background-color 0.1s' }}
                                                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-hover)'; }}
                                                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                                            >{cell.day}</div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Tags ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={labelStyle}>Tags (optional)</label>
                    {form.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {form.tags.map(tag => (
                                <span key={tag} onClick={() => setForm({ ...form, tags: form.tags.filter(t => t !== tag) })}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--accent)', background: 'var(--accent-light)', border: '1px solid var(--accent-border)', padding: '3px 10px', borderRadius: '20px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                    #{tag} ×
                                </span>
                            ))}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="text" placeholder="Add tag (press Enter)" value={tagInput} onChange={e => setTagInput(e.target.value.replace(/\s/g, ''))} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                            style={{ flex: 1, padding: '10px 16px', ...inputBase }} />
                        <button type="button" onClick={addTag} style={{ padding: '10px 16px', background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius: '10px', color: 'var(--accent)', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500, fontFamily: 'var(--font-body)' }}>Add</button>
                    </div>
                </div>

                {/* ── Notes ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={labelStyle}>Notes (optional)</label>
                    <textarea placeholder="Any additional notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                        style={{ width: '100%', padding: '10px 16px', ...inputBase, resize: 'vertical', boxSizing: 'border-box' }} />
                </div>

                {error && (
                    <div style={{ padding: '10px 14px', background: 'color-mix(in srgb, var(--color-exp) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--color-exp)', fontFamily: 'var(--font-body)' }}>
                        {error}
                    </div>
                )}
            </form>
        </Modal>
    );
}
