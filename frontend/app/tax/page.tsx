'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Info, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { taxAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonCard } from '@/components/ui/Skeleton';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtSigned = (n: number) => (n >= 0 ? '+' : '-') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

const SECTION_80C_LIMIT = 150000;

const TAX_TYPE_LABELS: Record<string, string> = {
    ppf: 'PPF',
    elss: 'ELSS',
    epf: 'EPF',
    life_insurance: 'Life Insurance',
    nsc: 'NSC',
    tax_saver_fd: 'Tax Saver FD',
    nps: 'NPS',
    home_loan_principal: 'Home Loan Principal',
    tuition_fees: 'Tuition Fees',
    other: 'Other',
};

const TAX_INVESTMENT_TYPES = Object.keys(TAX_TYPE_LABELS);

function getCurrentFY(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return month >= 3
        ? `${year}-${String((year + 1) % 100).padStart(2, '0')}`
        : `${year - 1}-${String(year % 100).padStart(2, '0')}`;
}

function getFYOptions(): string[] {
    const current = getCurrentFY();
    const startYear = parseInt(current.slice(0, 4), 10);
    return [0, 1, 2].map(offset => {
        const y = startYear - offset;
        return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    });
}

interface TaxInvestment {
    id: string;
    type: string;
    name: string;
    amount: string | number;
    deduction_section: string;
    financial_year: string;
}

interface AutoAddCandidate {
    id: string;
    name: string;
    type: string;
    amount: number;
}

interface Summary80C {
    financial_year: string;
    total_claimed: number;
    limit: number;
    remaining: number;
    utilization_pct: number;
    breakdown_by_type: { type: string; total: number }[];
    entries: TaxInvestment[];
    auto_add_candidates: AutoAddCandidate[];
}

interface CapitalGainsTxn {
    asset_name: string;
    buy_date: string;
    sell_date: string;
    holding_period_days: number;
    units: number;
    buy_price: number;
    sell_price: number;
    gain_loss_amount: number;
    gain_type: 'stcg' | 'ltcg';
}

interface CapitalGains {
    financial_year: string;
    stcg_equity: number;
    ltcg_equity: number;
    stcg_other: number;
    ltcg_other: number;
    total_gains: number;
    transactions: CapitalGainsTxn[];
}

export default function TaxPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const fyOptions = useMemo(() => getFYOptions(), []);
    const [fy, setFy] = useState(fyOptions[0]);

    const [summary, setSummary] = useState<Summary80C | null>(null);
    const [gains, setGains] = useState<CapitalGains | null>(null);
    const [loading, setLoading] = useState(true);

    const [showAddModal, setShowAddModal] = useState(false);
    const [addForm, setAddForm] = useState({ type: 'ppf', name: '', amount: '', financial_year: fy });
    const [addError, setAddError] = useState('');
    const [adding, setAdding] = useState(false);

    const [editingEntry, setEditingEntry] = useState<TaxInvestment | null>(null);
    const [editForm, setEditForm] = useState({ name: '', amount: '' });
    const [editError, setEditError] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [addingCandidateId, setAddingCandidateId] = useState<string | null>(null);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchData = (selectedFy: string) => {
        setLoading(true);
        Promise.all([taxAPI.get80CSummary(selectedFy), taxAPI.getCapitalGains(selectedFy)])
            .then(([summaryRes, gainsRes]) => {
                setSummary(summaryRes.data);
                setGains(gainsRes.data);
            })
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (!user) return;
        fetchData(fy);
    }, [user, fy]);

    useEffect(() => { setAddForm(f => ({ ...f, financial_year: fy })); }, [fy]);

    if (isLoading || !user || loading || !summary || !gains) {
        return (
            <AppLayout>
                <SkeletonCard height={60} style={{ marginBottom: '16px' }} />
                <SkeletonCard height={180} style={{ marginBottom: '16px' }} />
                <SkeletonCard height={260} />
            </AppLayout>
        );
    }

    const utilColor = summary.utilization_pct >= 80
        ? 'var(--color-inc)'
        : summary.utilization_pct >= 40
        ? 'var(--color-warn)'
        : 'var(--color-exp)';

    const handleAdd80C = async () => {
        setAddError('');
        if (!addForm.name.trim() || !addForm.amount) {
            setAddError('Name and amount are required.');
            return;
        }
        const amount = parseFloat(addForm.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            setAddError('Amount must be greater than 0.');
            return;
        }
        setAdding(true);
        try {
            await taxAPI.add80C({
                type: addForm.type,
                name: addForm.name.trim(),
                amount,
                financial_year: addForm.financial_year,
            });
            setShowAddModal(false);
            setAddForm({ type: 'ppf', name: '', amount: '', financial_year: fy });
            fetchData(fy);
        } catch (err: any) {
            setAddError(err.response?.data?.error || 'Failed to add investment.');
        } finally {
            setAdding(false);
        }
    };

    const openEdit = (entry: TaxInvestment) => {
        setEditingEntry(entry);
        setEditForm({ name: entry.name, amount: String(entry.amount) });
        setEditError('');
    };

    const handleSaveEdit = async () => {
        if (!editingEntry) return;
        setEditError('');
        const amount = parseFloat(editForm.amount);
        if (!editForm.name.trim() || !Number.isFinite(amount) || amount <= 0) {
            setEditError('Name and a valid amount are required.');
            return;
        }
        setSavingEdit(true);
        try {
            await taxAPI.update80C(editingEntry.id, { name: editForm.name.trim(), amount });
            setEditingEntry(null);
            fetchData(fy);
        } catch (err: any) {
            setEditError(err.response?.data?.error || 'Failed to update.');
        } finally {
            setSavingEdit(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Delete this 80C entry? This cannot be undone.')) return;
        setDeletingId(id);
        try {
            await taxAPI.delete80C(id);
            fetchData(fy);
        } catch { /* ignore */ }
        finally { setDeletingId(null); }
    };

    const handleAddCandidate = async (c: AutoAddCandidate) => {
        setAddingCandidateId(c.id);
        try {
            await taxAPI.add80C({
                type: c.type,
                name: c.name,
                amount: c.amount,
                investment_id: c.id,
                financial_year: fy,
            });
            fetchData(fy);
        } catch { /* ignore */ }
        finally { setAddingCandidateId(null); }
    };

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── PAGE HEADER ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                            Tax Intelligence
                        </h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                            Financial year {fy}
                        </p>
                    </div>
                    <select
                        value={fy}
                        onChange={e => setFy(e.target.value)}
                        style={{
                            padding: '8px 14px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-card)',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            fontWeight: 600,
                            fontFamily: 'var(--font-body)',
                            cursor: 'pointer',
                        }}
                    >
                        {fyOptions.map(opt => (
                            <option key={opt} value={opt}>FY {opt}</option>
                        ))}
                    </select>
                </div>

                {/* ══ SECTION 1: 80C TRACKER ══ */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                Section 80C Deductions
                            </h2>
                            <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: 'var(--bg-alt)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                FY {fy}
                            </span>
                        </div>
                        <Button size="sm" onClick={() => setShowAddModal(true)}>
                            <Plus size={14} /> Add 80C Investment
                        </Button>
                    </div>

                    <Card style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {fmt(summary.total_claimed)} / {fmt(SECTION_80C_LIMIT)}
                            </span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: utilColor }}>
                                {summary.utilization_pct}%
                            </span>
                        </div>
                        <ProgressBar pct={summary.utilization_pct} color={utilColor} height={8} />

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
                            <div>
                                <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Claimed</p>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(summary.total_claimed)}</p>
                            </div>
                            <div>
                                <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Remaining</p>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--color-inc)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(summary.remaining)}</p>
                            </div>
                            <div>
                                <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Limit</p>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(summary.limit)}</p>
                            </div>
                        </div>
                    </Card>

                    {/* Entries table */}
                    <Card style={{ marginBottom: summary.auto_add_candidates.length > 0 ? 12 : 0 }}>
                        {summary.entries.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, textAlign: 'center', padding: '16px 0', fontFamily: 'var(--font-body)' }}>
                                No 80C investments logged for FY {fy} yet.
                            </p>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px 0' }}>Type</th>
                                            <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Name</th>
                                            <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Amount (₹)</th>
                                            <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 8px' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summary.entries.map((entry, idx) => (
                                            <tr key={entry.id} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
                                                <td style={{ padding: '8px 8px 8px 0' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--accent-light)', color: 'var(--accent)', fontFamily: 'var(--font-body)' }}>
                                                        {TAX_TYPE_LABELS[entry.type] || entry.type}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '13px', color: 'var(--text-primary)', padding: '8px' }}>{entry.name}</td>
                                                <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600, padding: '8px' }}>{fmt(Number(entry.amount))}</td>
                                                <td style={{ textAlign: 'right', padding: '8px 0 8px 8px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                                        <button type="button" onClick={() => openEdit(entry)} title="Edit" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button type="button" onClick={() => handleDelete(entry.id)} disabled={deletingId === entry.id} title="Delete" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'color-mix(in srgb, var(--color-exp) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 22%, transparent)', borderRadius: 8, cursor: deletingId === entry.id ? 'not-allowed' : 'pointer', color: 'var(--color-exp)', opacity: deletingId === entry.id ? 0.5 : 1 }}>
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>

                    {/* Auto-add candidates */}
                    {summary.auto_add_candidates.length > 0 && (
                        <Card>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <Sparkles size={15} color="var(--accent)" />
                                <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                    Investments that may qualify for 80C — add to claim deduction
                                </h3>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {summary.auto_add_candidates.map(c => (
                                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 10, flexWrap: 'wrap' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>{c.name}</p>
                                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                                {TAX_TYPE_LABELS[c.type] || c.type} · Suggested {fmt(c.amount)}
                                            </p>
                                        </div>
                                        <Button size="sm" variant="secondary" isLoading={addingCandidateId === c.id} onClick={() => handleAddCandidate(c)}>
                                            Add to 80C
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>

                {/* ══ SECTION 2: CAPITAL GAINS ══ */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                            Capital Gains
                        </h2>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: 'var(--bg-alt)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                            FY {fy}
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: 12 }}>
                        {[
                            { label: 'STCG (Equity)', value: gains.stcg_equity },
                            { label: 'LTCG (Equity)', value: gains.ltcg_equity },
                            { label: 'STCG (Other)', value: gains.stcg_other },
                            { label: 'LTCG (Other)', value: gains.ltcg_other },
                        ].map(tile => (
                            <Card key={tile.label}>
                                <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>{tile.label}</p>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: tile.value >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                    {fmtSigned(tile.value)}
                                </p>
                            </Card>
                        ))}
                    </div>

                    <Card style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: gains.transactions.length > 0 ? 12 : 0 }}>
                            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Sell Transactions</h3>
                            <Link href="/tax/add-transaction" style={{ textDecoration: 'none' }}>
                                <Button size="sm" variant="secondary">
                                    <Plus size={14} /> Add transaction
                                </Button>
                            </Link>
                        </div>

                        {gains.transactions.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, textAlign: 'center', padding: '16px 0', fontFamily: 'var(--font-body)' }}>
                                No sell transactions recorded yet. Capital gains will appear here when you sell investments and log the transactions.
                            </p>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px 0' }}>Asset</th>
                                            <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Type</th>
                                            <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Buy Date</th>
                                            <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Sell Date</th>
                                            <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Holding Period</th>
                                            <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 8px' }}>Gain / Loss</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {gains.transactions.map((t, idx) => (
                                            <tr key={idx} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
                                                <td style={{ fontSize: '13px', color: 'var(--text-primary)', padding: '8px 8px 8px 0' }}>{t.asset_name}</td>
                                                <td style={{ padding: '8px' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: t.gain_type === 'ltcg' ? 'color-mix(in srgb, var(--color-inc) 12%, transparent)' : 'color-mix(in srgb, var(--color-warn) 12%, transparent)', color: t.gain_type === 'ltcg' ? 'var(--color-inc)' : 'var(--color-warn)', fontFamily: 'var(--font-body)' }}>
                                                        {t.gain_type.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '8px', fontFamily: 'var(--font-mono)' }}>{new Date(t.buy_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                                <td style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '8px', fontFamily: 'var(--font-mono)' }}>{new Date(t.sell_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                                <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--text-secondary)', padding: '8px', fontFamily: 'var(--font-mono)' }}>{t.holding_period_days} days</td>
                                                <td style={{ fontSize: '13px', textAlign: 'right', fontWeight: 700, color: t.gain_loss_amount >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', padding: '8px 0 8px 8px', fontFamily: 'var(--font-mono)' }}>{fmtSigned(t.gain_loss_amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>

                    <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 10 }}>
                        <Info size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 1 }} />
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                            Equity LTCG above ₹1,00,000 is taxable at 12.5% (from FY 2024-25). Equity STCG is taxed at 20%. Consult a CA for your exact liability.
                        </p>
                    </div>
                </div>

            </div>

            {/* ── ADD 80C MODAL ── */}
            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Add 80C Investment"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
                        <Button onClick={handleAdd80C} isLoading={adding}>Add</Button>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Type</label>
                        <select
                            value={addForm.type}
                            onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)' }}
                        >
                            {TAX_INVESTMENT_TYPES.map(t => (
                                <option key={t} value={t}>{TAX_TYPE_LABELS[t]}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Name</label>
                        <input
                            type="text"
                            value={addForm.name}
                            onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. HDFC ELSS Tax Saver Fund"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Amount (₹)</label>
                        <input
                            type="number"
                            min="0"
                            value={addForm.amount}
                            onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                            placeholder="0"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Financial Year</label>
                        <select
                            value={addForm.financial_year}
                            onChange={e => setAddForm(f => ({ ...f, financial_year: e.target.value }))}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)' }}
                        >
                            {fyOptions.map(opt => (
                                <option key={opt} value={opt}>FY {opt}</option>
                            ))}
                        </select>
                    </div>
                    {addError && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{addError}</p>}
                </div>
            </Modal>

            {/* ── EDIT 80C MODAL ── */}
            <Modal
                isOpen={!!editingEntry}
                onClose={() => setEditingEntry(null)}
                title="Edit 80C Investment"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <Button variant="secondary" onClick={() => setEditingEntry(null)}>Cancel</Button>
                        <Button onClick={handleSaveEdit} isLoading={savingEdit}>Save</Button>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Name</label>
                        <input
                            type="text"
                            value={editForm.name}
                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Amount (₹)</label>
                        <input
                            type="number"
                            min="0"
                            value={editForm.amount}
                            onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
                        />
                    </div>
                    {editError && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{editError}</p>}
                </div>
            </Modal>
        </AppLayout>
    );
}
