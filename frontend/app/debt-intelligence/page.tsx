'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Sparkles, CreditCard, Gauge, Calculator, TrendingDown, Snowflake, Mountain, Plus, Landmark, Wallet, Percent, Layers, Pencil, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { debtAPI, loanAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatTile } from '@/components/ui/StatTile';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { toast } from '@/store/toastStore';
import { Loan, AmortizationEntry, AmortizationSummary, LoanPrepayment, LOAN_TYPES, LOAN_TYPE_LABELS } from '@/types/loans';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const today = () => new Date().toISOString().split('T')[0];
const PAGE_SIZE = 12;

const inputSt: React.CSSProperties = { width: '100%', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' };
const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block', fontFamily: 'var(--font-body)' };
const errSt: React.CSSProperties = { fontSize: 11, color: 'var(--color-exp)', margin: '4px 0 0', fontFamily: 'var(--font-body)' };
const noteSt: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0', fontFamily: 'var(--font-body)' };
const sectionTitleSt: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' };
const sectionSubSt: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px', fontFamily: 'var(--font-body)' };

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'loans',     label: 'Loans' },
];

const UTIL_STATUS_COLORS: Record<string, string> = {
    optimal: 'var(--color-inc)',
    moderate: 'var(--accent)',
    high: 'var(--color-warn)',
    critical: 'var(--color-exp)',
};

const DTI_STATUS_COLORS: Record<string, string> = {
    excellent: 'var(--color-inc)',
    good: 'var(--accent)',
    moderate: 'var(--color-warn)',
    risky: 'var(--color-exp)',
};

const DTI_STATUS_LABELS: Record<string, string> = {
    excellent: 'Excellent',
    good: 'Good',
    moderate: 'Moderate',
    risky: 'Risky',
};

function estimateEMI(principal: number, ratePct: number, months: number): number | null {
    if (!(principal > 0) || !(ratePct > 0) || !(months > 0)) return null;
    const r = ratePct / 12 / 100;
    const factor = Math.pow(1 + r, months);
    const emi = (principal * r * factor) / (factor - 1);
    return Number.isFinite(emi) ? emi : null;
}

const emptyAddForm = {
    name: '',
    type: 'home_loan',
    principal_amount: '',
    disbursement_date: '',
    tenure_months: '',
    interest_rate_pct: '',
    outstanding_balance: '',
    emi_amount: '',
    bank_or_lender: '',
    prepayment_penalty_pct: '',
};

const emptyEditForm = {
    name: '',
    outstanding_balance: '',
    interest_rate_pct: '',
    emi_amount: '',
    bank_or_lender: '',
    notes: '',
};

const emptyPrepayForm = { amount: '', prepayment_date: today() };

interface PayoffStrategy {
    months: number;
    total_interest: number;
    interest_saved: number;
    payoff_sequence: { loan_id: string; name: string; payoff_month: number }[];
}

interface PayoffOptimizerResult {
    loans?: never[];
    message?: string;
    baseline?: { months: number; total_interest: number };
    avalanche?: PayoffStrategy;
    snowball?: PayoffStrategy;
    recommendation?: string;
}

interface CreditUtilizationResult {
    per_card: { id: string; name: string; bank_name: string; last4: string; outstanding_balance: number; credit_limit: number; utilization_pct: number; status: string }[];
    aggregate: { total_outstanding: number; total_limit: number; overall_utilization_pct: number; status: string };
    recommendation: string | null;
}

interface DtiResult {
    monthly_income: number;
    monthly_loan_emi: number;
    monthly_credit_obligation: number;
    total_monthly_debt_obligation: number;
    dti_ratio: number;
    status: string;
    breakdown_loans: { id: string; name: string; emi: number }[];
    breakdown_cards: { id: string; name: string; minimum_payment: number }[];
}

interface PrepaymentImpactResult {
    months_saved: number;
    interest_saved: number;
    penalty_amount: number;
    net_savings: number;
    old_payoff_date: string;
    new_payoff_date: string;
    recommendation: string;
}

function DebtIntelligencePageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const initialTab = searchParams.get('tab');
    const [tab, setTab] = useState(TABS.some(t => t.key === initialTab) ? initialTab! : 'overview');

    const [loading, setLoading] = useState(true);
    const [loans, setLoans] = useState<Loan[]>([]);
    const [payoff, setPayoff] = useState<PayoffOptimizerResult | null>(null);
    const [utilization, setUtilization] = useState<CreditUtilizationResult | null>(null);
    const [dti, setDti] = useState<DtiResult | null>(null);

    const [extraPayment, setExtraPayment] = useState('');
    const [payoffLoading, setPayoffLoading] = useState(false);

    const [prepayLoanId, setPrepayLoanId] = useState('');
    const [prepayAmount, setPrepayAmount] = useState('');
    const [prepayResult, setPrepayResult] = useState<PrepaymentImpactResult | null>(null);
    const [prepayLoading, setPrepayLoading] = useState(false);
    const [prepayError, setPrepayError] = useState('');

    // ── Loans tab state ──────────────────────────────────────────────────────
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [amortData, setAmortData] = useState<Record<string, { schedule: AmortizationEntry[]; summary: AmortizationSummary } | null>>({});
    const [amortLoading, setAmortLoading] = useState<Record<string, boolean>>({});
    const [amortPage, setAmortPage] = useState<Record<string, number>>({});
    const [prepayments, setPrepayments] = useState<Record<string, LoanPrepayment[]>>({});

    const [showAdd, setShowAdd] = useState(false);
    const [addForm, setAddForm] = useState(emptyAddForm);
    const [addErrors, setAddErrors] = useState<Record<string, string>>({});
    const [addLoading, setAddLoading] = useState(false);

    const [editLoan, setEditLoan] = useState<Loan | null>(null);
    const [editForm, setEditForm] = useState(emptyEditForm);
    const [editErrors, setEditErrors] = useState<Record<string, string>>({});
    const [editLoading, setEditLoading] = useState(false);

    const [logPrepayLoanId, setLogPrepayLoanId] = useState<string | null>(null);
    const [logPrepayForm, setLogPrepayForm] = useState(emptyPrepayForm);
    const [logPrepayErrors, setLogPrepayErrors] = useState<Record<string, string>>({});
    const [logPrepayLoading, setLogPrepayLoading] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchData = () => {
        setLoading(true);
        return Promise.all([
            loanAPI.getAll(true),
            debtAPI.getPayoffOptimizer(),
            debtAPI.getCreditUtilization(),
            debtAPI.getDti(),
        ])
            .then(([loansRes, payoffRes, utilRes, dtiRes]) => {
                const activeLoans = (loansRes.data.loans || []) as Loan[];
                setLoans(activeLoans);
                setPayoff(payoffRes.data);
                setUtilization(utilRes.data);
                setDti(dtiRes.data);
                if (activeLoans.length > 0) setPrepayLoanId(activeLoans[0].id);
            })
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => setLoading(false));
    };

    useEffect(() => { if (user) fetchData(); }, [user]);

    const runOptimizer = () => {
        const extra = extraPayment.trim() ? parseFloat(extraPayment) : 0;
        if (extraPayment.trim() && (!Number.isFinite(extra) || extra < 0)) {
            toast.error('Extra payment must be 0 or greater.');
            return;
        }
        setPayoffLoading(true);
        debtAPI.getPayoffOptimizer(extra)
            .then(res => setPayoff(res.data))
            .catch(() => toast.error('Failed to run payoff optimizer.'))
            .finally(() => setPayoffLoading(false));
    };

    const runPrepaymentImpact = () => {
        setPrepayError('');
        const amount = parseFloat(prepayAmount);
        if (!prepayLoanId) { setPrepayError('Select a loan.'); return; }
        if (!Number.isFinite(amount) || amount <= 0) { setPrepayError('Enter an amount greater than 0.'); return; }

        setPrepayLoading(true);
        debtAPI.getPrepaymentImpact(prepayLoanId, amount)
            .then(res => setPrepayResult(res.data))
            .catch((err: any) => toast.error(err.response?.data?.error || 'Failed to calculate prepayment impact.'))
            .finally(() => setPrepayLoading(false));
    };

    // ── Lazy amortization + prepayments fetch (Loans tab) ───────────────────

    const loadAmortization = (loanId: string) => {
        if (amortData[loanId] !== undefined) return;
        setAmortLoading(prev => ({ ...prev, [loanId]: true }));
        Promise.all([loanAPI.getAmortization(loanId), loanAPI.getPrepayments(loanId)])
            .then(([amortRes, prepayRes]) => {
                setAmortData(prev => ({ ...prev, [loanId]: { schedule: amortRes.data.schedule, summary: amortRes.data.summary } }));
                setPrepayments(prev => ({ ...prev, [loanId]: prepayRes.data.prepayments || [] }));
                setAmortPage(prev => ({ ...prev, [loanId]: 0 }));
            })
            .catch(() => {
                setAmortData(prev => ({ ...prev, [loanId]: null }));
                toast.error('Failed to load amortization schedule.');
            })
            .finally(() => setAmortLoading(prev => ({ ...prev, [loanId]: false })));
    };

    const toggleExpand = (loanId: string) => {
        if (expandedId === loanId) {
            setExpandedId(null);
        } else {
            setExpandedId(loanId);
            loadAmortization(loanId);
        }
    };

    const refreshAmortization = (loanId: string) => {
        setAmortLoading(prev => ({ ...prev, [loanId]: true }));
        Promise.all([loanAPI.getAmortization(loanId), loanAPI.getPrepayments(loanId)])
            .then(([amortRes, prepayRes]) => {
                setAmortData(prev => ({ ...prev, [loanId]: { schedule: amortRes.data.schedule, summary: amortRes.data.summary } }));
                setPrepayments(prev => ({ ...prev, [loanId]: prepayRes.data.prepayments || [] }));
                setAmortPage(prev => ({ ...prev, [loanId]: 0 }));
            })
            .catch(() => toast.error('Failed to refresh amortization schedule.'))
            .finally(() => setAmortLoading(prev => ({ ...prev, [loanId]: false })));
    };

    // ── Add Loan ─────────────────────────────────────────────────────────────

    const validateAddForm = () => {
        const errors: Record<string, string> = {};
        if (!addForm.name.trim()) errors.name = 'Loan name is required.';
        const principal = parseFloat(addForm.principal_amount);
        if (!Number.isFinite(principal) || principal <= 0) errors.principal_amount = 'Must be greater than 0.';
        if (!addForm.disbursement_date) errors.disbursement_date = 'Disbursement date is required.';
        else if (new Date(addForm.disbursement_date) > new Date()) errors.disbursement_date = 'Must be in the past.';
        const tenure = parseInt(addForm.tenure_months);
        if (!Number.isFinite(tenure) || tenure <= 0) errors.tenure_months = 'Must be greater than 0.';
        const rate = parseFloat(addForm.interest_rate_pct);
        if (!Number.isFinite(rate) || rate <= 0 || rate > 100) errors.interest_rate_pct = 'Must be greater than 0 and at most 100.';
        const outstanding = parseFloat(addForm.outstanding_balance);
        if (!Number.isFinite(outstanding) || outstanding < 0) errors.outstanding_balance = 'Must be 0 or greater.';
        if (Number.isFinite(principal) && Number.isFinite(outstanding) && outstanding > principal) errors.outstanding_balance = 'Cannot exceed the original loan amount.';
        if (addForm.emi_amount.trim()) {
            const emi = parseFloat(addForm.emi_amount);
            if (!Number.isFinite(emi) || emi <= 0) errors.emi_amount = 'Must be greater than 0.';
        }
        return errors;
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errors = validateAddForm();
        setAddErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setAddLoading(true);
        try {
            await loanAPI.create({
                name: addForm.name.trim(),
                type: addForm.type,
                principal_amount: parseFloat(addForm.principal_amount),
                disbursement_date: addForm.disbursement_date,
                tenure_months: parseInt(addForm.tenure_months),
                interest_rate_pct: parseFloat(addForm.interest_rate_pct),
                outstanding_balance: parseFloat(addForm.outstanding_balance),
                emi_amount: addForm.emi_amount.trim() ? parseFloat(addForm.emi_amount) : undefined,
                bank_or_lender: addForm.bank_or_lender.trim() || undefined,
                prepayment_penalty_pct: addForm.prepayment_penalty_pct.trim() ? parseFloat(addForm.prepayment_penalty_pct) : undefined,
            });
            setShowAdd(false);
            setAddForm(emptyAddForm);
            setAddErrors({});
            toast.success('Loan added');
            fetchData();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to add loan.');
        } finally {
            setAddLoading(false);
        }
    };

    // ── Edit Loan ────────────────────────────────────────────────────────────

    const openEdit = (loan: Loan) => {
        setEditLoan(loan);
        setEditForm({
            name: loan.name,
            outstanding_balance: String(loan.outstanding_balance),
            interest_rate_pct: String(loan.interest_rate_pct),
            emi_amount: loan.emi_amount !== null ? String(loan.emi_amount) : '',
            bank_or_lender: loan.bank_or_lender || '',
            notes: loan.notes || '',
        });
        setEditErrors({});
    };

    const validateEditForm = () => {
        const errors: Record<string, string> = {};
        if (!editForm.name.trim()) errors.name = 'Loan name is required.';
        const outstanding = parseFloat(editForm.outstanding_balance);
        if (!Number.isFinite(outstanding) || outstanding < 0) errors.outstanding_balance = 'Must be 0 or greater.';
        const rate = parseFloat(editForm.interest_rate_pct);
        if (!Number.isFinite(rate) || rate <= 0 || rate > 100) errors.interest_rate_pct = 'Must be greater than 0 and at most 100.';
        if (editForm.emi_amount.trim()) {
            const emi = parseFloat(editForm.emi_amount);
            if (!Number.isFinite(emi) || emi <= 0) errors.emi_amount = 'Must be greater than 0.';
        }
        return errors;
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editLoan) return;
        const errors = validateEditForm();
        setEditErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setEditLoading(true);
        try {
            await loanAPI.update(editLoan.id, {
                name: editForm.name.trim(),
                outstanding_balance: parseFloat(editForm.outstanding_balance),
                interest_rate_pct: parseFloat(editForm.interest_rate_pct),
                emi_amount: editForm.emi_amount.trim() ? parseFloat(editForm.emi_amount) : undefined,
                bank_or_lender: editForm.bank_or_lender.trim() || undefined,
                notes: editForm.notes.trim() || undefined,
            });
            const loanId = editLoan.id;
            setEditLoan(null);
            toast.success('Loan updated');
            fetchData();
            if (amortData[loanId] !== undefined) refreshAmortization(loanId);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to update loan.');
        } finally {
            setEditLoading(false);
        }
    };

    // ── Mark as repaid ───────────────────────────────────────────────────────

    const handleMarkRepaid = async (loan: Loan) => {
        try {
            await loanAPI.delete(loan.id);
            toast.success(`${loan.name} marked as repaid`);
            fetchData();
        } catch {
            toast.error('Failed to mark loan as repaid.');
        }
    };

    // ── Log Prepayment (Loans tab) ───────────────────────────────────────────

    const openLogPrepay = (loanId: string) => {
        setLogPrepayLoanId(loanId);
        setLogPrepayForm(emptyPrepayForm);
        setLogPrepayErrors({});
    };

    const handleLogPrepaySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!logPrepayLoanId) return;
        const loan = loans.find(l => l.id === logPrepayLoanId);
        const errors: Record<string, string> = {};
        const amount = parseFloat(logPrepayForm.amount);
        if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'Must be greater than 0.';
        else if (loan && amount > loan.outstanding_balance) errors.amount = 'Cannot exceed the outstanding balance.';
        if (!logPrepayForm.prepayment_date) errors.prepayment_date = 'Date is required.';
        setLogPrepayErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setLogPrepayLoading(true);
        try {
            await loanAPI.addPrepayment(logPrepayLoanId, { amount, prepayment_date: logPrepayForm.prepayment_date });
            toast.success('Prepayment logged');
            const loanId = logPrepayLoanId;
            setLogPrepayLoanId(null);
            fetchData();
            refreshAmortization(loanId);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to log prepayment.');
        } finally {
            setLogPrepayLoading(false);
        }
    };

    // ── Derived (Loans tab) ──────────────────────────────────────────────────

    const activeLoans = loans.filter(l => l.is_active);
    const totalOutstanding = activeLoans.reduce((s, l) => s + parseFloat(String(l.outstanding_balance)), 0);
    const monthlyEMIBurden = activeLoans.reduce((s, l) => {
        if (l.emi_amount) return s + parseFloat(String(l.emi_amount));
        const est = estimateEMI(parseFloat(String(l.outstanding_balance)), parseFloat(String(l.interest_rate_pct)), l.months_remaining || l.tenure_months);
        return s + (est || 0);
    }, 0);
    const totalOutstandingForAvg = activeLoans.reduce((s, l) => s + parseFloat(String(l.outstanding_balance)), 0);
    const avgInterestRate = totalOutstandingForAvg > 0
        ? activeLoans.reduce((s, l) => s + parseFloat(String(l.interest_rate_pct)) * parseFloat(String(l.outstanding_balance)), 0) / totalOutstandingForAvg
        : 0;

    const addEMIHint = estimateEMI(
        parseFloat(addForm.outstanding_balance || addForm.principal_amount),
        parseFloat(addForm.interest_rate_pct),
        parseInt(addForm.tenure_months)
    );

    if (isLoading || !user) {
        return (
            <AppLayout>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={120} />)}
                </div>
            </AppLayout>
        );
    }

    const hasLoans = loans.length > 0;

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        Debt Intelligence
                    </h1>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                        Optimize payoff strategy, evaluate prepayments, and monitor credit health
                    </p>
                </div>

                <Tabs tabs={TABS} active={tab} onChange={setTab} />

                {/* ══ OVERVIEW ══ */}
                {tab === 'overview' && (
                    loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={140} />)}
                        </div>
                    ) : (
                        <>
                            {/* ── DEBT-TO-INCOME ── */}
                            {dti && (
                                <Card>
                                    <p style={sectionTitleSt}><Gauge size={16} /> Debt-to-Income Ratio</p>
                                    <p style={sectionSubSt}>Based on your average monthly income over the last 3 months</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                        <StatTile label="Monthly Income" value={fmt(dti.monthly_income)} />
                                        <StatTile label="Loan EMIs" value={fmt(dti.monthly_loan_emi)} />
                                        <StatTile label="Card Minimums" value={fmt(dti.monthly_credit_obligation)} />
                                        <StatTile
                                            label="DTI Ratio"
                                            value={`${dti.dti_ratio.toFixed(1)}%`}
                                            accentColor={DTI_STATUS_COLORS[dti.status]}
                                            subLabel={DTI_STATUS_LABELS[dti.status] || dti.status}
                                        />
                                    </div>
                                    {(dti.breakdown_loans.length > 0 || dti.breakdown_cards.length > 0) && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                                            {dti.breakdown_loans.map(l => (
                                                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                                    <span>{l.name} (EMI)</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(l.emi)}</span>
                                                </div>
                                            ))}
                                            {dti.breakdown_cards.map(c => (
                                                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                                    <span>{c.name} (min. payment)</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(c.minimum_payment)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            )}

                            {/* ── CREDIT UTILIZATION ── */}
                            {utilization && (
                                <Card>
                                    <p style={sectionTitleSt}><CreditCard size={16} /> Credit Utilization</p>
                                    <p style={sectionSubSt}>Keeping utilization under 30% helps your credit profile</p>
                                    {utilization.per_card.length === 0 ? (
                                        <EmptyState icon={CreditCard} title="No credit cards tracked" subtitle="Add a credit card to monitor your utilization." />
                                    ) : (
                                        <>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                                <StatTile label="Total Outstanding" value={fmt(utilization.aggregate.total_outstanding)} />
                                                <StatTile label="Total Limit" value={fmt(utilization.aggregate.total_limit)} />
                                                <StatTile
                                                    label="Overall Utilization"
                                                    value={`${utilization.aggregate.overall_utilization_pct}%`}
                                                    accentColor={UTIL_STATUS_COLORS[utilization.aggregate.status]}
                                                    subLabel={utilization.aggregate.status}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {utilization.per_card.map(card => (
                                                    <div key={card.id}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
                                                            <div>
                                                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{card.name}</span>
                                                                {card.last4 && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px', fontFamily: 'var(--font-mono)' }}>••{card.last4}</span>}
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{fmt(card.outstanding_balance)} / {fmt(card.credit_limit)}</span>
                                                                <Badge color={UTIL_STATUS_COLORS[card.status]} bg={`color-mix(in srgb, ${UTIL_STATUS_COLORS[card.status]} 12%, transparent)`}>
                                                                    {card.utilization_pct}%
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                        <ProgressBar pct={card.utilization_pct} color={UTIL_STATUS_COLORS[card.status]} />
                                                    </div>
                                                ))}
                                            </div>
                                            {utilization.recommendation && (
                                                <div style={{ marginTop: '12px', padding: '10px 12px', background: 'var(--accent-subtle)', borderRadius: 8, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                    <Sparkles size={14} style={{ flexShrink: 0, marginTop: '1px', color: 'var(--accent)' }} />
                                                    {utilization.recommendation}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </Card>
                            )}

                            {/* ── PAYOFF OPTIMIZER ── */}
                            <Card>
                                <p style={sectionTitleSt}><TrendingDown size={16} /> Payoff Optimizer</p>
                                <p style={sectionSubSt}>Compare avalanche (highest interest first) vs snowball (smallest balance first) strategies</p>

                                {!hasLoans ? (
                                    <EmptyState icon={TrendingDown} title="No active loans" subtitle="Add a loan to use the payoff optimizer." />
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' }}>
                                            <div style={{ flex: '1 1 200px' }}>
                                                <label style={labelSt}>Extra Monthly Payment</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="100"
                                                    placeholder="0"
                                                    value={extraPayment}
                                                    onChange={e => setExtraPayment(e.target.value)}
                                                    style={inputSt}
                                                />
                                            </div>
                                            <Button onClick={runOptimizer} isLoading={payoffLoading}>
                                                <Calculator size={14} /> Recalculate
                                            </Button>
                                        </div>

                                        {payoff?.message ? (
                                            <EmptyState icon={TrendingDown} title="No active loans" subtitle={payoff.message} />
                                        ) : payoff?.baseline && payoff.avalanche && payoff.snowball ? (
                                            <>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                                    <StatTile label="Baseline Months" value={String(payoff.baseline.months)} subLabel={`${fmt(payoff.baseline.total_interest)} interest`} />
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                                    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '14px', background: 'var(--bg-surface-2)' }}>
                                                        <p style={{ ...sectionTitleSt, fontSize: '13px', marginBottom: '10px' }}><Mountain size={14} /> Avalanche</p>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontFamily: 'var(--font-body)' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Months to payoff</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{payoff.avalanche.months}</span></div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Total interest</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(payoff.avalanche.total_interest)}</span></div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Interest saved</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-inc)' }}>{fmt(payoff.avalanche.interest_saved)}</span></div>
                                                        </div>
                                                        {payoff.avalanche.payoff_sequence.length > 0 && (
                                                            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                {payoff.avalanche.payoff_sequence.map(p => (
                                                                    <div key={p.loan_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                                                        <span>{p.name}</span>
                                                                        <span>Month {p.payoff_month}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '14px', background: 'var(--bg-surface-2)' }}>
                                                        <p style={{ ...sectionTitleSt, fontSize: '13px', marginBottom: '10px' }}><Snowflake size={14} /> Snowball</p>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontFamily: 'var(--font-body)' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Months to payoff</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{payoff.snowball.months}</span></div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Total interest</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(payoff.snowball.total_interest)}</span></div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Interest saved</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-inc)' }}>{fmt(payoff.snowball.interest_saved)}</span></div>
                                                        </div>
                                                        {payoff.snowball.payoff_sequence.length > 0 && (
                                                            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                {payoff.snowball.payoff_sequence.map(p => (
                                                                    <div key={p.loan_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                                                        <span>{p.name}</span>
                                                                        <span>Month {p.payoff_month}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {payoff.recommendation && (
                                                    <div style={{ padding: '10px 12px', background: 'var(--accent-subtle)', borderRadius: 8, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                        <Sparkles size={14} style={{ flexShrink: 0, marginTop: '1px', color: 'var(--accent)' }} />
                                                        {payoff.recommendation}
                                                    </div>
                                                )}
                                            </>
                                        ) : null}
                                    </>
                                )}
                            </Card>

                            {/* ── PREPAYMENT IMPACT CALCULATOR ── */}
                            <Card>
                                <p style={sectionTitleSt}><Calculator size={16} /> Prepayment Impact Calculator</p>
                                <p style={sectionSubSt}>See how a one-time lump-sum prepayment affects your loan tenure and interest</p>

                                {!hasLoans ? (
                                    <EmptyState icon={Calculator} title="No active loans" subtitle="Add a loan to calculate prepayment impact." />
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '12px', flexWrap: 'wrap' }}>
                                            <div style={{ flex: '1 1 200px' }}>
                                                <label style={labelSt}>Loan</label>
                                                <select value={prepayLoanId} onChange={e => setPrepayLoanId(e.target.value)} style={inputSt}>
                                                    {loans.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                                </select>
                                            </div>
                                            <div style={{ flex: '1 1 160px' }}>
                                                <label style={labelSt}>Prepayment Amount</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1000"
                                                    placeholder="e.g. 100000"
                                                    value={prepayAmount}
                                                    onChange={e => setPrepayAmount(e.target.value)}
                                                    style={inputSt}
                                                />
                                            </div>
                                            <Button onClick={runPrepaymentImpact} isLoading={prepayLoading}>
                                                <Calculator size={14} /> Calculate
                                            </Button>
                                        </div>
                                        {prepayError && <p style={{ fontSize: 11, color: 'var(--color-exp)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>{prepayError}</p>}

                                        {prepayResult && (
                                            <>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                                    <StatTile label="Months Saved" value={String(prepayResult.months_saved)} />
                                                    <StatTile label="Interest Saved" value={fmt(prepayResult.interest_saved)} accentColor="var(--color-inc)" />
                                                    <StatTile label="Penalty" value={fmt(prepayResult.penalty_amount)} accentColor={prepayResult.penalty_amount > 0 ? 'var(--color-exp)' : undefined} />
                                                    <StatTile label="Net Savings" value={fmt(prepayResult.net_savings)} accentColor={prepayResult.net_savings >= 0 ? 'var(--color-inc)' : 'var(--color-exp)'} />
                                                </div>
                                                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '12px', fontFamily: 'var(--font-body)', color: 'var(--text-secondary)' }}>
                                                    <span>Old payoff date: <strong style={{ color: 'var(--text-primary)' }}>{prepayResult.old_payoff_date}</strong></span>
                                                    <span>New payoff date: <strong style={{ color: 'var(--text-primary)' }}>{prepayResult.new_payoff_date}</strong></span>
                                                </div>
                                                {prepayResult.recommendation && (
                                                    <div style={{ padding: '10px 12px', background: 'var(--accent-subtle)', borderRadius: 8, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                        <Sparkles size={14} style={{ flexShrink: 0, marginTop: '1px', color: 'var(--accent)' }} />
                                                        {prepayResult.recommendation}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                            </Card>
                        </>
                    )
                )}

                {/* ══ LOANS ══ */}
                {tab === 'loans' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Button onClick={() => { setShowAdd(true); setAddErrors({}); }}>
                                <Plus size={14} /> Add Loan
                            </Button>
                        </div>

                        {/* ── SUMMARY ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                            {loading ? (
                                [1, 2, 3, 4].map(i => <StatTile key={i} label="" value="" loading />)
                            ) : (
                                <>
                                    <StatTile label="Total Outstanding" value={fmt(totalOutstanding)} icon={<Wallet size={16} />} />
                                    <StatTile label="Monthly EMI Burden" value={fmt(monthlyEMIBurden)} icon={<Landmark size={16} />} />
                                    <StatTile label="Avg. Interest Rate" value={`${avgInterestRate.toFixed(2)}%`} icon={<Percent size={16} />} />
                                    <StatTile label="Active Loans" value={String(activeLoans.length)} icon={<Layers size={16} />} />
                                </>
                            )}
                        </div>

                        {/* ── LOAN LIST ── */}
                        {loading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {[1, 2, 3].map(i => <SkeletonCard key={i} height={90} />)}
                            </div>
                        ) : activeLoans.length === 0 ? (
                            <EmptyState
                                icon={Landmark}
                                title="No loans tracked yet"
                                subtitle="Add your loans to see amortization schedules, payoff timelines, and optimization strategies."
                                action={<Button onClick={() => setShowAdd(true)}><Plus size={14} /> Add Loan</Button>}
                            />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {activeLoans.map(loan => {
                                    const isExpanded = expandedId === loan.id;
                                    const principal = parseFloat(String(loan.principal_amount));
                                    const outstanding = parseFloat(String(loan.outstanding_balance));
                                    const pctRepaid = principal > 0 ? ((principal - outstanding) / principal) * 100 : 0;
                                    const emiDisplay = loan.emi_amount
                                        ? parseFloat(String(loan.emi_amount))
                                        : estimateEMI(outstanding, parseFloat(String(loan.interest_rate_pct)), loan.months_remaining || loan.tenure_months);
                                    const data = amortData[loan.id];
                                    const page = amortPage[loan.id] || 0;
                                    const schedule = data?.schedule || [];
                                    const totalPages = Math.ceil(schedule.length / PAGE_SIZE);
                                    const pageRows = schedule.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                                    const chartData = schedule.map(row => ({ month: row.month, cumulative_interest: row.cumulative_interest }));
                                    const loanPrepayments = prepayments[loan.id] || [];

                                    return (
                                        <Card key={loan.id} padding={0}>
                                            {/* Collapsed header */}
                                            <div onClick={() => toggleExpand(loan.id)} style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{loan.name}</span>
                                                            <Badge>{LOAN_TYPE_LABELS[loan.type] || loan.type}</Badge>
                                                        </div>
                                                        {loan.bank_or_lender && (
                                                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>{loan.bank_or_lender}</p>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                        <button type="button" onClick={e => { e.stopPropagation(); openEdit(loan); }} title="Edit loan"
                                                            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button type="button" onClick={e => { e.stopPropagation(); handleMarkRepaid(loan); }} title="Mark as repaid"
                                                            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--color-inc)', cursor: 'pointer' }}>
                                                            <CheckCircle size={14} />
                                                        </button>
                                                        <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between' }}>
                                                    <div>
                                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>Outstanding</p>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(outstanding)}</p>
                                                    </div>
                                                    <div>
                                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>Interest Rate</p>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{parseFloat(String(loan.interest_rate_pct)).toFixed(2)}%</p>
                                                    </div>
                                                    <div>
                                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>Monthly EMI</p>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{emiDisplay ? fmt(emiDisplay) : '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>Months Remaining</p>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{loan.months_remaining ?? '—'}</p>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Principal repaid</span>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{pctRepaid.toFixed(1)}%</span>
                                                    </div>
                                                    <ProgressBar pct={pctRepaid} color="var(--color-inc)" />
                                                </div>
                                            </div>

                                            {/* Expanded section */}
                                            {isExpanded && (
                                                <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px' }}>
                                                    {amortLoading[loan.id] ? (
                                                        <SkeletonCard height={160} />
                                                    ) : !data ? (
                                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                                            {loan.amortization_error || 'Unable to load amortization schedule.'}
                                                        </p>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                            {/* Cumulative interest chart */}
                                                            <div>
                                                                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Cumulative Interest</h4>
                                                                <ResponsiveContainer width="100%" height={160}>
                                                                    <LineChart data={chartData}>
                                                                        <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                                                        <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '₹' + Math.round(v / 1000) + 'K'} width={56} />
                                                                        <Tooltip
                                                                            formatter={(value: any) => fmt(Number(value))}
                                                                            labelFormatter={(label: any) => `Month ${label}`}
                                                                            contentStyle={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-body)' }}
                                                                        />
                                                                        <Line type="monotone" dataKey="cumulative_interest" stroke="var(--accent)" strokeWidth={2} dot={false} />
                                                                    </LineChart>
                                                                </ResponsiveContainer>
                                                            </div>

                                                            {/* Summary row */}
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '12px', background: 'var(--bg-surface-2)', borderRadius: 10 }}>
                                                                <div>
                                                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>Total Interest</p>
                                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{fmt(data.summary.total_interest)}</p>
                                                                </div>
                                                                <div>
                                                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>Total Payable</p>
                                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{fmt(data.summary.total_amount_payable)}</p>
                                                                </div>
                                                                <div>
                                                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>Payoff Date</p>
                                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{new Date(data.summary.payoff_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>
                                                                </div>
                                                            </div>

                                                            {/* Amortization table */}
                                                            <div>
                                                                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Amortization Schedule</h4>
                                                                <div style={{ overflowX: 'auto' }}>
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-body)' }}>
                                                                        <thead>
                                                                            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                                                {['#', 'Opening', 'EMI', 'Interest', 'Principal', 'Closing'].map(h => (
                                                                                    <th key={h} style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                                                                ))}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {pageRows.map(row => (
                                                                                <tr key={row.month} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                                                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{row.month}</td>
                                                                                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{fmt(row.opening_balance)}</td>
                                                                                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{fmt(row.emi)}</td>
                                                                                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-exp)', fontFamily: 'var(--font-mono)' }}>{fmt(row.interest_component)}</td>
                                                                                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-inc)', fontFamily: 'var(--font-mono)' }}>{fmt(row.principal_component)}</td>
                                                                                    <td style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(row.closing_balance)}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                                {totalPages > 1 && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '10px' }}>
                                                                        <button type="button" disabled={page === 0} onClick={() => setAmortPage(prev => ({ ...prev, [loan.id]: Math.max(0, page - 1) }))}
                                                                            style={{ padding: '6px 12px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: page === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'var(--font-body)' }}>
                                                                            Previous
                                                                        </button>
                                                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Page {page + 1} of {totalPages}</span>
                                                                        <button type="button" disabled={page >= totalPages - 1} onClick={() => setAmortPage(prev => ({ ...prev, [loan.id]: Math.min(totalPages - 1, page + 1) }))}
                                                                            style={{ padding: '6px 12px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: page >= totalPages - 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'var(--font-body)' }}>
                                                                            Next
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Prepayments */}
                                                            <div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                                    <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Prepayments</h4>
                                                                    <Button size="sm" variant="secondary" onClick={() => openLogPrepay(loan.id)}>
                                                                        <Plus size={12} /> Log Prepayment
                                                                    </Button>
                                                                </div>
                                                                {loanPrepayments.length === 0 ? (
                                                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>No prepayments logged yet.</p>
                                                                ) : (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                        {loanPrepayments.map(p => (
                                                                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-surface-2)', borderRadius: 8, fontSize: '12px', fontFamily: 'var(--font-body)' }}>
                                                                                <span style={{ color: 'var(--text-secondary)' }}>{new Date(p.prepayment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(p.amount)}</span>
                                                                                <span style={{ color: 'var(--color-inc)' }}>{p.months_saved} mo saved</span>
                                                                                <span style={{ color: 'var(--color-inc)' }}>{fmt(p.interest_saved)} saved</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ═══ ADD LOAN MODAL ═══ */}
            <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setAddErrors({}); }} title="Add Loan" maxWidth="480px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button type="button" onClick={() => { setShowAdd(false); setAddErrors({}); }} style={{ padding: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="submit" form="add-loan-form" disabled={addLoading} style={{ padding: 10, background: addLoading ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: addLoading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            {addLoading ? 'Adding…' : 'Add Loan'}
                        </button>
                    </div>
                }
            >
                <form id="add-loan-form" onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={labelSt}>Loan Name *</label>
                        <input style={inputSt} value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="e.g. HDFC Home Loan" />
                        {addErrors.name && <p style={errSt}>{addErrors.name}</p>}
                    </div>
                    <div>
                        <label style={labelSt}>Type</label>
                        <select value={addForm.type} onChange={e => setAddForm({ ...addForm, type: e.target.value })} style={{ ...inputSt, cursor: 'pointer' }}>
                            {LOAN_TYPES.map(t => (
                                <option key={t} value={t}>{LOAN_TYPE_LABELS[t]}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label style={labelSt}>Original Loan Amount *</label>
                            <input type="number" min="0" step="any" style={inputSt} value={addForm.principal_amount} onChange={e => setAddForm({ ...addForm, principal_amount: e.target.value })} placeholder="2500000" />
                            {addErrors.principal_amount && <p style={errSt}>{addErrors.principal_amount}</p>}
                        </div>
                        <div>
                            <label style={labelSt}>Disbursement Date *</label>
                            <input type="date" max={today()} style={inputSt} value={addForm.disbursement_date} onChange={e => setAddForm({ ...addForm, disbursement_date: e.target.value })} />
                            {addErrors.disbursement_date && <p style={errSt}>{addErrors.disbursement_date}</p>}
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label style={labelSt}>Tenure (months) *</label>
                            <input type="number" min="1" step="1" style={inputSt} value={addForm.tenure_months} onChange={e => setAddForm({ ...addForm, tenure_months: e.target.value })} placeholder="240" />
                            {addErrors.tenure_months && <p style={errSt}>{addErrors.tenure_months}</p>}
                        </div>
                        <div>
                            <label style={labelSt}>Annual Interest Rate (%) *</label>
                            <input type="number" min="0" max="100" step="any" style={inputSt} value={addForm.interest_rate_pct} onChange={e => setAddForm({ ...addForm, interest_rate_pct: e.target.value })} placeholder="8.5" />
                            {addErrors.interest_rate_pct && <p style={errSt}>{addErrors.interest_rate_pct}</p>}
                        </div>
                    </div>
                    <div>
                        <label style={labelSt}>Current Outstanding Balance *</label>
                        <input type="number" min="0" step="any" style={inputSt} value={addForm.outstanding_balance} onChange={e => setAddForm({ ...addForm, outstanding_balance: e.target.value })} placeholder="2200000" />
                        {addErrors.outstanding_balance && <p style={errSt}>{addErrors.outstanding_balance}</p>}
                    </div>
                    <div>
                        <label style={labelSt}>Monthly EMI (optional)</label>
                        <input type="number" min="0" step="any" style={inputSt} value={addForm.emi_amount} onChange={e => setAddForm({ ...addForm, emi_amount: e.target.value })} placeholder="Leave blank to auto-calculate" />
                        {addErrors.emi_amount && <p style={errSt}>{addErrors.emi_amount}</p>}
                        {!addForm.emi_amount.trim() && addEMIHint !== null && (
                            <p style={noteSt}>Estimated EMI: {fmt(addEMIHint)}</p>
                        )}
                        <p style={noteSt}>Leave blank to auto-calculate from balance, rate, and tenure.</p>
                    </div>
                    <div>
                        <label style={labelSt}>Bank / Lender (optional)</label>
                        <input style={inputSt} value={addForm.bank_or_lender} onChange={e => setAddForm({ ...addForm, bank_or_lender: e.target.value })} placeholder="e.g. HDFC Bank" />
                    </div>
                    <div>
                        <label style={labelSt}>Prepayment Penalty (%) (optional)</label>
                        <input type="number" min="0" max="100" step="any" style={inputSt} value={addForm.prepayment_penalty_pct} onChange={e => setAddForm({ ...addForm, prepayment_penalty_pct: e.target.value })} placeholder="0" />
                    </div>
                </form>
            </Modal>

            {/* ═══ EDIT LOAN MODAL ═══ */}
            <Modal isOpen={!!editLoan} onClose={() => setEditLoan(null)} title={editLoan ? `Edit ${editLoan.name}` : 'Edit Loan'} maxWidth="480px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button type="button" onClick={() => setEditLoan(null)} style={{ padding: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="submit" form="edit-loan-form" disabled={editLoading} style={{ padding: 10, background: editLoading ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: editLoading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            {editLoading ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                }
            >
                <form id="edit-loan-form" onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={labelSt}>Loan Name *</label>
                        <input style={inputSt} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                        {editErrors.name && <p style={errSt}>{editErrors.name}</p>}
                    </div>
                    <div>
                        <label style={labelSt}>Outstanding Balance *</label>
                        <input type="number" min="0" step="any" style={inputSt} value={editForm.outstanding_balance} onChange={e => setEditForm({ ...editForm, outstanding_balance: e.target.value })} />
                        {editErrors.outstanding_balance && <p style={errSt}>{editErrors.outstanding_balance}</p>}
                        <p style={noteSt}>Updating the outstanding balance will recalculate your amortization schedule.</p>
                    </div>
                    <div>
                        <label style={labelSt}>Annual Interest Rate (%) *</label>
                        <input type="number" min="0" max="100" step="any" style={inputSt} value={editForm.interest_rate_pct} onChange={e => setEditForm({ ...editForm, interest_rate_pct: e.target.value })} />
                        {editErrors.interest_rate_pct && <p style={errSt}>{editErrors.interest_rate_pct}</p>}
                    </div>
                    <div>
                        <label style={labelSt}>Monthly EMI (optional)</label>
                        <input type="number" min="0" step="any" style={inputSt} value={editForm.emi_amount} onChange={e => setEditForm({ ...editForm, emi_amount: e.target.value })} placeholder="Leave blank to auto-calculate" />
                        {editErrors.emi_amount && <p style={errSt}>{editErrors.emi_amount}</p>}
                    </div>
                    <div>
                        <label style={labelSt}>Bank / Lender (optional)</label>
                        <input style={inputSt} value={editForm.bank_or_lender} onChange={e => setEditForm({ ...editForm, bank_or_lender: e.target.value })} />
                    </div>
                    <div>
                        <label style={labelSt}>Notes (optional)</label>
                        <textarea style={{ ...inputSt, resize: 'vertical', minHeight: 60 }} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
                    </div>
                </form>
            </Modal>

            {/* ═══ LOG PREPAYMENT MODAL ═══ */}
            <Modal isOpen={!!logPrepayLoanId} onClose={() => setLogPrepayLoanId(null)} title="Log Prepayment" maxWidth="380px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button type="button" onClick={() => setLogPrepayLoanId(null)} style={{ padding: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="submit" form="prepayment-form" disabled={logPrepayLoading} style={{ padding: 10, background: logPrepayLoading ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontFamily: 'var(--font-body)', cursor: logPrepayLoading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            {logPrepayLoading ? 'Saving…' : 'Log Prepayment'}
                        </button>
                    </div>
                }
            >
                <form id="prepayment-form" onSubmit={handleLogPrepaySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={labelSt}>Amount *</label>
                        <input type="number" min="0" step="any" style={inputSt} value={logPrepayForm.amount} onChange={e => setLogPrepayForm({ ...logPrepayForm, amount: e.target.value })} autoFocus />
                        {logPrepayErrors.amount && <p style={errSt}>{logPrepayErrors.amount}</p>}
                    </div>
                    <div>
                        <label style={labelSt}>Date *</label>
                        <input type="date" max={today()} style={inputSt} value={logPrepayForm.prepayment_date} onChange={e => setLogPrepayForm({ ...logPrepayForm, prepayment_date: e.target.value })} />
                        {logPrepayErrors.prepayment_date && <p style={errSt}>{logPrepayErrors.prepayment_date}</p>}
                    </div>
                </form>
            </Modal>
        </AppLayout>
    );
}

export default function DebtIntelligencePage() {
    return <Suspense><DebtIntelligencePageInner /></Suspense>;
}
