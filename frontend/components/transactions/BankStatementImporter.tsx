'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { importAPI, ParsedTransaction } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Rows, TextAction, TONE_TEXT, type Tone } from '@/components/ui/CardParts';
import { selectStyle } from '@/components/personal-loans/fields';
import { type } from '@/lib/typography';

type Step = 'upload' | 'parsing' | 'review' | 'success';

interface JobResult {
    jobId: string;
    bank: string;
    account_last4: string | null;
    transactionCount: number;
    transactions: ParsedTransaction[];
}

interface HistoryJob {
    id: string;
    bank_name?: string;
    bank?: string;
    status: string;
    created_at: string;
}

interface BankStatementImporterProps {
    onClose: () => void;
    onSuccess?: (count: number) => void;
}

const statusTone: Record<string, Tone> = {
    completed: 'good', success: 'good', pending: 'caution', processing: 'caution', failed: 'bad', error: 'bad',
};

const rowInput: React.CSSProperties = { height: 36, padding: '0 var(--space-2)' };

export function BankStatementImporter({ onClose, onSuccess }: BankStatementImporterProps) {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState<Step>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [bankName, setBankName] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [error, setError] = useState('');
    const [history, setHistory] = useState<HistoryJob[]>([]);

    const [jobResult, setJobResult] = useState<JobResult | null>(null);
    const [editableTransactions, setEditableTransactions] = useState<ParsedTransaction[]>([]);
    const [importedCount, setImportedCount] = useState(0);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        importAPI.getHistory()
            .then(res => setHistory((res.data.jobs || res.data || []).slice(0, 3)))
            .catch(() => {});
    }, []);

    const reset = () => {
        setFile(null);
        setBankName('');
        setError('');
        setJobResult(null);
        setEditableTransactions([]);
        setImportedCount(0);
        setStep('upload');
    };

    const handleParse = async () => {
        if (!file) return;
        setStep('parsing');
        setError('');
        try {
            const res = await importAPI.uploadStatement(file, bankName.trim() || undefined);
            const data: JobResult = res.data;
            setJobResult(data);
            setEditableTransactions(data.transactions || []);
            setStep('review');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to parse statement. Please try again.');
            setStep('upload');
        }
    };

    const updateRow = (idx: number, patch: Partial<ParsedTransaction>) => {
        setEditableTransactions(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
    };

    const removeRow = (idx: number) => {
        setEditableTransactions(rows => rows.filter((_, i) => i !== idx));
    };

    const addRow = () => {
        setEditableTransactions(rows => [...rows, {
            date: new Date().toISOString().split('T')[0],
            description: '',
            amount: 0,
            type: 'expense',
        }]);
    };

    const handleImport = async () => {
        if (!jobResult) return;
        setImporting(true);
        try {
            const res = await importAPI.confirmImport(jobResult.jobId, editableTransactions);
            const count = res.data.imported ?? editableTransactions.length;
            setImportedCount(count);
            setStep('success');
            onSuccess?.(count);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to import transactions.');
        } finally {
            setImporting(false);
        }
    };

    // ── STEP: upload ─────────────────────────────────────────────────────────
    if (step === 'upload') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }}
                />
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                        e.preventDefault();
                        setDragOver(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) setFile(f);
                    }}
                    style={{
                        border: '1.5px dashed var(--border-visible)',
                        borderRadius: 'var(--radius-md)',
                        padding: '32px var(--space-4)',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'background var(--transition-fast)',
                        background: dragOver ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)',
                    }}
                >
                    <p style={{ ...type.bodyStrong, margin: 0 }}>Choose a PDF statement</p>
                    {file && <p style={{ ...type.meta, margin: '4px 0 0' }}>{file.name}</p>}
                </div>

                <Input label="Which bank is this? It helps the AI read it." value={bankName} onChange={e => setBankName(e.target.value)} placeholder="For example HDFC, ICICI, SBI" />

                {error && <p role="alert" style={{ ...type.meta, color: TONE_TEXT.bad, margin: 0 }}>{error}</p>}

                <Button onClick={handleParse} disabled={!file} style={{ width: '100%' }}>
                    Parse statement
                </Button>

                {history.length > 0 && (
                    <div>
                        <p style={{ ...type.label, margin: '0 0 var(--space-2)' }}>Recent imports</p>
                        <Rows>
                            {history.map(job => {
                                const tone = statusTone[job.status?.toLowerCase()] || 'caution';
                                return (
                                    <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
                                        <span style={{ ...type.bodyStrong, minWidth: 0 }}>{job.bank_name || job.bank || 'Unknown bank'}</span>
                                        <span style={{ ...type.meta, flexShrink: 0 }}>
                                            {new Date(job.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                            {' '}
                                            <span style={{ color: TONE_TEXT[tone] }}>{job.status}</span>
                                        </span>
                                    </div>
                                );
                            })}
                        </Rows>
                    </div>
                )}
            </div>
        );
    }

    // ── STEP: parsing ────────────────────────────────────────────────────────
    if (step === 'parsing') {
        return (
            <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px var(--space-4)' }}>
                <p style={{ ...type.body, margin: 0 }}>Reading your statement</p>
            </div>
        );
    }

    // ── STEP: review ─────────────────────────────────────────────────────────
    if (step === 'review' && jobResult) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <p style={{ ...type.meta, margin: 0 }}>
                    {`Found ${jobResult.transactionCount} transactions from ${jobResult.bank}. Edit before importing.`}
                </p>

                {error && <p role="alert" style={{ ...type.meta, color: TONE_TEXT.bad, margin: 0 }}>{error}</p>}

                <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                    <Rows>
                        {editableTransactions.map((t, idx) => (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-2)' }}>
                                {t.possible_duplicate && (
                                    <p style={{ ...type.meta, margin: 0, color: TONE_TEXT.caution }}>
                                        Possible duplicate. Matches an existing transaction.
                                    </p>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 'var(--space-2)', alignItems: 'center' }}>
                                    <Input type="date" aria-label="Date" value={t.date} onChange={e => updateRow(idx, { date: e.target.value })} style={rowInput} />
                                    <Input type="text" aria-label="Description" value={t.description} onChange={e => updateRow(idx, { description: e.target.value })} style={rowInput} placeholder="Description" />
                                    <Input type="number" aria-label="Amount" min="0" step="0.01" value={t.amount} onChange={e => updateRow(idx, { amount: parseFloat(e.target.value) || 0 })} style={{ ...rowInput, ...type.num }} />
                                    <select aria-label="Type" value={t.type} onChange={e => updateRow(idx, { type: e.target.value === 'income' ? 'income' : 'expense' })} style={{ ...selectStyle, height: 36 }}>
                                        <option value="expense">Expense</option>
                                        <option value="income">Income</option>
                                    </select>
                                    <div style={{ justifySelf: 'start' }}>
                                        <TextAction quiet onClick={() => removeRow(idx)}>Remove</TextAction>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </Rows>
                </div>

                <div style={{ alignSelf: 'flex-start' }}>
                    <TextAction onClick={addRow}>Add a row</TextAction>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
                    <TextAction quiet onClick={onClose}>Cancel</TextAction>
                    <Button onClick={handleImport} isLoading={importing} disabled={editableTransactions.length === 0}>
                        Import {editableTransactions.length} transaction{editableTransactions.length !== 1 ? 's' : ''}
                    </Button>
                </div>
            </div>
        );
    }

    // ── STEP: success ────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px var(--space-4)', gap: 'var(--space-4)', textAlign: 'center' }}>
            <p style={{ ...type.title, margin: 0 }}>
                Imported {importedCount} transaction{importedCount !== 1 ? 's' : ''}.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button onClick={() => { onClose(); router.push('/transactions'); }}>
                    View imported transactions
                </Button>
                <Button variant="secondary" onClick={reset}>
                    Import another statement
                </Button>
            </div>
        </div>
    );
}
