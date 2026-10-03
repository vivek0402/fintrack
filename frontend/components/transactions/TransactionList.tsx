'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, ReceiptText } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { transactionsAPI } from '@/lib/api';
import { removeTransactionsFromCache } from '@/hooks/queries';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency, formatDate, getCategoryColor, getCategoryBg, getSmartIcon } from '@/lib/utils';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { useIsMobile } from '@/hooks/useWindowSize';
import { haptics } from '@/lib/haptics';
import { toAmount, type Transaction } from '@/types/finance';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

interface Props {
    transactions: Transaction[];
    currency?: string;
    onEdit: (tx: Transaction) => void;
    onRefresh: () => void;
    selectMode?: boolean;
    selectedIds?: Set<string>;
    onToggleSelect?: (id: string) => void;
    pendingDelete: Set<string>;
    onPendingDeleteChange: (updater: (prev: Set<string>) => Set<string>) => void;
}

export function TransactionList({ transactions, currency = 'INR', onEdit, onRefresh, selectMode, selectedIds, onToggleSelect, pendingDelete, onPendingDeleteChange }: Props) {
    const isMobile = useIsMobile();
    const { user } = useAuthStore();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const queryClient = useQueryClient();

    // Rows are memoized, so the callbacks handed to them must be stable. These
    // refs let the stable callbacks below read the latest props without
    // changing identity every render.
    const latest = useRef({ transactions, onEdit, onRefresh, onToggleSelect, onPendingDeleteChange, user });
    useEffect(() => {
        latest.current = { transactions, onEdit, onRefresh, onToggleSelect, onPendingDeleteChange, user };
    });

    // The staggered entry animation plays only for the rows present on first
    // mount. Rows appended later (load more, a new transaction) appear in place.
    const [animateEntry, setAnimateEntry] = useState(true);
    useEffect(() => {
        const t = setTimeout(() => setAnimateEntry(false), 600);
        return () => clearTimeout(t);
    }, []);

    const handleDelete = useCallback((id: string) => {
        const { onPendingDeleteChange: setPending } = latest.current;
        haptics.delete();
        // Optimistically hide the row locally
        setPending(prev => new Set([...prev, id]));
        setConfirmId(null);

        let cancelled = false;
        toast.undo('Transaction deleted', () => {
            cancelled = true;
            latest.current.onPendingDeleteChange(prev => { const s = new Set(prev); s.delete(id); return s; });
        });

        // Commit delete after undo window closes
        setTimeout(async () => {
            if (cancelled) return;
            const { user: u, transactions: txs, onRefresh: refresh, onPendingDeleteChange: setPendingNow } = latest.current;
            setDeletingId(id);
            try {
                await transactionsAPI.delete(id);
                // Drop it from the cached lists before un-hiding, so the row
                // never flashes back while the background refresh runs.
                removeTransactionsFromCache(queryClient, [id]);
                setPendingNow(prev => { const s = new Set(prev); s.delete(id); return s; });
                // Bust the analytics page's own cache for the current month and the transaction's own month
                if (u) {
                    const now = new Date();
                    const cm = now.getMonth() + 1;
                    const cy = now.getFullYear();
                    localStorage.removeItem(`analytics-cache-${u.id}-${cm}-${cy}`);
                    // Deleting a transaction can also change a bank balance, this
                    // month's investment ratio, and DTI -- not month-keyed like the
                    // caches above, so just one unconditional bust each.
                    localStorage.removeItem(`accounts-cache-${u.id}`);
                    localStorage.removeItem(`investment-ratio-cache-${u.id}`);
                    localStorage.removeItem(`dti-cache-${u.id}`);
                    const tx = txs.find(t => t.id === id);
                    if (tx?.date) {
                        const [txYear, txMonth] = (tx.date as string).split('T')[0].split('-');
                        const tm = parseInt(txMonth);
                        const ty = parseInt(txYear);
                        if (tm !== cm || ty !== cy) {
                            localStorage.removeItem(`analytics-cache-${u.id}-${tm}-${ty}`);
                        }
                    }
                }
                refresh();
            } catch {
                latest.current.onPendingDeleteChange(prev => { const s = new Set(prev); s.delete(id); return s; });
                toast.error('Failed to delete — transaction restored');
            } finally {
                setDeletingId(null);
            }
        }, 4200);
    }, [queryClient]);

    const handleEdit = useCallback((tx: Transaction) => latest.current.onEdit(tx), []);
    const handleToggle = useCallback((id: string) => latest.current.onToggleSelect?.(id), []);
    const handleCancelConfirm = useCallback(() => setConfirmId(null), []);

    // Grouping and date labels only change when the list itself changes, not on
    // every selection toggle or confirm-delete click.
    const groups = useMemo(() => {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const byDate = new Map<string, Transaction[]>();
        transactions.forEach(tx => {
            const dateKey = (tx.date || '').split('T')[0];
            const bucket = byDate.get(dateKey);
            if (bucket) bucket.push(tx); else byDate.set(dateKey, [tx]);
        });
        return [...byDate.entries()].map(([date, txs]) => ({
            date,
            label: date === today ? 'Today' : date === yesterday ? 'Yesterday' : formatDate(date),
            txs,
        }));
    }, [transactions]);

    if (transactions.length === 0) {
        return (
            <EmptyState
                icon={ReceiptText}
                title="No transactions yet"
                subtitle="Tap + to add one"
            />
        );
    }

    // Global row counter for stagger across all groups
    let rowIndex = 0;

    return (
        <div>
            {groups.map(({ date, label, txs }) => {
                const visibleTxs = txs.filter(tx => !pendingDelete.has(tx.id));
                if (visibleTxs.length === 0) return null;
                const groupNet = visibleTxs.reduce((s, tx) => s + (tx.type === 'income' ? 1 : -1) * toAmount(tx.amount), 0);
                return (
                <div key={date}>
                    {/* Pins just below the status bar while its day scrolls past. Same
                        dense fill as the bottom nav, so rows scrolling underneath stay
                        unreadable instead of bleeding through the label. */}
                    <div style={{ position: 'sticky', top: 'var(--sa-top)', zIndex: 2, display: 'flex', alignItems: 'center', gap: '12px', padding: 'var(--space-3) var(--space-5) 6px', background: 'var(--glass-nav-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                        <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            net {groupNet >= 0 ? '+' : '−'}{fmt(Math.abs(groupNet))}
                        </span>
                    </div>
                    {visibleTxs.map(tx => (
                        <TransactionRow
                            key={tx.id}
                            tx={tx}
                            isMobile={isMobile}
                            currency={currency}
                            selectMode={!!selectMode}
                            isSelected={selectMode ? (selectedIds?.has(tx.id) ?? false) : false}
                            isConfirm={confirmId === tx.id}
                            isDeleting={deletingId === tx.id}
                            staggerDelay={animateEntry ? Math.min(rowIndex++ * 28, 280) : null}
                            onEdit={handleEdit}
                            onToggleSelect={handleToggle}
                            onDelete={handleDelete}
                            onConfirm={setConfirmId}
                            onCancelConfirm={handleCancelConfirm}
                        />
                    ))}
                </div>
                );
            })}
        </div>
    );
}

interface RowProps {
    tx: Transaction;
    isMobile: boolean;
    currency: string;
    selectMode: boolean;
    isSelected: boolean;
    isConfirm: boolean;
    isDeleting: boolean;
    /** Entry-animation delay in ms, or null for no entry animation. */
    staggerDelay: number | null;
    onEdit: (tx: Transaction) => void;
    onToggleSelect: (id: string) => void;
    onDelete: (id: string) => void;
    onConfirm: (id: string) => void;
    onCancelConfirm: () => void;
}

// Memoized so toggling one row's selection or confirm state re-renders that
// row only, not every row in the list.
const TransactionRow = memo(function TransactionRow({
    tx, isMobile, currency, selectMode, isSelected, isConfirm, isDeleting, staggerDelay,
    onEdit, onToggleSelect, onDelete, onConfirm, onCancelConfirm,
}: RowProps) {
    const isIncome = tx.type === 'income';
    const categoryColor = tx.category_color || getCategoryColor(tx.category_name);

    if (isMobile) {
        // ── Mobile row (two-line: icon+description+amount / category+payment-or-tags) ──
        const hasCategory = !!tx.category_name;
        const paymentChip = !isIncome && tx.payment_method && tx.payment_method !== 'Cash' ? tx.payment_method : null;
        const rowTags: string[] = (tx.tags || []).slice(0, 2);

        const mobileRowInner = (
            <div
                className="pressable"
                onClick={() => selectMode ? onToggleSelect(tx.id) : onEdit(tx)}
                role="button" tabIndex={0}
                onKeyDown={e => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    if (selectMode) onToggleSelect(tx.id); else onEdit(tx);
                }}
                style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: '1px solid var(--glass-border)',
                background: isSelected ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                minHeight: '64px',
                cursor: 'pointer',
                transition: 'background var(--transition-fast)',
            }}>
                {/* Selection checkbox or category icon */}
                {selectMode ? (
                    <div style={{
                        width: 20, height: 20, borderRadius: '5px', flexShrink: 0, marginRight: 12,
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                        background: isSelected ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background-color 0.15s, border-color 0.15s',
                    }}>
                        {isSelected && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                ) : (
                    <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: getCategoryBg(tx.category_name),
                        flexShrink: 0,
                        marginRight: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '16px',
                    }}>
                        {getSmartIcon(tx.description, tx.category_name, tx.category_icon)}
                    </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Line 1: description + amount */}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-body)', minWidth: 0 }}>
                            {tx.description}
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: isIncome ? 'var(--color-inc)' : 'var(--color-exp)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                            {isIncome ? '+' : '−'}{fmt(toAmount(tx.amount))}
                        </span>
                    </div>
                    {/* Line 2: category + payment/tags, or an amber "Uncategorised" flag */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 3, overflow: 'hidden' }}>
                        {hasCategory ? (
                            <>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: categoryColor, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {tx.category_name}
                                </span>
                                {paymentChip && (
                                    <span style={{ fontSize: '10px', fontWeight: 500, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                                        {paymentChip}
                                    </span>
                                )}
                                {rowTags.map(tag => (
                                    <span key={tag} style={{ fontSize: '10px', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', padding: '1px 6px', borderRadius: '8px', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0 }}>#{tag}</span>
                                ))}
                            </>
                        ) : (
                            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-warn)', background: 'color-mix(in srgb, var(--color-warn) 12%, transparent)', padding: '1px 6px', borderRadius: '4px', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                                Uncategorised
                            </span>
                        )}
                    </div>
                </div>
                {tx._pending && (
                    <span style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 6, flexShrink: 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-warn)', animation: 'pulseDot 1.2s ease-in-out infinite' }} />
                    </span>
                )}
            </div>
        );

        return (
            <div style={staggerDelay !== null ? { animation: `slideInUp 280ms cubic-bezier(0.22,1,0.36,1) ${staggerDelay}ms both` } : undefined}>
                {selectMode || tx._pending ? mobileRowInner : (
                    <SwipeableRow onSwipeLeft={() => onDelete(tx.id)}>
                        {mobileRowInner}
                    </SwipeableRow>
                )}
            </div>
        );
    }

    // ── Desktop row ─────────────────────────────────────────────
    // Only the row itself is interactive-as-a-whole in select mode;
    // outside select mode, editing happens via the dedicated pencil
    // button below (already natively keyboard-focusable), so the
    // row doesn't need its own role/tabIndex there.
    return (
        <div style={staggerDelay !== null ? { animation: `slideInUp 220ms cubic-bezier(0.22,1,0.36,1) ${staggerDelay}ms both` } : undefined}>
            <div
                className={selectMode ? 'pressable' : undefined}
                onClick={selectMode ? () => onToggleSelect(tx.id) : undefined}
                role={selectMode ? 'button' : undefined}
                tabIndex={selectMode ? 0 : undefined}
                onKeyDown={selectMode ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSelect(tx.id); } }) : undefined}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 20px 12px 14px', borderBottom: '1px solid var(--glass-border)',
                    borderLeft: `3px solid ${isSelected ? 'var(--accent)' : categoryColor}`,
                    gap: '12px', transition: 'background var(--transition-fast)',
                    background: isSelected ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                    cursor: selectMode ? 'pointer' : 'default',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--glass-fill-2)'; }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
                {selectMode && (
                    <div style={{
                        width: 18, height: 18, borderRadius: '5px', flexShrink: 0,
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                        background: isSelected ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background-color 0.15s, border-color 0.15s', marginRight: '4px',
                    }}>
                        {isSelected && <svg width="10" height="8" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', flexShrink: 0, background: getCategoryBg(tx.category_name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px' }}>
                        {getSmartIcon(tx.description, tx.category_name, tx.category_icon)}
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
                        {isIncome ? '+' : '−'}{formatCurrency(toAmount(tx.amount), currency)}
                    </p>
                    {tx._pending ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-body)' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-warn)', display: 'inline-block', animation: 'pulseDot 1.2s ease-in-out infinite', flexShrink: 0 }} />
                            Pending
                        </span>
                    ) : (
                        <>
                            <button onClick={() => onEdit(tx)} style={{ minWidth: '30px', height: '30px', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color var(--transition-fast), color var(--transition-fast)' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-subtle)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                <Pencil size={13} />
                            </button>
                            {isConfirm ? (
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button onClick={() => onDelete(tx.id)} disabled={isDeleting}
                                        style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-exp-subtle)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', color: 'var(--color-exp)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        {isDeleting ? '...' : 'Delete'}
                                    </button>
                                    <button onClick={onCancelConfirm}
                                        style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--glass-fill-1)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => onConfirm(tx.id)} style={{ minWidth: '30px', height: '30px', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color var(--transition-fast), color var(--transition-fast)' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-exp-subtle)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-exp)'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
});
