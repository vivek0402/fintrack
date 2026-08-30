'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Tag, Trash2, Download, Scissors, X } from 'lucide-react';
import { transactionsAPI } from '@/lib/api';
import { CategoryField, CategoryPickerDialog } from '@/components/categories/CategoryPickerDialog';
import { useCategories } from '@/hooks/useCategories';
import { toast } from '@/store/toastStore';
import { exportToCSV, formatCurrency } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useWindowSize';

interface Props {
    selectedIds: Set<string>;
    allTransactions: any[];
    currency: string;
    selectedYear: number;
    selectedMonth: number | null;
    onSelectAll: () => void;
    onExit: () => void;
    onRefresh: () => void;
    onRemoveIds: (ids: string[]) => void;
    onPendingDeleteChange: (updater: (prev: Set<string>) => Set<string>) => void;
}

export function BulkOpsPanel({
    selectedIds, allTransactions, currency, selectedYear, selectedMonth,
    onSelectAll, onExit, onRefresh, onRemoveIds, onPendingDeleteChange,
}: Props) {
    const isMobile = useIsMobile();
    const count = selectedIds.size;
    const selectedTxs = allTransactions.filter(tx => selectedIds.has(tx.id));
    const splitTx = count === 1 ? selectedTxs[0] : null;

    const [bulkCatOpen, setBulkCatOpen]     = useState(false);
    const [bulkTagOpen, setBulkTagOpen]     = useState(false);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [splitOpen, setSplitOpen]         = useState(false);

    const { categories } = useCategories();
    const [progress, setProgress]       = useState<{ done: number; total: number } | null>(null);

    const [tagInput, setTagInput]   = useState('');
    const [tagLoading, setTagLoading] = useState(false);

    const [splitLines, setSplitLines] = useState<{ amount: string; category_id: string; description: string }[]>([
        { amount: '', category_id: '', description: '' },
        { amount: '', category_id: '', description: '' },
    ]);
    const [splitLoading, setSplitLoading] = useState(false);

    const openCategorize = () => setBulkCatOpen(true);
    const openSplit = () => {
        setSplitLines([
            { amount: '', category_id: '', description: splitTx?.description || '' },
            { amount: '', category_id: '', description: '' },
        ]);
        setSplitOpen(true);
    };

    const handleBulkCategorize = async (catId: string) => {
        const ids = Array.from(selectedIds);
        setBulkCatOpen(false);
        setProgress({ done: 0, total: ids.length });
        // Continue through the full selection even if individual updates fail --
        // a single failure used to abort the loop, silently leaving the rest of
        // the batch untouched with no indication of what actually succeeded.
        let failCount = 0;
        for (let i = 0; i < ids.length; i++) {
            try {
                await transactionsAPI.update(ids[i], { category_id: catId });
            } catch {
                failCount++;
            }
            setProgress({ done: i + 1, total: ids.length });
        }
        setProgress(null);
        const okCount = ids.length - failCount;
        if (failCount === 0) toast.success(`Categorized ${okCount} transaction${okCount !== 1 ? 's' : ''}`);
        else toast.error(`Updated ${okCount} of ${ids.length} — ${failCount} failed`);
        onRefresh();
    };

    const handleBulkTag = async () => {
        const tag = tagInput.trim().replace(/^#/, '');
        if (!tag) return;
        setTagLoading(true);
        const ids = Array.from(selectedIds);
        let failCount = 0, skipCount = 0;
        for (const id of ids) {
            const tx = allTransactions.find(t => t.id === id);
            if (!tx) { skipCount++; continue; }
            const existing: string[] = Array.isArray(tx.tags) ? tx.tags : [];
            if (existing.includes(tag)) { skipCount++; continue; }
            try {
                await transactionsAPI.update(id, { tags: [...existing, tag] });
            } catch {
                failCount++;
            }
        }
        const okCount = ids.length - failCount - skipCount;
        if (failCount === 0) toast.success(`Tagged ${okCount} transaction${okCount !== 1 ? 's' : ''}`);
        else toast.error(`Tagged ${okCount} of ${ids.length} — ${failCount} failed`);
        setTagLoading(false);
        setBulkTagOpen(false);
        setTagInput('');
        onRefresh();
    };

    const handleBulkDelete = () => {
        const ids = Array.from(selectedIds);
        // Optimistically hide the rows locally -- same pendingDelete mechanism and
        // undo window as single-row delete (TransactionList.handleDelete), so bulk
        // delete gets the same trust guarantee instead of committing immediately.
        onPendingDeleteChange(prev => new Set([...prev, ...ids]));
        setBulkDeleteOpen(false);
        onExit();

        let cancelled = false;
        toast.undo(`Deleted ${ids.length} transaction${ids.length !== 1 ? 's' : ''}`, () => {
            cancelled = true;
            onPendingDeleteChange(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
        });

        setTimeout(async () => {
            if (cancelled) return;
            try {
                await Promise.all(ids.map(id => transactionsAPI.delete(id)));
                onRemoveIds(ids);
                onPendingDeleteChange(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
                onRefresh();
            } catch {
                onPendingDeleteChange(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
                toast.error('Some deletions failed — refreshing');
                onRefresh();
            }
        }, 4200);
    };

    const handleBulkExport = () => {
        const mo = String(selectedMonth ?? 'all').padStart(2, '0');
        void exportToCSV(selectedTxs, `fintrack-selected-${selectedYear}-${mo}.csv`);
    };

    const splitTotal = splitTx ? parseFloat(splitTx.amount) : 0;
    const splitSum = splitLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    const splitValid = splitLines.length >= 2 && Math.abs(splitSum - splitTotal) < 0.01 && splitLines.every(l => parseFloat(l.amount) > 0);

    const handleSplit = async () => {
        if (!splitTx || !splitValid) return;
        setSplitLoading(true);
        // Track created line ids so a failure after creation (either mid-loop, or
        // on the final delete-original step) can be rolled back instead of
        // silently leaving duplicated transactions behind.
        const createdIds: string[] = [];
        try {
            for (const line of splitLines) {
                const res = await transactionsAPI.create({
                    type: splitTx.type,
                    amount: parseFloat(line.amount),
                    description: line.description || splitTx.description,
                    date: splitTx.date,
                    category_id: line.category_id || undefined,
                    payment_method: splitTx.payment_method,
                    account_id: splitTx.account_id,
                    notes: `Split from: ${splitTx.description}`,
                });
                createdIds.push(res.data.transaction.id);
            }
            try {
                await transactionsAPI.delete(splitTx.id);
            } catch {
                // Creates succeeded but deleting the original failed — roll back the
                // new lines instead of leaving the user with duplicated transactions.
                try {
                    await Promise.all(createdIds.map(id => transactionsAPI.delete(id)));
                    toast.error('Split failed — no changes were made. Try again.');
                } catch {
                    toast.error(`Split partially failed — check transaction "${splitTx.description}" (${splitTx.date}) for duplicates.`);
                }
                onRefresh();
                return;
            }
            toast.success(`Split into ${splitLines.length} transactions`);
            setSplitOpen(false);
            onExit();
            onRefresh();
        } catch {
            // A create failed mid-loop — clean up whatever lines were created so
            // far; the original transaction is untouched.
            if (createdIds.length > 0) {
                await Promise.all(createdIds.map(id => transactionsAPI.delete(id).catch(() => {})));
            }
            toast.error('Split failed — no changes were made.');
        } finally {
            setSplitLoading(false);
        }
    };

    if (typeof document === 'undefined') return null;

    const barBottom = isMobile ? 'calc(60px + env(safe-area-inset-bottom, 0px))' : '24px';

    return createPortal(
        <>
            {/* ── Sticky bulk action bar ── */}
            <div style={{
                position: 'fixed', bottom: barBottom, left: '50%', transform: 'translateX(-50%)',
                zIndex: 990, background: 'var(--glass-sheet-surface)', border: '1px solid var(--glass-border)',
                backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--glass-edge)',
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '6px',
                maxWidth: 'calc(100vw - 32px)', animation: 'fadeUp 180ms ease both',
            }}>
                {progress ? (
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', padding: '0 4px' }}>
                        Updating {progress.done} of {progress.total}…
                    </span>
                ) : (
                    <>
                        <button onClick={onSelectAll} style={barBtnStyle}>
                            All&nbsp;{allTransactions.length}
                        </button>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', flexShrink: 0, padding: '0 4px' }}>
                            {count} selected
                        </span>
                        <button onClick={openCategorize} style={barBtnStyle}>Categorize</button>
                        <button onClick={() => setBulkTagOpen(true)} style={barBtnStyle}>
                            <Tag size={12} /> Tag
                        </button>
                        {count === 1 && (
                            <button onClick={openSplit} style={barBtnStyle}>
                                <Scissors size={12} /> Split
                            </button>
                        )}
                        <button onClick={handleBulkExport} title="Export selected" style={barBtnStyle}>
                            <Download size={12} />
                        </button>
                        <button onClick={() => setBulkDeleteOpen(true)} title="Delete selected" style={{ ...barBtnStyle, color: 'var(--color-exp)', borderColor: 'color-mix(in srgb, var(--color-exp) 30%, transparent)' }}>
                            <Trash2 size={12} />
                        </button>
                        <button onClick={onExit} title="Cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}>
                            <X size={16} />
                        </button>
                    </>
                )}
            </div>

            {/* ── Bulk Categorize ── */}
            <CategoryPickerDialog
                isOpen={bulkCatOpen}
                onClose={() => setBulkCatOpen(false)}
                title={`Categorize ${count} transaction${count !== 1 ? 's' : ''}`}
                value=""
                onChange={id => void handleBulkCategorize(id)}
                categories={categories}
            />

            {/* ── Bulk Tag ── */}
            {bulkTagOpen && (
                <div onClick={() => setBulkTagOpen(false)} style={overlayStyle}>
                    <div onClick={e => e.stopPropagation()} style={sheetStyle}>
                        <ModalHeader title={`Tag ${count} transaction${count !== 1 ? 's' : ''}`} onClose={() => { setBulkTagOpen(false); setTagInput(''); }} />
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px', fontFamily: 'var(--font-body)' }}>
                            The tag will be appended to all selected transactions.
                        </p>
                        <input
                            type="text" autoFocus placeholder="Tag name (e.g. tax-deductible)"
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value.replace(/\s/g, ''))}
                            onKeyDown={e => { if (e.key === 'Enter') void handleBulkTag(); }}
                            style={{ width: '100%', padding: '10px 14px', background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: '10px', fontSize: '14px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }}
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => { setBulkTagOpen(false); setTagInput(''); }} style={cancelStyle}>Cancel</button>
                            <button onClick={() => void handleBulkTag()} disabled={!tagInput.trim() || tagLoading}
                                style={{ ...confirmStyle, opacity: !tagInput.trim() || tagLoading ? 0.6 : 1, cursor: !tagInput.trim() || tagLoading ? 'not-allowed' : 'pointer' }}>
                                {tagLoading ? 'Tagging…' : 'Apply Tag'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Bulk Delete confirm ── */}
            {bulkDeleteOpen && (
                <div onClick={() => setBulkDeleteOpen(false)} style={overlayStyle}>
                    <div onClick={e => e.stopPropagation()} style={sheetStyle}>
                        <ModalHeader title={`Delete ${count} transaction${count !== 1 ? 's' : ''}?`} onClose={() => setBulkDeleteOpen(false)} />
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
                            {count} transaction{count !== 1 ? 's' : ''} will be removed. You'll have a few seconds to undo.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setBulkDeleteOpen(false)} style={cancelStyle}>Cancel</button>
                            <button onClick={handleBulkDelete}
                                style={{ ...confirmStyle, background: 'var(--color-exp)' }}>
                                Delete {count}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Split Transaction ── */}
            {splitOpen && splitTx && (
                <div onClick={() => setSplitOpen(false)} style={overlayStyle}>
                    <div onClick={e => e.stopPropagation()} style={{ ...sheetStyle, maxWidth: '540px' }}>
                        <ModalHeader title="Split Transaction" onClose={() => setSplitOpen(false)} />
                        {/* Original amount banner */}
                        <div style={{ padding: '12px 14px', background: 'var(--glass-fill-1)', borderRadius: '10px', border: '1px solid var(--glass-border)', marginBottom: '16px' }}>
                            <p style={{ margin: '0 0 2px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Original</p>
                            <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                                {formatCurrency(splitTotal, currency)} — {splitTx.description}
                            </p>
                        </div>
                        {/* Split lines */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                            {splitLines.map((line, i) => (
                                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: '18px', flexShrink: 0, textAlign: 'right', fontFamily: 'var(--font-body)' }}>{i + 1}.</span>
                                    <input type="number" placeholder="Amount" min="0.01" step="any"
                                        value={line.amount}
                                        onChange={e => setSplitLines(prev => prev.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))}
                                        style={{ width: '96px', flexShrink: 0, padding: '8px 10px', background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: '8px', fontSize: '14px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                    <input type="text" placeholder="Description"
                                        value={line.description}
                                        onChange={e => setSplitLines(prev => prev.map((l, j) => j === i ? { ...l, description: e.target.value } : l))}
                                        style={{ flex: 1, minWidth: 0, padding: '8px 10px', background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                    <div style={{ width: '110px', flexShrink: 0 }}>
                                        <CategoryField
                                            size="sm"
                                            placeholder="Category"
                                            value={line.category_id}
                                            onChange={v => setSplitLines(prev => prev.map((l, j) => j === i ? { ...l, category_id: v } : l))}
                                            categories={categories}
                                        />
                                    </div>
                                    {splitLines.length > 2 && (
                                        <button onClick={() => setSplitLines(prev => prev.filter((_, j) => j !== i))}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', flexShrink: 0 }}>
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {/* Sum validation row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', padding: '8px 12px', background: 'var(--glass-fill-1)', borderRadius: '8px', border: `1px solid ${splitValid ? 'color-mix(in srgb, var(--color-inc) 30%, transparent)' : 'var(--border-subtle)'}` }}>
                            <span style={{ fontSize: '13px', fontFamily: 'var(--font-body)', color: 'var(--text-secondary)' }}>
                                Sum:&nbsp;
                                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: splitValid ? 'var(--color-inc)' : splitSum > splitTotal ? 'var(--color-exp)' : 'var(--text-primary)' }}>
                                    {formatCurrency(splitSum, currency)}
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>&nbsp;/ {formatCurrency(splitTotal, currency)}</span>
                                {splitValid && <span style={{ marginLeft: '6px', color: 'var(--color-inc)' }}>✓</span>}
                            </span>
                            {splitLines.length < 5 && (
                                <button onClick={() => setSplitLines(prev => [...prev, { amount: '', category_id: '', description: '' }])}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-body)' }}>
                                    + Add line
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setSplitOpen(false)} style={cancelStyle}>Cancel</button>
                            <button onClick={() => void handleSplit()} disabled={!splitValid || splitLoading}
                                style={{ ...confirmStyle, opacity: !splitValid || splitLoading ? 0.6 : 1, cursor: !splitValid || splitLoading ? 'not-allowed' : 'pointer' }}>
                                {splitLoading ? 'Splitting…' : 'Confirm Split'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{title}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}>
                <X size={16} />
            </button>
        </div>
    );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const barBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
    borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--glass-fill-1)',
    color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500,
    cursor: 'pointer', fontFamily: 'var(--font-body)', flexShrink: 0, whiteSpace: 'nowrap',
};

const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
};

const sheetStyle: React.CSSProperties = {
    background: 'var(--glass-sheet-surface)', border: '1px solid var(--glass-border)',
    backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
    borderRadius: 'var(--radius-xl)', padding: '24px', width: '100%',
    maxWidth: '460px', boxShadow: 'var(--glass-edge)',
    animation: 'springIn 320ms cubic-bezier(0.34,1.56,0.64,1) both',
    maxHeight: '85vh', overflowY: 'auto',
};

const cancelStyle: React.CSSProperties = {
    padding: '9px 18px', borderRadius: '10px', border: '1px solid var(--glass-border)',
    background: 'var(--glass-fill-1)', color: 'var(--text-secondary)',
    fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)',
};

const confirmStyle: React.CSSProperties = {
    padding: '9px 18px', borderRadius: '10px', border: 'none',
    background: 'var(--accent)', color: 'white',
    fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
};
