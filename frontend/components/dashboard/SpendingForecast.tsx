'use client';

import { TrendingUp, Calendar, Zap } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Props { forecast: any; currency?: string; }

export function SpendingForecast({ forecast, currency = 'INR' }: Props) {
    if (!forecast || forecast.income === 0) return null;

    const {
        income, projected_expenses, projected_savings,
        daily_rate, ideal_daily_budget, day_of_month, days_in_month,
        days_remaining, is_on_track, savings_rate,
    } = forecast;

    const spendingPct = income > 0 ? Math.min((projected_expenses / income) * 100, 150) : 0;
    const isOverBudget = projected_expenses > income;
    const statusBorder = is_on_track ? 'var(--accent-green-border)' : 'var(--accent-red-border)';
    const statusBg = is_on_track ? 'var(--color-inc-subtle)' : 'var(--color-exp-subtle)';
    const statusColor = is_on_track ? 'var(--color-inc)' : 'var(--color-exp)';
    const statusGradient = is_on_track ? 'var(--gradient-green)' : 'var(--gradient-red)';

    return (
        <div style={{ background: 'var(--bg-surface-2)', border: `1px solid ${statusBorder}`, borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: statusBg, border: `1px solid ${statusBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Zap size={16} color={statusColor} />
                    </div>
                    <div>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Month Forecast</h3>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Day {day_of_month} of {days_in_month} · {days_remaining} days left</p>
                    </div>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor, background: statusBg, border: `1px solid ${statusBorder}`, padding: '5px 12px', borderRadius: '20px' }}>
                    {is_on_track ? '✅ On Track' : '⚠️ Over Budget Projected'}
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                {[
                    { label: 'Projected Total', value: formatCurrency(projected_expenses, currency), color: isOverBudget ? 'var(--color-exp)' : 'var(--color-warn)', icon: Calendar },
                    { label: 'Projected Savings', value: formatCurrency(Math.max(projected_savings, 0), currency), color: projected_savings >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', icon: TrendingUp },
                ].map(stat => {
                    const Icon = stat.icon;
                    return (
                        <div key={stat.label} style={{ background: statusGradient, borderRadius: '12px', padding: '12px', border: `1px solid ${statusBorder}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                                <Icon size={12} color={stat.color} />
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{stat.label}</span>
                            </div>
                            <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, color: stat.color, margin: 0 }}>{stat.value}</p>
                        </div>
                    );
                })}
            </div>

            <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Projected vs income</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isOverBudget ? 'var(--color-exp)' : 'var(--color-inc)' }}>{spendingPct.toFixed(0)}%</span>
                </div>
                <div style={{ height: '7px', background: 'var(--border-subtle)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(spendingPct, 100)}%`, background: isOverBudget ? 'var(--color-exp)' : 'var(--color-warn)', borderRadius: '4px', transition: 'width var(--transition-slow)' }} />
                </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', padding: '10px 14px', background: 'var(--bg-surface-1)', borderRadius: '10px', flexWrap: 'wrap' }}>
                {[
                    { label: 'Your daily spend', value: formatCurrency(daily_rate, currency) + '/day', warn: daily_rate > ideal_daily_budget },
                    { label: 'Ideal daily budget', value: formatCurrency(ideal_daily_budget, currency) + '/day', positive: true },
                    { label: 'Projected savings rate', value: savings_rate + '%', positive: parseFloat(savings_rate) >= 20, warn: parseFloat(savings_rate) < 20 },
                ].map((item, i) => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {i > 0 && <div style={{ width: '1px', height: '30px', background: 'var(--border-subtle)' }} />}
                        <div>
                            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: '0 0 2px 0' }}>{item.label}</p>
                            <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700, color: item.warn ? 'var(--color-exp)' : item.positive ? 'var(--color-inc)' : 'var(--text-primary)', margin: 0 }}>{item.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {isOverBudget && (
                <div style={{ marginTop: '10px', padding: '10px 14px', background: 'var(--gradient-red)', border: '1px solid var(--accent-red-border)', borderRadius: '10px', fontSize: '0.78rem', color: 'var(--color-exp)' }}>
                    ⚠️ At this rate you will overspend by <strong>{formatCurrency(projected_expenses - income, currency)}</strong> this month.
                </div>
            )}
        </div>
    );
}
