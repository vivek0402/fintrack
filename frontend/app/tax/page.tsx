'use client';

import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Info, Sparkles, Lock, Check, Clock, Minus, CheckSquare, Square, ChevronDown, ChevronUp, AlertTriangle, Receipt, Loader2, PiggyBank, Banknote, Lightbulb, Home, ShoppingBag, Car, TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { taxAPI, aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonCard, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';

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

interface TaxProfile {
    financial_year: string;
    basic_salary_monthly: string | number;
    hra_component_monthly: string | number;
    lta_component_annual: string | number;
    special_allowance_monthly: string | number;
    rent_paid_monthly: string | number;
    city_type: string;
    lta_claims_used_in_block: number;
    preferred_regime: string;
}

interface HraResult {
    financial_year: string;
    inputs: {
        annual_basic: number;
        annual_hra_received: number;
        annual_rent_paid: number;
    };
    exempt_hra: number;
    taxable_hra: number;
    limiting_factor: string;
    optimization_potential: number | null;
    explanation: string;
}

interface LtaResult {
    financial_year: string;
    lta_component: number;
    claims_used: number;
    claims_remaining: number;
    next_claim_expires_in_months: number;
    next_block_start: string;
    recommendation: string | null;
}

interface InstallmentSchedule {
    installment_number: number;
    due_date: string;
    cumulative_pct_due: number;
    cumulative_amount_due: number;
    installment_amount: number;
    amount_paid: number;
    paid_on_date: string | null;
    status: 'paid' | 'overdue' | 'due' | 'upcoming';
}

interface AdvanceTaxResult {
    financial_year: string;
    estimated_income: number;
    income_estimates: {
        transaction_based_estimate: number;
        profile_based_estimate: number | null;
        ytd_income: number;
        months_elapsed: number;
        months_remaining: number;
    };
    old_regime_tax: number;
    new_regime_tax: number;
    recommended_regime: 'old' | 'new';
    tax_savings_from_better_regime: number;
    is_applicable: boolean;
    installment_schedule: InstallmentSchedule[];
    explanation?: string;
}

interface ItrItem {
    key: string;
    label: string;
    type: 'auto' | 'manual';
    weight: number;
    status: 'done' | 'pending' | 'not_applicable';
}

interface ItrReadiness {
    financial_year: string;
    score: number;
    completion_summary: string;
    next_action: string | null;
    items: ItrItem[];
}

const LIMITING_FACTOR_LABELS: Record<string, string> = {
    actual_hra_received: 'Limited by: Actual HRA received',
    percentage_of_basic: 'Limited by: % of basic salary',
    rent_paid_minus_10pct_basic: 'Limited by: Annual rent paid minus 10% of basic',
};

const ITR_ITEM_EXPLANATIONS: Record<string, string> = {
    '80c_documented': 'Your Section 80C investments are pulled from your tax tracker.',
    capital_gains_computed: 'Capital gains from sold investments must be reported in ITR-2/3.',
    advance_tax_paid: 'Paying advance tax on time avoids interest penalties under sections 234B/234C.',
    profile_complete: 'Your salary profile powers HRA, LTA, and advance tax calculations.',
    form_16_received: "Your employer's TDS certificate — needed to file most ITRs accurately.",
    ais_reviewed: 'Cross-check your Annual Information Statement for income the IT department already knows about.',
    bank_interest_collected: 'Interest income from savings accounts and FDs must be declared, even if below taxable limits.',
    hra_documents_ready: 'Rent receipts and landlord PAN may be requested by the assessing officer to support your HRA claim.',
};

const EMPTY_PROFILE_FORM = {
    basic_salary_monthly: '',
    hra_component_monthly: '',
    lta_component_annual: '',
    special_allowance_monthly: '',
    rent_paid_monthly: '',
    city_type: 'non_metro',
    lta_claims_used_in_block: 0,
    preferred_regime: 'not_decided',
};

function ScoreGauge({ score }: { score: number }) {
    const color = score < 40 ? 'var(--color-exp)' : score < 70 ? 'var(--color-warn)' : 'var(--color-inc)';
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
    return (
        <div style={{ position: 'relative', width: 140, height: 140 }}>
            <svg width={140} height={140} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={70} cy={70} r={radius} fill="none" stroke="var(--bg-alt)" strokeWidth={12} />
                <circle
                    cx={70} cy={70} r={radius} fill="none" stroke={color} strokeWidth={12}
                    strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 500ms ease' }}
                />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>{score}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-body)' }}>/ 100</span>
            </div>
        </div>
    );
}

const OVERVIEW_TABS: { key: OverviewTabKey; label: string }[] = [
    { key: '80c', label: '80C' },
    { key: 'capital_gains', label: 'Capital Gains' },
    { key: 'hra_lta', label: 'HRA & LTA' },
    { key: 'advance_tax', label: 'Advance Tax' },
    { key: 'itr_readiness', label: 'ITR Readiness' },
];

type OverviewTabKey = '80c' | 'capital_gains' | 'hra_lta' | 'advance_tax' | 'itr_readiness';

const OUTER_TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'estimate', label: 'Estimate' },
    { key: 'salary', label: 'Salary' },
];

function TaxOverviewTab() {
    const router = useRouter();
    const { user } = useAuthStore();

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

    const [activeTab, setActiveTab] = useState<OverviewTabKey>('80c');

    // HRA & LTA tab
    const [profile, setProfile] = useState<TaxProfile | null>(null);
    const [hra, setHra] = useState<HraResult | null>(null);
    const [lta, setLta] = useState<LtaResult | null>(null);
    const [hraLtaLoading, setHraLtaLoading] = useState(false);
    const [hraLtaLoaded, setHraLtaLoaded] = useState(false);
    const [showProfileForm, setShowProfileForm] = useState(false);
    const [profileForm, setProfileForm] = useState(EMPTY_PROFILE_FORM);
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileError, setProfileError] = useState('');

    // Advance tax tab
    const [advanceTax, setAdvanceTax] = useState<AdvanceTaxResult | null>(null);
    const [atLoading, setAtLoading] = useState(false);
    const [atLoaded, setAtLoaded] = useState(false);
    const [loggingInstallment, setLoggingInstallment] = useState<number | null>(null);
    const [logForm, setLogForm] = useState({ amount_paid: '', paid_on_date: '', payment_reference: '' });
    const [logging, setLogging] = useState(false);
    const [logError, setLogError] = useState('');

    // ITR readiness tab
    const [itr, setItr] = useState<ItrReadiness | null>(null);
    const [itrLoading, setItrLoading] = useState(false);
    const [itrLoaded, setItrLoaded] = useState(false);

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

    const fetchProfile = async (): Promise<TaxProfile | null> => {
        try {
            const res = await taxAPI.getProfile();
            setProfile(res.data);
            return res.data;
        } catch (err: any) {
            if (err.response?.status === 404) { setProfile(null); return null; }
            throw err;
        }
    };

    const fetchHra = async () => {
        try {
            const res = await taxAPI.getHra();
            setHra(res.data);
        } catch (err: any) {
            if (err.response?.status === 404) setHra(null);
        }
    };

    const fetchLta = async () => {
        try {
            const res = await taxAPI.getLta();
            setLta(res.data);
        } catch (err: any) {
            if (err.response?.status === 404) setLta(null);
        }
    };

    const fetchHraLtaTab = async () => {
        setHraLtaLoading(true);
        try {
            const p = await fetchProfile();
            if (p) await Promise.all([fetchHra(), fetchLta()]);
        } catch (err: any) {
            if (err.response?.status === 401) router.push('/login');
        } finally {
            setHraLtaLoading(false);
            setHraLtaLoaded(true);
        }
    };

    const fetchAdvanceTax = () => {
        setAtLoading(true);
        taxAPI.getAdvanceTax()
            .then(res => setAdvanceTax(res.data))
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => { setAtLoading(false); setAtLoaded(true); });
    };

    const fetchItr = () => {
        setItrLoading(true);
        taxAPI.getItrReadiness()
            .then(res => setItr(res.data))
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => { setItrLoading(false); setItrLoaded(true); });
    };

    useEffect(() => {
        if (!user) return;
        if (activeTab === 'hra_lta' && !hraLtaLoaded) fetchHraLtaTab();
        if (activeTab === 'advance_tax' && !atLoaded) fetchAdvanceTax();
        if (activeTab === 'itr_readiness' && !itrLoaded) fetchItr();
    }, [activeTab, user]);

    useEffect(() => {
        if (profile) {
            setProfileForm({
                basic_salary_monthly: String(profile.basic_salary_monthly ?? ''),
                hra_component_monthly: String(profile.hra_component_monthly ?? ''),
                lta_component_annual: String(profile.lta_component_annual ?? ''),
                special_allowance_monthly: String(profile.special_allowance_monthly ?? ''),
                rent_paid_monthly: String(profile.rent_paid_monthly ?? ''),
                city_type: profile.city_type || 'non_metro',
                lta_claims_used_in_block: profile.lta_claims_used_in_block ?? 0,
                preferred_regime: profile.preferred_regime || 'not_decided',
            });
        }
    }, [profile]);

    const handleSaveProfile = async () => {
        setProfileError('');
        if (!profileForm.basic_salary_monthly || parseFloat(profileForm.basic_salary_monthly) < 0) {
            setProfileError('Basic salary is required.');
            return;
        }
        setSavingProfile(true);
        try {
            await taxAPI.saveProfile({
                financial_year: getCurrentFY(),
                basic_salary_monthly: parseFloat(profileForm.basic_salary_monthly) || 0,
                hra_component_monthly: parseFloat(profileForm.hra_component_monthly) || 0,
                lta_component_annual: parseFloat(profileForm.lta_component_annual) || 0,
                special_allowance_monthly: parseFloat(profileForm.special_allowance_monthly) || 0,
                rent_paid_monthly: parseFloat(profileForm.rent_paid_monthly) || 0,
                city_type: profileForm.city_type,
                lta_claims_used_in_block: profileForm.lta_claims_used_in_block,
                preferred_regime: profileForm.preferred_regime,
            });
            await fetchProfile();
            await Promise.all([fetchHra(), fetchLta()]);
            setShowProfileForm(false);
        } catch (err: any) {
            setProfileError(err.response?.data?.error || 'Failed to save profile.');
        } finally {
            setSavingProfile(false);
        }
    };

    const openLogPayment = (installmentNumber: number) => {
        setLoggingInstallment(installmentNumber);
        setLogForm({ amount_paid: '', paid_on_date: new Date().toISOString().slice(0, 10), payment_reference: '' });
        setLogError('');
    };

    const handleLogPayment = async (installmentNumber: number) => {
        setLogError('');
        const amount = parseFloat(logForm.amount_paid);
        if (!Number.isFinite(amount) || amount < 0 || !logForm.paid_on_date) {
            setLogError('A valid amount and date are required.');
            return;
        }
        setLogging(true);
        try {
            await taxAPI.logAdvanceTaxPayment({
                installment_number: installmentNumber,
                amount_paid: amount,
                paid_on_date: logForm.paid_on_date,
                payment_reference: logForm.payment_reference || undefined,
                financial_year: advanceTax?.financial_year,
            });
            setLoggingInstallment(null);
            fetchAdvanceTax();
        } catch (err: any) {
            setLogError(err.response?.data?.error || 'Failed to log payment.');
        } finally {
            setLogging(false);
        }
    };

    const handleToggleItr = async (key: string, current: boolean) => {
        setItr(prev => prev ? {
            ...prev,
            items: prev.items.map(i => i.key === key ? { ...i, status: !current ? 'done' : 'pending' } : i),
        } : prev);
        try {
            const res = await taxAPI.updateItrReadiness(key, !current);
            setItr(res.data);
        } catch {
            fetchItr();
        }
    };

    if (loading || !summary || !gains) {
        return (
            <>
                <SkeletonCard height={60} style={{ marginBottom: '16px' }} />
                <SkeletonCard height={180} style={{ marginBottom: '16px' }} />
                <SkeletonCard height={260} />
            </>
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
        <>
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

            {/* ── TAB NAVIGATION ── */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: 4, background: 'var(--bg-alt)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                {OVERVIEW_TABS.map(t => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveTab(t.key)}
                        style={{
                            padding: '8px 16px',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            background: activeTab === t.key ? 'var(--accent)' : 'transparent',
                            color: activeTab === t.key ? '#fff' : 'var(--text-secondary)',
                            fontSize: '13px',
                            fontWeight: 600,
                            fontFamily: 'var(--font-body)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'background 150ms ease, color 150ms ease',
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ══ SECTION 1: 80C TRACKER ══ */}
            {activeTab === '80c' && (
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
            )}

            {/* ══ SECTION 2: CAPITAL GAINS ══ */}
            {activeTab === 'capital_gains' && (
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
            )}

            {/* ══ SECTION 3: HRA & LTA ══ */}
            {activeTab === 'hra_lta' && (
            <div>
                {hraLtaLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <SkeletonCard height={220} />
                        <SkeletonCard height={160} />
                    </div>
                ) : !profile ? (
                    <Card>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>
                            Set up your salary profile to see your HRA exemption.
                        </p>
                        <Button size="sm" onClick={() => setShowProfileForm(true)}>Set up profile</Button>
                    </Card>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginBottom: 12 }}>
                        {/* HRA sub-section */}
                        <Card>
                            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>HRA Exemption</h3>
                            {hra ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                                        <div>
                                            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Annual HRA Received</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{fmt(hra.inputs.annual_hra_received)}</p>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Annual Rent Paid</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{fmt(hra.inputs.annual_rent_paid)}</p>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Annual Basic Salary</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{fmt(hra.inputs.annual_basic)}</p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                                        <div>
                                            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Exempt HRA</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 800, color: 'var(--color-inc)', margin: 0 }}>{fmt(hra.exempt_hra)}</p>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Taxable HRA</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 800, color: hra.taxable_hra > 0 ? 'var(--color-exp)' : 'var(--text-primary)', margin: 0 }}>{fmt(hra.taxable_hra)}</p>
                                        </div>
                                    </div>

                                    <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-alt)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginBottom: 12 }}>
                                        {LIMITING_FACTOR_LABELS[hra.limiting_factor] || hra.limiting_factor}
                                    </span>

                                    {hra.optimization_potential && (
                                        <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)', borderRadius: 10, marginBottom: 12 }}>
                                            <Sparkles size={15} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
                                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                                                Paying ₹{Math.round(hra.optimization_potential).toLocaleString('en-IN')}/month more in rent could increase your HRA exemption by ₹{Math.round(hra.optimization_potential * 12).toLocaleString('en-IN')} annually.
                                            </p>
                                        </div>
                                    )}

                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                                        {hra.explanation}
                                    </p>
                                </>
                            ) : (
                                <SkeletonCard height={160} />
                            )}
                        </Card>

                        {/* LTA sub-section */}
                        <Card>
                            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>LTA Block Tracker</h3>
                            {lta ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                        <div>
                                            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>LTA Annual Entitlement</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{fmt(lta.lta_component)}</p>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Claims Remaining in Block</p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{lta.claims_remaining}</span>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    {[0, 1].map(i => (
                                                        <span key={i} style={{
                                                            width: 12, height: 12, borderRadius: '50%',
                                                            border: '2px solid var(--accent)',
                                                            background: i < lta.claims_used ? 'var(--accent)' : 'transparent',
                                                        }} />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                                        <span>2022</span>
                                        <span style={{ flex: 1, height: 2, background: 'var(--border)', margin: '0 8px', position: 'relative' }}>
                                            <span style={{ position: 'absolute', left: '70%', top: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }} title="Today" />
                                        </span>
                                        <span>2025</span>
                                    </div>

                                    {lta.recommendation && (
                                        <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'color-mix(in srgb, var(--color-warn) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warn) 25%, transparent)', borderRadius: 10 }}>
                                            <AlertTriangle size={15} style={{ color: 'var(--color-warn)', flexShrink: 0, marginTop: 1 }} />
                                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                                                {lta.recommendation}
                                            </p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <SkeletonCard height={160} />
                            )}
                        </Card>
                    </div>
                )}

                {/* Salary Profile form (collapsible) */}
                <Card>
                    <button
                        type="button"
                        onClick={() => setShowProfileForm(v => !v)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                        <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Salary Components</h3>
                        {showProfileForm ? <ChevronUp size={16} color="var(--text-secondary)" /> : <ChevronDown size={16} color="var(--text-secondary)" />}
                    </button>

                    {showProfileForm && (
                        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Basic Salary (monthly)</label>
                                    <input type="number" min="0" value={profileForm.basic_salary_monthly} onChange={e => setProfileForm(f => ({ ...f, basic_salary_monthly: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>HRA Component (monthly)</label>
                                    <input type="number" min="0" value={profileForm.hra_component_monthly} onChange={e => setProfileForm(f => ({ ...f, hra_component_monthly: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>LTA Entitlement (annual)</label>
                                    <input type="number" min="0" value={profileForm.lta_component_annual} onChange={e => setProfileForm(f => ({ ...f, lta_component_annual: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Special Allowance (monthly)</label>
                                    <input type="number" min="0" value={profileForm.special_allowance_monthly} onChange={e => setProfileForm(f => ({ ...f, special_allowance_monthly: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Rent Paid (monthly)</label>
                                    <input type="number" min="0" value={profileForm.rent_paid_monthly} onChange={e => setProfileForm(f => ({ ...f, rent_paid_monthly: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>LTA Claims Used in Current Block</label>
                                    <input type="number" min="0" max="2" value={profileForm.lta_claims_used_in_block} onChange={e => setProfileForm(f => ({ ...f, lta_claims_used_in_block: Math.max(0, Math.min(2, parseInt(e.target.value, 10) || 0)) }))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)' }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>City Type</label>
                                <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--bg-alt)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                    {[{ key: 'metro', label: 'Metro' }, { key: 'non_metro', label: 'Non-Metro' }].map(opt => (
                                        <button key={opt.key} type="button" onClick={() => setProfileForm(f => ({ ...f, city_type: opt.key }))}
                                            style={{ padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: profileForm.city_type === opt.key ? 'var(--accent)' : 'transparent', color: profileForm.city_type === opt.key ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>Preferred Tax Regime</label>
                                <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--bg-alt)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                    {[{ key: 'old', label: 'Old' }, { key: 'new', label: 'New' }, { key: 'not_decided', label: 'Not decided' }].map(opt => (
                                        <button key={opt.key} type="button" onClick={() => setProfileForm(f => ({ ...f, preferred_regime: opt.key }))}
                                            style={{ padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: profileForm.preferred_regime === opt.key ? 'var(--accent)' : 'transparent', color: profileForm.preferred_regime === opt.key ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {profileError && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{profileError}</p>}

                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <Button onClick={handleSaveProfile} isLoading={savingProfile}>Save</Button>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
            )}

            {/* ══ SECTION 4: ADVANCE TAX ══ */}
            {activeTab === 'advance_tax' && (
            <div>
                {atLoading || !advanceTax ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <SkeletonCard height={120} />
                        <SkeletonCard height={240} />
                    </div>
                ) : !advanceTax.is_applicable ? (
                    <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 10 }}>
                        <Info size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 1 }} />
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                            Advance tax is not applicable — your estimated tax liability is below ₹10,000.
                        </p>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                            {(['old', 'new'] as const).map(regime => {
                                const isRecommended = advanceTax.recommended_regime === regime;
                                const amount = regime === 'old' ? advanceTax.old_regime_tax : advanceTax.new_regime_tax;
                                return (
                                    <Card key={regime} style={isRecommended ? { border: '1px solid var(--color-inc)' } : undefined}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0, fontFamily: 'var(--font-body)' }}>
                                                {regime === 'old' ? 'Old Regime Tax' : 'New Regime Tax'}
                                            </p>
                                            {isRecommended && (
                                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'color-mix(in srgb, var(--color-inc) 14%, transparent)', color: 'var(--color-inc)', fontFamily: 'var(--font-body)' }}>
                                                    Recommended
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{fmt(amount)}</p>
                                    </Card>
                                );
                            })}
                        </div>

                        {advanceTax.tax_savings_from_better_regime > 0 && (
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>
                                Switching to the <strong>{advanceTax.recommended_regime}</strong> regime could save you {fmt(advanceTax.tax_savings_from_better_regime)} this year.
                            </p>
                        )}

                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px', fontFamily: 'var(--font-body)' }}>
                            Based on {fmt(advanceTax.estimated_income)} income estimated for FY {advanceTax.financial_year} (YTD {fmt(advanceTax.income_estimates.ytd_income)} + projected {fmt(advanceTax.estimated_income - advanceTax.income_estimates.ytd_income)} remaining)
                        </p>

                        <Card>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px 0' }}>Installment</th>
                                            <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Due Date</th>
                                            <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Amount Due (₹)</th>
                                            <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Amount Paid (₹)</th>
                                            <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 8px' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {advanceTax.installment_schedule.map((inst, idx) => {
                                            const dueDate = new Date(inst.due_date);
                                            const today = new Date();
                                            const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                            let statusLabel: string;
                                            let statusColor: string;
                                            let StatusIcon = Clock;
                                            if (inst.status === 'paid') {
                                                statusLabel = 'Paid'; statusColor = 'var(--color-inc)'; StatusIcon = Check;
                                            } else if (inst.status === 'overdue') {
                                                statusLabel = 'Overdue'; statusColor = 'var(--color-exp)'; StatusIcon = AlertTriangle;
                                            } else if (inst.status === 'due' || (daysUntil >= 0 && daysUntil <= 30)) {
                                                statusLabel = 'Due Soon'; statusColor = 'var(--color-warn)'; StatusIcon = Clock;
                                            } else {
                                                statusLabel = 'Upcoming'; statusColor = 'var(--text-muted)'; StatusIcon = Clock;
                                            }
                                            return (
                                                <Fragment key={inst.installment_number}>
                                                    <tr style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
                                                        <td style={{ fontSize: '13px', color: 'var(--text-primary)', padding: '8px 8px 8px 0', fontWeight: 600 }}>Installment {inst.installment_number} ({inst.cumulative_pct_due}%)</td>
                                                        <td style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '8px', fontFamily: 'var(--font-mono)' }}>{dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                                        <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--text-primary)', padding: '8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(inst.cumulative_amount_due)}</td>
                                                        <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--text-secondary)', padding: '8px', fontFamily: 'var(--font-mono)' }}>{fmt(inst.amount_paid)}</td>
                                                        <td style={{ padding: '8px 0 8px 8px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: `color-mix(in srgb, ${statusColor} 14%, transparent)`, color: statusColor, fontFamily: 'var(--font-body)' }}>
                                                                    <StatusIcon size={11} /> {statusLabel}
                                                                </span>
                                                                {inst.status !== 'paid' && loggingInstallment !== inst.installment_number && (
                                                                    <button type="button" onClick={() => openLogPayment(inst.installment_number)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', padding: 0 }}>
                                                                        Log Payment
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {loggingInstallment === inst.installment_number && (
                                                        <tr>
                                                            <td colSpan={5} style={{ padding: '8px 0 12px' }}>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '10px 12px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 10 }}>
                                                                    <div>
                                                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, fontFamily: 'var(--font-body)' }}>Amount Paid</label>
                                                                        <input type="number" min="0" value={logForm.amount_paid} onChange={e => setLogForm(f => ({ ...f, amount_paid: e.target.value }))}
                                                                            style={{ width: 120, padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)' }} />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, fontFamily: 'var(--font-body)' }}>Payment Date</label>
                                                                        <input type="date" value={logForm.paid_on_date} onChange={e => setLogForm(f => ({ ...f, paid_on_date: e.target.value }))}
                                                                            style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)' }} />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, fontFamily: 'var(--font-body)' }}>Challan Ref. (optional)</label>
                                                                        <input type="text" value={logForm.payment_reference} onChange={e => setLogForm(f => ({ ...f, payment_reference: e.target.value }))}
                                                                            style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)' }} />
                                                                    </div>
                                                                    <Button size="sm" isLoading={logging} onClick={() => handleLogPayment(inst.installment_number)}>Save</Button>
                                                                    <Button size="sm" variant="secondary" onClick={() => setLoggingInstallment(null)}>Cancel</Button>
                                                                    {logError && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)', width: '100%' }}>{logError}</p>}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </>
                )}
            </div>
            )}

            {/* ══ SECTION 5: ITR READINESS ══ */}
            {activeTab === 'itr_readiness' && (
            <div>
                {itrLoading || !itr ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <SkeletonCard height={200} />
                        <SkeletonCard height={240} />
                    </div>
                ) : (
                    <>
                        <Card style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
                            <ScoreGauge score={itr.score} />
                            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>ITR Readiness Score</h3>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>{itr.completion_summary}</p>
                            {itr.next_action && (
                                <span style={{ fontSize: '12px', fontWeight: 600, padding: '4px 12px', borderRadius: 999, background: 'var(--bg-alt)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                    Next: {itr.next_action}
                                </span>
                            )}
                        </Card>

                        <Card style={{ marginBottom: 12 }}>
                            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Auto-checked</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {itr.items.filter(i => i.type === 'auto').map(item => {
                                    const StatusIcon = item.status === 'done' ? Check : item.status === 'not_applicable' ? Minus : Clock;
                                    const statusColor = item.status === 'done' ? 'var(--color-inc)' : item.status === 'not_applicable' ? 'var(--text-muted)' : 'var(--color-warn)';
                                    return (
                                        <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                                            <Lock size={14} style={{ color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }} />
                                            <StatusIcon size={14} style={{ color: statusColor, marginTop: 2, flexShrink: 0 }} />
                                            <div style={{ minWidth: 0 }}>
                                                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>{item.label}</p>
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{ITR_ITEM_EXPLANATIONS[item.key]}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>

                        <Card>
                            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Manual items</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {itr.items.filter(i => i.type === 'manual').map(item => {
                                    const isDone = item.status === 'done';
                                    const isNA = item.status === 'not_applicable';
                                    const ToggleIcon = isDone ? CheckSquare : Square;
                                    return (
                                        <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                                            <button
                                                type="button"
                                                disabled={isNA}
                                                onClick={() => handleToggleItr(item.key, isDone)}
                                                style={{ background: 'none', border: 'none', cursor: isNA ? 'default' : 'pointer', padding: 0, marginTop: 2, flexShrink: 0, color: isNA ? 'var(--text-muted)' : isDone ? 'var(--color-inc)' : 'var(--text-secondary)' }}
                                            >
                                                {isNA ? <Minus size={14} /> : <ToggleIcon size={14} />}
                                            </button>
                                            <div style={{ minWidth: 0 }}>
                                                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>{item.label}</p>
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{ITR_ITEM_EXPLANATIONS[item.key]}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    </>
                )}
            </div>
            )}

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
        </>
    );
}

const estimateCardSt: React.CSSProperties = {
    background: 'var(--bg-surface-1)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
};
const estimateLabelSt: React.CSSProperties = {
    fontSize: '10px', color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '1px',
    fontWeight: 600, margin: '0 0 8px',
    fontFamily: 'var(--font-body)',
};

function TaxEstimateTab() {
    const [data, setData]         = useState<any>(null);
    const [loading, setLoading]   = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError]       = useState('');

    const generate = async (force = false) => {
        setLoading(true); setError('');
        try {
            const res = await aiAPI.taxEstimate(force);
            setData(res.data.data); setGenerated(true);
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to generate tax estimate. Please try again.');
            setData(null);
        } finally { setLoading(false); }
    };

    const isNewBetter = data?.recommendedRegime === 'new';
    const recTax  = isNewBetter ? data?.newRegime?.total : data?.oldRegime?.total;

    return (
        <>
            {/* Header */}
            <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Tax Estimate</h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>FY income tax calculator</p>
                    </div>
                    {generated && !loading && (
                        <Button variant="secondary" size="md" onClick={() => generate(true)}>Recalculate</Button>
                    )}
                </div>
            </div>

            {/* Empty */}
            {!generated && !loading && !error && (
                <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <p style={{ fontSize: '48px', marginBottom: '12px' }}>🧾</p>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>No estimate yet</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>Add income transactions first, then calculate your tax estimate</p>
                    <Button variant="primary" size="md" onClick={() => generate(false)}><Receipt size={15} /> Calculate My Tax</Button>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div style={{ ...estimateCardSt, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px' }}>
                    <Loader2 size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>Calculating your tax estimate…</p>
                </div>
            )}

            {/* Error */}
            {error && !loading && (
                <div style={{ ...estimateCardSt, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '40px' }}>
                    <AlertTriangle size={28} color="var(--color-exp)" />
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-body)' }}>{error}</p>
                    <button type="button" onClick={() => generate(false)} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px 20px', color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Try again</button>
                </div>
            )}

            {/* Result */}
            {generated && data && !loading && (
                <>
                    {data.grossIncome === 0 && (
                        <GCard style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <AlertTriangle size={20} color="var(--color-warn)" style={{ flexShrink: 0, marginTop: '1px' }} />
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
                                {data.disclaimer || 'No income recorded for this financial year. Add salary/income transactions to see an estimate.'}
                            </p>
                        </GCard>
                    )}

                    {data.grossIncome > 0 && (
                        <>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                <div style={{ ...estimateCardSt, flex: '1 1 220px' }}>
                                    <p style={estimateLabelSt}>Gross Income {data.fyPeriod || 'FY 2025–26'}</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', fontVariantNumeric: 'tabular-nums' }}>{fmt(data.grossIncome)}</p>
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Total income transactions · April – March</p>
                                    {data.from_cache && <Badge style={{ marginTop: '8px' }}>Cached</Badge>}
                                </div>
                                <div style={{ ...estimateCardSt, flex: '1 1 220px', borderLeft: `4px solid ${isNewBetter ? 'var(--color-inc)' : 'var(--accent)'}` }}>
                                    <p style={estimateLabelSt}>Recommended Regime</p>
                                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: isNewBetter ? 'var(--color-inc)' : 'var(--accent)', margin: '0 0 4px' }}>{isNewBetter ? 'New Regime' : 'Old Regime'}</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 4px', fontVariantNumeric: 'tabular-nums' }}>{fmt(recTax ?? 0)} tax due</p>
                                    {(data.savings ?? 0) > 0 && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--color-inc)', margin: 0, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>You save {fmt(data.savings)} vs other regime</p>}
                                </div>
                            </div>

                            {/* Regime comparison */}
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                {[
                                    { label: 'New Regime', regime: data.newRegime, isRec: isNewBetter, note: 'No deductions, lower slabs' },
                                    { label: 'Old Regime', regime: data.oldRegime, isRec: !isNewBetter, note: 'With standard deductions (80C, HRA etc.)' },
                                ].map(({ label, regime, isRec, note }) => {
                                    if (!regime) return null;
                                    return (
                                        <div key={label} style={{ ...estimateCardSt, flex: '1 1 220px', position: 'relative', border: `1px solid ${isRec ? 'color-mix(in srgb, var(--color-inc) 30%, transparent)' : 'var(--border-subtle)'}` }}>
                                            {isRec && (
                                                <div style={{ position: 'absolute', top: '-10px', right: '16px', background: 'var(--color-inc)', color: 'white', fontSize: '10px', fontWeight: 700, padding: '2px 10px', borderRadius: '10px', fontFamily: 'var(--font-body)' }}>✓ RECOMMENDED</div>
                                            )}
                                            <p style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>{label}</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', fontVariantNumeric: 'tabular-nums' }}>{fmt(regime.total ?? 0)}</p>
                                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Effective rate: {regime.total && data.grossIncome ? ((regime.total / data.grossIncome) * 100).toFixed(1) : '0'}%</p>
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{note}</p>
                                            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '14px 0' }} />
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                                {[
                                                    { label: 'Standard Deduction', val: fmt(regime.standardDeduction ?? 0), color: 'var(--color-inc)' },
                                                    ...(regime.deduction80C ? [{ label: '80C Deductions', val: fmt(regime.deduction80C), color: 'var(--color-inc)' }] : []),
                                                    { label: 'Taxable Income', val: fmt(regime.taxableIncome ?? 0), color: 'var(--text-primary)' },
                                                    { label: 'Income Tax', val: fmt(regime.tax ?? 0), color: 'var(--color-exp)' },
                                                    { label: 'Cess (4%)', val: fmt(regime.cess ?? 0), color: 'var(--color-warn)' },
                                                ].map(row => (
                                                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
                                                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{row.label}</span>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: row.color, fontVariantNumeric: 'tabular-nums' }}>{row.val}</span>
                                                    </div>
                                                ))}
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Total Liability</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: (regime.total ?? 0) === 0 ? 'var(--color-inc)' : 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>{fmt(regime.total ?? 0)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Slab breakdown */}
                            {data.breakdown?.length > 0 && (
                                <div style={estimateCardSt}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                        <Receipt size={15} color="var(--accent)" />
                                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Tax slab breakdown (New Regime)</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px', padding: '8px 12px', marginBottom: '4px' }}>
                                        {['Slab', 'Taxable Amt', 'Rate', 'Tax'].map(h => (
                                            <span key={h} style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: h !== 'Slab' ? 'right' as const : 'left' as const, fontFamily: 'var(--font-body)' }}>{h}</span>
                                        ))}
                                    </div>
                                    {data.breakdown.map((row: any, i: number) => (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: i % 2 === 0 ? 'var(--bg-surface-2)' : 'transparent' }}>
                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{row.slab}</span>
                                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right', fontFamily: 'var(--font-body)' }}>—</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.rate}</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.tax > 0 ? fmt(row.tax) : 'Nil'}</span>
                                        </div>
                                    ))}
                                    <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '8px', padding: '10px 12px 0', display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Total Tax Due</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>{fmt(data.newRegime?.tax ?? data.oldRegime?.tax ?? 0)}</span>
                                    </div>
                                </div>
                            )}

                            {/* Tips */}
                            {data.tips?.length > 0 && (
                                <div style={estimateCardSt}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                        <PiggyBank size={15} color="var(--color-inc)" />
                                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Tax saving tips</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {data.tips.map((tip: string, i: number) => (
                                            <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                                <div style={{ width: '22px', height: '22px', flexShrink: 0, borderRadius: '11px', background: 'color-mix(in srgb, var(--color-inc) 12%, transparent)', color: 'var(--color-inc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{i + 1}</div>
                                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{tip}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    <GCard style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <AlertTriangle size={18} color="var(--color-warn)" style={{ flexShrink: 0, marginTop: '1px' }} />
                        <div>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 4px', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{data.disclaimer || 'This is an estimate only.'}</p>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>Consult a Chartered Accountant for accurate tax filing.</p>
                        </div>
                    </GCard>
                </>
            )}
        </>
    );
}

// Allocation plan category colours — stored data values, not CSS tokens
const PLAN_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    savings:       { label: 'Savings',       color: '#00e5a0', bg: 'rgba(0,229,160,0.12)',  icon: PiggyBank },
    rent:          { label: 'Rent / Housing', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Home },
    food:          { label: 'Food',           color: '#6366f1', bg: 'rgba(99,102,241,0.12)', icon: ShoppingBag },
    transport:     { label: 'Transport',      color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: Car },
    investments:   { label: 'Investments',    color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',  icon: TrendingUp },
    discretionary: { label: 'Discretionary',  color: '#f43f5e', bg: 'rgba(244,63,94,0.12)', icon: Sparkles },
};

function SalaryIntelligenceTab() {
    const router = useRouter();
    const [data, setData]         = useState<any>(null);
    const [loading, setLoading]   = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError]       = useState('');

    const analyse = async (force = false) => {
        setLoading(true); setError('');
        try {
            const res = await aiAPI.salaryIntelligence();
            setData(res.data); setGenerated(true);
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to analyse salary pattern. Please try again.');
            setData(null);
        } finally { setLoading(false); }
    };

    const planEntries: [string, any][] = data?.plan ? Object.entries(data.plan) : [];
    const totalPct = planEntries.reduce((s, [, v]) => s + (v?.percentage ?? 0), 0);

    return (
        <>
            {/* Header */}
            <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Salary Intelligence</h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Income benchmarking</p>
                    </div>
                    {generated && !loading && (
                        <Button variant="secondary" size="md" onClick={() => analyse()}>Refresh</Button>
                    )}
                </div>
            </div>

            {/* Empty */}
            {!generated && !loading && !error && (
                <EmptyState
                    icon={Banknote}
                    title="No data yet"
                    subtitle="Add income transactions so we can detect your salary and generate a personalised allocation plan"
                    action={
                        <Button variant="primary" size="md" onClick={() => analyse()}><Banknote size={15} /> Analyse Salary Pattern</Button>
                    }
                />
            )}

            {/* Loading */}
            {loading && (
                <div style={{ ...estimateCardSt, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px' }}>
                    <Loader2 size={28} color="var(--color-inc)" style={{ animation: 'spin 1s linear infinite' }} />
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>Detecting your salary pattern…</p>
                </div>
            )}

            {/* Error */}
            {error && !loading && (
                <div style={{ ...estimateCardSt, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '40px' }}>
                    <AlertTriangle size={28} color="var(--color-exp)" />
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-body)' }}>{error}</p>
                    <button type="button" onClick={() => analyse()} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px 20px', color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Try again</button>
                </div>
            )}

            {/* Not detected */}
            {generated && data && !data.detected && !loading && (
                <div style={{ ...estimateCardSt, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '50px 40px', textAlign: 'center' }}>
                    <Banknote size={36} color="var(--text-muted)" />
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>No salary pattern detected</h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, maxWidth: '360px', fontFamily: 'var(--font-body)' }}>
                        We need at least one income transaction to detect your salary. Add your salary or income transactions to unlock this feature.
                    </p>
                    <button type="button" onClick={() => router.push('/transactions')} style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 20px', color: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        Add Income Transactions
                    </button>
                </div>
            )}

            {/* Result */}
            {generated && data && data.detected && !loading && (
                <>
                    {/* Salary hero */}
                    <GCard style={{ background: 'color-mix(in srgb, var(--color-inc) 6%, var(--bg-surface-1))', border: '1px solid color-mix(in srgb, var(--color-inc) 20%, transparent)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
                            <div style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-lg)', background: 'color-mix(in srgb, var(--color-inc) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-inc) 25%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Banknote size={26} color="var(--color-inc)" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 700, color: 'var(--color-inc)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(data.salary)}</p>
                                    {data.from_cache && <Badge>Cached</Badge>}
                                </div>
                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>{data.description || 'Monthly salary detected'}</p>
                                {data.insight && <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, fontStyle: 'italic', fontFamily: 'var(--font-body)' }}>"{data.insight}"</p>}
                            </div>
                        </div>
                    </GCard>

                    {/* Allocation plan */}
                    {planEntries.length > 0 && (
                        <div style={estimateCardSt}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                                <TrendingUp size={16} color="var(--accent)" />
                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>AI Salary Allocation Plan</span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px', fontFamily: 'var(--font-body)' }}>Based on your spending</span>
                            </div>

                            {/* Visual bar */}
                            <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '20px', gap: '2px' }}>
                                {planEntries.map(([key, val]) => {
                                    const meta = PLAN_META[key] || { color: 'var(--text-muted)', bg: 'transparent', label: key, icon: Sparkles };
                                    return <div key={key} style={{ height: '100%', width: `${val?.percentage ?? 0}%`, background: meta.color, transition: 'width 0.6s ease', borderRadius: '2px' }} />;
                                })}
                            </div>

                            {/* Legend */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                                {planEntries.map(([key, val]) => {
                                    const meta = PLAN_META[key] || { color: 'var(--text-muted)', bg: 'transparent', label: key, icon: Sparkles };
                                    return (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: meta.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{meta.label} {val?.percentage}%</span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {planEntries.map(([key, val]) => {
                                    const meta = PLAN_META[key] || { color: 'var(--text-muted)', bg: 'transparent', label: key, icon: Sparkles };
                                    const IconCmp = meta.icon;
                                    const pct = val?.percentage ?? 0;
                                    return (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: 'var(--radius-md)', background: meta.bg, border: `1px solid ${meta.color}22` }}>
                                            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: `${meta.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <IconCmp size={18} color={meta.color} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'var(--font-display)' }}>{meta.label}</p>
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-body)' }}>{val?.reason || ''}</p>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: meta.color, margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>{fmt(val?.amount ?? 0)}</p>
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{pct}%</p>
                                            </div>
                                            <div style={{ width: '60px', flexShrink: 0 }}>
                                                <div style={{ height: '6px', background: 'var(--border-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: totalPct > 0 ? `${(pct / Math.max(totalPct, 100)) * 100}%` : '0%', background: meta.color, borderRadius: '3px' }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)' }}>Total allocated</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: totalPct >= 98 ? 'var(--color-inc)' : 'var(--color-warn)', fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt(planEntries.reduce((s, [, v]) => s + (v?.amount ?? 0), 0))} · {totalPct}%
                                </span>
                            </div>
                        </div>
                    )}

                    {/* How to use */}
                    <GCard style={{ background: 'color-mix(in srgb, var(--color-inc) 4%, var(--bg-surface-1))', border: '1px solid color-mix(in srgb, var(--color-inc) 15%, transparent)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                            <Lightbulb size={16} color="var(--accent)" />
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>How to use this plan</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {[
                                'Transfer the Savings amount to a separate account on payday before spending anything else.',
                                'Set the Investments amount as a recurring transfer to your SIP or RD on the 1st of the month.',
                                'Use the Discretionary budget as your guilt-free spending limit — no tracking needed within it.',
                                'Review this plan every 3 months as your income or lifestyle changes.',
                            ].map((tip, i) => (
                                <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                    <div style={{ width: '24px', height: '24px', flexShrink: 0, borderRadius: '12px', background: 'var(--accent-subtle)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px', fontFamily: 'var(--font-mono)' }}>{i + 1}</div>
                                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{tip}</p>
                                </div>
                            ))}
                        </div>
                    </GCard>
                </>
            )}
        </>
    );
}

function TaxPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const initialTab = searchParams.get('tab');
    const [tab, setTab] = useState(OUTER_TABS.some(t => t.key === initialTab) ? initialTab! : 'overview');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    if (isLoading || !user) {
        return (
            <AppLayout>
                <SkeletonCard height={60} style={{ marginBottom: '16px' }} />
                <SkeletonCard height={180} style={{ marginBottom: '16px' }} />
                <SkeletonCard height={260} />
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                <Tabs tabs={OUTER_TABS} active={tab} onChange={setTab} />

                {tab === 'overview' && <TaxOverviewTab />}
                {tab === 'estimate' && <TaxEstimateTab />}
                {tab === 'salary' && <SalaryIntelligenceTab />}
            </div>
        </AppLayout>
    );
}

export default function TaxPage() {
    return <Suspense><TaxPageInner /></Suspense>;
}
