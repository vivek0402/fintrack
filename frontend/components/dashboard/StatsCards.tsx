'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useWindowSize';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Props {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    savingsRate: number;
    currency?: string;
    month?: number;
    year?: number;
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

export function StatsCards({ totalIncome, totalExpenses, balance, savingsRate, currency = 'INR', month = new Date().getMonth() + 1, year = new Date().getFullYear() }: Props) {
    const isMobile = useIsMobile();
    const animIncome = useCountUp(totalIncome);
    const animExpenses = useCountUp(totalExpenses);
    const animBalance = useCountUp(Math.abs(balance));
    const animSavings = useCountUp(savingsRate);

    const savingsLabel = savingsRate < 10 ? 'Needs work' : savingsRate <= 20 ? 'Getting there' : 'On track';
    const periodLabel = `${MONTH_NAMES[month]} ${year}`;

    const cards = [
        {
            id: 'income',
            label: 'TOTAL INCOME',
            animValue: animIncome,
            icon: TrendingUp,
            bg: 'linear-gradient(135deg,#062e1a,#0d2818,#0a1f12)',
            glowBg: 'linear-gradient(135deg,#10b981,transparent)',
            accent: '#10b981',
            iconBg: 'rgba(16,185,129,0.15)',
            format: (v: number) => formatCurrency(v, currency),
            subLabel: periodLabel,
        },
        {
            id: 'expenses',
            label: 'TOTAL EXPENSES',
            animValue: animExpenses,
            icon: TrendingDown,
            bg: 'linear-gradient(135deg,#2d0a12,#1e0a10,#180810)',
            glowBg: 'linear-gradient(135deg,#f43f5e,transparent)',
            accent: '#f43f5e',
            iconBg: 'rgba(244,63,94,0.15)',
            format: (v: number) => formatCurrency(v, currency),
            subLabel: periodLabel,
        },
        {
            id: 'balance',
            label: 'NET BALANCE',
            animValue: animBalance,
            icon: Wallet,
            bg: 'linear-gradient(135deg,#091628,#0d1a2a,#081320)',
            glowBg: 'linear-gradient(135deg,#3b82f6,transparent)',
            accent: '#3b82f6',
            iconBg: 'rgba(59,130,246,0.15)',
            format: (v: number) => (balance < 0 ? '-' : '') + formatCurrency(v, currency),
            subLabel: 'All time',
        },
        {
            id: 'savings',
            label: 'SAVINGS RATE',
            animValue: animSavings,
            icon: PiggyBank,
            bg: 'linear-gradient(135deg,#1e1400,#1a1200,#140e00)',
            glowBg: 'linear-gradient(135deg,#f59e0b,transparent)',
            accent: '#f59e0b',
            iconBg: 'rgba(245,158,11,0.15)',
            format: (v: number) => `${Math.round(v)}%`,
            subLabel: null,
        },
    ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px' }}>
            {cards.map(card => {
                const Icon = card.icon;
                return (
                    <div
                        key={card.id}
                        style={{
                            background: card.bg,
                            borderRadius: 14,
                            padding: '16px 18px',
                            border: '1px solid rgba(255,255,255,0.06)',
                            position: 'relative',
                            overflow: 'hidden',
                            cursor: 'default',
                            transition: 'transform 0.2s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}
                    >
                        {/* Glow overlay */}
                        <div style={{ position: 'absolute', inset: 0, borderRadius: 14, opacity: 0.18, pointerEvents: 'none', zIndex: 0, background: card.glowBg }} />

                        {/* Content */}
                        <div style={{ position: 'relative', zIndex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{card.label}</span>
                                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: card.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Icon size={13} color={card.accent} />
                                </div>
                            </div>

                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '22px', fontWeight: 800, color: card.accent, margin: '0 0 8px 0', letterSpacing: '-0.02em', lineHeight: 1 }}>
                                {card.format(card.animValue)}
                            </p>

                            {card.id === 'savings' ? (
                                <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 600, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', borderRadius: '20px', padding: '2px 8px' }}>
                                    {savingsLabel}
                                </span>
                            ) : (
                                <p style={{ fontSize: '11px', color: `${card.accent}8c`, margin: 0, fontWeight: 500 }}>{card.subLabel}</p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
