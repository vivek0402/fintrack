'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { transactionsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Camera, ChevronDown } from 'lucide-react';

const FULL_MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const fmt = (n: number) => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

function useCountUp(target: number, duration = 1400, enabled = true) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!enabled || target === 0) { setVal(target); return; }
        let cur = 0;
        const step = target / (duration / 16);
        const t = setInterval(() => {
            cur = Math.min(cur + step, target);
            setVal(Math.floor(cur));
            if (cur >= target) clearInterval(t);
        }, 16);
        return () => clearInterval(t);
    }, [target, duration, enabled]);
    return val;
}

export default function YearReviewPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const cardRef = useRef<HTMLDivElement>(null);

    const now = new Date();
    const cy  = now.getFullYear();

    const [selectedYear, setSelectedYear]   = useState(cy - 1);
    const [allTxs, setAllTxs]               = useState<any[]>([]);
    const [loading, setLoading]             = useState(true);
    const [personality, setPersonality]     = useState('');
    const [screenshotMsg, setScreenshotMsg] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        transactionsAPI.getAll()
            .then(res => setAllTxs(res.data.transactions ?? []))
            .catch(() => {})
            .finally(() => setLoading(false));
        // Try to read cached personality label
        try {
            const raw = localStorage.getItem('fintrack-personality') ?? localStorage.getItem('fintrack-personality-label');
            if (raw) {
                const parsed = JSON.parse(raw);
                setPersonality(typeof parsed === 'string' ? parsed : (parsed?.label ?? parsed?.personality_type ?? ''));
            }
        } catch {}
    }, [user]);

    const yearTxs = useMemo(() =>
        allTxs.filter(t => {
            const y = new Date((t.date ?? '').split('T')[0] + 'T00:00:00').getFullYear();
            return y === selectedYear;
        }), [allTxs, selectedYear]);

    const stats = useMemo(() => {
        if (!yearTxs.length) return null;
        const expenses = yearTxs.filter(t => t.type === 'expense');
        const income   = yearTxs.filter(t => t.type === 'income');

        const catMap: Record<string, number> = {};
        expenses.forEach(t => {
            const k = t.category_name ?? t.category ?? 'Other';
            catMap[k] = (catMap[k] ?? 0) + parseFloat(t.amount ?? 0);
        });
        const topCatEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

        const mMap: Record<number, { exp: number; inc: number }> = {};
        for (let m = 1; m <= 12; m++) mMap[m] = { exp: 0, inc: 0 };
        yearTxs.forEach(t => {
            const m = new Date((t.date ?? '').split('T')[0] + 'T00:00:00').getMonth() + 1;
            const a = parseFloat(t.amount ?? 0);
            if (t.type === 'expense') mMap[m].exp += a;
            else mMap[m].inc += a;
        });

        const worstMonth = Object.entries(mMap)
            .filter(([, v]) => v.exp > 0)
            .sort((a, b) => b[1].exp - a[1].exp)[0];

        const bestSavingsMonth = Object.entries(mMap)
            .filter(([, v]) => v.inc > v.exp && v.inc > 0)
            .sort((a, b) => (b[1].inc - b[1].exp) - (a[1].inc - a[1].exp))[0];

        const totalExp = expenses.reduce((s, t) => s + parseFloat(t.amount ?? 0), 0);
        const totalInc = income.reduce((s, t) => s + parseFloat(t.amount ?? 0), 0);
        const saved    = Math.max(totalInc - totalExp, 0);
        const rate     = totalInc > 0 ? Math.round((saved / totalInc) * 100) : 0;

        return {
            count: yearTxs.length, totalExp, totalInc, saved, rate,
            topCategory: topCatEntry ? { name: topCatEntry[0], amount: topCatEntry[1] } : null,
            worstMonth:  worstMonth  ? { m: parseInt(worstMonth[0]),  exp:  worstMonth[1].exp  } : null,
            bestSavings: bestSavingsMonth ? { m: parseInt(bestSavingsMonth[0]), savings: bestSavingsMonth[1].inc - bestSavingsMonth[1].exp } : null,
        };
    }, [yearTxs]);

    const animCount = useCountUp(stats?.count ?? 0, 1400, !!stats);

    const handleScreenshot = () => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { setScreenshotMsg(true); setTimeout(() => setScreenshotMsg(false), 3000); }, 350);
    };

    const sCard: React.CSSProperties = { background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: 0 };

    if (isLoading || !user) return <AppLayout><SkeletonCard height={400} /></AppLayout>;

    return (
        <AppLayout>
            {screenshotMsg && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: 'var(--bg-surface-3)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 20px', fontSize: '14px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', whiteSpace: 'nowrap' }}>
                    Take a screenshot of the summary card to share your year! 📸
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* Header */}
                <div style={sCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Year in Review 🎉</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Your complete financial story for {selectedYear}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {[cy - 2, cy - 1, cy].map(y => (
                                <button key={y} type="button" onClick={() => setSelectedYear(y)}
                                    style={{ padding: '6px 12px', borderRadius: '999px', border: `1px solid ${selectedYear === y ? 'var(--accent)' : 'var(--border-subtle)'}`, background: selectedYear === y ? 'var(--accent)' : 'var(--bg-surface-2)', color: selectedYear === y ? 'white' : 'var(--text-muted)', fontSize: '13px', fontWeight: selectedYear === y ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all var(--transition-fast)' }}>
                                    {y}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {loading ? (
                    <><SkeletonCard height={200} /><SkeletonCard height={200} /></>
                ) : !stats ? (
                    <div style={{ ...sCard, textAlign: 'center', padding: '48px 24px' }}>
                        <p style={{ fontSize: '40px', margin: '0 0 12px' }}>📊</p>
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>No data for {selectedYear}</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Add transactions for this year to see your review.</p>
                    </div>
                ) : (
                    <>
                        {/* Big animated count */}
                        <div style={{ ...sCard, textAlign: 'center', padding: '36px 24px', background: 'var(--bg-surface-1)' }}>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(48px, 12vw, 72px)', fontWeight: 800, color: 'var(--accent)', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                                {animCount.toLocaleString('en-IN')}
                            </p>
                            <p style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>transactions in {selectedYear}</p>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', margin: 0 }}>Every rupee tracked — great financial discipline!</p>
                        </div>

                        {/* 4-stat grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            {[
                                { emoji: '💰', label: 'Total Income',   value: fmt(stats.totalInc), color: 'var(--color-inc)' },
                                { emoji: '💸', label: 'Total Spent',    value: fmt(stats.totalExp), color: 'var(--color-exp)' },
                                { emoji: '🏦', label: 'Total Saved',    value: fmt(stats.saved),    color: 'var(--accent)'    },
                                { emoji: '📈', label: 'Savings Rate',   value: `${stats.rate}%`,    color: 'var(--accent)'    },
                            ].map(s => (
                                <div key={s.label} style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
                                    <div style={{ fontSize: 22, marginBottom: 6 }}>{s.emoji}</div>
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>{s.label}</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700, color: s.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Highlights */}
                        <div style={sCard}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Highlights</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {stats.topCategory && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-exp)' }}>
                                        <span style={{ fontSize: 24, flexShrink: 0 }}>🏆</span>
                                        <div>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Top Spending Category</p>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', margin: 0 }}>
                                                Your #1 category was <strong>{stats.topCategory.name}</strong> — {fmt(stats.topCategory.amount)} all year
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {stats.worstMonth && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-warn)' }}>
                                        <span style={{ fontSize: 24, flexShrink: 0 }}>📅</span>
                                        <div>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Most Expensive Month</p>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', margin: 0 }}>
                                                <strong>{FULL_MONTHS[stats.worstMonth.m]}</strong> — you spent {fmt(stats.worstMonth.exp)}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {stats.bestSavings && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-inc)' }}>
                                        <span style={{ fontSize: 24, flexShrink: 0 }}>🌟</span>
                                        <div>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Best Savings Month</p>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', margin: 0 }}>
                                                <strong>{FULL_MONTHS[stats.bestSavings.m]}</strong> — saved {fmt(stats.bestSavings.savings)}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {personality && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--accent)' }}>
                                        <span style={{ fontSize: 24, flexShrink: 0 }}>🧠</span>
                                        <div>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Your Money Personality</p>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', margin: 0 }}>{personality}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Shareable card */}
                        <div style={sCard}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Share Your Story</h2>

                            <div ref={cardRef} style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent) 100%)', borderRadius: 'var(--radius-xl)', padding: '28px 24px', color: 'white', marginBottom: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                    <div>
                                        <p style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, margin: '0 0 2px', letterSpacing: '-0.01em' }}>FinTrack {selectedYear}</p>
                                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', opacity: 0.8, margin: 0 }}>Year in Review</p>
                                    </div>
                                    <span style={{ fontSize: 32 }}>🎯</span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: stats.bestSavings ? '12px' : 0 }}>
                                    {[
                                        { label: 'Transactions',      value: stats.count.toLocaleString('en-IN') },
                                        { label: 'Total Saved',       value: fmt(stats.saved) },
                                        { label: 'Biggest Category',  value: stats.topCategory?.name ?? '—' },
                                        { label: 'Savings Rate',      value: `${stats.rate}%` },
                                    ].map(s => (
                                        <div key={s.label} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 'var(--radius-md)', padding: '10px 14px', backdropFilter: 'blur(4px)' }}>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', opacity: 0.75, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {stats.bestSavings && (
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', opacity: 0.9, margin: 0, textAlign: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
                                        🌟 Best month: {FULL_MONTHS[stats.bestSavings.m]} — saved {fmt(stats.bestSavings.savings)}
                                    </p>
                                )}
                            </div>

                            <button type="button" onClick={handleScreenshot}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 20px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', width: '100%' }}>
                                <Camera size={15} /> Screenshot this card to share
                            </button>
                        </div>
                    </>
                )}
            </div>
        </AppLayout>
    );
}
