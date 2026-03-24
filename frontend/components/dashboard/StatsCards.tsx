'use client';

import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Props {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    savingsRate: number;
    currency?: string;
}

export function StatsCards({ totalIncome, totalExpenses, balance, savingsRate, currency = 'INR' }: Props) {
    const cards = [
        { label: 'Total Income', value: formatCurrency(totalIncome, currency), icon: TrendingUp, color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.15)' },
        { label: 'Total Expenses', value: formatCurrency(totalExpenses, currency), icon: TrendingDown, color: '#f43f5e', bg: 'rgba(244,63,94,0.08)', border: 'rgba(244,63,94,0.15)' },
        { label: 'Net Balance', value: formatCurrency(balance, currency), icon: Wallet, color: balance >= 0 ? '#3b82f6' : '#f43f5e', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.15)' },
        { label: 'Savings Rate', value: `${savingsRate}%`, icon: PiggyBank, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.15)' },
    ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {cards.map(card => {
                const Icon = card.icon;
                return (
                    <div key={card.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{card.label}</span>
                            <div style={{ width: '32px', height: '32px', background: card.bg, border: `1px solid ${card.border}`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Icon size={15} color={card.color} />
                            </div>
                        </div>
                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.3rem', fontWeight: 700, color: card.color, margin: 0 }}>
                            {card.value}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}