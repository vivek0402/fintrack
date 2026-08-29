'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Upload, Download, Trash2, FileText, Landmark, Receipt, Shield,
    TrendingUp, File, Archive,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { documentAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';

const DOCUMENT_TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
    salary_slip: { label: 'Salary Slip', icon: Receipt, color: 'var(--color-warn)' },
    bank_statement: { label: 'Bank Statement', icon: Landmark, color: 'var(--accent)' },
    insurance_policy: { label: 'Insurance Policy', icon: Shield, color: 'var(--color-inc)' },
    investment_proof: { label: 'Investment Proof', icon: TrendingUp, color: 'var(--color-inc)' },
    other: { label: 'Other', icon: File, color: 'var(--text-muted)' },
};

const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_META);

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx'];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

interface Document {
    id: string;
    name: string;
    type: string;
    financial_year: string | null;
    storage_path: string;
    file_name: string;
    file_size_bytes: number;
    mime_type: string;
    description: string | null;
    created_at: string;
}

function getCurrentFY(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return month >= 3
        ? `${year}-${String((year + 1) % 100).padStart(2, '0')}`
        : `${year - 1}-${String(year % 100).padStart(2, '0')}`;
}

function getFYOptions(count: number): string[] {
    const current = getCurrentFY();
    const startYear = parseInt(current.slice(0, 4), 10);
    return Array.from({ length: count }, (_, i) => {
        const y = startYear - i;
        return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    });
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays} days ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
    const diffYears = Math.floor(diffMonths / 12);
    return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
}

function formatFullDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const fieldSt: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)' };

export default function DocumentsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('all');
    const [fyFilter, setFyFilter] = useState('all');

    const [showUploadModal, setShowUploadModal] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadForm, setUploadForm] = useState({ name: '', type: 'other', financial_year: getCurrentFY(), description: '' });
    const [uploadError, setUploadError] = useState('');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchData = () => {
        setLoading(true);
        documentAPI.getAll()
            .then(res => setDocuments(res.data))
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (!user) return;
        fetchData();
    }, [user]);

    const fyOptions = useMemo(() => {
        const set = new Set<string>();
        documents.forEach(d => { if (d.financial_year) set.add(d.financial_year); });
        return Array.from(set).sort().reverse();
    }, [documents]);

    const filteredDocuments = useMemo(() => {
        return documents.filter(d => {
            if (typeFilter !== 'all' && d.type !== typeFilter) return false;
            if (fyFilter !== 'all' && d.financial_year !== fyFilter) return false;
            return true;
        });
    }, [documents, typeFilter, fyFilter]);

    const filtersActive = typeFilter !== 'all' || fyFilter !== 'all';

    const clearFilters = () => {
        setTypeFilter('all');
        setFyFilter('all');
    };

    const openUploadModal = () => {
        setSelectedFile(null);
        setUploadForm({ name: '', type: 'other', financial_year: getCurrentFY(), description: '' });
        setUploadError('');
        setShowUploadModal(true);
    };

    const handleFileSelect = (file: File | null) => {
        if (!file) return;
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            setUploadError('Only PDF, JPG, PNG, and XLSX files are accepted.');
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setUploadError('File size must be 20MB or less.');
            return;
        }
        setUploadError('');
        setSelectedFile(file);
        setUploadForm(f => ({ ...f, name: f.name || file.name }));
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            setUploadError('Please select a file.');
            return;
        }
        if (!uploadForm.name.trim()) {
            setUploadError('Document name is required.');
            return;
        }
        setUploading(true);
        setUploadError('');
        try {
            const res = await documentAPI.upload(selectedFile, {
                name: uploadForm.name.trim(),
                type: uploadForm.type,
                financial_year: uploadForm.financial_year === 'none' ? undefined : uploadForm.financial_year,
                description: uploadForm.description.trim() || undefined,
            });
            setDocuments(prev => [res.data, ...prev]);
            setShowUploadModal(false);
        } catch (err: any) {
            setUploadError(err.response?.data?.error || 'Failed to upload document.');
        } finally {
            setUploading(false);
        }
    };

    const handleDownload = async (doc: Document) => {
        try {
            const res = await documentAPI.getDownloadUrl(doc.id);
            window.open(res.data.download_url, '_blank');
        } catch { /* ignore */ }
    };

    const handleDelete = async (doc: Document) => {
        if (!window.confirm(`Delete ${doc.name}? This cannot be undone.`)) return;
        setDeletingId(doc.id);
        try {
            await documentAPI.delete(doc.id);
            setDocuments(prev => prev.filter(d => d.id !== doc.id));
        } catch { /* ignore */ }
        finally { setDeletingId(null); }
    };

    if (isLoading || !user || loading) {
        return (
            <>
                <SkeletonCard height={60} style={{ marginBottom: '16px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
                    {[1, 2, 3].map(i => <SkeletonCard key={i} height={160} />)}
                </div>
            </>
        );
    }

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── PAGE HEADER ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                            Document Vault
                        </h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                            Securely store your financial documents
                        </p>
                    </div>
                    <Button onClick={openUploadModal}>
                        <Upload size={14} /> Upload
                    </Button>
                </div>

                {/* ── FILTERS ── */}
                {documents.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                            <button
                                type="button"
                                onClick={() => setTypeFilter('all')}
                                className={typeFilter === 'all' ? undefined : 'glass-field'}
                                style={{
                                    padding: '6px 14px', borderRadius: 999, border: 'none',
                                    background: typeFilter === 'all' ? 'var(--accent)' : undefined,
                                    color: typeFilter === 'all' ? '#fff' : 'var(--text-secondary)',
                                    fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer', whiteSpace: 'nowrap',
                                }}
                            >
                                All
                            </button>
                            {DOCUMENT_TYPES.map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setTypeFilter(t)}
                                    className={typeFilter === t ? undefined : 'glass-field'}
                                    style={{
                                        padding: '6px 14px', borderRadius: 999, border: 'none',
                                        background: typeFilter === t ? 'var(--accent)' : undefined,
                                        color: typeFilter === t ? '#fff' : 'var(--text-secondary)',
                                        fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer', whiteSpace: 'nowrap',
                                    }}
                                >
                                    {DOCUMENT_TYPE_META[t].label}
                                </button>
                            ))}
                        </div>

                        {fyOptions.length > 0 && (
                            <select
                                value={fyFilter}
                                onChange={e => setFyFilter(e.target.value)}
                                className="glass-field"
                                style={{
                                    alignSelf: 'flex-start',
                                    padding: '8px 14px', borderRadius: 'var(--radius-md)', border: 'none',
                                    color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600,
                                    fontFamily: 'var(--font-body)', cursor: 'pointer',
                                }}
                            >
                                <option value="all">All years</option>
                                {fyOptions.map(fy => <option key={fy} value={fy}>FY {fy}</option>)}
                            </select>
                        )}
                    </div>
                )}

                {/* ── DOCUMENT GRID ── */}
                {documents.length === 0 ? (
                    <EmptyState
                        icon={Archive}
                        title="No documents stored yet"
                        subtitle="Upload your Form 16, ITR copies, investment proofs, and insurance policies to keep everything in one place."
                        action={<Button onClick={openUploadModal}><Upload size={14} /> Upload</Button>}
                    />
                ) : filteredDocuments.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>
                            No documents match your filters.
                        </p>
                        <button type="button" onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            Clear filters
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
                        {filteredDocuments.map(doc => {
                            const meta = DOCUMENT_TYPE_META[doc.type] || DOCUMENT_TYPE_META.other;
                            const Icon = meta.icon;
                            return (
                                <Card key={doc.id}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Icon size={18} color={meta.color} />
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button type="button" onClick={() => handleDownload(doc)} title="Download" className="glass-field" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                                <Download size={14} />
                                            </button>
                                            <button type="button" onClick={() => handleDelete(doc)} disabled={deletingId === doc.id} title="Delete" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, background: 'color-mix(in srgb, var(--color-exp) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 22%, transparent)', borderRadius: 8, cursor: deletingId === doc.id ? 'not-allowed' : 'pointer', color: 'var(--color-exp)', opacity: deletingId === doc.id ? 0.5 : 1 }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px', fontFamily: 'var(--font-body)', wordBreak: 'break-word' }}>
                                        {doc.name}
                                    </p>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color, fontFamily: 'var(--font-body)' }}>
                                            {meta.label}
                                        </span>
                                        {doc.financial_year && (
                                            <span className="glass-field" style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: 999, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                                FY {doc.financial_year}
                                            </span>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)' }}>{formatFileSize(doc.file_size_bytes)}</span>
                                        <span title={formatFullDate(doc.created_at)}>{formatRelativeDate(doc.created_at)}</span>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── UPLOAD MODAL ── */}
            <Modal
                isOpen={showUploadModal}
                onClose={() => setShowUploadModal(false)}
                title="Upload Document"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <Button variant="secondary" onClick={() => setShowUploadModal(false)}>Cancel</Button>
                        <Button onClick={handleUpload} isLoading={uploading}>Upload</Button>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>File</label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0] || null); }}
                            className="glass-field"
                            style={{
                                border: '2px dashed var(--glass-border)', borderRadius: 'var(--radius-md)', padding: '24px 16px',
                                textAlign: 'center', cursor: 'pointer',
                            }}
                        >
                            <Upload size={20} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                            <p style={{ fontSize: '13px', color: selectedFile ? 'var(--text-primary)' : 'var(--text-muted)', margin: 0, fontWeight: selectedFile ? 600 : 400, fontFamily: 'var(--font-body)' }}>
                                {selectedFile ? selectedFile.name : 'Click or drop a file here (PDF, JPG, PNG, XLSX — max 20MB)'}
                            </p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                                onChange={e => handleFileSelect(e.target.files?.[0] || null)}
                                style={{ display: 'none' }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Document Name</label>
                        <input
                            type="text"
                            value={uploadForm.name}
                            onChange={e => setUploadForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. Form 16 - FY 2024-25"
                            style={fieldSt}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Document Type</label>
                        <select
                            value={uploadForm.type}
                            onChange={e => setUploadForm(f => ({ ...f, type: e.target.value }))}
                            style={fieldSt}
                        >
                            {DOCUMENT_TYPES.map(t => (
                                <option key={t} value={t}>{DOCUMENT_TYPE_META[t].label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Financial Year</label>
                        <select
                            value={uploadForm.financial_year}
                            onChange={e => setUploadForm(f => ({ ...f, financial_year: e.target.value }))}
                            style={fieldSt}
                        >
                            {getFYOptions(5).map(fy => <option key={fy} value={fy}>FY {fy}</option>)}
                            <option value="none">Not applicable</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Description (optional)</label>
                        <input
                            type="text"
                            value={uploadForm.description}
                            onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))}
                            style={fieldSt}
                        />
                    </div>

                    {uploadError && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{uploadError}</p>}
                </div>
            </Modal>
        </>
    );
}
