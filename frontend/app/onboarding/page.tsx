'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Moon, Sun, TrendingUp, Sparkles, Target, CheckCircle, PiggyBank, Zap, BarChart3, MessageSquareText, FileUp, Landmark } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { profileAPI, budgetsAPI, categoriesAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { SmsImporter } from '@/components/transactions/SmsImporter';
import { BankStatementImporter } from '@/components/transactions/BankStatementImporter';
import { CamsImporter } from '@/components/investments/CamsImporter';

const CURRENCIES = [
    { code: 'INR', symbol: '₹', label: 'Indian Rupee',     flag: '🇮🇳' },
    { code: 'USD', symbol: '$', label: 'US Dollar',         flag: '🇺🇸' },
    { code: 'EUR', symbol: '€', label: 'Euro',              flag: '🇪🇺' },
    { code: 'GBP', symbol: '£', label: 'British Pound',    flag: '🇬🇧' },
    { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham',     flag: '🇦🇪' },
    { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar', flag: '🇸🇬' },
];

const POPULAR_BUDGETS = [
    { name: 'Food',          amount: 5000, icon: '🍽' },
    { name: 'Transport',     amount: 2000, icon: '🚗' },
    { name: 'Shopping',      amount: 3000, icon: '🛍' },
    { name: 'Subscriptions', amount: 1000, icon: '📱' },
    { name: 'Health',        amount: 2000, icon: '💊' },
    { name: 'Utilities',     amount: 1500, icon: '⚡' },
];

type ImportMethod = 'sms' | 'pdf' | 'cams' | null;

export default function OnboardingPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage, setAuth, token } = useAuthStore();
    const [step, setStep] = useState(0);
    const [currency, setCurrency] = useState('INR');
    const [categories, setCategories] = useState<any[]>([]);
    const [budgets, setBudgets] = useState<{ category_id: string; amount: number; name: string }[]>([]);
    const [saving, setSaving] = useState(false);
    const { setTheme, theme } = useThemeStore();
    const [amounts, setAmounts] = useState<Record<string, number>>(
        Object.fromEntries(POPULAR_BUDGETS.map(b => [b.name, b.amount]))
    );
    const [editingBudget, setEditingBudget] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');
    const [importMethod, setImportMethod] = useState<ImportMethod>(null);
    const [importedCount, setImportedCount] = useState(0);

    // Phase 1 A/B test (docs/GROWTH_BRIEF_10000X.md): only the 'treatment'
    // cohort sees the import step below. 'control' onboarding is unchanged
    // from before this test -- that's what makes the retention comparison valid.
    const isTreatment = user?.onboarding_variant === 'treatment';
    const BUDGETS_STEP = isTreatment ? 4 : 3;
    const STEP_LABELS = isTreatment
        ? ['Welcome', 'Currency', 'Appearance', 'Import', 'Budgets']
        : ['Welcome', 'Currency', 'Appearance', 'Budgets'];

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
            const year = new Date().getFullYear();
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

    const firstName = user?.full_name?.split(' ')[0] ?? 'there';

    if (isLoading || !user) return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '24px', height: '24px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px 60px' }}>

            {/* Wordmark */}
            <div style={{ width: '100%', maxWidth: '580px', marginBottom: '40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    Fin<span style={{ fontWeight: 500, color: 'var(--accent)' }}>Track</span>
                </span>
                <button type="button" onClick={skip}
                    style={{ background: 'none', border: 'none', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>
                    Skip setup
                </button>
            </div>

            {/* Progress bar */}
            <div style={{ width: '100%', maxWidth: '580px', marginBottom: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    {STEP_LABELS.map((label, i) => (
                        <span key={label} style={{ fontSize: '11px', fontWeight: i <= step ? 600 : 400, color: i <= step ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-body)', letterSpacing: '0.03em', transition: 'color 0.3s' }}>
                            {label}
                        </span>
                    ))}
                </div>
                <div style={{ width: '100%', height: '3px', background: 'var(--border-subtle)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--accent)', borderRadius: '2px', width: `${((step + 1) / STEP_LABELS.length) * 100}%`, transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
                </div>
            </div>

            {/* Card */}
            <div style={{ width: '100%', maxWidth: '580px', background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '48px 52px', boxShadow: 'var(--shadow-card)' }}>

                {/* ── Step 0: Welcome ── */}
                {step === 0 && (
                    <div className="page-enter">
                        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>
                            Account ready
                        </p>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 10px' }}>
                            Welcome, {firstName}.
                        </h1>
                        <p style={{ fontSize: '15px', color: 'var(--text-muted)', margin: '0 0 36px', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
                            Let's get FinTrack set up for you. Takes about 2 minutes.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '36px' }}>
                            {[
                                { Icon: TrendingUp,  label: 'Income & Expenses',   desc: 'Track every rupee in and out' },
                                { Icon: BarChart3,   label: 'Beautiful Charts',     desc: 'Visualize your financial story' },
                                { Icon: Target,      label: 'Budgets & Goals',      desc: 'Set limits and hit milestones' },
                                { Icon: Sparkles,    label: 'AI Insights',          desc: 'Monthly reports powered by AI' },
                            ].map(({ Icon, label, desc }) => (
                                <div key={label} style={{ padding: '16px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                                    <Icon size={18} color="var(--accent)" style={{ marginBottom: '10px' }} />
                                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 3px', fontFamily: 'var(--font-display)' }}>{label}</p>
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>{desc}</p>
                                </div>
                            ))}
                        </div>

                        <Button size="lg" style={{ width: '100%' }} onClick={() => setStep(1)}>
                            Get Started <ArrowRight size={16} />
                        </Button>
                    </div>
                )}

                {/* ── Step 1: Currency ── */}
                {step === 1 && (
                    <div className="page-enter">
                        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>
                            Step 1 of {STEP_LABELS.length - 1}
                        </p>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 10px' }}>
                            Choose your currency
                        </h1>
                        <p style={{ fontSize: '15px', color: 'var(--text-muted)', margin: '0 0 32px', fontFamily: 'var(--font-body)' }}>
                            All amounts will be displayed in this currency. You can change it later in Settings.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '32px' }}>
                            {CURRENCIES.map(c => (
                                <button key={c.code} type="button" onClick={() => setCurrency(c.code)}
                                    style={{
                                        padding: '14px 16px', borderRadius: 'var(--radius-md)', textAlign: 'left', cursor: 'pointer',
                                        border: currency === c.code ? '1.5px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                                        background: currency === c.code ? 'var(--accent-subtle)' : 'var(--bg-surface-2)',
                                        transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '20px', lineHeight: 1 }}>{c.flag}</span>
                                        <div>
                                            <p style={{ fontSize: '13px', fontWeight: 600, color: currency === c.code ? 'var(--accent)' : 'var(--text-primary)', margin: '0 0 1px', fontFamily: 'var(--font-display)' }}>
                                                {c.symbol} {c.code}
                                            </p>
                                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{c.label}</p>
                                        </div>
                                    </div>
                                    {currency === c.code && <CheckCircle size={15} color="var(--accent)" style={{ flexShrink: 0 }} />}
                                </button>
                            ))}
                        </div>

                        <Button size="lg" style={{ width: '100%' }} isLoading={saving} onClick={handleCurrencyNext}>
                            Continue <ArrowRight size={16} />
                        </Button>
                        <button type="button" onClick={() => setStep(0)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', display: 'block', width: '100%', textAlign: 'center', marginTop: '16px', padding: 0 }}>
                            Back
                        </button>
                    </div>
                )}

                {/* ── Step 2: Theme ── */}
                {step === 2 && (
                    <div className="page-enter">
                        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>
                            Step 2 of {STEP_LABELS.length - 1}
                        </p>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 10px' }}>
                            How should it look?
                        </h1>
                        <p style={{ fontSize: '15px', color: 'var(--text-muted)', margin: '0 0 32px', fontFamily: 'var(--font-body)' }}>
                            Pick your preferred appearance. You can change it anytime in Settings.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                            {[
                                {
                                    value: 'dark' as const,
                                    label: 'Dark',
                                    desc: 'AMOLED black — recommended for OLED screens',
                                    Icon: Moon,
                                    iconColor: 'var(--accent)',
                                    previewBg: '#000000',
                                    previewCard: '#111111',
                                    previewAccent: '#00e5a0',
                                },
                                {
                                    value: 'light' as const,
                                    label: 'Light',
                                    desc: 'Clean and bright — great for daytime use',
                                    Icon: Sun,
                                    iconColor: 'var(--color-warn)',
                                    previewBg: '#f8f9fc',
                                    previewCard: '#ffffff',
                                    previewAccent: '#059669',
                                },
                            ].map(t => (
                                <button key={t.value} type="button" onClick={() => handleThemeNext(t.value)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '16px', padding: '18px 20px',
                                        borderRadius: 'var(--radius-lg)', textAlign: 'left', cursor: 'pointer',
                                        border: '1px solid var(--border-subtle)', background: 'var(--bg-surface-2)',
                                        transition: 'all 0.15s', width: '100%',
                                    }}
                                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--accent-border)'; el.style.background = 'var(--accent-subtle)'; }}
                                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--border-subtle)'; el.style.background = 'var(--bg-surface-2)'; }}>

                                    {/* Mini preview */}
                                    <div style={{ width: '64px', height: '48px', borderRadius: '8px', background: t.previewBg, flexShrink: 0, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ width: '100%', height: '8px', borderRadius: '2px', background: t.previewCard }} />
                                        <div style={{ width: '70%', height: '6px', borderRadius: '2px', background: t.previewCard }} />
                                        <div style={{ width: '100%', height: '10px', borderRadius: '2px', background: t.previewAccent, opacity: 0.85 }} />
                                    </div>

                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px', fontFamily: 'var(--font-display)' }}>{t.label}</p>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{t.desc}</p>
                                    </div>

                                    <t.Icon size={20} color={t.iconColor} style={{ flexShrink: 0 }} />
                                </button>
                            ))}
                        </div>

                        <button type="button" onClick={() => setStep(1)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', display: 'block', width: '100%', textAlign: 'center', padding: 0 }}>
                            Back
                        </button>
                    </div>
                )}

                {/* ── Step (treatment only): Import ── */}
                {step === 3 && isTreatment && (
                    <div className="page-enter">
                        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>
                            Step 3 of {STEP_LABELS.length - 1}
                        </p>

                        {!importMethod && (
                            <>
                                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 10px' }}>
                                    Bring in your transactions
                                </h1>
                                <p style={{ fontSize: '15px', color: 'var(--text-muted)', margin: '0 0 28px', fontFamily: 'var(--font-body)' }}>
                                    Skip typing things in by hand. Import from an SMS, a bank statement, or a CAMS mutual fund statement.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
                                    {[
                                        { method: 'sms' as const, Icon: MessageSquareText, label: 'Paste a bank/UPI SMS', desc: 'One transaction, parsed instantly' },
                                        { method: 'pdf' as const, Icon: FileUp, label: 'Upload a bank statement (PDF)', desc: 'Bulk-import a month of transactions' },
                                        { method: 'cams' as const, Icon: Landmark, label: 'Upload a CAMS statement', desc: 'Import your mutual fund holdings' },
                                    ].map(({ method, Icon, label, desc }) => (
                                        <button key={method} type="button" onClick={() => setImportMethod(method)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 18px', borderRadius: 'var(--radius-lg)', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface-2)', width: '100%', fontFamily: 'var(--font-body)' }}>
                                            <Icon size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
                                            <div style={{ flex: 1 }}>
                                                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'var(--font-display)' }}>{label}</p>
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{desc}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {importedCount > 0 && (
                                    <p style={{ fontSize: '13px', color: 'var(--color-inc)', margin: '0 0 16px', fontFamily: 'var(--font-body)' }}>
                                        Imported {importedCount} transaction{importedCount !== 1 ? 's' : ''} so far.
                                    </p>
                                )}

                                <Button size="lg" style={{ width: '100%', height: 'auto', minHeight: '48px', padding: '12px 24px', whiteSpace: 'normal', textAlign: 'center' }} onClick={() => setStep(BUDGETS_STEP)}>
                                    {importedCount > 0 ? 'Continue' : "Skip — I'll add transactions manually"} <ArrowRight size={16} style={{ flexShrink: 0 }} />
                                </Button>
                                <button type="button" onClick={() => setStep(2)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', display: 'block', width: '100%', textAlign: 'center', marginTop: '16px', padding: 0 }}>
                                    Back
                                </button>
                            </>
                        )}

                        {importMethod === 'sms' && (
                            <SmsImporter onClose={() => setImportMethod(null)} onSuccess={() => { setImportedCount(c => c + 1); setImportMethod(null); }} />
                        )}
                        {importMethod === 'pdf' && (
                            <BankStatementImporter onClose={() => setImportMethod(null)} onSuccess={(count) => { setImportedCount(c => c + count); setImportMethod(null); }} />
                        )}
                        {importMethod === 'cams' && (
                            <CamsImporter onClose={() => setImportMethod(null)} onSuccess={(result) => { setImportedCount(c => c + result.created + result.updated); setImportMethod(null); }} />
                        )}
                    </div>
                )}

                {/* ── Step: Budgets ── */}
                {step === BUDGETS_STEP && (
                    <div className="page-enter">
                        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>
                            Step {STEP_LABELS.length - 1} of {STEP_LABELS.length - 1}
                        </p>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 10px' }}>
                            Set monthly budgets
                        </h1>
                        <p style={{ fontSize: '15px', color: 'var(--text-muted)', margin: '0 0 28px', fontFamily: 'var(--font-body)' }}>
                            Select categories and set limits. Tap an amount to edit it. You can change these anytime.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
                            {POPULAR_BUDGETS.map(budget => {
                                const cat = categories.find(c => c.name === budget.name);
                                const selected = budgets.some(b => b.name === budget.name);
                                const isEditing = editingBudget === budget.name;
                                if (!cat) return null;
                                return (
                                    <div key={budget.name}
                                        style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: selected ? '1.5px solid var(--accent-border)' : '1px solid var(--border-subtle)', background: selected ? 'var(--accent-subtle)' : 'var(--bg-surface-2)', transition: 'all 0.15s', gap: '12px', cursor: 'pointer' }}
                                        onClick={() => { if (!isEditing) toggleBudget(budget.name); }}>

                                        <span style={{ fontSize: '18px', flexShrink: 0, lineHeight: 1 }}>{budget.icon}</span>

                                        <span style={{ flex: 1, fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
                                            {budget.name}
                                        </span>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {isEditing ? (
                                                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                                                    <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '13px', pointerEvents: 'none' }}>₹</span>
                                                    <input autoFocus type="number" min="1" value={editingValue}
                                                        onChange={e => setEditingValue(e.target.value)}
                                                        onBlur={() => commitEdit(budget.name)}
                                                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(budget.name); if (e.key === 'Escape') setEditingBudget(null); }}
                                                        style={{ width: '96px', padding: '5px 6px 5px 24px', fontSize: '13px', color: 'var(--text-primary)', background: 'var(--bg-surface-3)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)', outline: 'none', textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
                                                </div>
                                            ) : (
                                                <span onClick={e => { e.stopPropagation(); startEditing(budget.name); }} title="Tap to edit"
                                                    style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'text', borderBottom: '1px dashed var(--border-visible)', paddingBottom: '1px', fontFamily: 'var(--font-mono)' }}>
                                                    ₹{amounts[budget.name].toLocaleString('en-IN')}/mo
                                                </span>
                                            )}

                                            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: selected ? 'none' : '1.5px solid var(--border-visible)', background: selected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                                                {selected && <CheckCircle size={18} color="var(--bg-base)" strokeWidth={2.5} />}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <Button size="lg" style={{ width: '100%' }} isLoading={saving} onClick={handleFinish}>
                            {budgets.length > 0 ? `Set ${budgets.length} Budget${budgets.length > 1 ? 's' : ''} & Finish` : 'Skip & Go to Dashboard'}
                            <ArrowRight size={16} />
                        </Button>
                        <button type="button" onClick={() => setStep(isTreatment ? 3 : 2)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', display: 'block', width: '100%', textAlign: 'center', marginTop: '14px', padding: 0 }}>
                            Back
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
