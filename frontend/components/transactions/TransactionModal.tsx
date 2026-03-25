'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Calendar, FileText, Mic, Camera } from 'lucide-react';
import { transactionsAPI, categoriesAPI, aiAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    transaction?: any;
    prefill?: any;
    defaultDate?: string;
}

export function TransactionModal({ isOpen, onClose, onSuccess, transaction, prefill, defaultDate }: Props) {
    const isEditing = !!transaction;
    const [form, setForm] = useState({
        type: 'expense' as 'income' | 'expense',
        amount: '', description: '', notes: '',
        date: new Date().toISOString().split('T')[0],
        category_id: '', tags: [] as string[],
    });
    const [tagInput, setTagInput] = useState('');
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // SMS state
    const [showSmsOverlay, setShowSmsOverlay] = useState(false);
    const [smsText, setSmsText] = useState('');
    const [smsLoading, setSmsLoading] = useState(false);
    const [isParsing, setIsParsing] = useState(false);

    // Image state
    const [imageLoading, setImageLoading] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Voice state
    const [voiceListening, setVoiceListening] = useState(false);
    const [voiceSupported, setVoiceSupported] = useState(false);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setVoiceSupported(!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        categoriesAPI.getAll().then(res => setCategories(res.data.categories));
    }, [isOpen]);

    // Populate form when modal opens or transaction/prefill changes
    useEffect(() => {
        if (transaction) {
            const rawDate = (transaction.date || '').split('T')[0];
            setForm({
                type: transaction.type,
                amount: transaction.amount,
                description: transaction.description,
                notes: transaction.notes || '',
                date: rawDate || new Date().toISOString().split('T')[0],
                category_id: transaction.category_id || '',
                tags: Array.isArray(transaction.tags) ? transaction.tags : [],
            });
        } else if (prefill) {
            setForm({
                type: prefill.type === 'income' ? 'income' : 'expense',
                amount: prefill.amount ? String(prefill.amount) : '',
                description: prefill.description || '',
                notes: prefill.notes || '',
                date: prefill.date || defaultDate || new Date().toISOString().split('T')[0],
                category_id: '', // matched below once categories load
                tags: [],
            });
            setTagInput('');
        } else {
            setForm({ type: 'expense', amount: '', description: '', notes: '', date: defaultDate || new Date().toISOString().split('T')[0], category_id: '', tags: [] });
            setTagInput('');
        }
        setError('');
        setImagePreview(null);
    }, [transaction, isOpen, defaultDate, prefill]);

    // Fuzzy-match an AI category string against the real category list
    const findCategory = (cats: any[], aiCat: string) => {
        if (!aiCat || !cats.length) return null;
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        const ai = norm(aiCat);
        // 1. Exact
        let m = cats.find(c => norm(c.name) === ai);
        if (m) return m;
        // 2. One contains the other
        m = cats.find(c => { const db = norm(c.name); return db.includes(ai) || ai.includes(db); });
        if (m) return m;
        // 3. Any significant word overlap
        const aiWords = new Set(ai.split(' ').filter(w => w.length > 2));
        m = cats.find(c => norm(c.name).split(' ').some((w: string) => w.length > 2 && aiWords.has(w)));
        return m || null;
    };

    // Match prefill category string → category_id once categories are loaded
    useEffect(() => {
        if (!prefill?.category || !categories.length) return;
        const matched = findCategory(categories, prefill.category);
        if (matched) {
            setForm(prev => ({ ...prev, category_id: String(matched.id) }));
        }
    }, [prefill, categories]);

    const applyParsed = (parsed: any) => {
        if (!parsed) return;
        const matched = findCategory(categories, parsed.category || '');
        setForm(prev => ({
            ...prev,
            amount: parsed.amount ? String(parsed.amount) : prev.amount,
            description: parsed.description || parsed.merchant || prev.description,
            date: parsed.date || prev.date,
            type: parsed.type === 'income' ? 'income' : 'expense',
            notes: parsed.notes || prev.notes,
            category_id: matched ? String(matched.id) : prev.category_id,
        }));
    };

    // SMS parsing
    const handleParseSMS = async () => {
        if (!smsText.trim()) return;
        setSmsLoading(true);
        setIsParsing(true);
        try {
            const res = await aiAPI.parseSMS(smsText);
            applyParsed(res.data.parsed);
            setShowSmsOverlay(false);
            setSmsText('');
        } catch {
            // silent fail — user keeps manual form
        } finally {
            setSmsLoading(false);
            setIsParsing(false);
        }
    };

    // Receipt image parsing
    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImagePreview(URL.createObjectURL(file));
        setImageLoading(true);
        try {
            const res = await aiAPI.parseImage(file);
            applyParsed(res.data.parsed);
        } catch {
            // silent fail
        } finally {
            setImageLoading(false);
        }
        // reset so same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Voice input
    const handleVoice = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        if (voiceListening) {
            recognitionRef.current?.stop();
            setVoiceListening(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'en-IN';
        recognition.interimResults = false;

        recognition.onstart = () => setVoiceListening(true);
        recognition.onend = () => setVoiceListening(false);
        recognition.onerror = () => setVoiceListening(false);

        recognition.onresult = async (event: any) => {
            const transcript = event.results[0][0].transcript;
            try {
                const res = await aiAPI.parseSMS(transcript);
                applyParsed(res.data.parsed);
            } catch {
                // silent fail
            }
        };

        recognition.start();
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

    const isIncome = form.type === 'income';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Transaction' : 'Add Transaction'}>
            {/* SMS overlay — position:fixed, renders above the modal */}
            {showSmsOverlay && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px', width: '100%', maxWidth: '420px', boxShadow: 'var(--shadow-modal)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>📱 Paste Bank SMS</span>
                            <button type="button" onClick={() => setShowSmsOverlay(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={16} /></button>
                        </div>
                        <textarea
                            autoFocus
                            placeholder="Paste your bank SMS here…"
                            value={smsText}
                            onChange={e => setSmsText(e.target.value)}
                            rows={4}
                            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: '12px' }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={handleParseSMS}
                                disabled={isParsing || !smsText.trim()}
                                style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 16px', background: isParsing ? 'var(--bg-card)' : 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)', borderRadius: '8px', color: isParsing ? 'var(--text-secondary)' : '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: isParsing ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: isParsing ? 0.7 : 1, transition: 'all 0.15s' }}
                            >
                                {isParsing && (
                                    <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--text-muted)', borderTopColor: 'var(--accent-blue)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 6 }} />
                                )}
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
                        <button
                            type="button"
                            onClick={() => setShowSmsOverlay(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                        >
                            📱 Parse SMS
                        </button>

                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={imageLoading}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: imageLoading ? 'wait' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: imageLoading ? 0.6 : 1 }}
                        >
                            <Camera size={13} />
                            {imageLoading ? 'Scanning…' : 'Scan Receipt'}
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />

                        {voiceSupported && (
                            <button
                                type="button"
                                onClick={handleVoice}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', background: voiceListening ? 'rgba(244,63,94,0.12)' : 'var(--bg-card)', border: `1px solid ${voiceListening ? 'rgba(244,63,94,0.4)' : 'var(--bg-border)'}`, borderRadius: '8px', color: voiceListening ? '#f43f5e' : 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                            >
                                <Mic size={13} style={{ animation: voiceListening ? 'pulse 1s ease-in-out infinite' : 'none' }} />
                                {voiceListening ? 'Listening…' : 'Voice'}
                            </button>
                        )}
                    </div>
                )}

                {/* Image preview */}
                {imagePreview && (
                    <div style={{ marginBottom: '12px', position: 'relative', display: 'inline-block' }}>
                        <img src={imagePreview} alt="Receipt preview" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--bg-border)' }} />
                        <button type="button" onClick={() => setImagePreview(null)} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent-red)', border: 'none', color: '#fff', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                            <input type="number" placeholder="0.00" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required
                                style={{ width: '100%', padding: '14px 16px 14px 36px', background: 'var(--bg-secondary)', color: isIncome ? 'var(--accent-green)' : 'var(--accent-red)', border: `1px solid ${isIncome ? 'var(--accent-green-border)' : 'var(--accent-red-border)'}`, borderRadius: '12px', fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box', transition: 'border-color var(--transition-fast)' }} />
                        </div>
                    </div>

                    <Input label="Description" type="text" placeholder="e.g. Swiggy order, Monthly salary" icon={<FileText size={15} />} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Category</label>
                        <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                            style={{ width: '100%', padding: '10px 16px', background: 'var(--bg-secondary)', color: form.category_id ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer' }}>
                            <option value="">Select a category</option>
                            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                    </div>

                    <Input label="Date" type="date" icon={<Calendar size={15} />} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />

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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Notes (optional)</label>
                        <textarea placeholder="Any additional notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                            style={{ width: '100%', padding: '10px 16px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                    </div>

                    {error && <div style={{ padding: '10px 14px', background: 'var(--accent-red-bg)', border: '1px solid var(--accent-red-border)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--accent-red)' }}>{error}</div>}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                        <Button type="button" variant="secondary" size="lg" onClick={onClose}>Cancel</Button>
                        <Button type="submit" size="lg" isLoading={loading}>{isEditing ? 'Save Changes' : 'Add Transaction'}</Button>
                    </div>
                </form>
            <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
        </Modal>
    );
}
