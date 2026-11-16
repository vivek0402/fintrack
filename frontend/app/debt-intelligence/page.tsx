'use client';

import { useEffect, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { debtAPI, loanAPI } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useUserQuery } from '@/hooks/queries';
import { Card } from '@/components/ui/Card';
import { CardHeader, Rows, Stat, TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { toast } from '@/store/toastStore';
import { Loan, AmortizationEntry, AmortizationSummary, LoanPrepayment, LOAN_TYPES, LOAN_TYPE_LABELS } from '@/types/loans';
import { fmt } from '@/lib/utils';
import { type, truncate } from '@/lib/typography';
import { estimateEMI, payoffVerdict, pctRepaid, plural, utilizationParts } from '@/lib/debt';

const CumulativeInterestChart = dynamic(() => import('@/components/debt-intelligence/CumulativeInterestChart').then(m => m.CumulativeInterestChart), { ssr: false, loading: () => <Skeleton height={160} /> });

const today = () => new Date().toISOString().split('T')[0];
const PAGE_SIZE = 12;

const selectStyle: React.CSSProperties = {
    ...type.body, color: 'var(--text-primary)', width: '100%', height: 40, padding: '0 var(--space-3)',
    background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
    outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
};
const textareaStyle: React.CSSProperties = { ...selectStyle, height: 'auto', minHeight: 72, padding: 'var(--space-3)', resize: 'vertical', cursor: 'text' };

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'loans',     label: 'Loans' },
];

const DTI_STATUS_LABELS: Record<string, string> = {
    excellent: 'Excellent',
    good: 'Good',
    moderate: 'Moderate',
    risky: 'Risky',
};

/** A labelled control the shared Input cannot render itself (select, textarea). */
function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%' }}>
            <label htmlFor={htmlFor} style={type.label}>{label}</label>
            {children}
            {error ? <p style={{ ...type.meta, color: TONE_TEXT.bad, margin: 0 }}>{error}</p>
                : hint ? <p style={{ ...type.meta, margin: 0 }}>{hint}</p> : null}
        </div>
    );
}

const th: React.CSSProperties = { ...type.meta, textAlign: 'right', padding: '0 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' };

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

const NO_LOANS: Loan[] = [];


function DebtIntelligencePageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const initialTab = searchParams.get('tab');
    const [tab, setTab] = useState(TABS.some(t => t.key === initialTab) ? initialTab! : 'overview');

    // Loans and the debt ratios from the shared cache: revisits show them at
    // once and refresh in the background.
    const queryClient = useQueryClient();
    const debtQuery = useUserQuery('debt', [], async () => {
        const [loansRes, payoffRes, utilRes, dtiRes] = await Promise.all([
            loanAPI.getAll(true),
            debtAPI.getPayoffOptimizer(),
            debtAPI.getCreditUtilization(),
            debtAPI.getDti(),
        ]);
        return {
            loans: (loansRes.data.loans || []) as Loan[],
            payoff: payoffRes.data as PayoffOptimizerResult,
            utilization: utilRes.data as CreditUtilizationResult,
            dti: dtiRes.data as DtiResult,
        };
    });
    const loading = debtQuery.isPending;
    const loans: Loan[] = debtQuery.data?.loans ?? NO_LOANS;
    // A what-if run with an extra payment replaces the baseline plan until
    // the data next changes.
    const [payoffOverride, setPayoff] = useState<PayoffOptimizerResult | null>(null);
    const payoff = payoffOverride ?? debtQuery.data?.payoff ?? null;
    const utilization = debtQuery.data?.utilization ?? null;
    const dti = debtQuery.data?.dti ?? null;

    const [extraPayment, setExtraPayment] = useState('');
    const [payoffLoading, setPayoffLoading] = useState(false);

    const [chosenPrepayLoanId, setPrepayLoanId] = useState('');
    // Defaults to the first active loan until one is picked.
    const prepayLoanId = chosenPrepayLoanId || loans[0]?.id || '';
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

    // Loans move the dashboard's debt widgets and ratios too -- refresh every
    // cached query, and drop any what-if plan so the new baseline shows.
    const fetchData = () => {
        setPayoff(null);
        return queryClient.invalidateQueries();
    };

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
            if (user) { localStorage.removeItem(`dti-cache-${user.id}`); localStorage.removeItem(`active-loan-count-cache-${user.id}`); }
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
            if (user) { localStorage.removeItem(`dti-cache-${user.id}`); localStorage.removeItem(`active-loan-count-cache-${user.id}`); }
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
            if (user) { localStorage.removeItem(`dti-cache-${user.id}`); localStorage.removeItem(`active-loan-count-cache-${user.id}`); }
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
            if (user) { localStorage.removeItem(`dti-cache-${user.id}`); localStorage.removeItem(`active-loan-count-cache-${user.id}`); }
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={120} />)}
            </div>
        );
    }

    const hasLoans = loans.length > 0;
    const openAdd = () => { setShowAdd(true); setAddErrors({}); };
    const closeAdd = () => { setShowAdd(false); setAddErrors({}); };

    const hasUtil = !!utilization?.aggregate && !!utilization.per_card?.length;
    const hasBreakdown = !!dti && (dti.breakdown_loans.length > 0 || dti.breakdown_cards.length > 0);
    const prepayAmountNum = parseFloat(prepayAmount);

    const utilizationCard = (
        <Card>
            {hasUtil && utilization ? (
                <>
                    <CardHeader
                        title="Credit utilization"
                        sub="Keeping it under 30% helps your credit profile"
                        action={<span style={type.num}>{utilization.aggregate.overall_utilization_pct}%</span>}
                    />
                    {(() => {
                        const parts = utilizationParts(utilization.aggregate);
                        const status = utilization.aggregate.status;
                        const tone = status === 'critical' ? 'bad' : status === 'high' ? 'caution' : null;
                        return (
                            <p style={{ ...type.meta, margin: '0 0 var(--space-4)' }}>
                                {tone ? <span style={{ color: TONE_TEXT[tone] }}>{parts.status}</span> : parts.status}
                                {`. ${parts.rest}`}
                            </p>
                        );
                    })()}
                    <Rows>
                        {utilization.per_card.map(card => {
                            const tone = card.status === 'critical' ? 'bad' : card.status === 'high' ? 'caution' : null;
                            return (
                                <div key={card.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                                        <span style={{ ...type.bodyStrong, ...truncate, flex: 1, minWidth: 0 }}>{card.name}</span>
                                        {card.last4 && <span style={{ ...type.numSmall, flexShrink: 0 }}>{`••${card.last4}`}</span>}
                                        <span style={{ ...type.num, flexShrink: 0 }}>{card.utilization_pct}%</span>
                                    </div>
                                    <p style={{ ...type.meta, margin: 0 }}>
                                        {`${fmt(card.outstanding_balance)} of ${fmt(card.credit_limit)}`}
                                        {tone && <span style={{ color: TONE_TEXT[tone] }}>{` · ${card.status.charAt(0).toUpperCase()}${card.status.slice(1)}`}</span>}
                                    </p>
                                    <ProgressBar pct={card.utilization_pct} height={4} color="var(--text-secondary)" />
                                </div>
                            );
                        })}
                    </Rows>
                    {utilization.recommendation && (
                        <p style={{ ...type.meta, margin: 'var(--space-4) 0 0' }}>{utilization.recommendation}</p>
                    )}
                </>
            ) : (
                <>
                    <CardHeader title="Credit utilization" sub="Keeping it under 30% helps your credit profile" />
                    <p style={{ ...type.meta, margin: 0 }}>No credit cards tracked. Add a credit card to monitor your utilization.</p>
                </>
            )}
        </Card>
    );

    const debtPaymentsCard = dti && hasBreakdown ? (
        <Card>
            <CardHeader
                title="Monthly debt payments"
                sub="What makes up the ratio"
                action={<span style={type.num}>{fmt(dti.total_monthly_debt_obligation)}</span>}
            />
            <Rows>
                {dti.breakdown_loans.map(l => (
                    <div key={`loan-${l.id}`}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{l.name}</p>
                            <p style={{ ...type.meta, margin: '2px 0 0' }}>EMI</p>
                        </div>
                        <span style={{ ...type.num, flexShrink: 0 }}>{fmt(l.emi)}</span>
                    </div>
                ))}
                {dti.breakdown_cards.map(c => (
                    <div key={`card-${c.id}`}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{c.name}</p>
                            <p style={{ ...type.meta, margin: '2px 0 0' }}>Minimum payment</p>
                        </div>
                        <span style={{ ...type.num, flexShrink: 0 }}>{fmt(c.minimum_payment)}</span>
                    </div>
                ))}
            </Rows>
        </Card>
    ) : null;

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* Header */}
                <div className="fin-page-head">
                    <div style={{ minWidth: 0 }}>
                        <p style={{ ...type.meta, margin: 0 }}>Payoff strategy, prepayments and credit health</p>
                        <h1 style={{ ...type.heading, margin: 0 }}>Debt intelligence</h1>
                    </div>
                    <div className="fin-page-actions">
                        <Button onClick={openAdd}>Add loan</Button>
                    </div>
                </div>

                <Tabs tabs={TABS} active={tab} onChange={setTab} />

                {/* Overview */}
                {tab === 'overview' && (
                    loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={140} />)}
                        </div>
                    ) : (
                        <>
                            {dti && (
                                <Card>
                                    <p style={{ ...type.label, margin: 0 }}>Debt-to-income ratio</p>
                                    <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{`${dti.dti_ratio.toFixed(1)}%`}</p>
                                    <p style={{ ...type.meta, margin: '6px 0 0' }}>
                                        {`${DTI_STATUS_LABELS[dti.status] || dti.status}. ${fmt(dti.total_monthly_debt_obligation)} of your ${fmt(dti.monthly_income)} monthly income goes to debt payments, from your last 3 months.`}
                                    </p>
                                    <div className="dash-stats">
                                        <Stat className="dash-stat" label="Monthly income" value={fmt(dti.monthly_income)} sub="3 month average" />
                                        <Stat className="dash-stat" label="Loan EMIs" value={fmt(dti.monthly_loan_emi)} sub={plural(dti.breakdown_loans.length, 'loan', 'loans')} />
                                        <Stat className="dash-stat" label="Card minimums" value={fmt(dti.monthly_credit_obligation)} sub={plural(dti.breakdown_cards.length, 'card', 'cards')} />
                                    </div>
                                </Card>
                            )}

                            {debtPaymentsCard ? (
                                <div className="fin-two">
                                    {utilizationCard}
                                    {debtPaymentsCard}
                                </div>
                            ) : utilizationCard}

                            {/* Payoff optimizer */}
                            <Card>
                                <CardHeader title="Payoff optimizer" sub="Avalanche pays the highest interest first. Snowball pays the smallest balance first." />

                                {!hasLoans ? (
                                    <p style={{ ...type.meta, margin: 0 }}>No active loans. Add a loan to use the payoff optimizer.</p>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                            <div style={{ flex: '1 1 200px' }}>
                                                <Input
                                                    label="Extra monthly payment"
                                                    type="number"
                                                    min="0"
                                                    step="100"
                                                    placeholder="0"
                                                    value={extraPayment}
                                                    onChange={e => setExtraPayment(e.target.value)}
                                                />
                                            </div>
                                            <Button variant="secondary" onClick={runOptimizer} isLoading={payoffLoading}>Recalculate</Button>
                                        </div>

                                        {payoff?.message ? (
                                            <p style={{ ...type.meta, margin: 'var(--space-4) 0 0' }}>{payoff.message}</p>
                                        ) : payoff?.baseline && payoff.avalanche && payoff.snowball ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
                                                <p style={{ ...type.body, margin: 0 }}>{payoffVerdict(payoff.baseline, payoff.avalanche, payoff.snowball)}</p>

                                                <div style={{ overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                        <thead>
                                                            <tr>
                                                                <th style={{ ...th, textAlign: 'left', paddingLeft: 0 }}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Measure</span></th>
                                                                <th style={th}>No extra</th>
                                                                <th style={th}>Avalanche</th>
                                                                <th style={th}>Snowball</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {[
                                                                { label: 'Months to payoff', cells: [String(payoff.baseline.months), String(payoff.avalanche.months), String(payoff.snowball.months)] },
                                                                { label: 'Total interest', cells: [fmt(payoff.baseline.total_interest), fmt(payoff.avalanche.total_interest), fmt(payoff.snowball.total_interest)] },
                                                                { label: 'Interest saved', cells: [null, fmt(payoff.avalanche.interest_saved), fmt(payoff.snowball.interest_saved)] },
                                                            ].map(row => (
                                                                <tr key={row.label} style={{ borderTop: '1px solid var(--glass-border)' }}>
                                                                    <td style={{ ...type.body, padding: 'var(--space-2) 0', whiteSpace: 'nowrap' }}>{row.label}</td>
                                                                    {row.cells.map((c, i) => (
                                                                        <td key={i} style={{ ...(c === null ? type.meta : type.numSmall), textAlign: 'right', padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>{c === null ? 'None' : c}</td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {(payoff.avalanche.payoff_sequence.length > 0 || payoff.snowball.payoff_sequence.length > 0) && (
                                                    <div className="fin-two">
                                                        {[
                                                            { title: 'Avalanche payoff order', seq: payoff.avalanche.payoff_sequence },
                                                            { title: 'Snowball payoff order', seq: payoff.snowball.payoff_sequence },
                                                        ].filter(b => b.seq.length > 0).map(b => (
                                                            <div key={b.title}>
                                                                <p style={{ ...type.label, margin: '0 0 var(--space-2)' }}>{b.title}</p>
                                                                <Rows>
                                                                    {b.seq.map(p => (
                                                                        <div key={p.loan_id}>
                                                                            <span style={{ ...type.body, ...truncate, flex: 1, minWidth: 0 }}>{p.name}</span>
                                                                            <span style={{ ...type.numSmall, flexShrink: 0 }}>{`Month ${p.payoff_month}`}</span>
                                                                        </div>
                                                                    ))}
                                                                </Rows>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {payoff.recommendation && (
                                                    <p style={{ ...type.meta, margin: 0 }}>{payoff.recommendation}</p>
                                                )}
                                            </div>
                                        ) : null}
                                    </>
                                )}
                            </Card>

                            {/* Prepayment calculator */}
                            <Card>
                                <CardHeader title="Prepayment calculator" sub="See how a one-time lump sum changes your tenure and interest" />

                                {!hasLoans ? (
                                    <p style={{ ...type.meta, margin: 0 }}>No active loans. Add a loan to calculate prepayment impact.</p>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                            <div style={{ flex: '1 1 200px' }}>
                                                <Field label="Loan" htmlFor="prepay-loan">
                                                    <select id="prepay-loan" value={prepayLoanId} onChange={e => setPrepayLoanId(e.target.value)} style={selectStyle}>
                                                        {loans.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                                    </select>
                                                </Field>
                                            </div>
                                            <div style={{ flex: '1 1 160px' }}>
                                                <Input
                                                    label="Prepayment amount"
                                                    type="number"
                                                    min="0"
                                                    step="1000"
                                                    placeholder="e.g. 100000"
                                                    value={prepayAmount}
                                                    onChange={e => setPrepayAmount(e.target.value)}
                                                />
                                            </div>
                                            <Button variant="secondary" onClick={runPrepaymentImpact} isLoading={prepayLoading}>Calculate</Button>
                                        </div>
                                        {prepayError && <p style={{ ...type.meta, color: TONE_TEXT.bad, margin: 'var(--space-3) 0 0' }}>{prepayError}</p>}

                                        {prepayResult && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
                                                <p style={{ ...type.body, margin: 0 }}>
                                                    {`Paying ${fmt(Number.isFinite(prepayAmountNum) ? prepayAmountNum : 0)} now moves your payoff from ${prepayResult.old_payoff_date} to ${prepayResult.new_payoff_date}.`}
                                                </p>
                                                <div className="dash-stats" style={{ marginTop: 0 }}>
                                                    <Stat className="dash-stat" label="Months saved" value={String(prepayResult.months_saved)} />
                                                    <Stat className="dash-stat" label="Interest saved" value={fmt(prepayResult.interest_saved)} />
                                                    <Stat className="dash-stat" label="Penalty" value={fmt(prepayResult.penalty_amount)} />
                                                    <Stat className="dash-stat" label="Net savings" value={fmt(prepayResult.net_savings)} />
                                                </div>
                                                {prepayResult.recommendation && (
                                                    <p style={{ ...type.meta, margin: 0 }}>{prepayResult.recommendation}</p>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </Card>
                        </>
                    )
                )}

                {/* Loans */}
                {tab === 'loans' && (
                    <>
                        {loading ? (
                            <SkeletonCard height={160} />
                        ) : (
                            <Card>
                                <p style={{ ...type.label, margin: 0 }}>Total outstanding</p>
                                <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{fmt(totalOutstanding)}</p>
                                <p style={{ ...type.meta, margin: '6px 0 0' }}>{`Across ${plural(activeLoans.length, 'active loan', 'active loans')}`}</p>
                                <div className="dash-stats">
                                    <Stat className="dash-stat" label="Monthly EMI burden" value={fmt(monthlyEMIBurden)} sub="All active loans" />
                                    <Stat className="dash-stat" label="Average interest rate" value={`${avgInterestRate.toFixed(2)}%`} sub="Weighted by balance" />
                                    <Stat className="dash-stat" label="Active loans" value={String(activeLoans.length)} />
                                </div>
                            </Card>
                        )}

                        {loading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {[1, 2, 3].map(i => <SkeletonCard key={i} height={90} />)}
                            </div>
                        ) : activeLoans.length === 0 ? (
                            <Card>
                                <CardHeader title="No loans tracked yet" sub="Add your loans to see amortization schedules, payoff timelines and optimization strategies." />
                                <Button onClick={openAdd}>Add loan</Button>
                            </Card>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {activeLoans.map(loan => {
                                    const isExpanded = expandedId === loan.id;
                                    const principal = parseFloat(String(loan.principal_amount));
                                    const outstanding = parseFloat(String(loan.outstanding_balance));
                                    const repaidPct = pctRepaid(principal, outstanding);
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
                                        <Card key={loan.id}>
                                            {/* Tap target */}
                                            <div onClick={() => toggleExpand(loan.id)}
                                                role="button" tabIndex={0} aria-expanded={isExpanded}
                                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(loan.id); } }}
                                                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{loan.name}</p>
                                                        <p style={{ ...type.meta, margin: '2px 0 0' }}>{`${LOAN_TYPE_LABELS[loan.type] || loan.type}${loan.bank_or_lender ? ` · ${loan.bank_or_lender}` : ''}`}</p>
                                                    </div>
                                                    <span style={{ ...type.meta, flexShrink: 0 }}>{isExpanded ? 'Hide details' : 'Show details'}</span>
                                                </div>

                                                <div>
                                                    <p style={{ ...type.label, margin: 0 }}>Outstanding</p>
                                                    <p style={{ ...type.num, margin: '2px 0 0' }}>{fmt(outstanding)}</p>
                                                    <p style={{ ...type.meta, margin: '2px 0 0' }}>
                                                        {`${parseFloat(String(loan.interest_rate_pct)).toFixed(2)}% · EMI ${emiDisplay ? fmt(emiDisplay) : '—'} · ${loan.months_remaining ?? '—'} months left`}
                                                    </p>
                                                </div>

                                                <div>
                                                    <ProgressBar pct={repaidPct} height={4} color="var(--text-secondary)" />
                                                    <p style={{ ...type.meta, margin: 'var(--space-2) 0 0' }}>{`${repaidPct.toFixed(0)}% of the principal repaid`}</p>
                                                </div>
                                            </div>

                                            {/* Expanded section */}
                                            {isExpanded && (
                                                <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)' }}>
                                                    <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
                                                        <TextAction onClick={() => openEdit(loan)}>Edit</TextAction>
                                                        <TextAction onClick={() => handleMarkRepaid(loan)}>Mark as repaid</TextAction>
                                                    </div>
                                                    {amortLoading[loan.id] ? (
                                                        <SkeletonCard height={160} />
                                                    ) : !data ? (
                                                        <p style={{ ...type.meta, margin: 0 }}>
                                                            {loan.amortization_error || 'Unable to load amortization schedule.'}
                                                        </p>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                                                            <div className="dash-stats" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                                                                <Stat className="dash-stat" label="Total interest" value={fmt(data.summary.total_interest)} />
                                                                <Stat className="dash-stat" label="Total payable" value={fmt(data.summary.total_amount_payable)} />
                                                                <Stat className="dash-stat" label="Payoff date" value={new Date(data.summary.payoff_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} />
                                                            </div>

                                                            <div>
                                                                <p style={{ ...type.label, margin: '0 0 var(--space-2)' }}>Cumulative interest</p>
                                                                <CumulativeInterestChart chartData={chartData} />
                                                            </div>

                                                            <div>
                                                                <p style={{ ...type.label, margin: '0 0 var(--space-2)' }}>Amortization schedule</p>
                                                                <div style={{ overflowX: 'auto' }}>
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                                        <thead>
                                                                            <tr>
                                                                                {['Month', 'Opening', 'EMI', 'Interest', 'Principal', 'Closing'].map(h => (
                                                                                    <th key={h} style={{ ...th, paddingLeft: 'var(--space-3)' }}>{h}</th>
                                                                                ))}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {pageRows.map(row => {
                                                                                const cell: React.CSSProperties = { ...type.numSmall, textAlign: 'right', padding: 'var(--space-2) 0 var(--space-2) var(--space-3)', whiteSpace: 'nowrap' };
                                                                                return (
                                                                                    <tr key={row.month} style={{ borderTop: '1px solid var(--glass-border)' }}>
                                                                                        <td style={cell}>{row.month}</td>
                                                                                        <td style={cell}>{fmt(row.opening_balance)}</td>
                                                                                        <td style={cell}>{fmt(row.emi)}</td>
                                                                                        <td style={cell}>{fmt(row.interest_component)}</td>
                                                                                        <td style={cell}>{fmt(row.principal_component)}</td>
                                                                                        <td style={{ ...cell, color: 'var(--text-primary)' }}>{fmt(row.closing_balance)}</td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                                {totalPages > 1 && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
                                                                        <TextAction disabled={page === 0} onClick={() => setAmortPage(prev => ({ ...prev, [loan.id]: Math.max(0, page - 1) }))}>Previous</TextAction>
                                                                        <span style={type.meta}>{`Page ${page + 1} of ${totalPages}`}</span>
                                                                        <TextAction disabled={page >= totalPages - 1} onClick={() => setAmortPage(prev => ({ ...prev, [loan.id]: Math.min(totalPages - 1, page + 1) }))}>Next</TextAction>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                                                                    <p style={{ ...type.bodyStrong, margin: 0 }}>Prepayments</p>
                                                                    <TextAction onClick={() => openLogPrepay(loan.id)}>Log a prepayment</TextAction>
                                                                </div>
                                                                {loanPrepayments.length === 0 ? (
                                                                    <p style={{ ...type.meta, margin: 0 }}>No prepayments logged yet.</p>
                                                                ) : (
                                                                    <Rows>
                                                                        {loanPrepayments.map(p => (
                                                                            <div key={p.id}>
                                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                                    <p style={{ ...type.bodyStrong, margin: 0 }}>{new Date(p.prepayment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                                                                    <p style={{ ...type.meta, margin: '2px 0 0' }}>{`${plural(p.months_saved, 'month', 'months')} and ${fmt(p.interest_saved)} interest saved`}</p>
                                                                                </div>
                                                                                <span style={{ ...type.num, flexShrink: 0 }}>{fmt(p.amount)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </Rows>
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

            {/* Add loan dialog */}
            <Modal isOpen={showAdd} onClose={closeAdd} title="Add loan" maxWidth="480px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Button type="button" variant="secondary" onClick={closeAdd}>Cancel</Button>
                        <Button type="submit" form="add-loan-form" isLoading={addLoading}>Add loan</Button>
                    </div>
                }
            >
                <form id="add-loan-form" onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Input label="Loan name" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="e.g. HDFC Home Loan" error={addErrors.name} />
                    <Field label="Loan type" htmlFor="add-loan-type">
                        <select id="add-loan-type" value={addForm.type} onChange={e => setAddForm({ ...addForm, type: e.target.value })} style={selectStyle}>
                            {LOAN_TYPES.map(t => (
                                <option key={t} value={t}>{LOAN_TYPE_LABELS[t]}</option>
                            ))}
                        </select>
                    </Field>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
                        <Input label="Principal amount" type="number" min="0" step="any" value={addForm.principal_amount} onChange={e => setAddForm({ ...addForm, principal_amount: e.target.value })} placeholder="2500000" error={addErrors.principal_amount} />
                        <Input label="Disbursement date" type="date" max={today()} value={addForm.disbursement_date} onChange={e => setAddForm({ ...addForm, disbursement_date: e.target.value })} error={addErrors.disbursement_date} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
                        <Input label="Tenure in months" type="number" min="1" step="1" value={addForm.tenure_months} onChange={e => setAddForm({ ...addForm, tenure_months: e.target.value })} placeholder="240" error={addErrors.tenure_months} />
                        <Input label="Interest rate (%)" type="number" min="0" max="100" step="any" value={addForm.interest_rate_pct} onChange={e => setAddForm({ ...addForm, interest_rate_pct: e.target.value })} placeholder="8.5" error={addErrors.interest_rate_pct} />
                    </div>
                    <Input label="Outstanding balance" type="number" min="0" step="any" value={addForm.outstanding_balance} onChange={e => setAddForm({ ...addForm, outstanding_balance: e.target.value })} placeholder="2200000" error={addErrors.outstanding_balance} />
                    <Input
                        label="EMI amount (optional)"
                        type="number" min="0" step="any"
                        value={addForm.emi_amount}
                        onChange={e => setAddForm({ ...addForm, emi_amount: e.target.value })}
                        placeholder="Leave blank to calculate"
                        error={addErrors.emi_amount}
                        hint={!addForm.emi_amount.trim() && addEMIHint !== null
                            ? `Estimated EMI: ${fmt(addEMIHint)}. Leave blank to calculate it from balance, rate and tenure.`
                            : 'Leave blank to calculate it from balance, rate and tenure.'}
                    />
                    <Input label="Lender or bank (optional)" value={addForm.bank_or_lender} onChange={e => setAddForm({ ...addForm, bank_or_lender: e.target.value })} placeholder="e.g. HDFC Bank" />
                    <Input label="Prepayment penalty (%) (optional)" type="number" min="0" max="100" step="any" value={addForm.prepayment_penalty_pct} onChange={e => setAddForm({ ...addForm, prepayment_penalty_pct: e.target.value })} placeholder="0" />
                </form>
            </Modal>

            {/* Edit loan dialog */}
            <Modal isOpen={!!editLoan} onClose={() => setEditLoan(null)} title={editLoan ? `Edit ${editLoan.name}` : 'Edit loan'} maxWidth="480px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Button type="button" variant="secondary" onClick={() => setEditLoan(null)}>Cancel</Button>
                        <Button type="submit" form="edit-loan-form" isLoading={editLoading}>Save</Button>
                    </div>
                }
            >
                <form id="edit-loan-form" onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Input label="Loan name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} error={editErrors.name} />
                    <Input label="Outstanding balance" type="number" min="0" step="any" value={editForm.outstanding_balance} onChange={e => setEditForm({ ...editForm, outstanding_balance: e.target.value })} error={editErrors.outstanding_balance} hint="Updating the outstanding balance recalculates your amortization schedule." />
                    <Input label="Interest rate (%)" type="number" min="0" max="100" step="any" value={editForm.interest_rate_pct} onChange={e => setEditForm({ ...editForm, interest_rate_pct: e.target.value })} error={editErrors.interest_rate_pct} />
                    <Input label="EMI amount (optional)" type="number" min="0" step="any" value={editForm.emi_amount} onChange={e => setEditForm({ ...editForm, emi_amount: e.target.value })} placeholder="Leave blank to calculate" error={editErrors.emi_amount} />
                    <Input label="Lender or bank (optional)" value={editForm.bank_or_lender} onChange={e => setEditForm({ ...editForm, bank_or_lender: e.target.value })} />
                    <Field label="Notes (optional)" htmlFor="edit-loan-notes">
                        <textarea id="edit-loan-notes" style={textareaStyle} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
                    </Field>
                </form>
            </Modal>

            {/* Log prepayment dialog */}
            <Modal isOpen={!!logPrepayLoanId} onClose={() => setLogPrepayLoanId(null)} title="Log prepayment" maxWidth="380px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Button type="button" variant="secondary" onClick={() => setLogPrepayLoanId(null)}>Cancel</Button>
                        <Button type="submit" form="prepayment-form" isLoading={logPrepayLoading}>Log prepayment</Button>
                    </div>
                }
            >
                <form id="prepayment-form" onSubmit={handleLogPrepaySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Input label="Amount" type="number" min="0" step="any" value={logPrepayForm.amount} onChange={e => setLogPrepayForm({ ...logPrepayForm, amount: e.target.value })} error={logPrepayErrors.amount} autoFocus />
                    <Input label="Date" type="date" max={today()} value={logPrepayForm.prepayment_date} onChange={e => setLogPrepayForm({ ...logPrepayForm, prepayment_date: e.target.value })} error={logPrepayErrors.prepayment_date} />
                </form>
            </Modal>
        </>
    );
}

export default function DebtIntelligencePage() {
    return <Suspense><DebtIntelligencePageInner /></Suspense>;
}
