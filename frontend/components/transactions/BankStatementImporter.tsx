'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Loader2, Trash2, CheckCircle2 } from 'lucide-react';
import { importAPI, ParsedTransaction } from '@/lib/api';
import { Button } from '@/components/ui/Button';

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

const inputSt: React.CSSProperties = {
    width: '100%', background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 8,
    padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)',
};
const labelSt: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block', fontFamily: 'var(--font-body)',
};

const statusColors: Record<string, { bg: string; color: string }> = {
    completed: { bg: 'color-mix(in srgb, var(--color-inc) 12%, transparent)', color: 'var(--color-inc)' },
    success:   { bg: 'color-mix(in srgb, var(--color-inc) 12%, transparent)', color: 'var(--color-inc)' },
    pending:   { bg: 'color-mix(in srgb, #f59e0b 15%, transparent)', color: '#f59e0b' },
    processing:{ bg: 'color-mix(in srgb, #f59e0b 15%, transparent)', color: '#f59e0b' },
    failed:    { bg: 'color-mix(in srgb, var(--color-exp) 12%, transparent)', color: 'var(--color-exp)' },
    error:     { bg: 'color-mix(in srgb, var(--color-exp) 12%, transparent)', color: 'var(--color-exp)' },
};

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                        border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-visible)'}`,
                        borderRadius: 'var(--radius-lg)',
                        padding: '32px 16px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'border-color 150ms ease',
                        background: dragOver ? 'var(--accent-subtle)' : 'var(--glass-fill-1)',
                    }}
                >
                    <Upload size={28} style={{ margin: '0 auto 10px', color: 'var(--text-muted)' }} />
                    {file ? (
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>{file.name}</p>
                    ) : (
                        <>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>
                                Drag &amp; drop your bank statement PDF here
                            </p>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                or click to browse
                            </p>
                        </>
                    )}
                </div>

                <div>
                    <label style={labelSt}>Which bank is this? (helps AI parse)</label>
                    <input style={inputSt} value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. HDFC, ICICI, SBI…" />
                </div>

                {error && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{error}</p>}

                <Button onClick={handleParse} disabled={!file} style={{ width: '100%' }}>
                    Parse Statement
                </Button>

                {history.length > 0 && (
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>
                            Recent imports
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {history.map(job => {
                                const status = statusColors[job.status?.toLowerCase()] || statusColors.pending;
                                return (
                                    <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--glass-fill-1)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                                        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
                                            {job.bank_name || job.bank || 'Unknown bank'}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                                {new Date(job.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                            </span>
                                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: status.bg, color: status.color, textTransform: 'capitalize', fontFamily: 'var(--font-body)' }}>
                                                {job.status}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── STEP: parsing ────────────────────────────────────────────────────────
    if (step === 'parsing') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', gap: 12 }}>
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                    Reading your statement…
                </p>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    // ── STEP: review ─────────────────────────────────────────────────────────
    if (step === 'review' && jobResult) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                    Found <strong style={{ color: 'var(--text-primary)' }}>{jobResult.transactionCount}</strong> transactions from <strong style={{ color: 'var(--text-primary)' }}>{jobResult.bank}</strong>. Edit before importing.
                </p>

                {error && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{error}</p>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '360px', overflowY: 'auto' }}>
                    {editableTransactions.map((t, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px', background: 'var(--glass-fill-1)', border: `1px solid ${t.possible_duplicate ? 'color-mix(in srgb, #f59e0b 40%, var(--border-subtle))' : 'var(--border-subtle)'}`, borderRadius: 8 }}>
                            {t.possible_duplicate && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#f59e0b', fontFamily: 'var(--font-body)' }}>
                                    Possible duplicate — matches an existing transaction
                                </span>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 90px 28px', gap: 6, alignItems: 'center' }}>
                                <input type="date" value={t.date} onChange={e => updateRow(idx, { date: e.target.value })} style={{ ...inputSt, padding: '6px 8px', fontSize: 12 }} />
                                <input type="text" value={t.description} onChange={e => updateRow(idx, { description: e.target.value })} style={{ ...inputSt, padding: '6px 8px', fontSize: 12 }} placeholder="Description" />
                                <input type="number" min="0" step="0.01" value={t.amount} onChange={e => updateRow(idx, { amount: parseFloat(e.target.value) || 0 })} style={{ ...inputSt, padding: '6px 8px', fontSize: 12 }} />
                                <button
                                    type="button"
                                    onClick={() => updateRow(idx, { type: t.type === 'income' ? 'expense' : 'income' })}
                                    style={{
                                        padding: '6px 4px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)',
                                        background: t.type === 'income' ? 'color-mix(in srgb, var(--color-inc) 14%, transparent)' : 'color-mix(in srgb, var(--color-exp) 14%, transparent)',
                                        color: t.type === 'income' ? 'var(--color-inc)' : 'var(--color-exp)',
                                    }}
                                >
                                    {t.type === 'income' ? 'Income' : 'Expense'}
                                </button>
                                <button type="button" onClick={() => removeRow(idx)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <button type="button" onClick={addRow} style={{ padding: '8px', borderRadius: 8, border: '1px dashed var(--border-visible)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    + Add row
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        Cancel
                    </button>
                    <Button onClick={handleImport} isLoading={importing} disabled={editableTransactions.length === 0}>
                        Import {editableTransactions.length} transaction{editableTransactions.length !== 1 ? 's' : ''}
                    </Button>
                </div>
            </div>
        );
    }

    // ── STEP: success ────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: 16, textAlign: 'center' }}>
            <CheckCircle2 size={40} style={{ color: 'var(--color-inc)' }} />
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
                Successfully imported {importedCount} transaction{importedCount !== 1 ? 's' : ''}.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
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
