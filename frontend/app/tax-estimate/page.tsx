'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Receipt, Loader2, AlertTriangle, PiggyBank, Calculator } from 'lucide-react';

const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
};
const labelSt: React.CSSProperties = {
    fontSize: '10px', color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '1px',
    fontWeight: 600, margin: '0 0 8px',
    fontFamily: 'var(--font-body)',
};

export default function TaxEstimatePage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const [data, setData]         = useState<any>(null);
    const [loading, setLoading]   = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

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

    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={300} />
        </AppLayout>
    );

    const isNewBetter = data?.recommendedRegime === 'new';
    const recTax  = isNewBetter ? data?.newRegime?.total : data?.oldRegime?.total;

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* Header */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
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
                        <p style={{ fontFamily: 'var(--font-head)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>No estimate yet</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>Add income transactions first, then calculate your tax estimate</p>
                        <Button variant="primary" size="md" onClick={() => generate(false)}><Receipt size={15} /> Calculate My Tax</Button>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px' }}>
                        <Loader2 size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>Calculating your tax estimate…</p>
                    </div>
                )}

                {/* Error */}
                {error && !loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '40px' }}>
                        <AlertTriangle size={28} color="var(--color-exp)" />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-body)' }}>{error}</p>
                        <button type="button" onClick={() => generate(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 20px', color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Try again</button>
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
                                    <div style={{ ...card, flex: '1 1 220px' }}>
                                        <p style={labelSt}>Gross Income {data.fyPeriod || 'FY 2025–26'}</p>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', fontVariantNumeric: 'tabular-nums' }}>{fmt(data.grossIncome)}</p>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Total income transactions · April – March</p>
                                        {data.from_cache && <Badge style={{ marginTop: '8px' }}>Cached</Badge>}
                                    </div>
                                    <div style={{ ...card, flex: '1 1 220px', borderLeft: `4px solid ${isNewBetter ? 'var(--color-inc)' : 'var(--accent)'}` }}>
                                        <p style={labelSt}>Recommended Regime</p>
                                        <p style={{ fontFamily: 'var(--font-head)', fontSize: '20px', fontWeight: 700, color: isNewBetter ? 'var(--color-inc)' : 'var(--accent)', margin: '0 0 4px' }}>{isNewBetter ? 'New Regime' : 'Old Regime'}</p>
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
                                            <div key={label} style={{ ...card, flex: '1 1 220px', position: 'relative', border: `1px solid ${isRec ? 'color-mix(in srgb, var(--color-inc) 30%, transparent)' : 'var(--border)'}` }}>
                                                {isRec && (
                                                    <div style={{ position: 'absolute', top: '-10px', right: '16px', background: 'var(--color-inc)', color: 'white', fontSize: '10px', fontWeight: 700, padding: '2px 10px', borderRadius: '10px', fontFamily: 'var(--font-body)' }}>✓ RECOMMENDED</div>
                                                )}
                                                <p style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>{label}</p>
                                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', fontVariantNumeric: 'tabular-nums' }}>{fmt(regime.total ?? 0)}</p>
                                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Effective rate: {regime.total && data.grossIncome ? ((regime.total / data.grossIncome) * 100).toFixed(1) : '0'}%</p>
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{note}</p>
                                                <div style={{ height: '1px', background: 'var(--border)', margin: '14px 0' }} />
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                                    {[
                                                        { label: 'Standard Deduction', val: fmt(regime.standardDeduction ?? 0), color: 'var(--color-inc)' },
                                                        ...(regime.deduction80C ? [{ label: '80C Deductions', val: fmt(regime.deduction80C), color: 'var(--color-inc)' }] : []),
                                                        { label: 'Taxable Income', val: fmt(regime.taxableIncome ?? 0), color: 'var(--text-primary)' },
                                                        { label: 'Income Tax', val: fmt(regime.tax ?? 0), color: 'var(--color-exp)' },
                                                        { label: 'Cess (4%)', val: fmt(regime.cess ?? 0), color: 'var(--color-warn)' },
                                                    ].map(row => (
                                                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border)' }}>
                                                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{row.label}</span>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: row.color, fontVariantNumeric: 'tabular-nums' }}>{row.val}</span>
                                                        </div>
                                                    ))}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-head)' }}>Total Liability</span>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: (regime.total ?? 0) === 0 ? 'var(--color-inc)' : 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>{fmt(regime.total ?? 0)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Slab breakdown */}
                                {data.breakdown?.length > 0 && (
                                    <div style={card}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                            <Receipt size={15} color="var(--accent)" />
                                            <span style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Tax slab breakdown (New Regime)</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px', padding: '8px 12px', marginBottom: '4px' }}>
                                            {['Slab', 'Taxable Amt', 'Rate', 'Tax'].map(h => (
                                                <span key={h} style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: h !== 'Slab' ? 'right' as const : 'left' as const, fontFamily: 'var(--font-body)' }}>{h}</span>
                                            ))}
                                        </div>
                                        {data.breakdown.map((row: any, i: number) => (
                                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: i % 2 === 0 ? 'var(--bg-alt)' : 'transparent' }}>
                                                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{row.slab}</span>
                                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right', fontFamily: 'var(--font-body)' }}>—</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.rate}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.tax > 0 ? fmt(row.tax) : 'Nil'}</span>
                                            </div>
                                        ))}
                                        <div style={{ borderTop: '1px solid var(--border)', marginTop: '8px', padding: '10px 12px 0', display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-head)' }}>Total Tax Due</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>{fmt(data.newRegime?.tax ?? data.oldRegime?.tax ?? 0)}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Tips */}
                                {data.tips?.length > 0 && (
                                    <div style={card}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                            <PiggyBank size={15} color="var(--color-inc)" />
                                            <span style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Tax saving tips</span>
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
            </div>
        </AppLayout>
    );
}
