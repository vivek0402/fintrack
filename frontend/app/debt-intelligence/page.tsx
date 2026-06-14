'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, CreditCard, Gauge, Calculator, TrendingDown, Snowflake, Mountain } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { debtAPI, loanAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatTile } from '@/components/ui/StatTile';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { toast } from '@/store/toastStore';
import { Loan } from '@/types/loans';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

const inputSt: React.CSSProperties = { width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' };
const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block', fontFamily: 'var(--font-body)' };
const sectionTitleSt: React.CSSProperties = { fontFamily: 'var(--font-head)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' };
const sectionSubSt: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px', fontFamily: 'var(--font-body)' };

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

export default function DebtIntelligencePage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

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

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchData = () => {
        setLoading(true);
        Promise.all([
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

                {loading ? (
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
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
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
                                            <div style={{ marginTop: '12px', padding: '10px 12px', background: 'var(--accent-light)', borderRadius: 8, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
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
                                                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px', background: 'var(--bg-alt)' }}>
                                                    <p style={{ ...sectionTitleSt, fontSize: '13px', marginBottom: '10px' }}><Mountain size={14} /> Avalanche</p>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontFamily: 'var(--font-body)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Months to payoff</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{payoff.avalanche.months}</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Total interest</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(payoff.avalanche.total_interest)}</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Interest saved</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-inc)' }}>{fmt(payoff.avalanche.interest_saved)}</span></div>
                                                    </div>
                                                    {payoff.avalanche.payoff_sequence.length > 0 && (
                                                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            {payoff.avalanche.payoff_sequence.map(p => (
                                                                <div key={p.loan_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                                                    <span>{p.name}</span>
                                                                    <span>Month {p.payoff_month}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px', background: 'var(--bg-alt)' }}>
                                                    <p style={{ ...sectionTitleSt, fontSize: '13px', marginBottom: '10px' }}><Snowflake size={14} /> Snowball</p>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontFamily: 'var(--font-body)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Months to payoff</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{payoff.snowball.months}</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Total interest</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(payoff.snowball.total_interest)}</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Interest saved</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-inc)' }}>{fmt(payoff.snowball.interest_saved)}</span></div>
                                                    </div>
                                                    {payoff.snowball.payoff_sequence.length > 0 && (
                                                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                                                <div style={{ padding: '10px 12px', background: 'var(--accent-light)', borderRadius: 8, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
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
                                                <div style={{ padding: '10px 12px', background: 'var(--accent-light)', borderRadius: 8, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
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
                )}
            </div>
        </AppLayout>
    );
}
