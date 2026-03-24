'use client';

import { useState } from 'react';
import { Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { transactionsAPI } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Props {
    transactions: any[];
    currency?: string;
    onEdit: (tx: any) => void;
    onRefresh: () => void;
}

export function TransactionList({ transactions, currency = 'INR', onEdit, onRefresh }: Props) {
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this transaction?')) return;
        setDeletingId(id);
        try { await transactionsAPI.delete(id); onRefresh(); }
        catch { alert('Failed to delete.'); }
        finally { setDeletingId(null); }
    };

    if (transactions.length === 0) {
        return (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No transactions found
            </div>
        );
    }

    return (
        <div>
            {transactions.map(tx => {
                const isIncome = tx.type === 'income';
                return (
                    <div key={tx.id}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--bg-border)', gap: '12px' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: isIncome ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {isIncome ? <TrendingUp size={15} color="#10b981" /> : <TrendingDown size={15} color="#f43f5e" />}
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.description}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                    {tx.category_name && (
                                        <span style={{ fontSize: '0.68rem', color: tx.category_color || 'var(--text-muted)', background: `${tx.category_color}20`, padding: '1px 6px', borderRadius: '4px', fontWeight: 500 }}>{tx.category_name}</span>
                                    )}
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{formatDate(tx.date)}</span>
                                    {tx.tags && tx.tags.map((tag: string) => (
                                        <span key={tag} style={{ fontSize: '0.68rem', color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', padding: '1px 6px', borderRadius: '10px' }}>#{tag}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: isIncome ? '#10b981' : '#f43f5e', margin: 0 }}>
                                {isIncome ? '+' : '-'}{formatCurrency(parseFloat(tx.amount), currency)}
                            </p>
                            <button onClick={() => onEdit(tx)} style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.1)'; (e.currentTarget as HTMLElement).style.color = '#3b82f6'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                <Pencil size={13} />
                            </button>
                            <button onClick={() => handleDelete(tx.id)} disabled={deletingId === tx.id} style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: deletingId === tx.id ? 0.5 : 1, transition: 'all 0.15s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(244,63,94,0.1)'; (e.currentTarget as HTMLElement).style.color = '#f43f5e'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                <Trash2 size={13} />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}