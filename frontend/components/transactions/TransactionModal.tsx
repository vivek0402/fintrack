'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, FileText } from 'lucide-react';
import { transactionsAPI, categoriesAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useIsMobile } from '@/hooks/useWindowSize';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    transaction?: any;
    defaultDate?: string;
}

export function TransactionModal({ isOpen, onClose, onSuccess, transaction, defaultDate }: Props) {
    const isEditing = !!transaction;
    const isMobile = useIsMobile();
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
            setForm({ type: 'expense', amount: '', description: '', notes: '', date: defaultDate || new Date().toISOString().split('T')[0], category_id: '', tags: [] });
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

    const isIncome = form.type === 'income';

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', zIndex: 100 }} />
            <div style={{
                position: 'fixed', zIndex: 101,
                ...(isMobile
                    ? { bottom: 0, left: 0, right: 0, borderRadius: '20px 20px 0 0', maxHeight: '92vh' }
                    : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: '480px', borderRadius: '20px', maxHeight: '90vh' }
                ),
                background: 'var(--bg-secondary)',
                border: '1px solid var(--bg-border)',
                boxShadow: 'var(--shadow-modal)',
                overflowY: 'auto',
                padding: '24px',
            }}>
                {isMobile && <div style={{ width: '36px', height: '4px', background: 'var(--bg-border)', borderRadius: '2px', margin: '0 auto 16px' }} />}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
                    <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        {isEditing ? 'Edit Transaction' : 'Add Transaction'}
                    </h2>
                    <button onClick={onClose} style={{ background: 'var(--bg-hover)', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: '6px', borderRadius: '8px' }}>
                        <X size={18} />
                    </button>
                </div>

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
            </div>
        </>
    );
}
