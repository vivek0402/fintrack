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
    const pct = ((spent / limit) * 100).toFixed(0);
    const isOver = type === 'over';
    const color = isOver ? '#f43f5e' : '#f59e0b';
    const bg = isOver ? 'rgba(244,63,94,0.06)' : 'rgba(245,158,11,0.06)';
    const border = isOver ? 'rgba(244,63,94,0.2)' : 'rgba(245,158,11,0.2)';

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: bg, border: `1px solid ${border}`, borderRadius: '12px', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                <AlertTriangle size={15} color={color} />
                <div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{budget.category_name}</span>
                    <span style={{ fontSize: '0.75rem', color, background: `${color}15`, border: `1px solid ${color}25`, padding: '1px 6px', borderRadius: '4px', marginLeft: '8px' }}>{pct}%</span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                        {isOver
                            ? <>Over by <strong style={{ color }}>{formatCurrency(spent - limit, currency)}</strong></>
                            : <>Only <strong style={{ color }}>{formatCurrency(limit - spent, currency)}</strong> remaining</>
                        }
                    </p>
                </div>
            </div>
            <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
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