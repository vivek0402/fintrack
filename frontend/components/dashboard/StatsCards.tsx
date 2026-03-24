'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Props {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    savingsRate: number;
    currency?: string;
}

function useCountUp(target: number, duration = 900) {
    const [value, setValue] = useState(0);
    useEffect(() => {
        let start = 0;
        const step = target / (duration / 16);
        const timer = setInterval(() => {
            start += step;
            if (start >= target) { setValue(target); clearInterval(timer); }
            else setValue(start);
        }, 16);
        return () => clearInterval(timer);
    }, [target]);
    return value;
}

export function StatsCards({ totalIncome, totalExpenses, balance, savingsRate, currency = 'INR' }: Props) {
    const animIncome = useCountUp(totalIncome);
    const animExpenses = useCountUp(totalExpenses);
    const animBalance = useCountUp(Math.abs(balance));
    const animSavings = useCountUp(savingsRate);

    const cards = [
        {
            label: 'Total Income', animValue: animIncome,
            icon: TrendingUp, gradient: 'var(--gradient-green)',
            glow: 'var(--shadow-glow-green)', accent: 'var(--accent-green)',
            accentBg: 'var(--accent-green-bg)', accentBorder: 'var(--accent-green-border)',
            format: (v: number) => formatCurrency(v, currency),
        },
        {
            label: 'Total Expenses', animValue: animExpenses,
            icon: TrendingDown, gradient: 'var(--gradient-red)',
            glow: 'var(--shadow-glow-red)', accent: 'var(--accent-red)',
            accentBg: 'var(--accent-red-bg)', accentBorder: 'var(--accent-red-border)',
            format: (v: number) => formatCurrency(v, currency),
        },
        {
            label: 'Net Balance', animValue: animBalance,
            icon: Wallet, gradient: 'var(--gradient-blue)',
            glow: 'var(--shadow-glow-blue)', accent: balance >= 0 ? 'var(--accent-blue)' : 'var(--accent-red)',
            accentBg: 'var(--accent-blue-bg)', accentBorder: 'var(--accent-blue-border)',
            format: (v: number) => (balance < 0 ? '-' : '') + formatCurrency(v, currency),
        },
        {
            label: 'Savings Rate', animValue: animSavings,
            icon: PiggyBank, gradient: 'var(--gradient-yellow)',
            glow: '0 0 24px var(--accent-yellow-border)', accent: 'var(--accent-yellow)',
            accentBg: 'var(--accent-yellow-bg)', accentBorder: 'var(--accent-yellow-border)',
            format: (v: number) => `${Math.round(v)}%`,
        },
    ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            {cards.map(card => {
                const Icon = card.icon;
                return (
                    <div
                        key={card.label}
                        style={{
                            background: card.gradient,
                            border: `1px solid ${card.accentBorder}`,
                            borderRadius: '16px', padding: '18px',
                            boxShadow: 'var(--shadow-card)',
                            transition: 'all var(--transition-base)',
                            cursor: 'default',
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                            (e.currentTarget as HTMLElement).style.boxShadow = card.glow;
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.transform = '';
                            (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card)';
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{card.label}</span>
                            <div style={{ width: '32px', height: '32px', background: card.accentBg, border: `1px solid ${card.accentBorder}`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Icon size={15} color={card.accent} />
                            </div>
                        </div>
                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.25rem', fontWeight: 700, color: card.accent, margin: 0, letterSpacing: '-0.02em' }}>
                            {card.format(card.animValue)}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}
