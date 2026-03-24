'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, Globe, Target, CheckCircle, ArrowRight, Moon, Sun, Eclipse } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { profileAPI, budgetsAPI, categoriesAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';

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

    const handleThemeNext = (selectedTheme: 'dark' | 'pitch' | 'light') => {
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
            // Update amount in budgets list if this category is already selected
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
            router.push('/dashboard');
        } catch { router.push('/dashboard'); }
        finally { setSaving(false); }
    };

    const skip = () => { localStorage.setItem(`onboarded-${user!.id}`, 'true'); router.push('/dashboard'); };

    if (isLoading || !user) return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '24px', height: '24px', border: '2px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '400px', background: 'radial-gradient(ellipse, rgba(16,185,129,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

            {/* Progress dots */}
            <div style={{ position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px' }}>
                {[0, 1, 2, 3].map(i => <div key={i} style={{ width: i === step ? '24px' : '8px', height: '8px', borderRadius: '4px', background: i <= step ? '#10b981' : 'var(--bg-border)', transition: 'all 0.3s ease' }} />)}
            </div>

            <div style={{ width: '100%', maxWidth: '480px' }}>

                {/* Step 0 — Welcome */}
                {step === 0 && (
                    <div style={{ textAlign: 'center', animation: 'fadeIn 0.4s ease' }}>
                        <div style={{ width: '80px', height: '80px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                            <TrendingUp size={36} color="#10b981" />
                        </div>
                        <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px 0' }}>Welcome to FinTrack! 🎉</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', margin: '0 0 32px 0', lineHeight: 1.6 }}>
                            Hey <strong style={{ color: '#10b981' }}>{user.full_name.split(' ')[0]}</strong>! Let's get you set up in 2 minutes.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px', textAlign: 'left' }}>
                            {[
                                { icon: '💰', text: 'Track income and expenses effortlessly' },
                                { icon: '📊', text: 'Visualize spending with beautiful charts' },
                                { icon: '🎯', text: 'Set budgets and savings goals' },
                                { icon: '📅', text: 'Calendar view of all transactions' },
                            ].map(item => (
                                <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '12px' }}>
                                    <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{item.text}</span>
                                </div>
                            ))}
                        </div>
                        <Button onClick={() => setStep(1)} size="lg" style={{ width: '100%' }}>Let's Get Started <ArrowRight size={16} /></Button>
                        <button onClick={skip} style={{ marginTop: '12px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', display: 'block', width: '100%' }}>Skip → go to dashboard</button>
                    </div>
                )}

                {/* Step 1 — Currency */}
                {step === 1 && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                            <div style={{ width: '56px', height: '56px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <Globe size={24} color="#3b82f6" />
                            </div>
                            <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>Choose Your Currency</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>All amounts will be shown in this currency</p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' }}>
                            {CURRENCIES.map(c => (
                                <button key={c.code} onClick={() => setCurrency(c.code)}
                                    style={{ padding: '14px 16px', borderRadius: '12px', border: currency === c.code ? '2px solid #10b981' : '1px solid var(--bg-border)', background: currency === c.code ? 'rgba(16,185,129,0.08)' : 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: currency === c.code ? '#10b981' : 'var(--text-primary)', margin: '0 0 2px 0' }}>{c.symbol}</p>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>{c.code} · {c.label}</p>
                                        </div>
                                        {currency === c.code && <CheckCircle size={16} color="#10b981" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <Button onClick={handleCurrencyNext} isLoading={saving} size="lg" style={{ width: '100%' }}>Continue <ArrowRight size={16} /></Button>
                    </div>
                )}

                {/* Step 2 — Theme */}
                {step === 2 && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                            <div style={{ width: '56px', height: '56px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <Moon size={24} color="#8b5cf6" />
                            </div>
                            <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>Choose Your Theme</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Pick how FinTrack looks. You can change this anytime in Settings.</p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                            {[
                                {
                                    value: 'dark' as const,
                                    label: 'Dark',
                                    desc: 'Deep navy — easy on the eyes',
                                    icon: <Moon size={22} color="#8b5cf6" />,
                                    bg: '#0a0f1e',
                                    accent: '#0f1629',
                                    recommended: true,
                                },
                                {
                                    value: 'pitch' as const,
                                    label: 'Pitch Dark',
                                    desc: 'Pure black — great for AMOLED screens',
                                    icon: <Eclipse size={22} color="#6366f1" />,
                                    bg: '#000000',
                                    accent: '#111111',
                                    recommended: false,
                                },
                                {
                                    value: 'light' as const,
                                    label: 'Light',
                                    desc: 'Clean white — bright and minimal',
                                    icon: <Sun size={22} color="#f59e0b" />,
                                    bg: '#f0f4f8',
                                    accent: '#ffffff',
                                    recommended: false,
                                },
                            ].map(t => (
                                <button
                                    key={t.value}
                                    onClick={() => handleThemeNext(t.value)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '16px',
                                        padding: '16px 20px', borderRadius: '14px', textAlign: 'left',
                                        border: '1px solid var(--bg-border)',
                                        background: 'var(--bg-secondary)',
                                        cursor: 'pointer', transition: 'all 0.2s', width: '100%',
                                    }}
                                    onMouseEnter={e => {
                                        (e.currentTarget as HTMLElement).style.borderColor = '#10b981';
                                        (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.05)';
                                    }}
                                    onMouseLeave={e => {
                                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)';
                                        (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)';
                                    }}
                                >
                                    {/* Theme preview swatch */}
                                    <div style={{
                                        width: '52px', height: '52px', borderRadius: '12px',
                                        background: t.bg, flexShrink: 0, overflow: 'hidden',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        display: 'flex', flexDirection: 'column',
                                        padding: '6px', gap: '4px',
                                    }}>
                                        <div style={{ width: '100%', height: '10px', borderRadius: '3px', background: t.accent }} />
                                        <div style={{ width: '70%', height: '6px', borderRadius: '3px', background: t.accent }} />
                                        <div style={{ width: '100%', height: '14px', borderRadius: '3px', background: '#10b981', opacity: 0.8 }} />
                                    </div>

                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {t.label}
                                            </span>
                                            {t.recommended && (
                                                <span style={{ fontSize: '0.65rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>
                                                    Default
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '3px 0 0 0' }}>{t.desc}</p>
                                    </div>

                                    <ArrowRight size={16} color="var(--text-muted)" />
                                </button>
                            ))}
                        </div>

                        <button onClick={() => setStep(3)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center' }}>
                            Skip — keep Dark theme
                        </button>
                    </div>
                )}

                {/* Step 3 — Budgets */}
                {step === 3 && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <div style={{ width: '56px', height: '56px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <Target size={24} color="#f59e0b" />
                            </div>
                            <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>Set Monthly Budgets</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Select categories to set budgets for. You can change these anytime.</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                            {POPULAR_BUDGETS.map(budget => {
                                const cat = categories.find(c => c.name === budget.name);
                                const selected = budgets.some(b => b.name === budget.name);
                                const isEditing = editingBudget === budget.name;
                                if (!cat) return null;
                                return (
                                    <div key={budget.name}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '12px', border: selected ? `1px solid ${budget.color}60` : '1px solid var(--bg-border)', background: selected ? `${budget.color}10` : 'var(--bg-secondary)', transition: 'all 0.15s' }}>
                                        {/* Left: dot + name — clicking toggles selection */}
                                        <div onClick={() => toggleBudget(budget.name)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}>
                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: budget.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>{budget.name}</span>
                                        </div>
                                        {/* Right: editable amount + circle toggle */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {isEditing ? (
                                                <input
                                                    autoFocus
                                                    type="number"
                                                    min="1"
                                                    value={editingValue}
                                                    onChange={e => setEditingValue(e.target.value)}
                                                    onBlur={() => commitEdit(budget.name)}
                                                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(budget.name); if (e.key === 'Escape') setEditingBudget(null); }}
                                                    style={{ width: '80px', padding: '2px 6px', fontSize: '0.8rem', fontFamily: 'Sora, sans-serif', color: 'var(--text-primary)', background: 'var(--bg-primary)', border: '1px solid #10b981', borderRadius: '6px', outline: 'none', textAlign: 'right' }}
                                                />
                                            ) : (
                                                <span
                                                    onClick={() => startEditing(budget.name)}
                                                    title="Click to edit"
                                                    style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'Sora, sans-serif', cursor: 'text', borderBottom: '1px dashed var(--bg-border)', paddingBottom: '1px' }}>
                                                    ₹{amounts[budget.name].toLocaleString('en-IN')}/mo
                                                </span>
                                            )}
                                            <div onClick={() => toggleBudget(budget.name)}
                                                style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${selected ? budget.color : 'var(--bg-border)'}`, background: selected ? budget.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                                {selected && <CheckCircle size={12} color="#fff" />}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <Button onClick={handleFinish} isLoading={saving} size="lg" style={{ width: '100%' }}>
                            {budgets.length > 0 ? `Set ${budgets.length} Budget${budgets.length > 1 ? 's' : ''} & Finish` : 'Skip & Go to Dashboard'}
                            <ArrowRight size={16} />
                        </Button>
                        <button onClick={skip} style={{ marginTop: '12px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', display: 'block', width: '100%' }}>Skip for now</button>
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