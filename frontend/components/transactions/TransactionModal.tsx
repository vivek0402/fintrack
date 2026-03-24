'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, IndianRupee, FileText } from 'lucide-react';
import { transactionsAPI, categoriesAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    transaction?: any;
    defaultDate?: string;
}

export function TransactionModal({ isOpen, onClose, onSuccess, transaction, defaultDate }: Props) {
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

    useEffect(() => {
        if (!isOpen) return;
        categoriesAPI.getAll().then(res => setCategories(res.data.categories));
    }, [isOpen]);

    useEffect(() => {
        if (transaction) {
            setForm({
                type: transaction.type, amount: transaction.amount,
                description: transaction.description, notes: transaction.notes || '',
                date: transaction.date.split('T')[0],
                category_id: transaction.category_id || '',
                tags: transaction.tags || [],
            });
        } else {
            setForm({
                type: 'expense', amount: '', description: '', notes: '',
                date: defaultDate || new Date().toISOString().split('T')[0],
                category_id: '', tags: []
            });
            setTagInput('');
        }
        setError('');
    }, [transaction, isOpen, defaultDate]);

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

    if (!isOpen) return null;

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 100 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: '480px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '20px', padding: '28px', zIndex: 101, maxHeight: '90vh', overflowY: 'auto' }}>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        {isEditing ? 'Edit Transaction' : 'Add Transaction'}
                    </h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* Type */}
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Type</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {(['expense', 'income'] as const).map(t => (
                                <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                                    style={{ padding: '10px', borderRadius: '10px', border: form.type === t ? `1px solid ${t === 'income' ? '#10b981' : '#f43f5e'}` : '1px solid var(--bg-border)', background: form.type === t ? t === 'income' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)' : 'var(--bg-card)', color: form.type === t ? t === 'income' ? '#10b981' : '#f43f5e' : 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>
                                    {t === 'income' ? '↑ Income' : '↓ Expense'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <Input label="Amount (₹)" type="number" placeholder="0.00" min="0.01" step="0.01" icon={<IndianRupee size={15} />} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
                    <Input label="Description" type="text" placeholder="e.g. Swiggy order, Monthly salary" icon={<FileText size={15} />} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />

                    {/* Category */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Category</label>
                        <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                            style={{ width: '100%', padding: '10px 16px', background: 'var(--bg-card)', color: form.category_id ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid var(--bg-border)', borderRadius: '12px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer' }}>
                            <option value="">Select a category</option>
                            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                    </div>

                    <Input label="Date" type="date" icon={<Calendar size={15} />} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />

                    {/* Tags */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Tags (optional)</label>
                        {form.tags.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {form.tags.map(tag => (
                                    <span key={tag} onClick={() => setForm({ ...form, tags: form.tags.filter(t => t !== tag) })}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', padding: '3px 10px', borderRadius: '20px', cursor: 'pointer' }}>
                                        #{tag} ×
                                    </span>
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" placeholder="Add tag (press Enter)" value={tagInput}
                                onChange={e => setTagInput(e.target.value.replace(/\s/g, ''))}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                                style={{ flex: 1, padding: '10px 16px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '12px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none' }} />
                            <button type="button" onClick={addTag}
                                style={{ padding: '10px 16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '12px', color: '#10b981', fontSize: '0.875rem', cursor: 'pointer' }}>
                                Add
                            </button>
                        </div>
                    </div>

                    {/* Notes */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Notes (optional)</label>
                        <textarea placeholder="Any additional notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                            style={{ width: '100%', padding: '10px 16px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '12px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                    </div>

                    {error && <div style={{ padding: '10px 14px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', fontSize: '0.8rem', color: '#f87171' }}>{error}</div>}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                        <Button type="button" variant="secondary" size="lg" onClick={onClose}>Cancel</Button>
                        <Button type="submit" size="lg" isLoading={loading}>{isEditing ? 'Save Changes' : 'Add Transaction'}</Button>
                    </div>
                </form>
            </div>
        </>
    );
}