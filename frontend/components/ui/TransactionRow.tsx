'use client';

import React from 'react';
import { Pencil } from 'lucide-react';
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
}

interface TransactionRowProps {
    transaction: Transaction;
    onEdit: (tx: Transaction) => void;
    onDelete: (tx: Transaction) => void;
}

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

function getDateLabel(dateStr: string): string {
    const today     = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const d = (dateStr || '').split('T')[0];
    if (d === today)     return 'Today';
    if (d === yesterday) return 'Yesterday';
    return formatDate(d);
}

export function TransactionRow({ transaction: tx, onEdit, onDelete }: TransactionRowProps) {
    const isMobile = useIsMobile();
    const isIncome = tx.type === 'income';
    const bg       = getCategoryBg(tx.category_name);
    const amount   = parseFloat(String(tx.amount));

    const inner = (
        <div
            onClick={() => onEdit(tx)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: `var(--space-3) var(--space-4)`,
                cursor: 'pointer',
                background: 'transparent',
                transition: `background var(--transition-fast)`,
            }}
            onMouseEnter={e => { if (!isMobile) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-3)'; }}
            onMouseLeave={e => { if (!isMobile) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
            {/* Category icon circle */}
            <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: bg || 'var(--bg-surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '1rem',
            }}>
                {tx.category_icon || '💳'}
            </div>

            {/* Description + meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                    <span style={{ fontSize: 'var(--text-body)', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
                        {tx.description}
                    </span>
                </div>
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontFamily: 'var(--font-body)' }}>
                    <span>{tx.category_name || 'Uncategorized'}</span>
                    <span>·</span>
                    <span>{getDateLabel(tx.date)}</span>
                    {tx.tags && tx.tags.length > 0 && (
                        <span style={{ color: 'var(--accent)', opacity: 0.8 }}>
                            {tx.tags.map(t => `#${t}`).join(' ')}
                        </span>
                    )}
                </div>
            </div>

            {/* Amount */}
            <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9rem',
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                color: isIncome ? 'var(--color-inc)' : 'var(--text-primary)',
                flexShrink: 0,
            }}>
                {isIncome ? '+' : '−'}{fmt(amount)}
            </div>

            {/* Desktop edit icon */}
            {!isMobile && (
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onEdit(tx); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 'var(--space-1)', display: 'flex', alignItems: 'center', opacity: 0.5, transition: `opacity var(--transition-fast)` }}
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
