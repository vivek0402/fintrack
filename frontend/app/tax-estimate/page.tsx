'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';

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
            const msg = err?.response?.data?.error || err?.response?.data?.message;
            setError(msg || 'Failed to generate tax estimate. Please try again.');
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={120} />
        </AppLayout>
    );

    const regimeColor = (r: string) => r === 'new' ? 'var(--accent-blue)' : 'var(--accent-green)';
    const scoreColor = (n: number) => n === 0 ? 'var(--accent-green)' : 'var(--accent-red)';

    return (
        <AppLayout>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Tax Estimate</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>Indian income tax estimate for current financial year</p>
                </div>
                {generated && (
                    <Button onClick={() => generate(true)} isLoading={loading} size="md">🔄 Recalculate</Button>
                )}
            </div>

            {/* Error */}
            {error && (
                <div style={{ backgroundColor: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', padding: '10px 14px', fontSize: '0.85rem', color: '#f87171', marginBottom: '16px' }}>
                    {error}
                </div>
            )}

            {/* Prompt screen */}
            {!generated && !loading && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '20px', padding: '60px 40px', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🧾</div>
                    <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 10px 0' }}>Estimate Your Income Tax</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0 0 24px 0', lineHeight: 1.6, maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                        AI will analyse your income transactions for the current financial year (April–March) and compare Old Regime vs New Regime tax liability.
                    </p>
                    <Button onClick={() => generate(false)} isLoading={loading} size="lg">🧾 Calculate My Tax</Button>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    <div style={{ width: '24px', height: '24px', border: '2px solid var(--accent-blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
                    Analysing your income data…
                </div>
            )}

            {/* Results */}
            {data && !loading && (
                <div>
                    {/* FY period */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '6px', padding: '3px 10px' }}>
                            {data.fyPeriod || `${data.fyStart?.slice(0, 7)} → ${data.fyEnd?.slice(0, 7)}`}
                        </span>
                        {data.from_cache && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '6px', padding: '3px 10px' }}>
                                Cached
                            </span>
                        )}
                    </div>

                    {/* Zero income message */}
                    {data.grossIncome === 0 && (
                        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px', color: 'var(--accent-yellow)', fontSize: '0.875rem' }}>
                            {data.disclaimer}
                        </div>
                    )}

                    {data.grossIncome > 0 && (
                        <>
                            {/* Hero: Gross Income */}
                            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '24px', marginBottom: '16px' }}>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>Gross Income (FY)</p>
                                <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '2rem', fontWeight: 700, color: 'var(--accent-green)', margin: '0 0 16px 0' }}>
                                    {formatCurrency(data.grossIncome, user.currency)}
                                </p>

                                {/* Recommended regime badge */}
                                {data.recommendedRegime && (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '10px', background: `${regimeColor(data.recommendedRegime)}18`, border: `1px solid ${regimeColor(data.recommendedRegime)}40` }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: regimeColor(data.recommendedRegime) }}>
                                            ✅ {data.recommendedRegime === 'new' ? 'New Regime' : 'Old Regime'} is better for you
                                        </span>
                                        {data.savings > 0 && (
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                saves {formatCurrency(data.savings, user.currency)}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Regime Comparison */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                                {[
                                    { key: 'oldRegime', label: 'Old Regime', regime: data.oldRegime },
                                    { key: 'newRegime', label: 'New Regime', regime: data.newRegime },
                                ].map(({ key, label, regime }) => {
                                    if (!regime) return null;
                                    const isRecommended = data.recommendedRegime === (key === 'oldRegime' ? 'old' : 'new');
                                    return (
                                        <div key={key} style={{
                                            background: 'var(--bg-secondary)',
                                            border: `1px solid ${isRecommended ? 'var(--accent-green-border)' : 'var(--bg-border)'}`,
                                            borderRadius: '16px',
                                            padding: '20px',
                                            position: 'relative',
                                        }}>
                                            {isRecommended && (
                                                <div style={{ position: 'absolute', top: '-10px', right: '16px', background: 'var(--accent-green)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 10px', borderRadius: '10px' }}>
                                                    RECOMMENDED
                                                </div>
                                            )}
                                            <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>{label}</h3>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {[
                                                    { label: 'Standard Deduction', value: formatCurrency(regime.standardDeduction || 0, user.currency), color: 'var(--accent-green)' },
                                                    ...(regime.deduction80C ? [{ label: '80C Deductions', value: formatCurrency(regime.deduction80C, user.currency), color: 'var(--accent-green)' }] : []),
                                                    { label: 'Taxable Income', value: formatCurrency(regime.taxableIncome || 0, user.currency), color: 'var(--text-primary)' },
                                                    { label: 'Income Tax', value: formatCurrency(regime.tax || 0, user.currency), color: 'var(--accent-red)' },
                                                    { label: 'Cess (4%)', value: formatCurrency(regime.cess || 0, user.currency), color: 'var(--accent-yellow)' },
                                                    { label: 'Total Liability', value: formatCurrency(regime.total || 0, user.currency), color: scoreColor(regime.total || 0) },
                                                ].map(row => (
                                                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '6px', borderBottom: '1px solid var(--bg-border)' }}>
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{row.label}</span>
                                                        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.875rem', fontWeight: 600, color: row.color }}>{row.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Slab Breakdown */}
                            {data.breakdown?.length > 0 && (
                                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px 0' }}>Tax Slab Breakdown</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {data.breakdown.map((slab: any, i: number) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                                                <div>
                                                    <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', margin: '0 0 2px 0', fontWeight: 500 }}>{slab.slab}</p>
                                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0 }}>{slab.rate}</p>
                                                </div>
                                                <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.875rem', fontWeight: 600, color: slab.tax > 0 ? 'var(--accent-red)' : 'var(--accent-green)', margin: 0 }}>
                                                    {slab.tax > 0 ? formatCurrency(slab.tax, user.currency) : 'Nil'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Tips */}
                            {data.tips?.length > 0 && (
                                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px 0' }}>💡 Tax Saving Tips</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {data.tips.map((tip: string, i: number) => (
                                            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                <span style={{ color: 'var(--accent-blue)', fontSize: '0.9rem', flexShrink: 0, marginTop: '1px' }}>•</span>
                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tip}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Disclaimer */}
                    <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '10px', padding: '12px 16px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        ⚠️ {data.disclaimer || 'This is an estimate only. Consult a Chartered Accountant for accurate tax filing.'}
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
