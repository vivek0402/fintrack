'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Download } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
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
    const currentYear = new Date().getFullYear();

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
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '24px', height: '24px', border: '2px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
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
                    <Button onClick={() => { setEditingTx(null); setModalOpen(true); }} size="md">
                        <Plus size={16} />{isMobile ? 'Add' : 'Add Transaction'}
                    </Button>
                </div>
            </div>

            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Income', value: totalIncome, color: '#10b981' },
                    { label: 'Expenses', value: totalExpense, color: '#f43f5e' },
                    { label: 'Net', value: totalIncome - totalExpense, color: totalIncome - totalExpense >= 0 ? '#10b981' : '#f43f5e' },
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
                            style={{ padding: '8px 10px', borderRadius: '10px', border: typeFilter === t ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--bg-border)', background: typeFilter === t ? 'rgba(16,185,129,0.1)' : 'var(--bg-secondary)', color: typeFilter === t ? '#10b981' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s' }}>
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
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}