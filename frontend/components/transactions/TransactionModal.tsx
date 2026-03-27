'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
    X, FileText, Mic, Camera, ChevronDown,
    Utensils, Car, ShoppingBag, Film, HeartPulse, BookOpen,
    Zap, Home, Briefcase, TrendingUp, Sparkles, Users, Plane,
    Repeat, Gift, CircleDot, Laptop, Package,
} from 'lucide-react';
import { transactionsAPI, categoriesAPI, aiAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

// ─── Category icon helpers ────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
    'utensils': Utensils,
    'car': Car,
    'shopping-bag': ShoppingBag,
    'film': Film,
    'heart-pulse': HeartPulse,
    'book-open': BookOpen,
    'zap': Zap,
    'home': Home,
    'briefcase': Briefcase,
    'trending-up': TrendingUp,
    'sparkles': Sparkles,
    'users': Users,
    'plane': Plane,
    'repeat': Repeat,
    'gift': Gift,
    'circle-dot': CircleDot,
    'laptop': Laptop,
    'package': Package,
};

const CategoryIcon = ({ name, size = 14, color = 'currentColor' }: {
    name: string; size?: number; color?: string;
}) => {
    if (!name) return <span style={{ fontSize: size }}>📦</span>;
    const Icon = ICON_MAP[name];
    if (Icon) return <Icon size={size} color={color} />;
    return <span style={{ fontSize: size, lineHeight: 1 }}>{name}</span>;
};

// ─── Dropdown option ─────────────────────────────────────────────────────────

function CatOption({ cat, selected, onSelect, onDelete }: {
    cat: any; selected: boolean; onSelect: () => void; onDelete: () => void;
}) {
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
            style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '9px 14px', cursor: 'pointer',
                background: selected ? 'var(--bg-hover)' : 'transparent',
                transition: 'background 0.1s',
            }}
            onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
            <CategoryIcon name={cat.icon} size={14} color={cat.color} />
            <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)', fontFamily: 'DM Sans, sans-serif' }}>
                {cat.name}
            </span>
            {Number(cat.usage_count) > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {cat.usage_count}×
                </span>
            )}
            <button
                type="button"
                onClick={handleDelete}
                style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: '2px 4px', borderRadius: '4px',
                    fontSize: '11px', lineHeight: 1, flexShrink: 0,
                    display: 'flex', alignItems: 'center',
                    transition: 'color 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
                title="Delete category"
            >
                ✕
            </button>
        </div>
    );
}

// ─── Date Picker Field ────────────────────────────────────────────────────────
// ─── Calendar grid helper ───────────────────────────────────────────────────────────────

function buildCalDays(month: number, year: number) {
    const first = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrev = new Date(year, month, 0).getDate()
    const cells: { day: number; month: 'prev' | 'cur' | 'next' }[] = []

    for (let i = first - 1; i >= 0; i--)
        cells.push({ day: daysInPrev - i, month: 'prev' })

    for (let d = 1; d <= daysInMonth; d++)
        cells.push({ day: d, month: 'cur' })

    const remaining = 42 - cells.length
    for (let d = 1; d <= remaining; d++)
        cells.push({ day: d, month: 'next' })

    return cells
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
    const [form, setForm] = useState({
        type: 'expense' as 'income' | 'expense',
        amount: '', description: '', notes: '',
        date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        category_id: '', tags: [] as string[],
    });
    const [tagInput, setTagInput] = useState('');
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Category dropdown
    const [catDropdownOpen, setCatDropdownOpen] = useState(false);
    const catDropdownRef = useRef<HTMLDivElement>(null);

    // Add-category inline form
    const [showAddCat, setShowAddCat] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    const [newCatColor, setNewCatColor] = useState('#6366f1');
    const [addCatLoading, setAddCatLoading] = useState(false);

    // AI new-category prompt
    const [pendingNewCategory, setPendingNewCategory] = useState('');
    const [showNewCategoryPrompt, setShowNewCategoryPrompt] = useState(false);
    const [approvingCat, setApprovingCat] = useState(false);

    // SMS
    const [showSmsOverlay, setShowSmsOverlay] = useState(false);
    const [smsText, setSmsText] = useState('');
    const [smsLoading, setSmsLoading] = useState(false);
    const [isParsing, setIsParsing] = useState(false);

    // Image
    const [imageLoading, setImageLoading] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Voice
    const [voiceListening, setVoiceListening] = useState(false);
    const [voiceSupported, setVoiceSupported] = useState(false);
    const recognitionRef = useRef<any>(null);

    // Calendar
    const [calOpen, setCalOpen] = useState(false)
    const [calMonth, setCalMonth] = useState(new Date().getMonth())
    const [calYear, setCalYear] = useState(new Date().getFullYear())
    const dateRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setVoiceSupported(!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        categoriesAPI.getAll()
            .then(res => setCategories(res.data.categories || []))
            .catch(() => setCategories([]));
    }, [isOpen]);

    // Close category dropdown on outside click
    useEffect(() => {
        if (!catDropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node)) {
                setCatDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [catDropdownOpen]);

    // Close calendar on outside click
    useEffect(() => {
        if (!calOpen) return
        const handler = (e: MouseEvent) => {
            if (dateRef.current && !dateRef.current.contains(e.target as Node)) {
                setCalOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [calOpen])

    // Populate form when modal opens or transaction/prefill changes
    useEffect(() => {
        if (transaction) {
            const rawDate = (transaction.date || '').split('T')[0];
            setForm({
                type: transaction.type,
                amount: transaction.amount,
                description: transaction.description,
                notes: transaction.notes || '',
                date: rawDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
                category_id: transaction.category_id || '',
                tags: Array.isArray(transaction.tags) ? transaction.tags : [],
            });
        } else if (prefill) {
            setForm({
                type: prefill.type === 'income' ? 'income' : 'expense',
                amount: prefill.amount ? String(prefill.amount) : '',
                description: prefill.description || '',
                notes: prefill.notes || '',
                date: prefill.date || defaultDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
                category_id: '',
                tags: [],
            });
            setTagInput('');
        } else {
            setForm({ type: 'expense', amount: '', description: '', notes: '', date: defaultDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), category_id: '', tags: [] });
            setTagInput('');
        }
        setError('');
        setImagePreview(null);
        setCatDropdownOpen(false);
        setShowAddCat(false);
        setShowNewCategoryPrompt(false);
        setPendingNewCategory('');
    }, [transaction, isOpen, defaultDate, prefill]);

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

        // Fill all non-category fields first
        setForm(prev => ({
            ...prev,
            amount: parsed.amount ? String(parsed.amount) : prev.amount,
            description: parsed.description || parsed.merchant || prev.description,
            date: parsed.date || prev.date,
            type: parsed.type === 'income' ? 'income' : 'expense',
            notes: parsed.notes || prev.notes,
        }));

        // Try to match category
        const matched = findCategory(categories, parsed.category || '');
        if (matched) {
            setForm(prev => ({ ...prev, category_id: String(matched.id) }));
        } else if (parsed.category) {
            // No match — prompt user to approve creating it
            setPendingNewCategory(parsed.category);
            setShowNewCategoryPrompt(true);
        }
    };

    const handleApproveNewCategory = async () => {
        if (!pendingNewCategory) return;
        setApprovingCat(true);
        try {
            const colors = [
                '#f59e0b', '#3b82f6', '#ec4899', '#a855f7', '#10b981',
                '#06b6d4', '#f97316', '#8b5cf6', '#059669', '#f43f5e',
            ];
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
        // Optimistic remove
        setCategories(prev => prev.filter(c => c.id !== cat.id));
        if (form.category_id === String(cat.id)) {
            setForm(prev => ({ ...prev, category_id: '' }));
        }
        try {
            await categoriesAPI.delete(String(cat.id));
        } catch {
            // Restore on failure
            setCategories(prev => [...prev, cat]);
        }
    };

    const handleParseSMS = async () => {
        if (!smsText.trim()) return;
        setSmsLoading(true); setIsParsing(true);
        try {
            const res = await aiAPI.parseSMS(smsText);
            applyParsed(res.data.parsed);
            setShowSmsOverlay(false); setSmsText('');
        } catch { /* silent */ } finally { setSmsLoading(false); setIsParsing(false); }
    };

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImagePreview(URL.createObjectURL(file));
        setImageLoading(true);
        try {
            const res = await aiAPI.parseImage(file);
            applyParsed(res.data.parsed);
        } catch { /* silent */ } finally { setImageLoading(false); }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleVoice = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setError('Voice input is not supported on this device. Please type your transaction.');
            return;
        }
        if (voiceListening) { recognitionRef.current?.stop(); setVoiceListening(false); return; }
        try {
            const recognition = new SpeechRecognition();
            recognitionRef.current = recognition;
            recognition.lang = 'en-IN';
            recognition.interimResults = false;
            recognition.onstart = () => setVoiceListening(true);
            recognition.onend = () => setVoiceListening(false);
            recognition.onerror = (e: any) => {
                setVoiceListening(false);
                const msg = e?.error;
                if (msg === 'not-allowed') setError('Microphone permission denied. Please allow microphone access and try again.');
                else if (msg === 'no-speech') setError('No speech detected. Please try again.');
                else setError('Voice input failed. Please try again or type your transaction.');
            };
            recognition.onresult = async (event: any) => {
                const transcript = event.results[0][0].transcript;
                try { const res = await aiAPI.parseSMS(transcript); applyParsed(res.data.parsed); }
                catch { setError('Could not parse voice input. Please try again or type your transaction.'); }
            };
            recognition.start();
        } catch (e) {
            setVoiceListening(false);
            setError('Voice input is not supported on this device. Please type your transaction.');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setLoading(true);
        try {
            const payload = {
                type: form.type, amount: parseFloat(form.amount),
                description: form.description, notes: form.notes || undefined,
                date: form.date, category_id: form.category_id || undefined,
                tags: form.tags.length > 0 ? form.tags : undefined,
            };
            if (isEditing) await transactionsAPI.update(transaction.id, payload);
            else await transactionsAPI.create(payload);
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
        } catch { /* silent */ } finally { setAddCatLoading(false); }
    };

    const isIncome = form.type === 'income';
    const safeCats = categories || [];

    const sortedCategories = useMemo(() => {
        if (!safeCats.length) return [];
        return [...safeCats].sort((a, b) => {
            const countDiff = (Number(b.usage_count) || 0) - (Number(a.usage_count) || 0);
            if (countDiff !== 0) return countDiff;
            if (a.last_used && b.last_used)
                return new Date(b.last_used).getTime() - new Date(a.last_used).getTime();
            if (a.last_used) return -1;
            if (b.last_used) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [safeCats]);

    const frequentCats = sortedCategories.filter(c => Number(c.usage_count) > 0);
    const neverUsedCats = sortedCategories.filter(c => !Number(c.usage_count));
    const selectedCat = safeCats.find(c => String(c.id) === form.category_id);

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December']
    const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    const selectedDate = form.date ? new Date(form.date + 'T00:00:00') : null
    const todayStr = new Date().toISOString().split('T')[0]

    const handleDayClick = (day: number, monthType: 'prev' | 'cur' | 'next') => {
        let m = calMonth, y = calYear
        if (monthType === 'prev') { m--; if (m < 0) { m = 11; y-- } }
        if (monthType === 'next') { m++; if (m > 11) { m = 0; y++ } }
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        setForm((prev: any) => ({ ...prev, date: dateStr }))
        setCalMonth(m)
        setCalYear(y)
        setCalOpen(false)
    }

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
            {/* SMS overlay */}
            {showSmsOverlay && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px', width: '100%', maxWidth: '420px', boxShadow: 'var(--shadow-modal)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>📱 Paste Bank SMS</span>
                            <button type="button" onClick={() => setShowSmsOverlay(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={16} /></button>
                        </div>
                        <textarea autoFocus placeholder="Paste your bank SMS here…" value={smsText} onChange={e => setSmsText(e.target.value)} rows={4}
                            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: '12px' }} />
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="button" onClick={handleParseSMS} disabled={isParsing || !smsText.trim()}
                                style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 16px', background: isParsing ? 'var(--bg-card)' : 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)', borderRadius: '8px', color: isParsing ? 'var(--text-secondary)' : '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: isParsing ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: isParsing ? 0.7 : 1, transition: 'all 0.15s' }}>
                                {isParsing && <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--text-muted)', borderTopColor: 'var(--accent-blue)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 6 }} />}
                                {isParsing ? 'Parsing…' : 'Extract Details'}
                            </button>
                            <Button type="button" variant="secondary" size="sm" onClick={() => setShowSmsOverlay(false)}>Cancel</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Input helpers */}
            {!isEditing && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setShowSmsOverlay(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                        📱 Parse SMS
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={imageLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: imageLoading ? 'wait' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: imageLoading ? 0.6 : 1 }}>
                        <Camera size={13} />{imageLoading ? 'Scanning…' : 'Scan Receipt'}
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                    <button type="button" onClick={handleVoice}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', background: voiceListening ? 'rgba(244,63,94,0.12)' : 'var(--bg-card)', border: `1px solid ${voiceListening ? 'rgba(244,63,94,0.4)' : 'var(--bg-border)'}`, borderRadius: '8px', color: voiceListening ? '#f43f5e' : 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                        <Mic size={13} style={{ animation: voiceListening ? 'pulse 1s ease-in-out infinite' : 'none' }} />
                        {voiceListening ? 'Listening…' : 'Voice'}
                    </button>
                </div>
            )}

            {/* AI new-category prompt banner */}
            {showNewCategoryPrompt && (
                <div style={{
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--accent-blue)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                }}>
                    <div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                            ✨ New category detected
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                            AI suggested: <strong>"{pendingNewCategory}"</strong>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button
                            type="button"
                            onClick={handleApproveNewCategory}
                            disabled={approvingCat}
                            style={{
                                background: 'var(--accent-blue)', color: '#fff',
                                border: 'none', borderRadius: 6, padding: '5px 12px',
                                fontSize: 12, cursor: approvingCat ? 'wait' : 'pointer',
                                fontWeight: 600, opacity: approvingCat ? 0.7 : 1,
                                fontFamily: 'DM Sans, sans-serif',
                            }}
                        >
                            {approvingCat ? '…' : 'Add it'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowNewCategoryPrompt(false)}
                            style={{
                                background: 'var(--bg-card)', color: 'var(--text-secondary)',
                                border: '1px solid var(--bg-border)', borderRadius: 6,
                                padding: '5px 12px', fontSize: 12, cursor: 'pointer',
                                fontFamily: 'DM Sans, sans-serif',
                            }}
                        >
                            Skip
                        </button>
                    </div>
                </div>
            )}

            {/* Image preview */}
            {imagePreview && (
                <div style={{ marginBottom: '12px', position: 'relative', display: 'inline-block' }}>
                    <img src={imagePreview} alt="Receipt preview" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--bg-border)' }} />
                    <button type="button" onClick={() => setImagePreview(null)} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent-red)', border: 'none', color: '#fff', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
            )}

            <form id="transaction-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Type toggle */}
                <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Type</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '4px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--bg-border)' }}>
                        {(['expense', 'income'] as const).map(t => (
                            <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                                style={{
                                    padding: '10px', borderRadius: '9px',
                                    border: form.type === t ? `1px solid ${t === 'income' ? 'var(--accent-green-border)' : 'var(--accent-red-border)'}` : '1px solid transparent',
                                    background: form.type === t ? (t === 'income' ? 'var(--gradient-green)' : 'var(--gradient-red)') : 'transparent',
                                    color: form.type === t ? (t === 'income' ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-secondary)',
                                    fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', transition: 'all var(--transition-fast)',
                                }}>
                                {t === 'income' ? '↑ Income' : '↓ Expense'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Amount */}
                <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Amount</label>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: isIncome ? 'var(--accent-green)' : 'var(--accent-red)', fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: '1.2rem' }}>₹</span>
                        <input type="number" placeholder="0" min="0.01" step="any" value={form.amount === '0' ? '' : form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required
                            style={{ width: '100%', padding: '14px 16px 14px 36px', background: 'var(--bg-secondary)', color: isIncome ? 'var(--accent-green)' : 'var(--accent-red)', border: `1px solid ${isIncome ? 'var(--accent-green-border)' : 'var(--accent-red-border)'}`, borderRadius: '12px', fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box', transition: 'border-color var(--transition-fast)' }} />
                    </div>
                </div>

                <Input label="Description" type="text" placeholder="e.g. Swiggy order, Monthly salary" icon={<FileText size={15} />} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />

                {/* Category — custom dropdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Category</label>
                    <div ref={catDropdownRef} style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setCatDropdownOpen(v => !v)}
                            style={{
                                width: '100%', padding: '10px 14px',
                                background: 'var(--bg-secondary)',
                                color: selectedCat ? 'var(--text-primary)' : 'var(--text-muted)',
                                border: `1px solid ${catDropdownOpen ? 'var(--accent-blue)' : 'var(--bg-border)'}`,
                                borderRadius: '10px', fontSize: '0.875rem',
                                fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px',
                                transition: 'border-color 0.15s',
                            }}
                        >
                            {selectedCat ? (
                                <>
                                    <CategoryIcon name={selectedCat.icon} size={14} color={selectedCat.color} />
                                    <span style={{ flex: 1, textAlign: 'left' }}>{selectedCat.name}</span>
                                </>
                            ) : (
                                <span style={{ flex: 1, textAlign: 'left' }}>Select a category</span>
                            )}
                            <ChevronDown size={14} style={{ transform: catDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                        </button>

                        {catDropdownOpen && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                                background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
                                borderRadius: '10px', zIndex: 60,
                                maxHeight: '220px', overflowY: 'auto',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                            }}>
                                {sortedCategories.length === 0 ? (
                                    <div style={{ padding: '12px 14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading…</div>
                                ) : (
                                    <>
                                        {frequentCats.length > 0 && (
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '6px 12px 2px', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'DM Sans, sans-serif' }}>
                                                Frequently Used
                                            </div>
                                        )}
                                        {frequentCats.map(cat => (
                                            <CatOption key={cat.id} cat={cat}
                                                selected={form.category_id === String(cat.id)}
                                                onSelect={() => { setForm(prev => ({ ...prev, category_id: String(cat.id) })); setCatDropdownOpen(false); }}
                                                onDelete={() => handleDeleteCategory(cat)}
                                            />
                                        ))}

                                        {neverUsedCats.length > 0 && frequentCats.length > 0 && (
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '6px 12px 2px', borderTop: '1px solid var(--bg-border)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4, fontFamily: 'DM Sans, sans-serif' }}>
                                                All Categories
                                            </div>
                                        )}
                                        {neverUsedCats.map(cat => (
                                            <CatOption key={cat.id} cat={cat}
                                                selected={form.category_id === String(cat.id)}
                                                onSelect={() => { setForm(prev => ({ ...prev, category_id: String(cat.id) })); setCatDropdownOpen(false); }}
                                                onDelete={() => handleDeleteCategory(cat)}
                                            />
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Inline add category */}
                    {!showAddCat ? (
                        <button type="button" onClick={() => setShowAddCat(true)}
                            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: '12px', cursor: 'pointer', padding: '2px 0', fontFamily: 'DM Sans, sans-serif' }}>
                            + Add category
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                            <input type="text" placeholder="Category name" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }} autoFocus
                                style={{ flex: 1, padding: '7px 12px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'DM Sans, sans-serif', outline: 'none' }} />
                            <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
                                style={{ width: '32px', height: '32px', padding: '2px', border: '1px solid var(--bg-border)', borderRadius: '6px', cursor: 'pointer', background: 'none' }} />
                            <button type="button" onClick={handleAddCategory} disabled={addCatLoading || !newCatName.trim()}
                                style={{ padding: '7px 12px', background: 'var(--accent-blue)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '0.8rem', cursor: addCatLoading || !newCatName.trim() ? 'not-allowed' : 'pointer', opacity: addCatLoading || !newCatName.trim() ? 0.6 : 1, fontFamily: 'DM Sans, sans-serif' }}>
                                {addCatLoading ? '…' : 'Add'}
                            </button>
                            <button type="button" onClick={() => { setShowAddCat(false); setNewCatName(''); }}
                                style={{ padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}>
                                ×
                            </button>
                        </div>
                    )}
                </div>

                {/* Date picker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Date</label>
                    <div ref={dateRef} style={{ position: 'relative', width: '100%' }}>

                        {/* Trigger button */}
                        <div
                            onClick={() => setCalOpen(o => !o)}
                            style={{
                                backgroundColor: 'var(--bg-primary)',
                                border: '1px solid var(--bg-border)',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                color: selectedDate ? 'var(--text-primary)' : 'var(--text-muted)',
                                fontSize: '14px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                boxSizing: 'border-box',
                                userSelect: 'none',
                                width: '100%',
                            }}
                        >
                            <span>
                                {selectedDate
                                    ? `${selectedDate.getDate()} ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
                                    : 'Select a date'}
                            </span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                style={{ stroke: 'var(--text-secondary)', flexShrink: 0 }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                                <line x1="8" y1="14" x2="8" y2="14" />
                                <line x1="12" y1="14" x2="12" y2="14" />
                                <line x1="16" y1="14" x2="16" y2="14" />
                                <line x1="8" y1="18" x2="8" y2="18" />
                                <line x1="12" y1="18" x2="12" y2="18" />
                            </svg>
                        </div>

                        {/* Calendar dropdown — opens above */}
                        {calOpen && (
                            <div style={{
                                position: 'absolute',
                                bottom: 'calc(100% + 8px)',
                                left: 0,
                                width: '100%',
                                minWidth: '300px',
                                zIndex: 9999,
                                backgroundColor: 'var(--bg-primary)',
                                border: '1px solid var(--bg-border)',
                                borderRadius: '12px',
                                padding: '16px',
                                boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
                                boxSizing: 'border-box',
                            }}>

                                {/* Header */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <button
                                        onClick={() => { let m = calMonth - 1, y = calYear; if (m < 0) { m = 11; y-- } setCalMonth(m); setCalYear(y) }}
                                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px', padding: '0 8px', lineHeight: 1 }}
                                    >‹</button>
                                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}>
                                        {MONTHS[calMonth]} {calYear}
                                    </span>
                                    <button
                                        onClick={() => { let m = calMonth + 1, y = calYear; if (m > 11) { m = 0; y++ } setCalMonth(m); setCalYear(y) }}
                                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px', padding: '0 8px', lineHeight: 1 }}
                                    >›</button>
                                </div>

                                {/* Weekday headers */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: '4px' }}>
                                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                                        <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, padding: '4px 0' }}>
                                            {d}
                                        </div>
                                    ))}
                                </div>

                                {/* Day grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>
                                    {buildCalDays(calMonth, calYear).map((cell, i) => {
                                        const cy = cell.month === 'prev' ? (calMonth === 0 ? calYear - 1 : calYear) : cell.month === 'next' ? (calMonth === 11 ? calYear + 1 : calYear) : calYear
                                        const cm = cell.month === 'prev' ? (calMonth === 0 ? 12 : calMonth) : cell.month === 'next' ? (calMonth === 11 ? 1 : calMonth + 2) : calMonth + 1
                                        const dateStr = `${cy}-${String(cm).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`
                                        const isSelected = form.date === dateStr
                                        const isToday = todayStr === dateStr
                                        const isOtherMonth = cell.month !== 'cur'
                                        return (
                                            <div
                                                key={i}
                                                onClick={() => handleDayClick(cell.day, cell.month)}
                                                style={{
                                                    width: '36px',
                                                    height: '36px',
                                                    borderRadius: '50%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '13px',
                                                    cursor: 'pointer',
                                                    margin: '0 auto',
                                                    backgroundColor: isSelected ? 'var(--accent-blue)' : 'transparent',
                                                    color: isSelected ? '#fff' : 'var(--text-secondary)',
                                                    opacity: isOtherMonth && !isSelected ? 0.4 : 1,
                                                    outline: (!isSelected && isToday) ? '2px solid var(--accent-blue)' : 'none',
                                                    outlineOffset: '-2px',
                                                    transition: 'background-color 0.1s',
                                                }}
                                                onMouseEnter={e => {
                                                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-hover)'
                                                }}
                                                onMouseLeave={e => {
                                                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
                                                }}
                                            >
                                                {cell.day}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tags */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Tags (optional)</label>
                    {form.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {form.tags.map(tag => (
                                <span key={tag} onClick={() => setForm({ ...form, tags: form.tags.filter(t => t !== tag) })}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--accent-green)', background: 'var(--accent-green-bg)', border: '1px solid var(--accent-green-border)', padding: '3px 10px', borderRadius: '20px', cursor: 'pointer' }}>
                                    #{tag} ×
                                </span>
                            ))}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="text" placeholder="Add tag (press Enter)" value={tagInput} onChange={e => setTagInput(e.target.value.replace(/\s/g, ''))}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                            style={{ flex: 1, padding: '10px 16px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none' }} />
                        <button type="button" onClick={addTag}
                            style={{ padding: '10px 16px', background: 'var(--accent-green-bg)', border: '1px solid var(--accent-green-border)', borderRadius: '10px', color: 'var(--accent-green)', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 }}>
                            Add
                        </button>
                    </div>
                </div>

                {/* Notes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Notes (optional)</label>
                    <textarea placeholder="Any additional notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                        style={{ width: '100%', padding: '10px 16px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>

                {error && <div style={{ padding: '10px 14px', background: 'var(--accent-red-bg)', border: '1px solid var(--accent-red-border)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--accent-red)' }}>{error}</div>}
            </form>
            <style>{`
                @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </Modal>
    );
}
