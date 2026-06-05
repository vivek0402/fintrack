'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Target, CheckCircle, ArrowRight, Moon, Sun, User, DollarSign, PieChart, Palette } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { profileAPI, budgetsAPI, categoriesAPI } from '@/lib/api';
import type { PaletteName } from '@/store/themeStore';

const CURRENCIES = [
    { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
    { code: 'USD', symbol: '$', label: 'US Dollar' },
    { code: 'EUR', symbol: '€', label: 'Euro' },
    { code: 'GBP', symbol: '£', label: 'British Pound' },
    { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham' },
    { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
];

const POPULAR_BUDGETS = [
    { name: 'Food',          amount: 5000, color: '#FF6B6B' },
    { name: 'Transport',     amount: 2000, color: '#45B7D1' },
    { name: 'Shopping',      amount: 3000, color: '#96CEB4' },
    { name: 'Subscriptions', amount: 1000, color: '#FFEAA7' },
    { name: 'Health',        amount: 2000, color: '#F7DC6F' },
    { name: 'Utilities',     amount: 1500, color: '#DDA0DD' },
];

// Palette definitions — hex is data, not a CSS token
const PALETTE_DEFS: { name: PaletteName; color: string; label: string; desc: string }[] = [
    { name: 'ember',  color: '#ea580c', label: 'Ember',  desc: 'Warm orange — energetic' },
    { name: 'ocean',  color: '#0284c7', label: 'Ocean',  desc: 'Sky blue — calm & focused' },
    { name: 'violet', color: '#7c3aed', label: 'Violet', desc: 'Rich purple — bold' },
    { name: 'forest', color: '#059669', label: 'Forest', desc: 'Emerald green — fresh' },
    { name: 'rose',   color: '#e11d48', label: 'Rose',   desc: 'Rose red — vibrant' },
];

export default function OnboardingPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage, setAuth, token } = useAuthStore();
    const [step, setStep] = useState(0);
    const [currency, setCurrency] = useState('INR');
    const [categories, setCategories] = useState<any[]>([]);
    const [budgets, setBudgets] = useState<{ category_id: string; amount: number; name: string }[]>([]);
    const [saving, setSaving] = useState(false);
    const { setTheme, setPalette, palette: currentPalette } = useThemeStore();
    const [selectedPalette, setSelectedPalette] = useState<PaletteName>(currentPalette);
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

    // Apply palette preview live
    useEffect(() => { setPalette(selectedPalette); }, [selectedPalette]);

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
        setStep(3); // → palette step
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
            // New users don't need the redesign announcement
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

    // Steps: 0=welcome, 1=currency, 2=theme, 3=palette, 4=budgets
    const TOTAL_STEPS = 5;

    const btnStyle: React.CSSProperties = {
        background: selectedPalette ? PALETTE_DEFS.find(p => p.name === selectedPalette)?.color || '#6366f1' : '#6366f1',
        color: 'white', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 600, width: '100%',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'opacity 0.15s',
    };
    const linkBtn: React.CSSProperties = {
        background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 12,
        cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', marginTop: 10,
    };
    const accentColor = PALETTE_DEFS.find(p => p.name === selectedPalette)?.color || '#6366f1';

    if (isLoading || !user) return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#060b18 0%,#0a0f1e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '24px', height: '24px', border: `2px solid ${accentColor}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#060b18 0%,#0a0f1e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "var(--font-body)", position: 'relative', overflow: 'hidden' }}>
            {/* Ambient glow — uses selected palette colour */}
            <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 300, height: 300, background: `radial-gradient(circle, ${accentColor}18, transparent 65%)`, borderRadius: '50%', pointerEvents: 'none', transition: 'background 0.4s ease' }} />
            <div style={{ position: 'absolute', bottom: -50, left: -30, width: 200, height: 200, background: `radial-gradient(circle, ${accentColor}0d, transparent 70%)`, borderRadius: '50%', pointerEvents: 'none' }} />

            <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 440, background: 'rgba(12,18,36,0.95)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '32px 28px' }}>

                {/* Progress dots */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
                    {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                        <div key={i} style={{ width: i === step ? 20 : 6, height: 6, borderRadius: 3, background: i === step ? accentColor : i < step ? '#00e5a0' : '#1e2d4a', boxShadow: i === step ? `0 0 8px ${accentColor}60` : 'none', transition: 'all 0.3s ease' }} />
                    ))}
                </div>

                {/* ── Step 0: Welcome ── */}
                {step === 0 && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        <div style={{ width: 52, height: 52, borderRadius: 15, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accentColor}22` }}>
                            <User size={24} color={accentColor} />
                        </div>
                        <p style={{ fontSize: 20, fontWeight: 800, color: 'white', fontFamily: "var(--font-display)", textAlign: 'center', marginBottom: 6 }}>Welcome to FinTrack!</p>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 20px' }}>
                            Hey <strong style={{ color: accentColor }}>{user.full_name.split(' ')[0]}</strong>! Let's get you set up in 2 minutes.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
                            {[
                                { icon: '💰', text: 'Track income and expenses effortlessly' },
                                { icon: '📊', text: 'Visualize spending with beautiful charts' },
                                { icon: '🎯', text: 'Set budgets and savings goals' },
                                { icon: '🤖', text: 'AI-powered financial insights' },
                            ].map(item => (
                                <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px' }}>
                                    <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>{item.text}</span>
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={() => setStep(1)} style={btnStyle}>Let's Get Started <ArrowRight size={16} /></button>
                        <button type="button" onClick={skip} style={linkBtn}>Skip → go to dashboard</button>
                    </div>
                )}

                {/* ── Step 1: Currency ── */}
                {step === 1 && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        <div style={{ width: 52, height: 52, borderRadius: 15, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accentColor}22` }}>
                            <DollarSign size={24} color={accentColor} />
                        </div>
                        <p style={{ fontSize: 20, fontWeight: 800, color: 'white', fontFamily: "var(--font-display)", textAlign: 'center', marginBottom: 6 }}>Choose Your Currency</p>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 20px' }}>All amounts will be shown in this currency</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' }}>
                            {CURRENCIES.map(c => (
                                <button key={c.code} type="button" onClick={() => setCurrency(c.code)}
                                    style={{ padding: '14px 16px', borderRadius: '12px', border: currency === c.code ? `1px solid ${accentColor}60` : '1px solid rgba(255,255,255,0.07)', background: currency === c.code ? `${accentColor}18` : 'rgba(255,255,255,0.03)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: currency === c.code ? accentColor : 'white', margin: '0 0 2px', fontFamily: "var(--font-display)" }}>{c.symbol}</p>
                                            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: 0 }}>{c.code} · {c.label}</p>
                                        </div>
                                        {currency === c.code && <CheckCircle size={16} color={accentColor} />}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={handleCurrencyNext} disabled={saving} style={btnStyle}>
                            {saving ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid white', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} /> : <><span>Continue</span> <ArrowRight size={16} /></>}
                        </button>
                        <button type="button" onClick={() => setStep(0)} style={linkBtn}>← Back</button>
                    </div>
                )}

                {/* ── Step 2: Theme ── */}
                {step === 2 && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        <div style={{ width: 52, height: 52, borderRadius: 15, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accentColor}22` }}>
                            <Moon size={24} color={accentColor} />
                        </div>
                        <p style={{ fontSize: 20, fontWeight: 800, color: 'white', fontFamily: "var(--font-display)", textAlign: 'center', marginBottom: 6 }}>Choose Your Theme</p>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 20px' }}>Pick how FinTrack looks. Change anytime in Settings.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                            {[
                                { value: 'dark' as const,  label: 'Dark',  desc: 'AMOLED black — recommended', icon: <Moon size={22} color={accentColor} />, bg: '#000', accent: '#111' },
                                { value: 'light' as const, label: 'Light', desc: 'Clean & bright', icon: <Sun size={22} color="#f59e0b" />, bg: '#f9fafb', accent: '#fff' },
                            ].map(t => (
                                <button key={t.value} type="button" onClick={() => handleThemeNext(t.value)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '14px', textAlign: 'left', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.2s', width: '100%' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${accentColor}60`; (e.currentTarget as HTMLElement).style.background = `${accentColor}10`; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}>
                                    <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: t.bg, flexShrink: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', padding: '6px', gap: '4px' }}>
                                        <div style={{ width: '100%', height: '10px', borderRadius: '3px', background: t.accent }} />
                                        <div style={{ width: '70%', height: '6px', borderRadius: '3px', background: t.accent }} />
                                        <div style={{ width: '100%', height: '14px', borderRadius: '3px', background: accentColor, opacity: 0.8 }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontSize: '14px', fontWeight: 600, color: 'white', margin: '0 0 3px', fontFamily: "var(--font-head)" }}>{t.label}</p>
                                        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>{t.desc}</p>
                                    </div>
                                    <ArrowRight size={16} color="rgba(255,255,255,0.3)" />
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={() => { setTheme('dark'); setStep(3); }} style={linkBtn}>Skip — keep Dark theme</button>
                    </div>
                )}

                {/* ── Step 3: Palette (NEW) ── */}
                {step === 3 && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        <div style={{ width: 52, height: 52, borderRadius: 15, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accentColor}22`, transition: 'background 0.3s' }}>
                            <Palette size={24} color={accentColor} />
                        </div>
                        <p style={{ fontSize: 20, fontWeight: 800, color: 'white', fontFamily: "var(--font-display)", textAlign: 'center', marginBottom: 6 }}>Choose Your Colour</p>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 24px' }}>
                            Pick an accent colour for your app. This changes buttons, highlights, and the page glow.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
                            {PALETTE_DEFS.map(p => (
                                <button key={p.name} type="button" onClick={() => setSelectedPalette(p.name)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '14px', border: selectedPalette === p.name ? `2px solid ${p.color}80` : '1px solid rgba(255,255,255,0.07)', background: selectedPalette === p.name ? `${p.color}18` : 'rgba(255,255,255,0.03)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', width: '100%' }}>
                                    {/* Colour swatch */}
                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: p.color, flexShrink: 0, boxShadow: selectedPalette === p.name ? `0 0 12px ${p.color}60` : 'none', transition: 'box-shadow 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {selectedPalette === p.name && (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        )}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontSize: '14px', fontWeight: 600, color: selectedPalette === p.name ? p.color : 'white', margin: '0 0 2px', fontFamily: "var(--font-head)", textTransform: 'capitalize' }}>{p.label}</p>
                                        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>{p.desc}</p>
                                    </div>
                                    {/* Mini preview bar */}
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', padding: 5, gap: 3, flexShrink: 0 }}>
                                        <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }} />
                                        <div style={{ width: '70%', height: 4, borderRadius: 2, background: p.color, opacity: 0.9 }} />
                                        <div style={{ width: '100%', height: 8, borderRadius: 2, background: p.color, opacity: 0.3 }} />
                                    </div>
                                </button>
                            ))}
                        </div>

                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: '0 0 16px', fontFamily: "var(--font-body)" }}>
                            The app is updating live as you pick ✨
                        </p>

                        <button type="button" onClick={() => setStep(4)} style={btnStyle}>
                            Continue <ArrowRight size={16} />
                        </button>
                        <button type="button" onClick={() => setStep(2)} style={linkBtn}>← Back</button>
                    </div>
                )}

                {/* ── Step 4: Budgets ── */}
                {step === 4 && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        <div style={{ width: 52, height: 52, borderRadius: 15, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accentColor}22` }}>
                            <PieChart size={24} color={accentColor} />
                        </div>
                        <p style={{ fontSize: 20, fontWeight: 800, color: 'white', fontFamily: "var(--font-display)", textAlign: 'center', marginBottom: 6 }}>Set Monthly Budgets</p>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 20px' }}>Select categories. You can change these anytime.</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                            {POPULAR_BUDGETS.map(budget => {
                                const cat      = categories.find(c => c.name === budget.name);
                                const selected = budgets.some(b => b.name === budget.name);
                                const isEditing = editingBudget === budget.name;
                                if (!cat) return null;
                                return (
                                    <div key={budget.name}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', border: selected ? `1px solid ${accentColor}60` : '1px solid rgba(255,255,255,0.07)', background: selected ? `${accentColor}15` : 'rgba(255,255,255,0.03)', transition: 'all 0.15s' }}>
                                        <div onClick={() => toggleBudget(budget.name)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: budget.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'white' }}>{budget.name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {isEditing ? (
                                                <div style={{ position: 'relative' }}>
                                                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14, pointerEvents: 'none' }}>₹</span>
                                                    <input autoFocus type="number" min="1" value={editingValue}
                                                        onChange={e => setEditingValue(e.target.value)}
                                                        onBlur={() => commitEdit(budget.name)}
                                                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(budget.name); if (e.key === 'Escape') setEditingBudget(null); }}
                                                        style={{ width: '90px', padding: '4px 6px 4px 22px', fontSize: '12px', color: 'white', background: 'rgba(0,0,0,0.4)', border: `1px solid ${accentColor}80`, borderRadius: '6px', outline: 'none', textAlign: 'right', fontFamily: "var(--font-mono)" }} />
                                                </div>
                                            ) : (
                                                <span onClick={() => startEditing(budget.name)} title="Click to edit"
                                                    style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', cursor: 'text', borderBottom: '1px dashed rgba(255,255,255,0.15)', paddingBottom: '1px', fontFamily: "var(--font-mono)" }}>
                                                    ₹{amounts[budget.name].toLocaleString('en-IN')}/mo
                                                </span>
                                            )}
                                            <div onClick={() => toggleBudget(budget.name)}
                                                style={{ width: 10, height: 10, borderRadius: '50%', background: selected ? accentColor : 'rgba(255,255,255,0.1)', boxShadow: selected ? `0 0 8px ${accentColor}80` : 'none', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <button type="button" onClick={handleFinish} disabled={saving} style={btnStyle}>
                            {saving
                                ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid white', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                                : <><span>{budgets.length > 0 ? `Set ${budgets.length} Budget${budgets.length > 1 ? 's' : ''} & Finish` : 'Skip & Go to Dashboard'}</span> <ArrowRight size={16} /></>
                            }
                        </button>
                        <button type="button" onClick={skip} style={linkBtn}>Skip for now</button>
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
