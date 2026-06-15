'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
    ReferenceLine, CartesianGrid, Cell,
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { planningAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { AlertTriangle, ChevronDown, Wallet, TrendingUp, Landmark } from 'lucide-react';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtSigned = (n: number) => (n >= 0 ? '+' : '-') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

const fmtAbbrev = (n: number) => {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(1)}Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
    return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
};

const sectionTitleSt: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' };
const sectionSubSt: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px', fontFamily: 'var(--font-body)' };

const STATUS_ROW_BG: Record<string, string> = {
    surplus: 'color-mix(in srgb, var(--color-inc) 8%, transparent)',
    healthy: 'transparent',
    tight: 'color-mix(in srgb, var(--color-warn) 8%, transparent)',
    at_risk: 'color-mix(in srgb, var(--color-exp) 10%, transparent)',
};

const STATUS_LABELS: Record<string, string> = {
    surplus: 'Surplus',
    healthy: 'Healthy',
    tight: 'Tight',
    at_risk: 'At Risk',
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

function WaterfallTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const d: CashflowMonth = payload[0].payload;
    return (
        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--bg-border-strong)', borderRadius: 8, padding: '10px 12px' }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 6px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)' }}>{d.month}</p>
            <p style={{ margin: '0 0 2px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Income: <span style={{ color: 'var(--text-primary)' }}>{fmt(d.projected_income)}</span></p>
            <p style={{ margin: '0 0 2px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Expenses: <span style={{ color: 'var(--text-primary)' }}>{fmt(d.projected_expenses)}</span></p>
            <p style={{ margin: '0 0 2px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Fixed outflows: <span style={{ color: 'var(--text-primary)' }}>{fmt(d.fixed_outflows)}</span></p>
            <p style={{ margin: '4px 0 0', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: d.net_cashflow >= 0 ? 'var(--color-inc)' : 'var(--color-exp)' }}>
                Net: {fmtSigned(d.net_cashflow)}
            </p>
        </div>
    );
}

function BalanceTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--bg-border-strong)', borderRadius: 8, padding: '8px 12px' }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 4px', fontSize: 12, fontFamily: 'var(--font-body)' }}>{label}</p>
            <p style={{ margin: 0, fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(payload[0].value)}</p>
        </div>
    );
}

export default function CashFlowPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<CashflowResult | null>(null);
    const [assumptionsOpen, setAssumptionsOpen] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        planningAPI.getCashflow()
            .then(res => setData(res.data))
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => setLoading(false));
    }, [user]);

    if (isLoading || !user || loading || !data) {
        return (
            <AppLayout>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={120} />)}
                </div>
            </AppLayout>
        );
    }

    const { summary, months, loan_breakdown } = data;
    const surplusIsPositive = summary.average_monthly_surplus >= 0;

    const balanceEnd = months[months.length - 1].running_balance;
    const balanceStart = months[0].running_balance;
    const balanceLineColor = balanceEnd >= balanceStart ? 'var(--color-inc)' : 'var(--color-exp)';

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        Cash Flow Projection
                    </h1>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                        A 12-month look ahead based on your recent income, expenses, and fixed obligations
                    </p>
                </div>

                {/* ── SUMMARY BANNER ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                    <StatTile label="Projected Annual Income" value={fmt(summary.total_projected_annual_income)} accentColor="var(--color-inc)" />
                    <StatTile label="Projected Annual Expenses" value={fmt(summary.total_projected_annual_expenses)} accentColor="var(--color-exp)" />
                    <StatTile
                        label="Average Monthly Surplus"
                        value={fmtSigned(summary.average_monthly_surplus)}
                        accentColor={surplusIsPositive ? 'var(--color-inc)' : 'var(--color-exp)'}
                    />
                    <StatTile
                        label="Months at Risk"
                        value={String(summary.months_at_risk)}
                        accentColor={summary.months_at_risk > 0 ? 'var(--color-exp)' : undefined}
                        icon={summary.months_at_risk > 0 ? <AlertTriangle size={14} /> : undefined}
                    />
                </div>

                {/* ── WATERFALL CHART ── */}
                <Card>
                    <p style={sectionTitleSt}><TrendingUp size={16} /> Cash Flow Waterfall</p>
                    <p style={sectionSubSt}>Projected net cash flow for each of the next 12 months</p>
                    <div style={{ width: '100%', height: 260 }}>
                        <ResponsiveContainer>
                            <BarChart data={months}>
                                <CartesianGrid vertical={false} stroke="var(--bg-border)" />
                                <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                                <YAxis tickFormatter={fmtAbbrev} tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={70} />
                                <Tooltip content={<WaterfallTooltip />} />
                                <ReferenceLine y={0} stroke="var(--bg-border-strong)" />
                                <Bar dataKey="net_cashflow" name="Net Cash Flow" radius={[4, 4, 4, 4]} animationDuration={600}>
                                    {months.map((m, i) => (
                                        <Cell key={i} fill={m.net_cashflow >= 0 ? 'var(--color-inc)' : 'var(--color-exp)'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* ── RUNNING BALANCE CHART ── */}
                <Card>
                    <p style={sectionTitleSt}><Wallet size={16} /> Running Balance</p>
                    <p style={sectionSubSt}>
                        Cumulative surplus/deficit over the next 12 months — {balanceEnd >= balanceStart ? 'you end the year stronger' : 'you end the year weaker'}
                    </p>
                    <div style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer>
                            <LineChart data={months}>
                                <CartesianGrid vertical={false} stroke="var(--bg-border)" />
                                <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                                <YAxis tickFormatter={fmtAbbrev} tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={70} />
                                <Tooltip content={<BalanceTooltip />} />
                                <ReferenceLine y={0} stroke="var(--bg-border-strong)" />
                                <Line type="monotone" dataKey="running_balance" name="Running Balance" stroke={balanceLineColor} strokeWidth={1.5} dot={false} animationDuration={600} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* ── 12-MONTH PROJECTION TABLE ── */}
                <Card padding={0}>
                    <div style={{ padding: 'var(--space-6) var(--space-6) 0' }}>
                        <p style={sectionTitleSt}>12-Month Projection</p>
                        <p style={sectionSubSt}>Income, expenses, and fixed outflows assumed flat across the projection</p>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                    {['Month', 'Income', 'Expenses', 'Fixed Outflows', 'Net Cash Flow', 'Status'].map(h => (
                                        <th key={h} style={{ textAlign: h === 'Month' ? 'left' : 'right', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {months.map((m, i) => (
                                    <tr key={i} style={{ background: STATUS_ROW_BG[m.status] || 'transparent', borderBottom: i < months.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                        <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>{m.month}</td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{fmt(m.projected_income)}</td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{fmt(m.projected_expenses)}</td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{fmt(m.fixed_outflows)}</td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: m.net_cashflow >= 0 ? 'var(--color-inc)' : 'var(--color-exp)' }}>
                                            {fmtSigned(m.net_cashflow)}
                                        </td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                            <span style={{
                                                display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                                                color: m.status === 'surplus' ? 'var(--color-inc)' : m.status === 'at_risk' ? 'var(--color-exp)' : m.status === 'tight' ? 'var(--color-warn)' : 'var(--text-secondary)',
                                                background: m.status === 'healthy' ? 'var(--bg-surface-2)' : STATUS_ROW_BG[m.status],
                                            }}>
                                                {STATUS_LABELS[m.status] || m.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* ── FIXED OBLIGATIONS ── */}
                <Card>
                    <p style={sectionTitleSt}><Landmark size={16} /> Fixed Obligations</p>
                    <p style={sectionSubSt}>What makes up your {fmt(data.fixed_monthly_outflows)}/month in fixed outflows</p>
                    {loan_breakdown.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>No active loans — your fixed outflows come entirely from recurring expenses.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {loan_breakdown.map(loan => (
                                <div key={loan.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'var(--font-body)' }}>{loan.name}</span>
                                    <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(loan.emi)}/mo</span>
                                </div>
                            ))}
                            {data.recurring_outflows > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'var(--font-body)' }}>Recurring expenses</span>
                                    <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(data.recurring_outflows)}/mo</span>
                                </div>
                            )}
                        </div>
                    )}
                </Card>

                {/* ── ASSUMPTIONS (COLLAPSIBLE) ── */}
                <Card padding={0}>
                    <button
                        onClick={() => setAssumptionsOpen(o => !o)}
                        style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: 'transparent', border: 'none', cursor: 'pointer', padding: 'var(--space-6)',
                            fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
                        }}
                    >
                        Assumptions
                        <ChevronDown size={16} style={{ transform: assumptionsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease', color: 'var(--text-muted)' }} />
                    </button>
                    {assumptionsOpen && (
                        <div style={{ padding: '0 var(--space-6) var(--space-6)', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                            <p style={{ margin: 0 }}>
                                <strong style={{ color: 'var(--text-primary)' }}>Income:</strong> {fmt(data.average_monthly_income)}/month, the average of your last 3 months of recorded income transactions.
                            </p>
                            <p style={{ margin: 0 }}>
                                <strong style={{ color: 'var(--text-primary)' }}>Expenses:</strong> {fmt(data.average_monthly_expenses)}/month, the average of your last 3 months of recorded expense transactions, plus {fmt(data.fixed_monthly_outflows + data.recurring_outflows)}/month in fixed loan EMIs and recurring expenses.
                            </p>
                            <p style={{ margin: 0 }}>
                                This projection assumes flat income and expenses for the next 12 months. If you've had a salary change, a new loan, or a major recurring expense change, update those records so this projection stays accurate.
                            </p>
                        </div>
                    )}
                </Card>
            </div>
        </AppLayout>
    );
}
