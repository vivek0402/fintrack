'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Briefcase, Wallet, TrendingUp, Layers, FileUp } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useIsMobile } from '@/hooks/useWindowSize';
import { investmentAPI, CreateInvestmentPayload } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatTile } from '@/components/ui/StatTile';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CamsImporter } from '@/components/investments/CamsImporter';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/store/toastStore';
import { Investment, InvestmentSummary, INVESTMENT_TYPES, GROUP_LABELS } from '@/types/investments';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtSigned = (n: number) => (n >= 0 ? '+' : '-') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

const inputSt: React.CSSProperties = { width: '100%', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' };
const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block', fontFamily: 'var(--font-body)' };
const errSt: React.CSSProperties = { fontSize: 11, color: 'var(--color-exp)', margin: '4px 0 0', fontFamily: 'var(--font-body)' };

const today = () => new Date().toISOString().split('T')[0];

const emptyForm = {
    type: 'mutual_fund',
    name: '',
    ticker_or_folio: '',
    units: '',
    purchase_price_per_unit: '',
    current_nav_or_price: '',
    purchase_date: today(),
    account_label: '',
};

export default function InvestmentsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const [investments, setInvestments] = useState<Investment[]>([]);
    const [summary, setSummary] = useState<InvestmentSummary | null>(null);
    const [loading, setLoading] = useState(true);

    const [showAdd, setShowAdd] = useState(false);
    const [showCamsImport, setShowCamsImport] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [formLoading, setFormLoading] = useState(false);

    const [activeInvestment, setActiveInvestment] = useState<Investment | null>(null);
    const [priceValue, setPriceValue] = useState('');
    const [priceError, setPriceError] = useState('');
    const [priceLoading, setPriceLoading] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchData = () => {
        setLoading(true);
        return Promise.all([investmentAPI.getAll(), investmentAPI.getSummary()])
            .then(([invRes, sumRes]) => {
                setInvestments(invRes.data.investments || []);
                setSummary(sumRes.data);
            })
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => setLoading(false));
    };

    useEffect(() => { if (user) fetchData(); }, [user]);

    // ── Add Investment ──────────────────────────────────────────────────────

    const validateForm = () => {
        const errors: Record<string, string> = {};
        if (!form.name.trim()) errors.name = 'Name is required.';
        const units = parseFloat(form.units);
        if (!Number.isFinite(units) || units <= 0) errors.units = 'Units must be greater than 0.';
        const purchasePrice = parseFloat(form.purchase_price_per_unit);
        if (!Number.isFinite(purchasePrice) || purchasePrice < 0) errors.purchase_price_per_unit = 'Must be 0 or greater.';
        const currentPrice = parseFloat(form.current_nav_or_price);
        if (!Number.isFinite(currentPrice) || currentPrice < 0) errors.current_nav_or_price = 'Must be 0 or greater.';
        if (!form.purchase_date) errors.purchase_date = 'Purchase date is required.';
        else if (new Date(form.purchase_date) > new Date()) errors.purchase_date = 'Date cannot be in the future.';
        return errors;
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const errors = validateForm();
        setFormErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setFormLoading(true);
        try {
            const payload: CreateInvestmentPayload = {
                type: form.type,
                name: form.name.trim(),
                units: parseFloat(form.units),
                purchase_price_per_unit: parseFloat(form.purchase_price_per_unit),
                current_nav_or_price: parseFloat(form.current_nav_or_price),
                purchase_date: form.purchase_date,
                ticker_or_folio: form.ticker_or_folio.trim() || undefined,
                account_label: form.account_label.trim() || undefined,
            };
            await investmentAPI.create(payload);
            setShowAdd(false);
            setForm(emptyForm);
            setFormErrors({});
            toast.success('Investment added');
            fetchData();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to add investment.');
        } finally {
            setFormLoading(false);
        }
    };

    // ── Update Price / Delete ───────────────────────────────────────────────

    const openInvestment = (inv: Investment) => {
        setActiveInvestment(inv);
        setPriceValue(String(inv.current_nav_or_price));
        setPriceError('');
        setConfirmDelete(false);
    };

    const handlePriceSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = parseFloat(priceValue);
        if (!Number.isFinite(value) || value < 0) {
            setPriceError('Must be 0 or greater.');
            return;
        }
        if (!activeInvestment) return;
        setPriceLoading(true);
        try {
            await investmentAPI.update(activeInvestment.id, { current_nav_or_price: value });
            setActiveInvestment(null);
            toast.success('Price updated');
            fetchData();
        } catch (err: any) {
            setPriceError(err.response?.data?.error || 'Failed to update price.');
        } finally {
            setPriceLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!activeInvestment) return;
        setDeleteLoading(true);
        try {
            await investmentAPI.delete(activeInvestment.id);
            setActiveInvestment(null);
            toast.success('Investment deleted');
            fetchData();
        } catch {
            toast.error('Failed to delete investment.');
        } finally {
            setDeleteLoading(false);
            setConfirmDelete(false);
        }
    };

    // ── Derived: group holdings by type ─────────────────────────────────────

    const groups = Object.keys(GROUP_LABELS)
        .map(type => ({
            type,
            label: GROUP_LABELS[type],
            holdings: investments.filter(inv => inv.type === type),
        }))
        .filter(g => g.holdings.length > 0);

    if (isLoading || !user) {
        return (
            <AppLayout>
                <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[1, 2, 3].map(i => <SkeletonCard key={i} height={100} />)}
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                            Investments
                        </h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                            Track your portfolio across all asset types
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <Button variant={isMobile ? 'icon' : 'secondary'} size={isMobile ? 'md' : 'md'} onClick={() => setShowCamsImport(true)} title="Import from CAMS">
                            <FileUp size={16} />{!isMobile && ' Import from CAMS'}
                        </Button>
                        <Button variant={isMobile ? 'icon' : 'primary'} onClick={() => { setShowAdd(true); setFormErrors({}); }} title="Add Investment">
                            <Plus size={16} />{!isMobile && ' Add Investment'}
                        </Button>
                    </div>
                </div>

                {/* ── SUMMARY ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                    {loading || !summary ? (
                        [1, 2, 3, 4].map(i => <StatTile key={i} label="" value="" loading />)
                    ) : (
                        <>
                            <StatTile label="Total Invested" value={fmt(summary.total_invested)} icon={<Wallet size={16} />} />
                            <StatTile label="Current Value" value={fmt(summary.total_current_value)} icon={<Briefcase size={16} />} />
                            <StatTile
                                label="Unrealized Gain"
                                value={fmtSigned(summary.total_unrealized_gain)}
                                subLabel={`${summary.total_unrealized_gain_pct >= 0 ? '+' : ''}${summary.total_unrealized_gain_pct}%`}
                                icon={<TrendingUp size={16} />}
                                accentColor={summary.total_unrealized_gain >= 0 ? 'var(--color-inc)' : 'var(--color-exp)'}
                            />
                            <StatTile label="Holdings" value={String(investments.length)} icon={<Layers size={16} />} />
                        </>
                    )}
                </div>

                {/* ── HOLDINGS ── */}
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {[1, 2, 3].map(i => <SkeletonCard key={i} height={90} />)}
                    </div>
                ) : investments.length === 0 ? (
                    <EmptyState
                        icon={Briefcase}
                        title="No investments tracked yet"
                        subtitle="Add your first holding to start tracking your portfolio."
                        action={<Button onClick={() => setShowAdd(true)}><Plus size={14} /> Add Investment</Button>}
                    />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {groups.map(group => {
                            const groupTotal = group.holdings.reduce((s, h) => s + h.current_value, 0);
                            return (
                                <div key={group.type}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', padding: '0 4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                {group.label}
                                            </span>
                                            <Badge color="var(--text-muted)" bg="var(--bg-surface-2)">{group.holdings.length}</Badge>
                                        </div>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                            {fmt(groupTotal)}
                                        </span>
                                    </div>
                                    <Card padding={0}>
                                        {group.holdings.map((inv, idx) => {
                                            const isGain = inv.unrealized_gain >= 0;
                                            return (
                                                <div
                                                    key={inv.id}
                                                    onClick={() => openInvestment(inv)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                                                        padding: '12px 16px',
                                                        borderBottom: idx < group.holdings.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <div style={{ minWidth: 0, flex: '1 1 140px' }}>
                                                        <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {inv.name}
                                                        </p>
                                                        {inv.ticker_or_folio && (
                                                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>
                                                                {inv.ticker_or_folio}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div style={{ textAlign: 'right', minWidth: 70 }}>
                                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>Units</p>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{inv.units}</p>
                                                    </div>
                                                    <div style={{ textAlign: 'right', minWidth: 80, display: 'none' }} className="inv-col-buy">
                                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>Avg. Buy</p>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(inv.purchase_price_per_unit)}</p>
                                                    </div>
                                                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>Current</p>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(inv.current_nav_or_price)}</p>
                                                    </div>
                                                    <div style={{ textAlign: 'right', minWidth: 90 }}>
                                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>Value</p>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(inv.current_value)}</p>
                                                    </div>
                                                    <div style={{ textAlign: 'right', minWidth: 90 }}>
                                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>Gain</p>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: isGain ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                                            {fmtSigned(inv.unrealized_gain)} ({isGain ? '+' : ''}{inv.unrealized_gain_pct}%)
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </Card>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ═══ CAMS IMPORT MODAL ═══ */}
            <Modal isOpen={showCamsImport} onClose={() => setShowCamsImport(false)} title="Import from CAMS" maxWidth="520px">
                <CamsImporter
                    onClose={() => setShowCamsImport(false)}
                    onSuccess={() => fetchData()}
                />
            </Modal>

            {/* ═══ ADD INVESTMENT MODAL ═══ */}
            <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setFormErrors({}); }} title="Add Investment" maxWidth="480px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button type="button" onClick={() => { setShowAdd(false); setFormErrors({}); }} style={{ padding: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="submit" form="add-investment-form" disabled={formLoading} style={{ padding: 10, background: formLoading ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: formLoading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            {formLoading ? 'Adding…' : 'Add Investment'}
                        </button>
                    </div>
                }
            >
                <form id="add-investment-form" onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={labelSt}>Type</label>
                        <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ ...inputSt, cursor: 'pointer' }}>
                            {INVESTMENT_TYPES.map(t => (
                                <option key={t} value={t}>{GROUP_LABELS[t]}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelSt}>Name *</label>
                        <input style={inputSt} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Axis Bluechip Fund, Reliance, SBI FD…" />
                        {formErrors.name && <p style={errSt}>{formErrors.name}</p>}
                    </div>
                    <div>
                        <label style={labelSt}>Ticker / Folio (optional)</label>
                        <input style={inputSt} value={form.ticker_or_folio} onChange={e => setForm({ ...form, ticker_or_folio: e.target.value })} placeholder="e.g. RELIANCE, 123456789" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label style={labelSt}>Units *</label>
                            <input type="number" min="0" step="any" style={inputSt} value={form.units} onChange={e => setForm({ ...form, units: e.target.value })} placeholder="10" />
                            {formErrors.units && <p style={errSt}>{formErrors.units}</p>}
                        </div>
                        <div>
                            <label style={labelSt}>Purchase Date *</label>
                            <input type="date" max={today()} style={inputSt} value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} />
                            {formErrors.purchase_date && <p style={errSt}>{formErrors.purchase_date}</p>}
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label style={labelSt}>Purchase Price / Unit *</label>
                            <input type="number" min="0" step="any" style={inputSt} value={form.purchase_price_per_unit}
                                onChange={e => setForm({ ...form, purchase_price_per_unit: e.target.value, current_nav_or_price: form.current_nav_or_price || e.target.value })}
                                placeholder="100" />
                            {formErrors.purchase_price_per_unit && <p style={errSt}>{formErrors.purchase_price_per_unit}</p>}
                        </div>
                        <div>
                            <label style={labelSt}>Current NAV / Price *</label>
                            <input type="number" min="0" step="any" style={inputSt} value={form.current_nav_or_price} onChange={e => setForm({ ...form, current_nav_or_price: e.target.value })} placeholder="120" />
                            {formErrors.current_nav_or_price && <p style={errSt}>{formErrors.current_nav_or_price}</p>}
                        </div>
                    </div>
                    <div>
                        <label style={labelSt}>Account Label (optional)</label>
                        <input style={inputSt} value={form.account_label} onChange={e => setForm({ ...form, account_label: e.target.value })} placeholder="e.g. Zerodha, HDFC Demat…" />
                    </div>
                </form>
            </Modal>

            {/* ═══ UPDATE PRICE MODAL ═══ */}
            <Modal isOpen={!!activeInvestment} onClose={() => setActiveInvestment(null)} title={activeInvestment?.name || 'Update Investment'} maxWidth="380px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button type="button" onClick={() => setActiveInvestment(null)} style={{ padding: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="submit" form="update-price-form" disabled={priceLoading} style={{ padding: 10, background: priceLoading ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: priceLoading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            {priceLoading ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                }
            >
                <form id="update-price-form" onSubmit={handlePriceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={labelSt}>Current NAV / Price</label>
                        <input type="number" min="0" step="any" style={inputSt} value={priceValue} onChange={e => setPriceValue(e.target.value)} autoFocus />
                        {priceError && <p style={errSt}>{priceError}</p>}
                    </div>
                </form>

                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                    {confirmDelete ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" onClick={handleDelete} disabled={deleteLoading}
                                style={{ flex: 1, padding: 10, borderRadius: 10, background: 'color-mix(in srgb, var(--color-exp) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', color: 'var(--color-exp)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                {deleteLoading ? 'Deleting…' : 'Confirm Delete'}
                            </button>
                            <button type="button" onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: 10, borderRadius: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button type="button" onClick={() => setConfirmDelete(true)}
                            style={{ width: '100%', padding: 10, borderRadius: 10, background: 'transparent', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', color: 'var(--color-exp)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            Delete this holding
                        </button>
                    )}
                </div>
            </Modal>
        </AppLayout>
    );
}
