'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export interface Budget {
    id: string;
    category_name: string;
    amount: string | number;
    spent: string | number;
}

interface Props { budgets?: Budget[]; currency?: string; }

interface AlertProps {
    budget: Budget;
    type: 'over' | 'near';
    currency: string;
    onDismiss: () => void;
}

const Alert = ({ budget, type, currency, onDismiss }: AlertProps) => {
    const spent = parseFloat(String(budget.spent));
    const limit = parseFloat(String(budget.amount));
    const pct = Math.min((spent / limit) * 100, 100);
    const isOver = type === 'over';
    const accentColor = isOver ? 'var(--color-exp)' : 'var(--color-warn)';
    const accentBg = isOver ? 'var(--color-exp-subtle)' : 'var(--color-warn-subtle)';
    const accentBorder = isOver ? 'var(--accent-red-border)' : 'var(--accent-yellow-border)';
    const gradient = isOver ? 'var(--gradient-red)' : 'var(--gradient-yellow)';

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: gradient, border: `1px solid ${accentBorder}`, borderLeft: `4px solid ${accentColor}`, borderRadius: '12px', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                <AlertTriangle size={15} color={accentColor} />
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{budget.category_name}</span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: accentColor, background: accentBg, border: `1px solid ${accentBorder}`, padding: '1px 7px', borderRadius: '20px' }}>{pct.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--border-subtle)', borderRadius: '2px', overflow: 'hidden', marginBottom: '5px' }}>
                        <div style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: accentColor,
                            borderRadius: '2px',
                            animation: `budgetFill 700ms cubic-bezier(0.22,1,0.36,1) both`,
                        }} />
                    </div>
                    <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', margin: 0 }}>
                        {isOver
                            ? <>Over by <strong style={{ color: accentColor }}>{formatCurrency(spent - limit, currency)}</strong></>
                            : <>Only <strong style={{ color: accentColor }}>{formatCurrency(limit - spent, currency)}</strong> remaining</>
                        }
                    </p>
                </div>
            </div>
            <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px', borderRadius: '6px' }}>
                <X size={14} />
            </button>
        </div>
    );
};

export function BudgetAlerts({ budgets = [], currency = 'INR' }: Props) {
    const [dismissed, setDismissed] = useState<string[]>([]);

    if (!budgets || budgets.length === 0) return null;

    const overBudget = budgets.filter(b => parseFloat(String(b.spent)) / parseFloat(String(b.amount)) >= 1 && !dismissed.includes(b.id));
    const nearLimit = budgets.filter(b => { const p = parseFloat(String(b.spent)) / parseFloat(String(b.amount)); return p >= 0.8 && p < 1 && !dismissed.includes(b.id); });

    if (overBudget.length === 0 && nearLimit.length === 0) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {overBudget.map(b => <Alert key={b.id} budget={b} type="over" currency={currency} onDismiss={() => setDismissed(p => [...p, b.id])} />)}
            {nearLimit.map(b => <Alert key={b.id} budget={b} type="near" currency={currency} onDismiss={() => setDismissed(p => [...p, b.id])} />)}
        </div>
    );
}
