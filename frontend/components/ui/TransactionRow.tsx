'use client';

import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { SwipeableRow } from './SwipeableRow';
import { formatDate, getCategoryColor, getCategoryBg } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useWindowSize';

interface Transaction {
    id: string | number;
    description: string;
    amount: number | string;
    type: 'income' | 'expense';
    date: string;
    category_name?: string;
    category_color?: string;
    category_icon?: string;
    tags?: string[];
    is_regretted?: boolean;
}

interface TransactionRowProps {
    transaction: Transaction;
    onEdit: (tx: Transaction) => void;
    onDelete: (tx: Transaction) => void;
}

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

function getDateLabel(dateStr: string): string {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const d = (dateStr || '').split('T')[0];
    if (d === today) return 'Today';
    if (d === yesterday) return 'Yesterday';
    return formatDate(d);
}

export function TransactionRow({ transaction: tx, onEdit, onDelete }: TransactionRowProps) {
    const isMobile = useIsMobile();
    const isIncome = tx.type === 'income';
    const color = tx.category_color || getCategoryColor(tx.category_name);
    const bg = getCategoryBg(tx.category_name);
    const amount = parseFloat(String(tx.amount));

    const inner = (
        <div
            onClick={() => onEdit(tx)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: `var(--space-3) var(--space-4)`,
                cursor: 'pointer',
                background: 'var(--surface-1)',
                transition: `background var(--transition-fast)`,
            }}
            onMouseEnter={e => { if (!isMobile) (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
            onMouseLeave={e => { if (!isMobile) (e.currentTarget as HTMLElement).style.background = 'var(--surface-1)'; }}
        >
            {/* Category icon circle */}
            <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: bg || `rgba(59,130,246,0.1)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '1rem',
            }}>
                {tx.category_icon || '💳'}
            </div>

            {/* Description + date */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 'var(--text-body)',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {tx.description}
                </div>
                <div style={{
                    fontSize: 'var(--text-caption)',
                    color: 'var(--text-muted)',
                    marginTop: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                }}>
                    <span>{tx.category_name || 'Uncategorized'}</span>
                    {tx.tags && tx.tags.length > 0 && (
                        <span style={{ color: 'var(--accent-blue)', opacity: 0.8 }}>
                            {tx.tags.map(t => `#${t}`).join(' ')}
                        </span>
                    )}
                </div>
            </div>

            {/* Amount */}
            <div style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '0.9rem',
                fontWeight: 600,
                color: isIncome ? 'var(--accent-green)' : 'var(--accent-red)',
                flexShrink: 0,
            }}>
                {isIncome ? '+' : '-'}{fmt(amount)}
            </div>

            {/* Desktop edit icon */}
            {!isMobile && (
                <button
                    onClick={e => { e.stopPropagation(); onEdit(tx); }}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        padding: 'var(--space-1)',
                        display: 'flex',
                        alignItems: 'center',
                        opacity: 0.5,
                        transition: `opacity var(--transition-fast)`,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                >
                    <Pencil size={14} />
                </button>
            )}
        </div>
    );

    if (isMobile) {
        return (
            <SwipeableRow onSwipeLeft={() => onDelete(tx)}>
                {inner}
            </SwipeableRow>
        );
    }

    return inner;
}
