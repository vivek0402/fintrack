'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef } from 'react';
import { importAPI, type CamsHolding } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Rows } from '@/components/ui/CardParts';
import { type, truncate } from '@/lib/typography';

type Step = 'upload' | 'parsing' | 'review' | 'success';

interface CamsImporterProps {
    onClose: () => void;
    onSuccess?: (result: { created: number; updated: number }) => void;
}

const fmt = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function CamsImporter({ onClose, onSuccess }: CamsImporterProps) {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState<Step>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [error, setError] = useState('');

    const [jobId, setJobId] = useState<string | null>(null);
    const [holdings, setHoldings] = useState<CamsHolding[]>([]);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ created: number; updated: number } | null>(null);

    const reset = () => {
        setFile(null);
        setError('');
        setJobId(null);
        setHoldings([]);
        setResult(null);
        setStep('upload');
    };

    const handleFileSelect = (f: File) => {
        if (f.type !== 'application/pdf') {
            setError('Please select a PDF file. CAMS CAS statements are downloaded as PDF.');
            return;
        }
        setError('');
        setFile(f);
    };

    const handleParse = async () => {
        if (!file) return;
        setStep('parsing');
        setError('');
        try {
            const res = await importAPI.uploadCams(file);
            setJobId(res.data.jobId);
            setHoldings(res.data.holdings || []);
            setStep('review');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to parse CAMS statement. Please try again.');
            setStep('upload');
        }
    };

    const removeRow = (idx: number) => {
        setHoldings(rows => rows.filter((_, i) => i !== idx));
    };

    const handleImport = async () => {
        if (!jobId) return;
        setImporting(true);
        setError('');
        try {
            const res = await importAPI.confirmCamsImport(jobId, holdings);
            const r = { created: res.data.created ?? 0, updated: res.data.updated ?? 0 };
            setResult(r);
            setStep('success');
            onSuccess?.(r);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to import holdings.');
        } finally {
            setImporting(false);
        }
    };

    const openPicker = () => fileInputRef.current?.click();

    // ── STEP: upload ─────────────────────────────────────────────────────────
    if (step === 'upload') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
                <div
                    role="button"
                    tabIndex={0}
                    onClick={openPicker}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                        e.preventDefault();
                        setDragOver(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleFileSelect(f);
                    }}
                    style={{
                        border: `1px dashed ${dragOver ? 'var(--border-visible)' : 'var(--glass-border)'}`,
                        borderRadius: 'var(--radius-lg)',
                        padding: '32px 16px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'border-color 150ms ease',
                        background: dragOver ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)',
                    }}
                >
                    {file ? (
                        <p style={{ ...type.bodyStrong, margin: 0 }}>{file.name}</p>
                    ) : (
                        <>
                            <p style={{ ...type.bodyStrong, margin: '0 0 4px' }}>
                                Drag &amp; drop your CAMS CAS PDF here
                            </p>
                            <p style={{ ...type.meta, margin: 0 }}>
                                or click to browse
                            </p>
                        </>
                    )}
                </div>

                <p style={{ ...type.meta, margin: 0, lineHeight: 1.5 }}>
                    A CAMS CAS (Consolidated Account Statement) lists all your mutual fund holdings in one PDF.
                    Get yours free at <strong style={{ ...type.bodyStrong }}>camsonline.com</strong>. Request a CAS by PAN or email, and CAMS
                    will send the PDF to your registered email.
                </p>

                {error && <p role="alert" style={{ ...type.meta, color: 'var(--color-exp-text)', margin: 0 }}>{error}</p>}

                <Button onClick={handleParse} disabled={!file} style={{ width: '100%' }}>
                    Parse statement
                </Button>
            </div>
        );
    }

    // ── STEP: parsing ────────────────────────────────────────────────────────
    if (step === 'parsing') {
        return (
            <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', gap: 12 }}>
                <div
                    aria-hidden="true"
                    style={{ width: 28, height: 28, border: '2px solid var(--text-secondary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}
                />
                <p style={{ ...type.bodyStrong, margin: 0 }}>
                    Reading your CAMS statement
                </p>
            </div>
        );
    }

    // ── STEP: review ─────────────────────────────────────────────────────────
    if (step === 'review') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ ...type.body, margin: 0 }}>
                    Found <strong style={{ ...type.bodyStrong }}>{holdings.length}</strong> holding{holdings.length !== 1 ? 's' : ''}. Review before importing to your portfolio.
                </p>

                {error && <p role="alert" style={{ ...type.meta, color: 'var(--color-exp-text)', margin: 0 }}>{error}</p>}

                <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                    {holdings.length === 0 && (
                        <p style={{ ...type.meta, margin: 0 }}>
                            No holdings found in this statement.
                        </p>
                    )}
                    <Rows>
                        {holdings.map((h, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{h.scheme_name}</p>
                                    <div style={{ ...type.numSmall, display: 'flex', gap: '0 12px', flexWrap: 'wrap' }}>
                                        <span>Folio: {h.folio_number}</span>
                                        <span>Units: {Number(h.units).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</span>
                                        <span>NAV: {fmt(h.nav)}</span>
                                        <span>Value: {fmt(h.current_value)}</span>
                                        <span>New / Update</span>
                                    </div>
                                </div>
                                <Button type="button" variant="secondary" size="sm" onClick={() => removeRow(idx)} aria-label={`Remove ${h.scheme_name}`}>
                                    Remove
                                </Button>
                            </div>
                        ))}
                    </Rows>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px solid var(--glass-border)' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleImport} isLoading={importing} disabled={holdings.length === 0}>
                        Import {holdings.length} holding{holdings.length !== 1 ? 's' : ''}
                    </Button>
                </div>
            </div>
        );
    }

    // ── STEP: success ────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: 16, textAlign: 'center' }}>
            <div>
                <p style={{ ...type.title, margin: '0 0 4px' }}>
                    Portfolio updated
                </p>
                <p style={{ ...type.body, margin: 0 }}>
                    {result?.created ?? 0} fund{(result?.created ?? 0) !== 1 ? 's' : ''} added, {result?.updated ?? 0} updated.
                </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
                <Button onClick={() => { onClose(); router.push('/investments'); }}>
                    View portfolio
                </Button>
                <Button variant="secondary" onClick={reset}>
                    Import again
                </Button>
            </div>
        </div>
    );
}
