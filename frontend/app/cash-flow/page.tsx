'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store/authStore';
import { planningAPI } from '@/lib/api';
import { useUserQuery } from '@/hooks/queries';
import { Card } from '@/components/ui/Card';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { CardHeader, Rows, Stat, TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { fmt } from '@/lib/utils';
import { type } from '@/lib/typography';
import { riskSentence, statusLabel } from '@/lib/cashflow';

function chartSkeleton(height: number) {
    const ChartSkeleton = () => <Skeleton height={height} borderRadius={8} />;
    return ChartSkeleton;
}

const WaterfallChart = dynamic(() => import('@/components/cash-flow/WaterfallChart').then(m => m.WaterfallChart), { ssr: false, loading: chartSkeleton(260) });
const RunningBalanceChart = dynamic(() => import('@/components/cash-flow/RunningBalanceChart').then(m => m.RunningBalanceChart), { ssr: false, loading: chartSkeleton(220) });

const fmtSigned = (n: number) => (n >= 0 ? '+' : '−') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

// Status as a plain word: only the states that need attention get a tone.
const STATUS_COLOR: Record<string, string> = {
    surplus: TONE_TEXT.good,
    tight: TONE_TEXT.caution,
    at_risk: TONE_TEXT.bad,
};

interface CashflowMonth {
    month: string;
    projected_income: number;
    projected_expenses: number;
    fixed_outflows: number;
    net_cashflow: number;
    running_balance: number;
    status: string;
}

interface LoanBreakdown { id: string; name: string; emi: number; }

interface CashflowResult {
    months: CashflowMonth[];
    summary: {
        average_monthly_surplus: number;
        total_projected_annual_income: number;
        total_projected_annual_expenses: number;
        months_at_risk: number;
        months_surplus: number;
    };
    average_monthly_income: number;
    average_monthly_expenses: number;
    average_monthly_expenses_by_category: Record<string, number>;
    fixed_monthly_outflows: number;
    recurring_outflows: number;
    loan_breakdown: LoanBreakdown[];
}

const TH: React.CSSProperties = { ...type.meta, padding: '10px 16px', whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { ...type.numSmall, padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1px solid var(--glass-border)' };

export default function CashFlowPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    // Cached: revisits show the projection at once and refresh it in the background.
    const cashflowQuery = useUserQuery('cashflow', [], async () => (await planningAPI.getCashflow()).data as CashflowResult);
    const loading = cashflowQuery.isPending;
    const data = cashflowQuery.data ?? null;
    const [assumptionsOpen, setAssumptionsOpen] = useState(true);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    if (isLoading || !user || loading || !data) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={120} />)}
            </div>
        );
    }

    const { summary, months, loan_breakdown } = data;

    const balanceEnd = months[months.length - 1].running_balance;
    const balanceStart = months[0].running_balance;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

            <div className="fin-page-head">
                <div style={{ minWidth: 0 }}>
                    <p style={{ ...type.meta, margin: 0 }}>A 12-month look ahead from your recent income, expenses and fixed obligations</p>
                    <h1 style={{ ...type.heading, margin: 0 }}>Cash flow</h1>
                </div>
            </div>

            <Card>
                <p style={{ ...type.label, margin: 0 }}>Average monthly surplus</p>
                <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{fmtSigned(summary.average_monthly_surplus)}</p>
                <p style={{ ...type.meta, margin: '6px 0 0' }}>{riskSentence(months)}</p>
                <div className="dash-stats">
                    <Stat className="dash-stat" label="Projected income" value={fmt(summary.total_projected_annual_income)} sub="Next 12 months" />
                    <Stat className="dash-stat" label="Projected expenses" value={fmt(summary.total_projected_annual_expenses)} sub="Next 12 months" />
                    <Stat className="dash-stat" label="Months at risk" value={String(summary.months_at_risk)} sub="Of 12" />
                </div>
            </Card>

            <div className="fin-two">
                <Card>
                    <CardHeader title="Month by month" sub="Projected net cash flow for each of the next 12 months" />
                    <div style={{ width: '100%', height: 260 }}>
                        <WaterfallChart months={months} />
                    </div>
                </Card>
                <Card>
                    <CardHeader
                        title="Running balance"
                        sub={`Cumulative surplus or deficit. ${balanceEnd >= balanceStart ? 'You end the year stronger.' : 'You end the year weaker.'}`}
                    />
                    <div style={{ width: '100%', height: 220 }}>
                        <RunningBalanceChart months={months} balanceLineColor="var(--text-secondary)" />
                    </div>
                </Card>
            </div>

            <Card>
                <CardHeader title="12-month projection" sub="Income, expenses and fixed outflows assumed flat" />
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                {['Month', 'Income', 'Expenses', 'Fixed outflows', 'Net cash flow', 'Status'].map(h => (
                                    <th key={h} style={{ ...TH, textAlign: h === 'Month' ? 'left' : 'right' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {months.map((m, i) => (
                                <tr key={i}>
                                    <td style={{ ...TD, ...type.bodyStrong, textAlign: 'left', borderTop: '1px solid var(--glass-border)' }}>{m.month}</td>
                                    <td style={TD}>{fmt(m.projected_income)}</td>
                                    <td style={TD}>{fmt(m.projected_expenses)}</td>
                                    <td style={TD}>{fmt(m.fixed_outflows)}</td>
                                    <td style={{ ...TD, color: 'var(--text-primary)' }}>{fmtSigned(m.net_cashflow)}</td>
                                    <td style={{ ...TD, fontFamily: 'var(--font-body)', fontVariantNumeric: 'normal', color: STATUS_COLOR[m.status] ?? TONE_TEXT.neutral }}>{statusLabel(m.status)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <div className="fin-two">
                <Card>
                    <CardHeader
                        title="Fixed obligations"
                        sub={`What makes up your ${fmt(data.fixed_monthly_outflows + data.recurring_outflows)} a month in fixed outflows`}
                        action={<span style={type.num}>{fmt(data.fixed_monthly_outflows + data.recurring_outflows)}</span>}
                    />
                    {loan_breakdown.length === 0 ? (
                        <p style={{ ...type.meta, margin: 0 }}>No active loans. Your fixed outflows come entirely from recurring expenses.</p>
                    ) : (
                        <Rows>
                            {loan_breakdown.map(loan => (
                                <div key={loan.id} style={{ justifyContent: 'space-between' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <p style={{ ...type.bodyStrong, margin: 0 }}>{loan.name}</p>
                                        <p style={{ ...type.meta, margin: '2px 0 0' }}>EMI</p>
                                    </div>
                                    <span style={type.num}>{fmt(loan.emi)}</span>
                                </div>
                            ))}
                            {data.recurring_outflows > 0 && (
                                <div style={{ justifyContent: 'space-between' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <p style={{ ...type.bodyStrong, margin: 0 }}>Recurring expenses</p>
                                        <p style={{ ...type.meta, margin: '2px 0 0' }}>Every month</p>
                                    </div>
                                    <span style={type.num}>{fmt(data.recurring_outflows)}</span>
                                </div>
                            )}
                        </Rows>
                    )}
                </Card>

                <Card>
                    <CardHeader
                        title="Assumptions"
                        sub="How the projection is made"
                        flush={!assumptionsOpen}
                        action={<TextAction onClick={() => setAssumptionsOpen(o => !o)} aria-expanded={assumptionsOpen}>{assumptionsOpen ? 'Hide' : 'Show'}</TextAction>}
                    />
                    {assumptionsOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <p style={{ ...type.body, margin: 0 }}>
                                Income is {fmt(data.average_monthly_income)} a month, the average of your last 3 months of recorded income.
                            </p>
                            <p style={{ ...type.body, margin: 0 }}>
                                Expenses are {fmt(data.average_monthly_expenses)} a month, the average of your last 3 months of recorded expenses, plus {fmt(data.fixed_monthly_outflows + data.recurring_outflows)} a month in fixed loan EMIs and recurring expenses.
                            </p>
                            <p style={{ ...type.meta, margin: 0 }}>
                                This projection assumes flat income and expenses for the next 12 months. If you&apos;ve had a salary change, a new loan or a major recurring expense change, update those records so the projection stays accurate.
                            </p>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
