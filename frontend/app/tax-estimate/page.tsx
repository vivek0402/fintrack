'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import {
    Receipt, Loader2, AlertTriangle, PiggyBank, Calculator,
} from 'lucide-react';
import { FadeIn } from '@/components/ui/FadeIn';

const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--bg-border)',
    borderRadius: '16px',
    padding: '20px 24px',
};

const generateBtn: React.CSSProperties = {
    background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'DM Sans, sans-serif',
};

const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    fontWeight: 600,
    margin: '0 0 8px',
};

export default function TaxEstimatePage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const generate = async (force = false) => {
        setLoading(true);
        setError('');
        try {
            const res = await aiAPI.taxEstimate(force);
            setData(res.data.data);
            setGenerated(true);
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to generate tax estimate. Please try again.');
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={24} color="var(--accent-blue)" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );

    const isNewBetter = data?.recommendedRegime === 'new';
    const recTax = isNewBetter ? data?.newRegime?.total : data?.oldRegime?.total;
    const otherTax = isNewBetter ? data?.oldRegime?.total : data?.newRegime?.total;

    return (
        <AppLayout>
            <PageShell
                title="Tax Estimate"
                subtitle="FY income tax calculator"
                headerRight={
                    generated && !loading ? (
                        <Button variant="secondary" size="md" onClick={() => generate(true)}>Recalculate</Button>
                    ) : undefined
                }
            >
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>

                {/* State 1 — Initial / Empty */}
                {!generated && !loading && !error && (
                    <EmptyState
                        icon={Calculator}
                        title="No estimate yet"
                        subtitle="Add income transactions first, then calculate your tax estimate for the financial year"
                        action={
                            <Button variant="primary" size="md" onClick={() => generate(false)}>
                                <Receipt size={15} /> Calculate My Tax
                            </Button>
                        }
                    />
                )}

                {/* State 2 — Loading */}
                {loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px' }}>
                        <Loader2 size={28} color="var(--accent-blue)" style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                            Calculating your tax estimate…
                        </p>
                    </div>
                )}

                {/* State 3 — Error */}
                {error && !loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '40px' }}>
                        <AlertTriangle size={28} color="var(--accent-red)" />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center' }}>{error}</p>
                        <button type="button" onClick={() => generate(false)} style={{
                            background: 'none', border: '1px solid var(--bg-border)',
                            borderRadius: '8px', padding: '8px 20px',
                            color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer',
                        }}>
                            Try again
                        </button>
                    </div>
                )}

                {/* State 4 — Result */}
                {generated && data && !loading && (
                    <FadeIn>
                    <>
                        {/* Zero income message */}
                        {data.grossIncome === 0 && (
                            <div style={{
                                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                                borderRadius: '14px', padding: '20px 24px', marginBottom: '16px',
                                display: 'flex', alignItems: 'flex-start', gap: '12px',
                            }}>
                                <AlertTriangle size={20} color="var(--accent-yellow)" style={{ flexShrink: 0, marginTop: '1px' }} />
                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                                    {data.disclaimer || 'No income recorded for this financial year. Add salary/income transactions to see an estimate.'}
                                </p>
                            </div>
                        )}

                        {data.grossIncome > 0 && (
                            <>
                                {/* Summary row */}
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                                    {/* Gross income */}
                                    <div style={{ ...card, flex: '1 1 220px' }}>
                                        <p style={labelStyle}>Gross Income {data.fyPeriod || 'FY 2025–26'}</p>
                                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                                            {fmt(data.grossIncome)}
                                        </p>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                                            Total income transactions · April – March
                                        </p>
                                        {data.from_cache && (
                                            <span style={{ display: 'inline-block', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-hover)', borderRadius: '6px', padding: '2px 8px' }}>Cached</span>
                                        )}
                                    </div>

                                    {/* Recommended regime */}
                                    <div style={{
                                        ...card,
                                        flex: '1 1 220px',
                                        borderLeft: `4px solid ${isNewBetter ? 'var(--accent-green)' : 'var(--accent-blue)'}`,
                                    }}>
                                        <p style={labelStyle}>Recommended Regime</p>
                                        <p style={{
                                            fontFamily: 'Sora, sans-serif', fontSize: '20px', fontWeight: 700,
                                            color: isNewBetter ? 'var(--accent-green)' : 'var(--accent-blue)',
                                            margin: '0 0 4px',
                                        }}>
                                            {isNewBetter ? 'New Regime' : 'Old Regime'}
                                        </p>
                                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                                            {fmt(recTax ?? 0)} tax due
                                        </p>
                                        {(data.savings ?? 0) > 0 && (
                                            <p style={{ fontSize: '13px', color: 'var(--accent-green)', margin: 0, fontWeight: 500 }}>
                                                You save {fmt(data.savings)} vs the other regime
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Regime comparison */}
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                                    {[
                                        {
                                            label: 'New Regime',
                                            regime: data.newRegime,
                                            isRec: isNewBetter,
                                            note: 'No deductions, lower slabs',
                                        },
                                        {
                                            label: 'Old Regime',
                                            regime: data.oldRegime,
                                            isRec: !isNewBetter,
                                            note: 'With standard deductions (80C, HRA etc.)',
                                        },
                                    ].map(({ label, regime, isRec, note }) => {
                                        if (!regime) return null;
                                        return (
                                            <div key={label} style={{
                                                ...card,
                                                flex: '1 1 220px',
                                                position: 'relative',
                                                border: `1px solid ${isRec ? 'rgba(16,185,129,0.4)' : 'var(--bg-border)'}`,
                                            }}>
                                                {isRec && (
                                                    <div style={{
                                                        position: 'absolute', top: '-10px', right: '16px',
                                                        background: 'var(--accent-green)', color: '#fff',
                                                        fontSize: '10px', fontWeight: 700,
                                                        padding: '2px 10px', borderRadius: '10px',
                                                    }}>
                                                        ✓ RECOMMENDED
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                                    <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                                        {label}
                                                    </p>
                                                </div>
                                                <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                                                    {fmt(regime.total ?? 0)}
                                                </p>
                                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                                                    Effective rate: {regime.total && data.grossIncome ? ((regime.total / data.grossIncome) * 100).toFixed(1) : '0'}%
                                                </p>
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>{note}</p>

                                                <div style={{ height: '1px', background: 'var(--bg-border)', margin: '14px 0' }} />

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                                    {[
                                                        { label: 'Standard Deduction', val: fmt(regime.standardDeduction ?? 0), color: 'var(--accent-green)' },
                                                        ...(regime.deduction80C ? [{ label: '80C Deductions', val: fmt(regime.deduction80C), color: 'var(--accent-green)' }] : []),
                                                        { label: 'Taxable Income', val: fmt(regime.taxableIncome ?? 0), color: 'var(--text-primary)' },
                                                        { label: 'Income Tax', val: fmt(regime.tax ?? 0), color: 'var(--accent-red)' },
                                                        { label: 'Cess (4%)', val: fmt(regime.cess ?? 0), color: 'var(--accent-yellow)' },
                                                    ].map(row => (
                                                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--bg-border)' }}>
                                                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{row.label}</span>
                                                            <span style={{ fontSize: '13px', fontWeight: 600, color: row.color }}>{row.val}</span>
                                                        </div>
                                                    ))}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Total Liability</span>
                                                        <span style={{ fontSize: '14px', fontWeight: 700, color: (regime.total ?? 0) === 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                                            {fmt(regime.total ?? 0)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Slab breakdown */}
                                {data.breakdown?.length > 0 && (
                                    <div style={{ ...card, marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                            <Receipt size={15} color="var(--accent-blue)" />
                                            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                Tax slab breakdown (New Regime)
                                            </span>
                                        </div>

                                        {/* Header row */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px', padding: '8px 12px', marginBottom: '4px' }}>
                                            {['Slab', 'Taxable Amt', 'Rate', 'Tax'].map(h => (
                                                <span key={h} style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: h !== 'Slab' ? 'right' : 'left' }}>
                                                    {h}
                                                </span>
                                            ))}
                                        </div>

                                        {data.breakdown.map((row: any, i: number) => (
                                            <div key={i} style={{
                                                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px',
                                                padding: '10px 12px',
                                                borderRadius: '8px',
                                                background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                            }}>
                                                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{row.slab}</span>
                                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>—</span>
                                                <span style={{ fontSize: '13px', color: 'var(--accent-blue)', textAlign: 'right' }}>{row.rate}</span>
                                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>
                                                    {row.tax > 0 ? fmt(row.tax) : 'Nil'}
                                                </span>
                                            </div>
                                        ))}

                                        {/* Total row */}
                                        <div style={{ borderTop: '1px solid var(--bg-border)', marginTop: '8px', padding: '10px 12px 0', display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Total Tax Due</span>
                                            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-red)' }}>
                                                {fmt(data.newRegime?.tax ?? data.oldRegime?.tax ?? 0)}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Tips */}
                                {data.tips?.length > 0 && (
                                    <div style={{ ...card, marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                            <PiggyBank size={15} color="var(--accent-green)" />
                                            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                Tax saving tips
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {data.tips.map((tip: string, i: number) => (
                                                <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                                    <div style={{
                                                        width: '22px', height: '22px', flexShrink: 0,
                                                        borderRadius: '11px',
                                                        background: 'rgba(16,185,129,0.15)',
                                                        color: 'var(--accent-green)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '12px', fontWeight: 700,
                                                    }}>
                                                        {i + 1}
                                                    </div>
                                                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{tip}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Disclaimer */}
                        <div style={{
                            background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)',
                            borderRadius: '12px', padding: '16px 20px',
                            display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px',
                        }}>
                            <AlertTriangle size={18} color="var(--accent-yellow)" style={{ flexShrink: 0, marginTop: '1px' }} />
                            <div>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 4px', lineHeight: 1.6 }}>
                                    {data.disclaimer || 'This is an estimate only.'}
                                </p>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                                    Consult a Chartered Accountant for accurate tax filing.
                                </p>
                            </div>
                        </div>

                    </>
                    </FadeIn>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </PageShell>
        </AppLayout>
    );
}
