'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Download, Sparkles, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCircle, SkeletonText, SkeletonButton } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { TransactionList } from '@/components/transactions/TransactionList';
import { exportToCSV } from '@/lib/utils';

const MONTHS = ['All Months', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function TransactionsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const [transactions, setTransactions] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTx, setEditingTx] = useState<any>(null);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [monthFilter, setMonthFilter] = useState(new Date().getMonth() + 1);
    const [tagFilter, setTagFilter] = useState('');
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [quickAddText, setQuickAddText] = useState('');
    const [quickAddLoading, setQuickAddLoading] = useState(false);
    const [quickAddError, setQuickAddError] = useState('');
    const [placeholderIdx, setPlaceholderIdx] = useState(0);
    const currentYear = new Date().getFullYear();

    const QUICK_ADD_PLACEHOLDERS = [
        'paid 450 for lunch at cafe',
        'received salary 85000',
        'uber 180 to airport',
        'netflix subscription 649',
        'grocery shopping 2300 at dmart',
    ];

    useEffect(() => {
        if (!quickAddOpen) return;
        const t = setInterval(() => setPlaceholderIdx(i => (i + 1) % QUICK_ADD_PLACEHOLDERS.length), 2500);
        return () => clearInterval(t);
    }, [quickAddOpen]);

    const handleQuickAdd = async (e?: React.MouseEvent) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (!quickAddText.trim()) return;
        setQuickAddLoading(true);
        setQuickAddError('');
        try {
            const res = await aiAPI.parseSMS(quickAddText.trim());
            const parsed = res.data.transaction || res.data;
            setQuickAddOpen(false);
            setQuickAddText('');
            setEditingTx(parsed);
            setModalOpen(true);
        } catch (e: any) {
            setQuickAddError('Could not parse — try rephrasing');
        } finally {
            setQuickAddLoading(false);
        }
    };

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchTransactions = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const params = monthFilter > 0 ? { month: monthFilter, year: currentYear } : {};
            const res = await transactionsAPI.getAll(params);
            setTransactions(res.data.transactions);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { if (user) fetchTransactions(); }, [user, monthFilter]);

    useEffect(() => {
        let result = [...transactions];
        if (typeFilter !== 'all') result = result.filter(tx => tx.type === typeFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(tx => tx.description.toLowerCase().includes(q) || tx.category_name?.toLowerCase().includes(q));
        }
        if (tagFilter.trim()) {
            const tag = tagFilter.toLowerCase().replace('#', '');
            result = result.filter(tx => tx.tags && tx.tags.some((t: string) => t.toLowerCase().includes(tag)));
        }
        setFiltered(result);
    }, [transactions, typeFilter, search, tagFilter]);

    const totalIncome = filtered.filter(tx => tx.type === 'income').reduce((s, tx) => s + parseFloat(tx.amount), 0);
    const totalExpense = filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + parseFloat(tx.amount), 0);

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <SkeletonButton />
                <SkeletonButton />
                <Skeleton width="100%" height={36} borderRadius={8} />
            </div>
            {[1,2,3].map(group => (
                <div key={group} style={{ marginBottom: '16px' }}>
                    <Skeleton width="120px" height={14} borderRadius={4} style={{ marginBottom: '10px' }} />
                    {[1,2,3].map(i => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--bg-border)' }}>
                            <SkeletonCircle size={40} />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <SkeletonText />
                                <Skeleton width="50%" height={12} borderRadius={4} />
                            </div>
                            <Skeleton width={72} height={16} borderRadius={4} />
                        </div>
                    ))}
                </div>
            ))}
        </AppLayout>
    );

    return (
        <AppLayout>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Transactions</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {!isMobile && (
                        <Button variant="secondary" size="md" onClick={() => exportToCSV(filtered, `fintrack-${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}.csv`)}>
                            <Download size={16} />Export CSV
                        </Button>
                    )}
                    <Button variant="secondary" size="md" onClick={() => { setQuickAddOpen(true); setQuickAddText(''); setQuickAddError(''); }}>
                        <Sparkles size={16} />Quick Add ✨
                    </Button>
                    <Button onClick={() => { setEditingTx(null); setModalOpen(true); }} size="md">
                        <Plus size={16} />{isMobile ? 'Add' : 'Add Transaction'}
                    </Button>
                </div>
            </div>

            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Income', value: totalIncome, color: 'var(--accent-green)' },
                    { label: 'Expenses', value: totalExpense, color: 'var(--accent-red)' },
                    { label: 'Net', value: totalIncome - totalExpense, color: totalIncome - totalExpense >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
                ].map(card => (
                    <div key={card.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '14px', padding: '14px 16px' }}>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>{card.label}</p>
                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: card.color, margin: 0 }}>₹{Math.abs(card.value).toLocaleString('en-IN')}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                    <Input type="text" placeholder="Search transactions..." icon={<Search size={15} />} value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {['all', 'income', 'expense'].map(t => (
                        <button key={t} onClick={() => setTypeFilter(t)}
                            style={{ padding: '8px 10px', borderRadius: '10px', border: typeFilter === t ? '1px solid var(--accent-green-border)' : '1px solid var(--bg-border)', background: typeFilter === t ? 'var(--accent-green-bg)' : 'var(--bg-secondary)', color: typeFilter === t ? 'var(--accent-green)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize', transition: 'all var(--transition-fast)' }}>
                            {t === 'all' ? 'All' : t}
                        </button>
                    ))}
                </div>
                <select value={monthFilter} onChange={e => setMonthFilter(Number(e.target.value))}
                    style={{ padding: '8px 12px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.78rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer' }}>
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <input type="text" placeholder="#tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)}
                    style={{ padding: '8px 12px', background: tagFilter ? 'rgba(139,92,246,0.1)' : 'var(--bg-secondary)', color: tagFilter ? '#8b5cf6' : 'var(--text-primary)', border: tagFilter ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--bg-border)', borderRadius: '10px', fontSize: '0.78rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', width: '80px', transition: 'all 0.2s' }} />
            </div>

            {/* List */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
                ) : (
                    <TransactionList transactions={filtered} currency={user.currency} onEdit={tx => { setEditingTx(tx); setModalOpen(true); }} onRefresh={fetchTransactions} />
                )}
            </div>

            <TransactionModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingTx(null); }} onSuccess={fetchTransactions} transaction={editingTx} />

            {/* Quick Add Modal */}
            {quickAddOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={e => { if (e.target === e.currentTarget) { setQuickAddOpen(false); } }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Sparkles size={18} color="#10b981" />
                                </div>
                                <div>
                                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Quick Add</h3>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0 }}>Describe the transaction in plain language</p>
                                </div>
                            </div>
                            <button onClick={() => setQuickAddOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}><X size={18} /></button>
                        </div>

                        <textarea
                            value={quickAddText}
                            onChange={e => setQuickAddText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleQuickAdd(); }}
                            placeholder={QUICK_ADD_PLACEHOLDERS[placeholderIdx]}
                            rows={3}
                            autoFocus
                            style={{ width: '100%', padding: '14px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '12px', fontSize: '0.95rem', fontFamily: 'DM Sans, sans-serif', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, transition: 'border-color 0.15s' }}
                            onFocus={e => (e.target.style.borderColor = 'rgba(16,185,129,0.5)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--bg-border)')}
                        />

                        {quickAddError && <p style={{ fontSize: '0.8rem', color: '#f43f5e', margin: '8px 0 0 0' }}>{quickAddError}</p>}

                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
                            <Button type="button" variant="secondary" size="md" onClick={() => setQuickAddOpen(false)}>Cancel</Button>
                            <Button type="button" size="md" onClick={handleQuickAdd} isLoading={quickAddLoading} disabled={!quickAddText.trim()}>
                                <Sparkles size={14} />Parse & Fill
                            </Button>
                        </div>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '12px 0 0 0', textAlign: 'center' }}>AI will parse your text and pre-fill the transaction form</p>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}