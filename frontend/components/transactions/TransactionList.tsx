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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: 'var(--space-3) var(--space-6) 6px', background: 'var(--surface-1)' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{getDateLabel(date)}</span>
                        <div style={{ flex: 1, height: '1px', background: 'var(--bg-border)' }} />
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
                                borderBottom: '1px solid var(--bg-border)',
                                background: isSelected ? 'var(--bg-alt)' : 'var(--bg-card)',
                                minHeight: '64px',
                                opacity: tx.is_regretted ? 0.7 : 1,
                                cursor: 'pointer',
                                transition: 'background var(--transition-fast)',
                            }}>
                                {/* Selection checkbox or category dot */}
                                {selectMode ? (
                                    <div style={{
                                        width: 20, height: 20, borderRadius: '5px', flexShrink: 0, marginRight: 12,
                                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
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
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {tx.description}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                        {tx.is_regretted && (
                                            <span style={{ color: 'var(--accent-yellow)' }}>⚠️ </span>
                                        )}
                                        {tx.category_name || 'Uncategorized'}
                                    </div>
                                </div>

                                {/* Right: amount + date */}
                                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: isIncome ? 'var(--accent-green)' : 'var(--accent-red)', fontFamily: "'DM Mono', monospace" }}>
                                        {isIncome ? '+' : '-'}₹{parseFloat(tx.amount).toLocaleString('en-IN')}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                        {formatDate((tx.date || '').split('T')[0])}
                                    </div>
                                </div>
                            </div>
                        );

                        // ── Desktop row ─────────────────────────────────────────────
                        const desktopRowInner = (
                            <div
                                onClick={selectMode ? () => onToggleSelect?.(tx.id) : undefined}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 20px 12px 14px', borderBottom: '1px solid var(--bg-border)',
                                    borderLeft: `3px solid ${isSelected ? 'var(--accent)' : getCategoryColor(tx.category_name)}`,
                                    gap: '12px', transition: 'background var(--transition-fast)',
                                    opacity: tx.is_regretted ? 0.7 : 1,
                                    background: isSelected ? 'var(--bg-alt)' : 'transparent',
                                    cursor: selectMode ? 'pointer' : 'default',
                                }}
                                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = isSelected ? 'var(--bg-alt)' : 'transparent'; }}
                            >
                                {selectMode && (
                                    <div style={{
                                        width: 18, height: 18, borderRadius: '5px', flexShrink: 0,
                                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                                        background: isSelected ? 'var(--accent)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.15s', marginRight: '4px',
                                    }}>
                                        {isSelected && <svg width="10" height="8" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                    <div style={{ width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0, background: getCategoryBg(tx.category_name), border: '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {isIncome ? <TrendingUp size={15} color="var(--accent-green)" /> : <TrendingDown size={15} color="var(--accent-red)" />}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.description}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                            {tx.category_name && <span style={{ fontSize: '0.68rem', color: tx.category_color || 'var(--text-muted)', background: `${tx.category_color}22`, padding: '1px 6px', borderRadius: '4px', fontWeight: 500 }}>{tx.category_name}</span>}
                                            {!isIncome && tx.payment_method && tx.payment_method !== 'Cash' && (
                                                <span style={{ fontSize: '0.65rem', fontWeight: 500, background: 'rgba(99,102,241,0.08)', color: 'var(--accent-blue)', borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap' }}>{tx.payment_method}</span>
                                            )}
                                            {tx.group_name && <span style={{ fontSize: '0.65rem', fontWeight: 600, background: 'rgba(99,102,241,0.12)', color: '#818cf8', borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap' }}>{tx.group_name}</span>}
                                            {(tx.tags || []).map((tag: string) => (
                                                <span key={tag} style={{ fontSize: '0.68rem', color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', padding: '1px 6px', borderRadius: '10px' }}>#{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9rem', fontWeight: 700, color: isIncome ? 'var(--accent-green)' : 'var(--accent-red)', margin: 0 }}>
                                        {isIncome ? '+' : '-'}{formatCurrency(parseFloat(tx.amount), currency)}
                                    </p>
                                    <button
                                        onClick={() => handleRegret(tx.id)}
                                        disabled={regrettingId === tx.id}
                                        title={tx.is_regretted ? 'Remove regret mark' : 'Mark as regretted'}
                                        style={{ minWidth: '30px', height: '30px', borderRadius: '8px', background: tx.is_regretted ? 'rgba(244,63,94,0.1)' : 'transparent', border: tx.is_regretted ? '1px solid rgba(244,63,94,0.25)' : '1px solid transparent', color: tx.is_regretted ? '#f43f5e' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', transition: 'all var(--transition-fast)', opacity: regrettingId === tx.id ? 0.5 : 1 }}
                                        onMouseEnter={e => { if (!tx.is_regretted) { (e.currentTarget as HTMLElement).style.background = 'rgba(244,63,94,0.08)'; (e.currentTarget as HTMLElement).style.color = '#f43f5e'; } }}
                                        onMouseLeave={e => { if (!tx.is_regretted) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; } }}
                                    >
                                        🤦
                                    </button>
                                    <button onClick={() => onEdit(tx)} style={{ minWidth: '30px', height: '30px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--transition-fast)' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-blue-bg)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-blue)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                        <Pencil size={13} />
                                    </button>
                                    {isConfirm ? (
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button onClick={() => handleDelete(tx.id)} disabled={deletingId === tx.id}
                                                style={{ padding: '4px 8px', borderRadius: '6px', background: 'var(--accent-red-bg)', border: '1px solid var(--accent-red-border)', color: 'var(--accent-red)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                                                {deletingId === tx.id ? '...' : 'Delete'}
                                            </button>
                                            <button onClick={() => setConfirmId(null)}
                                                style={{ padding: '4px 8px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setConfirmId(tx.id)} style={{ minWidth: '30px', height: '30px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--transition-fast)' }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-red-bg)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                            <Trash2 size={13} />
                                        </button>
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
                                    {selectMode ? mobileRowInner : (
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
