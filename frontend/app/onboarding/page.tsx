'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Target, CheckCircle, ArrowRight, Moon, Sun, User, DollarSign, PieChart } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { profileAPI, budgetsAPI, categoriesAPI } from '@/lib/api';

const CURRENCIES = [
    { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
    { code: 'USD', symbol: '$', label: 'US Dollar' },
    { code: 'EUR', symbol: '€', label: 'Euro' },
    { code: 'GBP', symbol: '£', label: 'British Pound' },
    { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham' },
    { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
];

const POPULAR_BUDGETS = [
    { name: 'Food', amount: 5000, color: '#FF6B6B' },
    { name: 'Transport', amount: 2000, color: '#45B7D1' },
    { name: 'Shopping', amount: 3000, color: '#96CEB4' },
    { name: 'Subscriptions', amount: 1000, color: '#FFEAA7' },
    { name: 'Health', amount: 2000, color: '#F7DC6F' },
    { name: 'Utilities', amount: 1500, color: '#DDA0DD' },
];

export default function OnboardingPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage, setAuth, token } = useAuthStore();
    const [step, setStep] = useState(0);
    const [currency, setCurrency] = useState('INR');
    const [categories, setCategories] = useState<any[]>([]);
    const [budgets, setBudgets] = useState<{ category_id: string; amount: number; name: string }[]>([]);
    const [saving, setSaving] = useState(false);
    const { setTheme } = useThemeStore();
    const [amounts, setAmounts] = useState<Record<string, number>>(
        Object.fromEntries(POPULAR_BUDGETS.map(b => [b.name, b.amount]))
    );
    const [editingBudget, setEditingBudget] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        if (localStorage.getItem(`onboarded-${user.id}`)) { router.push('/dashboard'); return; }
        categoriesAPI.getAll().then(res => setCategories(res.data.categories));
    }, [user]);

    const handleCurrencyNext = async () => {
        setSaving(true);
        try {
            if (currency !== user?.currency) {
                const res = await profileAPI.update({ full_name: user!.full_name, email: user!.email, currency });
                if (token) setAuth(res.data.user, token);
            }
            setStep(2);
        } catch { setStep(2); }
        finally { setSaving(false); }
    };

    const handleThemeNext = (selectedTheme: 'dark' | 'light') => {
        setTheme(selectedTheme);
        setStep(3);
    };

    const toggleBudget = (name: string) => {
        const cat = categories.find(c => c.name === name);
        if (!cat) return;
        const exists = budgets.find(b => b.category_id === cat.id);
        if (exists) setBudgets(budgets.filter(b => b.category_id !== cat.id));
        else setBudgets([...budgets, { category_id: cat.id, amount: amounts[name], name }]);
    };

    const startEditing = (name: string) => {
        setEditingBudget(name);
        setEditingValue(String(amounts[name]));
    };

    const commitEdit = (name: string) => {
        const parsed = parseFloat(editingValue);
        if (!isNaN(parsed) && parsed > 0) {
            const newAmount = Math.floor(parsed);
            setAmounts(prev => ({ ...prev, [name]: newAmount }));
            setBudgets(prev => prev.map(b => b.name === name ? { ...b, amount: newAmount } : b));
        }
        setEditingBudget(null);
    };

    const handleFinish = async () => {
        setSaving(true);
        try {
            const month = new Date().getMonth() + 1;
            const year = new Date().getFullYear();
            for (const b of budgets) await budgetsAPI.create({ category_id: b.category_id, amount: b.amount, month, year });
            localStorage.setItem(`onboarded-${user!.id}`, 'true');
            if (user?.id) {
                localStorage.setItem(`fintrack-show-tour-${user.id}`, 'true');
            }
            router.push('/dashboard');
        } catch { router.push('/dashboard'); }
        finally { setSaving(false); }
    };

    const skip = () => { localStorage.setItem(`onboarded-${user!.id}`, 'true'); router.push('/dashboard'); };

    const TOTAL_STEPS = 4;

    const btnStyle: React.CSSProperties = {
        background: 'var(--accent-blue)',
        color: 'white',
        border: 'none',
        borderRadius: 10,
        padding: 12,
        fontSize: 14,
        fontWeight: 600,
        width: '100%',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    };

    if (isLoading || !user) return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#060b18 0%,#0a0f1e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '24px', height: '24px', border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#060b18 0%,#0a0f1e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'DM Sans, sans-serif', position: 'relative', overflow: 'hidden' }}>
            {/* Ambient glows */}
            <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 250, height: 250, background: 'radial-gradient(circle,rgba(59,130,246,0.11),transparent 65%)', borderRadius: '50%', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -50, left: -30, width: 180, height: 180, background: 'radial-gradient(circle,rgba(16,185,129,0.08),transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

            <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 440, background: 'rgba(12,18,36,0.95)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '32px 28px' }}>

                {/* Progress indicator */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
                    {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                        <div key={i} style={{
                            width: i === step ? 20 : 6,
                            height: 6,
                            borderRadius: 3,
                            background: i === step ? '#3b82f6' : i < step ? '#10b981' : '#1e2d4a',
                            boxShadow: i === step ? '0 0 8px rgba(59,130,246,0.4)' : 'none',
                            transition: 'all 0.3s ease',
                        }} />
                    ))}
                </div>

                {/* Step 0 — Welcome */}
                {step === 0 && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        {/* Step icon */}
                        <div style={{ width: 52, height: 52, borderRadius: 15, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(59,130,246,0.12)' }}>
                            <User size={24} color="#3b82f6" />
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", textAlign: 'center', marginBottom: 6 }}>Welcome to FinTrack!</div>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20, lineHeight: 1.6, margin: '0 0 20px 0' }}>
                            Hey <strong style={{ color: 'var(--accent-blue)' }}>{user.full_name.split(' ')[0]}</strong>! Let&apos;s get you set up in 2 minutes.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
                            {[
                                { icon: '💰', text: 'Track income and expenses effortlessly' },
                                { icon: '📊', text: 'Visualize spending with beautiful charts' },
                                { icon: '🎯', text: 'Set budgets and savings goals' },
                                { icon: '📅', text: 'Calendar view of all transactions' },
                            ].map(item => (
                                <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: '12px' }}>
                                    <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{item.text}</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setStep(1)} style={btnStyle}>
                            Let&apos;s Get Started <ArrowRight size={16} />
                        </button>
                        <button onClick={skip} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', marginTop: 10 }}>
                            Skip → go to dashboard
                        </button>
                    </div>
                )}

                {/* Step 1 — Currency */}
                {step === 1 && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        {/* Step icon */}
                        <div style={{ width: 52, height: 52, borderRadius: 15, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.12)' }}>
                            <DollarSign size={24} color="#10b981" />
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", textAlign: 'center', marginBottom: 6 }}>Choose Your Currency</div>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20, lineHeight: 1.6, margin: '0 0 20px 0' }}>All amounts will be shown in this currency</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' }}>
                            {CURRENCIES.map(c => (
                                <button key={c.code} onClick={() => setCurrency(c.code)}
                                    style={{ padding: '14px 16px', borderRadius: '12px', border: currency === c.code ? '1px solid var(--accent-blue-border)' : '1px solid var(--bg-border)', background: currency === c.code ? 'var(--accent-blue-bg)' : 'var(--surface-1)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <p style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: '1.1rem', fontWeight: 700, color: currency === c.code ? '#3b82f6' : '#f0f4ff', margin: '0 0 2px 0' }}>{c.symbol}</p>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>{c.code} · {c.label}</p>
                                        </div>
                                        {currency === c.code && <CheckCircle size={16} color="#3b82f6" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <button onClick={handleCurrencyNext} disabled={saving} style={btnStyle}>
                            {saving
                                ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid white', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                                : <><span>Continue</span> <ArrowRight size={16} /></>
                            }
                        </button>
                        <button onClick={() => setStep(0)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', marginTop: 10 }}>← Back</button>
                    </div>
                )}

                {/* Step 2 — Theme */}
                {step === 2 && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        {/* Step icon */}
                        <div style={{ width: 52, height: 52, borderRadius: 15, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(167,139,250,0.12)' }}>
                            <Moon size={24} color="#a78bfa" />
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", textAlign: 'center', marginBottom: 6 }}>Choose Your Theme</div>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20, lineHeight: 1.6, margin: '0 0 20px 0' }}>Pick how FinTrack looks. You can change this anytime in Settings.</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                            {[
                                {
                                    value: 'dark' as const,
                                    label: 'Dark',
                                    desc: 'AMOLED black',
                                    icon: <Moon size={22} color="#8b5cf6" />,
                                    bg: '#000000',
                                    accent: '#111111',
                                    recommended: true,
                                },
                                {
                                    value: 'light' as const,
                                    label: 'Light',
                                    desc: 'Clean & bright',
                                    icon: <Sun size={22} color="#f59e0b" />,
                                    bg: '#f9fafb',
                                    accent: '#ffffff',
                                    recommended: false,
                                },
                            ].map(t => (
                                <button
                                    key={t.value}
                                    onClick={() => handleThemeNext(t.value)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '14px', textAlign: 'left', border: '1px solid var(--bg-border)', background: 'var(--surface-1)', cursor: 'pointer', transition: 'all 0.2s', width: '100%' }}
                                    onMouseEnter={e => {
                                        (e.currentTarget as HTMLElement).style.borderColor = '#3b82f6';
                                        (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.05)';
                                    }}
                                    onMouseLeave={e => {
                                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)';
                                        (e.currentTarget as HTMLElement).style.background = '#141d35';
                                    }}
                                >
                                    <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: t.bg, flexShrink: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', padding: '6px', gap: '4px' }}>
                                        <div style={{ width: '100%', height: '10px', borderRadius: '3px', background: t.accent }} />
                                        <div style={{ width: '70%', height: '6px', borderRadius: '3px', background: t.accent }} />
                                        <div style={{ width: '100%', height: '14px', borderRadius: '3px', background: '#3b82f6', opacity: 0.8 }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</span>
                                            {t.recommended && (
                                                <span style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>Default</span>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '3px 0 0 0' }}>{t.desc}</p>
                                    </div>
                                    <ArrowRight size={16} color="#4a5568" />
                                </button>
                            ))}
                        </div>

                        <button onClick={() => setStep(3)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center' }}>
                            Skip — keep Dark theme
                        </button>
                    </div>
                )}

                {/* Step 3 — Budgets */}
                {step === 3 && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        {/* Step icon */}
                        <div style={{ width: 52, height: 52, borderRadius: 15, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,158,11,0.12)' }}>
                            <PieChart size={24} color="#f59e0b" />
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", textAlign: 'center', marginBottom: 6 }}>Set Monthly Budgets</div>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20, lineHeight: 1.6, margin: '0 0 20px 0' }}>Select categories to set budgets for. You can change these anytime.</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                            {POPULAR_BUDGETS.map(budget => {
                                const cat = categories.find(c => c.name === budget.name);
                                const selected = budgets.some(b => b.name === budget.name);
                                const isEditing = editingBudget === budget.name;
                                if (!cat) return null;
                                return (
                                    <div key={budget.name}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', border: selected ? '1px solid var(--accent-blue-border)' : '1px solid var(--bg-border)', background: selected ? 'var(--accent-blue-bg)' : 'var(--surface-1)', transition: 'all 0.15s' }}>
                                        <div onClick={() => toggleBudget(budget.name)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: budget.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{budget.name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {isEditing ? (
                                                <div style={{ position: 'relative' }}>
                                                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14, pointerEvents: 'none' }}>₹</span>
                                                    <input
                                                        autoFocus
                                                        type="number"
                                                        min="1"
                                                        value={editingValue}
                                                        onChange={e => setEditingValue(e.target.value)}
                                                        onBlur={() => commitEdit(budget.name)}
                                                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(budget.name); if (e.key === 'Escape') setEditingBudget(null); }}
                                                        style={{ width: '90px', padding: '4px 6px 4px 22px', fontSize: '12px', color: 'var(--text-primary)', background: 'var(--surface-0)', border: '1px solid var(--accent-blue)', borderRadius: '6px', outline: 'none', textAlign: 'right' }}
                                                    />
                                                </div>
                                            ) : (
                                                <span
                                                    onClick={() => startEditing(budget.name)}
                                                    title="Click to edit"
                                                    style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'text', borderBottom: '1px dashed #1e2d4a', paddingBottom: '1px' }}>
                                                    ₹{amounts[budget.name].toLocaleString('en-IN')}/mo
                                                </span>
                                            )}
                                            <div onClick={() => toggleBudget(budget.name)}
                                                style={{ width: 10, height: 10, borderRadius: '50%', background: selected ? 'var(--accent-blue)' : 'var(--bg-border)', boxShadow: selected ? '0 0 8px var(--accent-blue-bg)' : 'none', cursor: 'pointer', flexShrink: 0 }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <button onClick={handleFinish} disabled={saving} style={btnStyle}>
                            {saving
                                ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid white', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                                : <><span>{budgets.length > 0 ? `Set ${budgets.length} Budget${budgets.length > 1 ? 's' : ''} & Finish` : 'Skip & Go to Dashboard'}</span> <ArrowRight size={16} /></>
                            }
                        </button>
                        <button onClick={skip} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', marginTop: 10 }}>Skip for now</button>
                    </div>
                )}
            </div>
            <style>{`
                @keyframes spin   { to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
}
