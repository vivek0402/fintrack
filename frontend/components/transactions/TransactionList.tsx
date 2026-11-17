'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, ReceiptText } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { transactionsAPI } from '@/lib/api';
import { removeTransactionsFromCache } from '@/hooks/queries';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency, formatDate, getSmartIcon } from '@/lib/utils';
import { TextAction } from '@/components/ui/CardParts';
import { type, truncate } from '@/lib/typography';
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
                        <span style={{ ...type.label, whiteSpace: 'nowrap' }}>{label}</span>
                        <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                        <span style={{ ...type.numSmall, whiteSpace: 'nowrap' }}>
                            {groupNet >= 0 ? '+' : '−'}{fmt(Math.abs(groupNet))}
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

/** One metadata line: category, payment, group, split, recurring, then tags. */
function rowMeta(tx: Transaction, isIncome: boolean): string {
    const parts: string[] = [tx.category_name || 'Uncategorised'];
    if (!isIncome && tx.payment_method && tx.payment_method !== 'Cash') parts.push(tx.payment_method);
    if (tx.group_name) parts.push(tx.group_name);
    if ((tx as { is_split?: boolean }).is_split) parts.push('split');
    if (tx.recurring_id) parts.push('recurring');
    (tx.tags || []).forEach(tag => parts.push(tag));
    return parts.join(' · ');
}

function MetaLine({ tx, isIncome }: { tx: Transaction; isIncome: boolean }) {
    return (
        <p style={{ ...type.meta, ...truncate, margin: 0 }}>
            {rowMeta(tx, isIncome)}
            {tx._pending && <span style={{ color: 'var(--color-warn-text)' }}>{' · Not synced yet'}</span>}
        </p>
    );
}

function Amount({ tx, text }: { tx: Transaction; text: string }) {
    const isIncome = tx.type === 'income';
    return (
        <span style={{ ...type.num, color: isIncome ? 'var(--color-inc-text)' : 'var(--text-primary)', flexShrink: 0 }}>
            {isIncome ? '+' : '−'}{text}
        </span>
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

    if (isMobile) {
        // ── Mobile row (two-line: icon+description+amount / category+payment-or-tags) ──
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
                background: isSelected ? 'var(--glass-fill-2)' : 'transparent',
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
                        background: 'var(--glass-fill-1)',
                        flexShrink: 0,
                        marginRight: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 'var(--text-title)', // sizes the category emoji
                    }}>
                        {getSmartIcon(tx.description, tx.category_name, tx.category_icon)}
                    </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Line 1: description + amount */}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ ...type.bodyStrong, ...truncate, minWidth: 0 }}>{tx.description}</span>
                        <Amount tx={tx} text={fmt(toAmount(tx.amount))} />
                    </div>
                    {/* Line 2: one metadata line */}
                    <div style={{ marginTop: 2 }}>
                        <MetaLine tx={tx} isIncome={isIncome} />
                    </div>
                </div>
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
                    padding: '12px 20px', borderBottom: '1px solid var(--glass-border)',
                    gap: '12px', transition: 'background var(--transition-fast)',
                    background: isSelected ? 'var(--glass-fill-2)' : 'transparent',
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
                    <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', flexShrink: 0, background: 'var(--glass-fill-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-title)' /* sizes the category emoji */ }}>
                        {getSmartIcon(tx.description, tx.category_name, tx.category_icon)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{tx.description}</p>
                        <MetaLine tx={tx} isIncome={isIncome} />
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <Amount tx={tx} text={formatCurrency(toAmount(tx.amount), currency)} />
                    {tx._pending ? null : (
                        <>
                            <button onClick={() => onEdit(tx)} style={{ minWidth: '30px', height: '30px', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color var(--transition-fast), color var(--transition-fast)' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--glass-fill-1)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                                <Pencil size={13} />
                            </button>
                            {isConfirm ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                    <TextAction tone="danger" onClick={() => onDelete(tx.id)} disabled={isDeleting}>
                                        {isDeleting ? '...' : 'Delete'}
                                    </TextAction>
                                    <TextAction quiet onClick={onCancelConfirm}>Cancel</TextAction>
                                </div>
                            ) : (
                                <button onClick={() => onConfirm(tx.id)} style={{ minWidth: '30px', height: '30px', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color var(--transition-fast), color var(--transition-fast)' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--glass-fill-1)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-exp-text)'; }}
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
