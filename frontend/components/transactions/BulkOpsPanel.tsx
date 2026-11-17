'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { transactionsAPI } from '@/lib/api';
import { CategoryField, CategoryPickerDialog } from '@/components/categories/CategoryPickerDialog';
import { useCategories } from '@/hooks/useCategories';
import { toast } from '@/store/toastStore';
import { exportToCSV, formatCurrency } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useWindowSize';
import { haptics } from '@/lib/haptics';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Rows, TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { type } from '@/lib/typography';
import { splitSummary, formatSplitSentence } from '@/lib/bulkOps';

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

// Compact variants of the shared Input for the split lines.
const lineInputStyle: React.CSSProperties = { height: 36, padding: '0 var(--space-2)' };
const lineAmountStyle: React.CSSProperties = { ...type.num, height: 36, padding: '0 var(--space-2)' };

export function BulkOpsPanel({
    selectedIds, allTransactions, currency, selectedYear, selectedMonth,
    onSelectAll, onExit, onRefresh, onRemoveIds, onPendingDeleteChange,
}: Props) {
    const isMobile = useIsMobile();
    const count = selectedIds.size;
    const plural = count !== 1 ? 's' : '';
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

    // The Modal moves focus to its first control (the close button) once it has
    // mounted, which would undo the input's autoFocus. Put focus back on the
    // tag field after that has happened.
    useEffect(() => {
        if (!bulkTagOpen) return;
        const t = setTimeout(() => document.getElementById('bulk-tag-input')?.focus(), 60);
        return () => clearTimeout(t);
    }, [bulkTagOpen]);

    const openCategorize = () => setBulkCatOpen(true);
    const openSplit = () => {
        setSplitLines([
            { amount: '', category_id: '', description: splitTx?.description || '' },
            { amount: '', category_id: '', description: '' },
        ]);
        setSplitOpen(true);
    };
    const closeTag = () => { setBulkTagOpen(false); setTagInput(''); };

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
        else toast.error(`Updated ${okCount} of ${ids.length}. ${failCount} failed.`);
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
        else toast.error(`Tagged ${okCount} of ${ids.length}. ${failCount} failed.`);
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
        haptics.delete();
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
                toast.error('Some deletions failed. Refreshing.');
                onRefresh();
            }
        }, 4200);
    };

    const handleBulkExport = () => {
        const mo = String(selectedMonth ?? 'all').padStart(2, '0');
        void exportToCSV(selectedTxs, `fintrack-selected-${selectedYear}-${mo}.csv`);
    };

    const splitTotal = splitTx ? parseFloat(splitTx.amount) : 0;
    const split = splitSummary(splitLines, splitTotal);
    const splitValid = split.valid;

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
                // Creates succeeded but deleting the original failed: roll back the
                // new lines instead of leaving the user with duplicated transactions.
                try {
                    await Promise.all(createdIds.map(id => transactionsAPI.delete(id)));
                    toast.error('Split failed. No changes were made. Try again.');
                } catch {
                    toast.error(`Split partially failed. Check transaction "${splitTx.description}" (${splitTx.date}) for duplicates.`);
                }
                onRefresh();
                return;
            }
            toast.success(`Split into ${splitLines.length} transactions`);
            setSplitOpen(false);
            onExit();
            onRefresh();
        } catch {
            // A create failed mid-loop: clean up whatever lines were created so
            // far; the original transaction is untouched.
            if (createdIds.length > 0) {
                await Promise.all(createdIds.map(id => transactionsAPI.delete(id).catch(() => {})));
            }
            toast.error('Split failed. No changes were made.');
        } finally {
            setSplitLoading(false);
        }
    };

    if (typeof document === 'undefined') return null;

    const barBottom = isMobile ? 'calc(60px + var(--sa-bottom))' : '24px';

    return createPortal(
        <>
            {/* Floating bulk action bar */}
            <div style={{
                position: 'fixed', bottom: barBottom, left: '50%', transform: 'translateX(-50%)',
                zIndex: 990, background: 'var(--glass-sheet-surface)', border: '1px solid var(--glass-border)',
                backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--glass-edge)',
                padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                gap: 'var(--space-2) var(--space-4)',
                width: 'min(640px, calc(100vw - 32px))', animation: 'fadeUp 180ms ease both',
            }}>
                {progress ? (
                    <span role="status" style={type.body}>
                        {`Updating ${progress.done} of ${progress.total}`}
                    </span>
                ) : (
                    <>
                        <span style={{ ...type.bodyStrong, flexShrink: 0 }}>{`${count} selected`}</span>
                        <TextAction quiet onClick={onSelectAll}>{`All ${allTransactions.length}`}</TextAction>
                        <span style={{ flex: 1 }} />
                        <TextAction onClick={openCategorize}>Categorize</TextAction>
                        <TextAction onClick={() => setBulkTagOpen(true)}>Tag</TextAction>
                        {count === 1 && <TextAction onClick={openSplit}>Split</TextAction>}
                        <TextAction onClick={handleBulkExport} aria-label="Export selected">Export</TextAction>
                        <TextAction tone="danger" onClick={() => setBulkDeleteOpen(true)} aria-label="Delete selected">Delete</TextAction>
                        <TextAction quiet onClick={onExit} aria-label="Cancel">Done</TextAction>
                    </>
                )}
            </div>

            {/* Bulk categorize */}
            <CategoryPickerDialog
                isOpen={bulkCatOpen}
                onClose={() => setBulkCatOpen(false)}
                title={`Categorize ${count} transaction${plural}`}
                value=""
                onChange={id => void handleBulkCategorize(id)}
                categories={categories}
            />

            {/* Bulk tag */}
            <Modal
                isOpen={bulkTagOpen}
                onClose={closeTag}
                title={`Tag ${count} transaction${plural}`}
                maxWidth="420px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                        <Button type="button" variant="secondary" onClick={closeTag}>Cancel</Button>
                        <Button type="button" onClick={() => void handleBulkTag()} isLoading={tagLoading} disabled={!tagInput.trim()}>Apply tag</Button>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <p style={{ ...type.meta, margin: 0 }}>The tag is added to every selected transaction.</p>
                    <Input
                        id="bulk-tag-input"
                        type="text" autoFocus aria-label="Tag name" placeholder="Tag name, for example tax-deductible"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value.replace(/\s/g, ''))}
                        onKeyDown={e => { if (e.key === 'Enter') void handleBulkTag(); }}
                    />
                </div>
            </Modal>

            {/* Bulk delete confirm */}
            <Modal
                isOpen={bulkDeleteOpen}
                onClose={() => setBulkDeleteOpen(false)}
                title={`Delete ${count} transaction${plural}?`}
                maxWidth="420px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                        <Button type="button" variant="secondary" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
                        <Button type="button" variant="danger" onClick={handleBulkDelete}>{`Delete ${count}`}</Button>
                    </div>
                }
            >
                <p style={{ ...type.body, margin: 0 }}>
                    {`${count} transaction${plural} will be removed. You will have a few seconds to undo.`}
                </p>
            </Modal>

            {/* Split transaction */}
            <Modal
                isOpen={splitOpen && !!splitTx}
                onClose={() => setSplitOpen(false)}
                title="Split transaction"
                maxWidth="560px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                        <Button type="button" variant="secondary" onClick={() => setSplitOpen(false)}>Cancel</Button>
                        <Button type="button" onClick={() => void handleSplit()} isLoading={splitLoading} disabled={!splitValid}>Split</Button>
                    </div>
                }
            >
                {splitTx && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        <Rows>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                                <div style={{ minWidth: 0 }}>
                                    <p style={{ ...type.bodyStrong, margin: 0 }}>{splitTx.description}</p>
                                    <p style={{ ...type.meta, margin: 0 }}>The original transaction</p>
                                </div>
                                <span style={{ ...type.num, flexShrink: 0 }}>{formatCurrency(splitTotal, currency)}</span>
                            </div>
                        </Rows>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            {splitLines.map((line, i) => (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                                    <div style={{
                                        display: 'grid', alignItems: 'center', gap: 'var(--space-2)',
                                        gridTemplateColumns: isMobile ? '24px 96px minmax(0, 1fr)' : '24px 96px minmax(0, 1fr) 140px',
                                    }}>
                                        <span style={{ ...type.meta, textAlign: 'right' }}>{i + 1}</span>
                                        <Input type="number" placeholder="Amount" aria-label={`Line ${i + 1} amount`} min="0.01" step="any"
                                            value={line.amount}
                                            onChange={e => setSplitLines(prev => prev.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))}
                                            style={lineAmountStyle}
                                        />
                                        <Input type="text" placeholder="Description" aria-label={`Line ${i + 1} description`}
                                            value={line.description}
                                            onChange={e => setSplitLines(prev => prev.map((l, j) => j === i ? { ...l, description: e.target.value } : l))}
                                            style={lineInputStyle}
                                        />
                                        <div style={isMobile ? { gridColumn: '2 / -1' } : undefined}>
                                            <CategoryField
                                                size="sm"
                                                placeholder="Category"
                                                value={line.category_id}
                                                onChange={v => setSplitLines(prev => prev.map((l, j) => j === i ? { ...l, category_id: v } : l))}
                                                categories={categories}
                                            />
                                        </div>
                                    </div>
                                    {splitLines.length > 2 && (
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <TextAction quiet onClick={() => setSplitLines(prev => prev.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>Remove</TextAction>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                            <p role="status" style={{ ...type.meta, margin: 0, color: split.sentenceKey === 'over' ? TONE_TEXT.bad : undefined }}>
                                {formatSplitSentence(split, splitTotal, n => formatCurrency(n, currency))}
                            </p>
                            {splitLines.length < 5 && (
                                <TextAction onClick={() => setSplitLines(prev => [...prev, { amount: '', category_id: '', description: '' }])}>Add a line</TextAction>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </>,
        document.body
    );
}
