'use client';

import { TrendingUp, TrendingDown, Calendar, Zap } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Props { forecast: any; currency?: string; }

export function SpendingForecast({ forecast, currency = 'INR' }: Props) {
    if (!forecast || forecast.income === 0) return null;

    const { income, expenses_so_far, projected_expenses, projected_savings, daily_rate, ideal_daily_budget, day_of_month, days_in_month, days_remaining, is_on_track, savings_rate } = forecast;

    const spendingPct = income > 0 ? Math.min((projected_expenses / income) * 100, 150) : 0;
    const isOverBudget = projected_expenses > income;

    return (
        <div style={{ background: 'var(--bg-secondary)', border: `1px solid ${is_on_track ? 'var(--bg-border)' : 'rgba(244,63,94,0.2)'}`, borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: is_on_track ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', border: `1px solid ${is_on_track ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Zap size={15} color={is_on_track ? '#10b981' : '#f43f5e'} />
                    </div>
                    <div>
                        <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Month Forecast</h3>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Day {day_of_month} of {days_in_month} · {days_remaining} days left</p>
                    </div>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: is_on_track ? '#10b981' : '#f43f5e', background: is_on_track ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', border: `1px solid ${is_on_track ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`, padding: '4px 10px', borderRadius: '8px' }}>
                    {is_on_track ? '✅ On Track' : '⚠️ Over Budget Projected'}
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                {[
                    { label: 'Spent So Far', value: formatCurrency(expenses_so_far, currency), color: '#f43f5e', icon: TrendingDown },
                    { label: 'Projected Total', value: formatCurrency(projected_expenses, currency), color: isOverBudget ? '#f43f5e' : '#f59e0b', icon: Calendar },
                    { label: 'Projected Savings', value: formatCurrency(Math.max(projected_savings, 0), currency), color: projected_savings >= 0 ? '#10b981' : '#f43f5e', icon: TrendingUp },
                ].map(stat => {
                    const Icon = stat.icon;
                    return (
                        <div key={stat.label} style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                                <Icon size={12} color={stat.color} />
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{stat.label}</span>
                            </div>
                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: stat.color, margin: 0 }}>{stat.value}</p>
                        </div>
                    );
                })}
            </div>

            <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Projected vs income</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: isOverBudget ? '#f43f5e' : '#10b981' }}>{spendingPct.toFixed(0)}%</span>
                </div>
                <div style={{ height: '6px', background: 'var(--bg-border)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(spendingPct, 100)}%`, background: isOverBudget ? '#f43f5e' : '#f59e0b', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', padding: '10px 12px', background: 'var(--bg-card)', borderRadius: '8px', flexWrap: 'wrap' }}>
                <div>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: '0 0 2px 0' }}>Your daily spend</p>
                    <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.85rem', fontWeight: 600, color: daily_rate > ideal_daily_budget ? '#f43f5e' : 'var(--text-primary)', margin: 0 }}>{formatCurrency(daily_rate, currency)}/day</p>
                </div>
                <div style={{ width: '1px', background: 'var(--bg-border)' }} />
                <div>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: '0 0 2px 0' }}>Ideal daily budget</p>
                    <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.85rem', fontWeight: 600, color: '#10b981', margin: 0 }}>{formatCurrency(ideal_daily_budget, currency)}/day</p>
                </div>
                <div style={{ width: '1px', background: 'var(--bg-border)' }} />
                <div>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: '0 0 2px 0' }}>Savings rate</p>
                    <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.85rem', fontWeight: 600, color: parseFloat(savings_rate) >= 20 ? '#10b981' : '#f59e0b', margin: 0 }}>{savings_rate}%</p>
                </div>
            </div>

            {isOverBudget && (
                <div style={{ marginTop: '10px', padding: '10px 12px', background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.15)', borderRadius: '8px', fontSize: '0.78rem', color: '#f87171' }}>
                    ⚠️ At this rate you will overspend by <strong>{formatCurrency(projected_expenses - income, currency)}</strong> this month.
                </div>
            )}
        </div>
    );
}