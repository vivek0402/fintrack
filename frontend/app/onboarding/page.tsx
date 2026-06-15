'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowRight, Moon, Sun, User, DollarSign, PieChart } from 'lucide-react';
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
    { name: 'Food',          amount: 5000 },
    { name: 'Transport',     amount: 2000 },
    { name: 'Shopping',      amount: 3000 },
    { name: 'Subscriptions', amount: 1000 },
    { name: 'Health',        amount: 2000 },
    { name: 'Utilities',     amount: 1500 },
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

    const startEditing = (name: string) => { setEditingBudget(name); setEditingValue(String(amounts[name])); };
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
            const year  = new Date().getFullYear();
            for (const b of budgets) await budgetsAPI.create({ category_id: b.category_id, amount: b.amount, month, year });
            localStorage.setItem(`onboarded-${user!.id}`, 'true');
            localStorage.setItem('fintrack-v3-seen', '1');
            if (user?.id) localStorage.setItem(`fintrack-show-tour-${user.id}`, 'true');
            router.push('/dashboard');
        } catch { router.push('/dashboard'); }
        finally { setSaving(false); }
    };

    const skip = () => {
        localStorage.setItem(`onboarded-${user!.id}`, 'true');
        localStorage.setItem('fintrack-v3-seen', '1');
        router.push('/dashboard');
    };

    // Steps: 0=welcome, 1=currency, 2=theme, 3=budgets
    const TOTAL_STEPS = 4;

    const linkBtn: React.CSSProperties = {
        background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 'var(--text-caption)',
        cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', marginTop: 'var(--space-3)',
    };

    if (isLoading || !user) return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '24px', height: '24px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
            <div style={{ width: '100%', maxWidth: '440px', background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)', padding: 'var(--space-8) var(--space-7)' }}>

                {/* Progress dots */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: 'var(--space-6)' }}>
                    {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                        <div key={i} style={{ width: i === step ? '20px' : '6px', height: '6px', borderRadius: '3px', background: i === step ? 'var(--accent)' : i < step ? 'var(--color-inc)' : 'var(--border-visible)', transition: 'all 0.3s ease' }} />
                    ))}
                </div>

                {/* ── Step 0: Welcome ── */}
                {step === 0 && (
                    <div className="page-enter">
                        <div style={{ width: '52px', height: '52px', borderRadius: 'var(--radius-md)', margin: '0 auto var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-subtle)' }}>
                            <User size={24} color="var(--accent)" />
                        </div>
                        <p style={{ fontSize: 'var(--text-h1)', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', textAlign: 'center', marginBottom: 'var(--space-1)' }}>Welcome to FinTrack!</p>
                        <p style={{ fontSize: 'var(--text-body)', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 var(--space-5)' }}>
                            Hey <strong style={{ color: 'var(--accent)' }}>{user.full_name.split(' ')[0]}</strong>! Let's get you set up in 2 minutes.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
                            {[
                                { icon: '💰', text: 'Track income and expenses effortlessly' },
                                { icon: '📊', text: 'Visualize spending with beautiful charts' },
                                { icon: '🎯', text: 'Set budgets and savings goals' },
                                { icon: '🤖', text: 'AI-powered financial insights' },
                            ].map(item => (
                                <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-3)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                                    <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                                    <span style={{ fontSize: 'var(--text-body)', color: 'var(--text-secondary)' }}>{item.text}</span>
                                </div>
                            ))}
                        </div>
                        <Button size="lg" style={{ width: '100%' }} onClick={() => setStep(1)}>Let's Get Started <ArrowRight size={16} /></Button>
                        <button type="button" onClick={skip} style={linkBtn}>Skip → go to dashboard</button>
                    </div>
                )}

                {/* ── Step 1: Currency ── */}
                {step === 1 && (
                    <div className="page-enter">
                        <div style={{ width: '52px', height: '52px', borderRadius: 'var(--radius-md)', margin: '0 auto var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-subtle)' }}>
                            <DollarSign size={24} color="var(--accent)" />
                        </div>
                        <p style={{ fontSize: 'var(--text-h1)', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', textAlign: 'center', marginBottom: 'var(--space-1)' }}>Choose Your Currency</p>
                        <p style={{ fontSize: 'var(--text-body)', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 var(--space-5)' }}>All amounts will be shown in this currency</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
                            {CURRENCIES.map(c => (
                                <button key={c.code} type="button" onClick={() => setCurrency(c.code)}
                                    style={{ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: currency === c.code ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)', background: currency === c.code ? 'var(--accent-subtle)' : 'var(--bg-surface-2)', cursor: 'pointer', textAlign: 'left', transition: 'all var(--transition-fast)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: currency === c.code ? 'var(--accent)' : 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'var(--font-display)' }}>{c.symbol}</p>
                                            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--text-muted)', margin: 0 }}>{c.code} · {c.label}</p>
                                        </div>
                                        {currency === c.code && <CheckCircle size={16} color="var(--accent)" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <Button size="lg" style={{ width: '100%' }} isLoading={saving} onClick={handleCurrencyNext}>
                            <span>Continue</span> <ArrowRight size={16} />
                        </Button>
                        <button type="button" onClick={() => setStep(0)} style={linkBtn}>← Back</button>
                    </div>
                )}

                {/* ── Step 2: Theme ── */}
                {step === 2 && (
                    <div className="page-enter">
                        <div style={{ width: '52px', height: '52px', borderRadius: 'var(--radius-md)', margin: '0 auto var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-subtle)' }}>
                            <Moon size={24} color="var(--accent)" />
                        </div>
                        <p style={{ fontSize: 'var(--text-h1)', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', textAlign: 'center', marginBottom: 'var(--space-1)' }}>Choose Your Theme</p>
                        <p style={{ fontSize: 'var(--text-body)', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 var(--space-5)' }}>Pick how FinTrack looks. Change anytime in Settings.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
                            {[
                                { value: 'dark' as const,  label: 'Dark',  desc: 'AMOLED black — recommended', icon: <Moon size={22} color="var(--accent)" />, bg: '#000', card: '#1a1a1a' },
                                { value: 'light' as const, label: 'Light', desc: 'Clean & bright', icon: <Sun size={22} color="var(--color-warn)" />, bg: '#f8f8f8', card: '#ffffff' },
                            ].map(t => (
                                <button key={t.value} type="button" onClick={() => handleThemeNext(t.value)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', textAlign: 'left', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface-2)', cursor: 'pointer', transition: 'all var(--transition-fast)', width: '100%' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)'; (e.currentTarget as HTMLElement).style.background = 'var(--accent-subtle)'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-2)'; }}>
                                    <div style={{ width: '52px', height: '52px', borderRadius: 'var(--radius-md)', background: t.bg, flexShrink: 0, overflow: 'hidden', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', padding: '6px', gap: '4px' }}>
                                        <div style={{ width: '100%', height: '10px', borderRadius: '3px', background: t.card }} />
                                        <div style={{ width: '70%', height: '6px', borderRadius: '3px', background: t.card }} />
                                        <div style={{ width: '100%', height: '14px', borderRadius: '3px', background: 'var(--accent)', opacity: 0.8 }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'var(--font-display)' }}>{t.label}</p>
                                        <p style={{ fontSize: 'var(--text-caption)', color: 'var(--text-muted)', margin: 0 }}>{t.desc}</p>
                                    </div>
                                    {t.icon}
                                    <ArrowRight size={16} color="var(--text-muted)" />
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={() => { setTheme('dark'); setStep(3); }} style={linkBtn}>Skip — keep Dark theme</button>
                    </div>
                )}

                {/* ── Step 3: Budgets ── */}
                {step === 3 && (
                    <div className="page-enter">
                        <div style={{ width: '52px', height: '52px', borderRadius: 'var(--radius-md)', margin: '0 auto var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-subtle)' }}>
                            <PieChart size={24} color="var(--accent)" />
                        </div>
                        <p style={{ fontSize: 'var(--text-h1)', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', textAlign: 'center', marginBottom: 'var(--space-1)' }}>Set Monthly Budgets</p>
                        <p style={{ fontSize: 'var(--text-body)', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 var(--space-5)' }}>Select categories. You can change these anytime.</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
                            {POPULAR_BUDGETS.map(budget => {
                                const cat      = categories.find(c => c.name === budget.name);
                                const selected = budgets.some(b => b.name === budget.name);
                                const isEditing = editingBudget === budget.name;
                                if (!cat) return null;
                                return (
                                    <div key={budget.name}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: selected ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)', background: selected ? 'var(--accent-subtle)' : 'var(--bg-surface-2)', transition: 'all var(--transition-fast)' }}>
                                        <div onClick={() => toggleBudget(budget.name)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer', flex: 1 }}>
                                            <span style={{ fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--text-primary)' }}>{budget.name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                            {isEditing ? (
                                                <div style={{ position: 'relative' }}>
                                                    <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '14px', pointerEvents: 'none' }}>₹</span>
                                                    <input autoFocus type="number" min="1" value={editingValue}
                                                        onChange={e => setEditingValue(e.target.value)}
                                                        onBlur={() => commitEdit(budget.name)}
                                                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(budget.name); if (e.key === 'Escape') setEditingBudget(null); }}
                                                        style={{ width: '90px', padding: '4px 6px 4px 22px', fontSize: 'var(--text-caption)', color: 'var(--text-primary)', background: 'var(--bg-surface-3)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)', outline: 'none', textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
                                                </div>
                                            ) : (
                                                <span onClick={() => startEditing(budget.name)} title="Click to edit"
                                                    style={{ fontSize: 'var(--text-caption)', color: 'var(--text-muted)', cursor: 'text', borderBottom: '1px dashed var(--border-visible)', paddingBottom: '1px', fontFamily: 'var(--font-mono)' }}>
                                                    ₹{amounts[budget.name].toLocaleString('en-IN')}/mo
                                                </span>
                                            )}
                                            <div onClick={() => toggleBudget(budget.name)}
                                                style={{ width: '10px', height: '10px', borderRadius: '50%', background: selected ? 'var(--accent)' : 'var(--border-visible)', cursor: 'pointer', flexShrink: 0, transition: 'all var(--transition-fast)' }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <Button size="lg" style={{ width: '100%' }} isLoading={saving} onClick={handleFinish}>
                            <span>{budgets.length > 0 ? `Set ${budgets.length} Budget${budgets.length > 1 ? 's' : ''} & Finish` : 'Skip & Go to Dashboard'}</span> <ArrowRight size={16} />
                        </Button>
                        <button type="button" onClick={skip} style={linkBtn}>Skip for now</button>
                    </div>
                )}
            </div>
        </div>
    );
}
