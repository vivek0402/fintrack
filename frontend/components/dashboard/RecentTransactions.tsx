'use client';

import Link from 'next/link';
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { formatCurrency, formatDate, getCategoryColor, getCategoryBg } from '@/lib/utils';

interface Props { transactions: any[]; currency?: string; }

export function RecentTransactions({ transactions, currency = 'INR' }: Props) {
    const recent = transactions.slice(0, 5);

    return (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    Recent Transactions
                </h3>
                <Link href="/transactions" style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--accent-blue)', fontWeight: 500, padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--accent-blue-border)', background: 'var(--accent-blue-bg)' }}>
                        View all <ArrowRight size={12} />
                    </div>
                </Link>
            </div>
            {recent.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    No transactions yet — add your first one!
                </div>
            ) : (
                <div>
                    {recent.map(tx => {
                        const isIncome = tx.type === 'income';
                        return (
                            <div
                                key={tx.id}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 20px 12px 14px', borderBottom: '1px solid var(--bg-border)',
                                    borderLeft: `3px solid ${getCategoryColor(tx.category_name)}`,
                                    transition: 'background var(--transition-fast)',
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                                        background: getCategoryBg(tx.category_name),
                                        border: '1px solid transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {isIncome ? <TrendingUp size={15} color="var(--accent-green)" /> : <TrendingDown size={15} color="var(--accent-red)" />}
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>{tx.description}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                            {tx.category_name && (
                                                <span style={{ fontSize: '0.68rem', color: tx.category_color || 'var(--text-muted)', background: `${tx.category_color}22`, padding: '1px 6px', borderRadius: '4px' }}>
                                                    {tx.category_name}
                                                </span>
                                            )}
                                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{formatDate(tx.date)}</span>
                                        </div>
                                    </div>
                                </div>
                                <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: isIncome ? 'var(--accent-green)' : 'var(--accent-red)', margin: 0, flexShrink: 0 }}>
                                    {isIncome ? '+' : '-'}{formatCurrency(parseFloat(tx.amount), currency)}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
