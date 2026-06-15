'use client';

import { useState } from 'react';
import { Pencil, Trash2, TrendingUp, TrendingDown, ReceiptText } from 'lucide-react';
import { transactionsAPI } from '@/lib/api';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency, formatDate, getCategoryColor, getCategoryBg } from '@/lib/utils';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { useIsMobile } from '@/hooks/useWindowSize';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

interface Props {
    transactions: any[];
    currency?: string;
    onEdit: (tx: any) => void;
    onRefresh: () => void;
    selectMode?: boolean;
    selectedIds?: Set<string>;
    onToggleSelect?: (id: string) => void;
}

export function TransactionList({ transactions, currency = 'INR', onEdit, onRefresh, selectMode, selectedIds, onToggleSelect }: Props) {
    const isMobile = useIsMobile();
    const { user } = useAuthStore();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [regrettingId, setRegrettingId] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Set<string>>(new Set());

    const handleDelete = (id: string) => {
        // Optimistically hide the row locally
        setPendingDelete(prev => new Set([...prev, id]));
        setConfirmId(null);

        let cancelled = false;
        toast.undo('Transaction deleted', () => {
            cancelled = true;
            setPendingDelete(prev => { const s = new Set(prev); s.delete(id); return s; });
        });

        // Commit delete after undo window closes
        setTimeout(async () => {
            if (cancelled) return;
            setDeletingId(id);
            try {
                await transactionsAPI.delete(id);
                setPendingDelete(prev => { const s = new Set(prev); s.delete(id); return s; });
                // Bust dashboard and analytics cache for current month and the transaction's own month
                if (user) {
                    const now = new Date();
                    const cm = now.getMonth() + 1;
                    const cy = now.getFullYear();
                    localStorage.removeItem(`dashboard-cache-${user.id}-${cm}-${cy}`);
                    localStorage.removeItem(`analytics-cache-${user.id}-${cm}-${cy}`);
                    const tx = transactions.find(t => t.id === id);
                    if (tx?.date) {
                        const [txYear, txMonth] = (tx.date as string).split('T')[0].split('-');
                        const tm = parseInt(txMonth);
                        const ty = parseInt(txYear);
                        if (tm !== cm || ty !== cy) {
                            localStorage.removeItem(`dashboard-cache-${user.id}-${tm}-${ty}`);
                            localStorage.removeItem(`analytics-cache-${user.id}-${tm}-${ty}`);
                        }
                    }
                }
                onRefresh();
            } catch {
                setPendingDelete(prev => { const s = new Set(prev); s.delete(id); return s; });
                toast.error('Failed to delete — transaction restored');
            } finally {
                setDeletingId(null);
            }
        }, 4200);
    };

    const handleRegret = async (id: string) => {
        setRegrettingId(id);
        try { await transactionsAPI.toggleRegret(id); onRefresh(); }
        catch { /* silent */ }
        finally { setRegrettingId(null); }
    };

    if (transactions.length === 0) {
        return (
            <EmptyState
                icon={ReceiptText}
                title="No transactions yet"
                subtitle="Tap + to add one"
            />
        );
    }

    // Group by date
    const groups: Record<string, any[]> = {};
    transactions.forEach(tx => {
        const dateKey = (tx.date || '').split('T')[0];
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(tx);
    });

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const getDateLabel = (d: string) => d === today ? 'Today' : d === yesterday ? 'Yesterday' : formatDate(d);

    // Global row counter for stagger across all groups
    let rowIndex = 0;

    return (
        <div>
            {Object.entries(groups).map(([date, txs]) => {
                const visibleTxs = txs.filter(tx => !pendingDelete.has(tx.id));
                if (visibleTxs.length === 0) return null;
                return (
                <div key={date}>
                    <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: '12px', padding: 'var(--space-3) var(--space-5) 6px', background: 'var(--bg-surface-1)' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{getDateLabel(date)}</span>
                        <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                    </div>
                    {visibleTxs.map(tx => {
                        const staggerDelay = Math.min(rowIndex++ * 28, 280);
                        const isIncome = tx.type === 'income';
                        const isConfirm = confirmId === tx.id;
                        const categoryColor = tx.category_color || getCategoryColor(tx.category_name);

                        const isSelected = selectMode ? (selectedIds?.has(tx.id) ?? false) : false;

                        // ── Mobile row ──────────────────────────────────────────────
                        const mobileRowInner = (
                            <div
                                onClick={() => selectMode ? onToggleSelect?.(tx.id) : onEdit(tx)}
                                style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '12px 16px',
                                borderBottom: '1px solid var(--border-subtle)',
                                background: isSelected ? 'var(--bg-surface-2)' : 'var(--bg-surface-1)',
                                minHeight: '64px',
                                opacity: tx.is_regretted ? 0.7 : 1,
                                cursor: 'pointer',
                                transition: 'background var(--transition-fast)',
                            }}>
                                {/* Selection checkbox or category dot */}
                                {selectMode ? (
                                    <div style={{
                                        width: 20, height: 20, borderRadius: '5px', flexShrink: 0, marginRight: 12,
                                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                                        background: isSelected ? 'var(--accent)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.15s',
                                    }}>
                                        {isSelected && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                    </div>
                                ) : (
                                    <div style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        backgroundColor: categoryColor,
                                        flexShrink: 0,
                                        marginRight: 12,
                                    }} />
                                )}

                                {/* Left: description + category */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-body)' }}>
                                        {tx.description}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-body)' }}>
                                        {tx.is_regretted && (
                                            <span style={{ color: 'var(--color-warn)' }}>⚠️ </span>
                                        )}
                                        {tx.category_name || 'Uncategorized'}
                                    </div>
                                </div>

                                {/* Right: amount + date */}
                                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: isIncome ? 'var(--color-inc)' : 'var(--color-exp)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                                        {isIncome ? '+' : '−'}{fmt(parseFloat(tx.amount))}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-body)' }}>
                                        {formatDate((tx.date || '').split('T')[0])}
                                    </div>
                                </div>
                                {/* Mobile regret toggle or pending indicator */}
                                {(tx as any)._pending ? (
                                    <span style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 6, flexShrink: 0 }}>
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-warn)', animation: 'pulseDot 1.2s ease-in-out infinite' }} />
                                    </span>
                                ) : !isIncome && !selectMode && (
                                    <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); handleRegret(tx.id); }}
                                        disabled={regrettingId === tx.id}
                                        title={tx.is_regretted ? 'Remove regret mark' : 'Mark as regretted'}
                                        style={{
                                            width: 30, height: 30, borderRadius: 8, flexShrink: 0, marginLeft: 6,
                                            background: tx.is_regretted ? 'var(--color-exp-subtle)' : 'transparent',
                                            border: tx.is_regretted ? '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)' : '1px solid transparent',
                                            color: tx.is_regretted ? 'var(--color-exp)' : 'var(--text-muted)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '14px', opacity: regrettingId === tx.id ? 0.5 : 1,
                                            transition: 'all 0.15s',
                                        }}
                                    >😬</button>
                                )}
                            </div>
                        );

                        // ── Desktop row ─────────────────────────────────────────────
                        const desktopRowInner = (
                            <div
                                onClick={selectMode ? () => onToggleSelect?.(tx.id) : undefined}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 20px 12px 14px', borderBottom: '1px solid var(--border-subtle)',
                                    borderLeft: `3px solid ${isSelected ? 'var(--accent)' : categoryColor}`,
                                    gap: '12px', transition: 'background var(--transition-fast)',
                                    opacity: tx.is_regretted ? 0.7 : 1,
                                    background: isSelected ? 'var(--bg-surface-2)' : 'transparent',
                                    cursor: selectMode ? 'pointer' : 'default',
                                }}
                                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-3)'; }}
                                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = isSelected ? 'var(--bg-surface-2)' : 'transparent'; }}
                            >
                                {selectMode && (
                                    <div style={{
                                        width: 18, height: 18, borderRadius: '5px', flexShrink: 0,
                                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                                        background: isSelected ? 'var(--accent)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.15s', marginRight: '4px',
                                    }}>
                                        {isSelected && <svg width="10" height="8" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                    <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', flexShrink: 0, background: getCategoryBg(tx.category_name), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {isIncome ? <TrendingUp size={15} color="var(--color-inc)" /> : <TrendingDown size={15} color="var(--color-exp)" />}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-body)' }}>{tx.description}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                            {tx.category_name && <span style={{ fontSize: '0.68rem', color: tx.category_color || 'var(--text-muted)', background: `color-mix(in srgb, ${tx.category_color || 'var(--text-muted)'} 15%, transparent)`, padding: '1px 6px', borderRadius: '4px', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{tx.category_name}</span>}
                                            {!isIncome && tx.payment_method && tx.payment_method !== 'Cash' && (
                                                <span style={{ fontSize: '0.65rem', fontWeight: 500, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>{tx.payment_method}</span>
                                            )}
                                            {tx.group_name && <span style={{ fontSize: '0.65rem', fontWeight: 600, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>{tx.group_name}</span>}
                                            {(tx.tags || []).map((tag: string) => (
                                                <span key={tag} style={{ fontSize: '0.68rem', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid var(--accent-border)', padding: '1px 6px', borderRadius: '10px', fontFamily: 'var(--font-body)' }}>#{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: isIncome ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                        {isIncome ? '+' : '−'}{formatCurrency(parseFloat(tx.amount), currency)}
                                    </p>
                                    {(tx as any)._pending ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-body)' }}>
                                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-warn)', display: 'inline-block', animation: 'pulseDot 1.2s ease-in-out infinite', flexShrink: 0 }} />
                                            Pending
                                        </span>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => handleRegret(tx.id)}
                                                disabled={regrettingId === tx.id}
                                                title={tx.is_regretted ? 'Remove regret mark' : 'Mark as regretted'}
                                                style={{ minWidth: '30px', height: '30px', borderRadius: 'var(--radius-sm)', background: tx.is_regretted ? 'var(--color-exp-subtle)' : 'transparent', border: tx.is_regretted ? '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)' : '1px solid transparent', color: tx.is_regretted ? 'var(--color-exp)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', transition: 'all var(--transition-fast)', opacity: regrettingId === tx.id ? 0.5 : 1 }}
                                                onMouseEnter={e => { if (!tx.is_regretted) { (e.currentTarget as HTMLElement).style.background = 'var(--color-exp-subtle)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-exp)'; } }}
                                                onMouseLeave={e => { if (!tx.is_regretted) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; } }}
                                            >
                                                🤦
                                            </button>
                                            <button onClick={() => onEdit(tx)} style={{ minWidth: '30px', height: '30px', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--transition-fast)' }}
                                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-subtle)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                                <Pencil size={13} />
                                            </button>
                                            {isConfirm ? (
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button onClick={() => handleDelete(tx.id)} disabled={deletingId === tx.id}
                                                        style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-exp-subtle)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', color: 'var(--color-exp)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                                        {deletingId === tx.id ? '...' : 'Delete'}
                                                    </button>
                                                    <button onClick={() => setConfirmId(null)}
                                                        style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setConfirmId(tx.id)} style={{ minWidth: '30px', height: '30px', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--transition-fast)' }}
                                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-exp-subtle)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-exp)'; }}
                                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );

                        if (isMobile) {
                            return (
                                <div
                                    key={tx.id}
                                    style={{
                                        animation: `slideInUp 280ms cubic-bezier(0.22,1,0.36,1) ${staggerDelay}ms both`,
                                    }}
                                >
                                    {selectMode || (tx as any)._pending ? mobileRowInner : (
                                        <SwipeableRow
                                            onSwipeLeft={() => handleDelete(tx.id)}
                                            onSwipeRight={() => handleRegret(tx.id)}
                                            isRegretted={tx.is_regretted}
                                        >
                                            {mobileRowInner}
                                        </SwipeableRow>
                                    )}
                                </div>
                            );
                        }
                        return (
                            <div
                                key={tx.id}
                                style={{ animation: `slideInUp 220ms cubic-bezier(0.22,1,0.36,1) ${staggerDelay}ms both` }}
                            >
                                {desktopRowInner}
                            </div>
                        );
                    })}
                </div>
                );
            })}
        </div>
    );
}
