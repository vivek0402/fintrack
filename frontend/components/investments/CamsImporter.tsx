'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef } from 'react';
import { Upload, Loader2, Trash2, CheckCircle2, Info } from 'lucide-react';
import { importAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';

type Step = 'upload' | 'parsing' | 'review' | 'success';

interface CamsHolding {
    folio_number: string;
    fund_house: string;
    scheme_name: string;
    units: number;
    nav: number;
    current_value: number;
    purchase_details?: { date: string; units: number; price_per_unit: number }[];
}

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
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                        e.preventDefault();
                        setDragOver(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleFileSelect(f);
                    }}
                    style={{
                        border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-strong)'}`,
                        borderRadius: 'var(--radius-lg)',
                        padding: '32px 16px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'border-color 150ms ease',
                        background: dragOver ? 'var(--accent-light)' : 'var(--bg-alt)',
                    }}
                >
                    <Upload size={28} style={{ margin: '0 auto 10px', color: 'var(--text-muted)' }} />
                    {file ? (
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>{file.name}</p>
                    ) : (
                        <>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>
                                Drag &amp; drop your CAMS CAS PDF here
                            </p>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                or click to browse
                            </p>
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <Info size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                        A CAMS CAS (Consolidated Account Statement) lists all your mutual fund holdings in one PDF.
                        Get yours free at <strong>camsonline.com</strong> — request a CAS by PAN or email, and CAMS
                        will send the PDF to your registered email.
                    </p>
                </div>

                {error && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{error}</p>}

                <Button onClick={handleParse} disabled={!file} style={{ width: '100%' }}>
                    Parse Statement
                </Button>
            </div>
        );
    }

    // ── STEP: parsing ────────────────────────────────────────────────────────
    if (step === 'parsing') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', gap: 12 }}>
                <Loader2 size={32} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                    Reading your CAMS statement...
                </p>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    // ── STEP: review ─────────────────────────────────────────────────────────
    if (step === 'review') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                    Found <strong style={{ color: 'var(--text-primary)' }}>{holdings.length}</strong> holding{holdings.length !== 1 ? 's' : ''}. Review before importing to your portfolio.
                </p>

                {error && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{error}</p>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '360px', overflowY: 'auto' }}>
                    {holdings.length === 0 && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                            No holdings found in this statement.
                        </p>
                    )}
                    {holdings.map((h, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 28px', gap: 8, alignItems: 'center', padding: '10px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 8 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-head)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {h.scheme_name}
                                </p>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                    <span>Folio: {h.folio_number}</span>
                                    <span>Units: {Number(h.units).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</span>
                                    <span>NAV: {fmt(h.nav)}</span>
                                    <span>Value: {fmt(h.current_value)}</span>
                                    <span style={{
                                        fontWeight: 600, padding: '1px 6px', borderRadius: 999,
                                        background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)'
                                    }}>
                                        New / Update
                                    </span>
                                </div>
                            </div>
                            <button type="button" onClick={() => removeRow(idx)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        Cancel
                    </button>
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
            <CheckCircle2 size={40} style={{ color: 'var(--color-inc)' }} />
            <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-head)' }}>
                    Portfolio updated
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
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
