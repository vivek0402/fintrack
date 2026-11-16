'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { profileAPI, budgetsAPI, categoriesAPI } from '@/lib/api';
import { type } from '@/lib/typography';
import { stepProgress, progressPercent, budgetButtonLabel, importedLabel } from '@/lib/onboarding';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Rows, Switch, TextAction } from '@/components/ui/CardParts';
import { SmsImporter } from '@/components/transactions/SmsImporter';
import { BankStatementImporter } from '@/components/transactions/BankStatementImporter';
import { CamsImporter } from '@/components/investments/CamsImporter';

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

type ImportMethod = 'sms' | 'pdf' | 'cams' | null;

const H1: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 'var(--text-figure)', fontWeight: 700, lineHeight: 1.15, color: 'var(--text-primary)', margin: '0 0 6px' };
const LEAD: React.CSSProperties = { ...type.body, margin: '0 0 24px' };
const OPTION: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 18px', width: '100%',
    borderRadius: 'var(--radius-md)', textAlign: 'left', cursor: 'pointer',
    border: '1px solid var(--glass-border)', background: 'transparent',
    transition: 'background 0.15s',
};
const wash = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--glass-fill-2)'; },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'transparent'; },
};
const BACK: React.CSSProperties = { textAlign: 'center', marginTop: '16px' };

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
            <div style={{ width: '100%', maxWidth: '580px' }}>

                {/* Wordmark and skip */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <span style={type.heading}>
                        Fin<span style={{ fontWeight: 500, color: 'var(--accent-text)' }}>Track</span>
                    </span>
                    <TextAction quiet onClick={skip}>Skip setup</TextAction>
                </div>

                {/* Progress */}
                <div style={{ marginBottom: '24px' }}>
                    {step >= 1 && (
                        <p style={{ ...type.meta, margin: '0 0 8px' }}>{stepProgress(step, STEP_LABELS)}</p>
                    )}
                    <div style={{ width: '100%', height: '3px', background: 'var(--border-visible)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 'var(--radius-sm)', width: `${progressPercent(step, STEP_LABELS)}%`, transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
                    </div>
                </div>

                <Card>

                    {/* Step 0: Welcome */}
                    {step === 0 && (
                        <div className="page-enter">
                            <h1 style={H1}>Welcome, {firstName}.</h1>
                            <p style={LEAD}>Let&apos;s get FinTrack set up for you. It takes about 2 minutes.</p>

                            <Rows style={{ marginBottom: '24px' }}>
                                {[
                                    { label: 'Income and expenses', desc: 'Track every rupee in and out' },
                                    { label: 'Charts', desc: 'See your financial story at a glance' },
                                    { label: 'Budgets and goals', desc: 'Set limits and hit milestones' },
                                    { label: 'AI insights', desc: 'Monthly reports written from your own numbers' },
                                ].map(f => (
                                    <div key={f.label}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ ...type.bodyStrong, margin: 0 }}>{f.label}</p>
                                            <p style={{ ...type.meta, margin: '2px 0 0' }}>{f.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </Rows>

                            <Button size="lg" style={{ width: '100%' }} onClick={() => setStep(1)}>Get started</Button>
                        </div>
                    )}

                    {/* Step 1: Currency */}
                    {step === 1 && (
                        <div className="page-enter">
                            <h1 style={H1}>Choose your currency</h1>
                            <p style={LEAD}>All amounts show in this currency. You can change it later in your profile.</p>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' }}>
                                {CURRENCIES.map(c => {
                                    const selected = currency === c.code;
                                    return (
                                        <button key={c.code} type="button" aria-pressed={selected} onClick={() => setCurrency(c.code)}
                                            style={{
                                                padding: '14px 16px', borderRadius: 'var(--radius-md)', textAlign: 'left', cursor: 'pointer',
                                                border: '1px solid ' + (selected ? 'transparent' : 'var(--glass-border)'),
                                                background: 'transparent',
                                                boxShadow: selected ? 'inset 0 0 0 2px var(--text-primary)' : 'none',
                                            }}>
                                            <p style={{ ...type.bodyStrong, margin: 0 }}>{c.symbol} {c.code}</p>
                                            <p style={{ ...type.meta, margin: '2px 0 0' }}>{c.label}</p>
                                        </button>
                                    );
                                })}
                            </div>

                            <Button size="lg" style={{ width: '100%' }} isLoading={saving} onClick={handleCurrencyNext}>Continue</Button>
                            <div style={BACK}><TextAction quiet onClick={() => setStep(0)}>Back</TextAction></div>
                        </div>
                    )}

                    {/* Step 2: Appearance */}
                    {step === 2 && (
                        <div className="page-enter">
                            <h1 style={H1}>How should it look?</h1>
                            <p style={LEAD}>Pick an appearance. Tapping one applies it and moves on. You can change it any time in your profile.</p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                                {[
                                    { value: 'dark' as const, label: 'Dark', desc: 'Black background, easy on OLED screens', previewBg: '#000', previewCard: '#111', previewAccent: '#2563eb' },
                                    { value: 'light' as const, label: 'Light', desc: 'Clean and bright, good for daytime', previewBg: '#f8f9fc', previewCard: '#fff', previewAccent: '#2563eb' },
                                ].map(t => (
                                    <button key={t.value} type="button" onClick={() => handleThemeNext(t.value)} style={OPTION} {...wash}>
                                        {/* Mini preview */}
                                        <div style={{ width: '64px', height: '48px', borderRadius: '8px', background: t.previewBg, flexShrink: 0, border: '1px solid var(--glass-border)', overflow: 'hidden', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', boxSizing: 'border-box' }}>
                                            <div style={{ width: '100%', height: '8px', borderRadius: '2px', background: t.previewCard }} />
                                            <div style={{ width: '70%', height: '6px', borderRadius: '2px', background: t.previewCard }} />
                                            <div style={{ width: '100%', height: '10px', borderRadius: '2px', background: t.previewAccent, opacity: 0.85 }} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ ...type.bodyStrong, margin: 0 }}>{t.label}</p>
                                            <p style={{ ...type.meta, margin: '2px 0 0' }}>{t.desc}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div style={{ textAlign: 'center' }}><TextAction quiet onClick={() => setStep(1)}>Back</TextAction></div>
                        </div>
                    )}

                    {/* Step 3 (treatment only): Import */}
                    {step === 3 && isTreatment && (
                        <div className="page-enter">
                            {!importMethod && (
                                <>
                                    <h1 style={H1}>Bring in your transactions</h1>
                                    <p style={LEAD}>Skip typing things in by hand. Import from an SMS, a bank statement or a CAMS mutual fund statement.</p>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                                        {[
                                            { method: 'sms' as const, label: 'Paste a bank or UPI SMS', desc: 'One transaction, parsed instantly' },
                                            { method: 'pdf' as const, label: 'Upload a bank statement (PDF)', desc: 'Bulk-import a month of transactions' },
                                            { method: 'cams' as const, label: 'Upload a CAMS statement', desc: 'Import your mutual fund holdings' },
                                        ].map(({ method, label, desc }) => (
                                            <button key={method} type="button" onClick={() => setImportMethod(method)} style={OPTION} {...wash}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ ...type.bodyStrong, margin: 0 }}>{label}</p>
                                                    <p style={{ ...type.meta, margin: '2px 0 0' }}>{desc}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>

                                    {importedCount > 0 && (
                                        <p style={{ ...type.meta, margin: '0 0 16px' }}>{importedLabel(importedCount)}</p>
                                    )}

                                    <Button size="lg" style={{ width: '100%', height: 'auto', minHeight: '48px', padding: '12px 24px', whiteSpace: 'normal', textAlign: 'center' }} onClick={() => setStep(BUDGETS_STEP)}>
                                        {importedCount > 0 ? 'Continue' : "Skip, I'll add transactions manually"}
                                    </Button>
                                    <div style={BACK}><TextAction quiet onClick={() => setStep(2)}>Back</TextAction></div>
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

                    {/* Budgets step */}
                    {step === BUDGETS_STEP && (
                        <div className="page-enter">
                            <h1 style={H1}>Set monthly budgets</h1>
                            <p style={LEAD}>Switch on the categories you want a limit for. Tap an amount to change it. You can change these any time.</p>

                            <Rows style={{ marginBottom: '24px' }}>
                                {POPULAR_BUDGETS.map(budget => {
                                    const cat = categories.find(c => c.name === budget.name);
                                    const selected = budgets.some(b => b.name === budget.name);
                                    const isEditing = editingBudget === budget.name;
                                    if (!cat) return null;
                                    return (
                                        <div key={budget.name}>
                                            <span style={{ ...type.bodyStrong, flex: 1, minWidth: 0 }}>{budget.name}</span>

                                            {isEditing ? (
                                                <div style={{ position: 'relative' }}>
                                                    <span aria-hidden="true" style={{ ...type.num, color: 'var(--text-secondary)', position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>₹</span>
                                                    <input autoFocus type="number" min="1" value={editingValue}
                                                        aria-label={`Monthly budget for ${budget.name}`}
                                                        onChange={e => setEditingValue(e.target.value)}
                                                        onBlur={() => commitEdit(budget.name)}
                                                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(budget.name); if (e.key === 'Escape') setEditingBudget(null); }}
                                                        style={{ ...type.num, width: '96px', boxSizing: 'border-box', padding: '6px 10px 6px 26px', textAlign: 'right', background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', outline: 'none' }} />
                                                </div>
                                            ) : (
                                                <TextAction quiet onClick={() => startEditing(budget.name)}>
                                                    {`₹${amounts[budget.name].toLocaleString('en-IN')} a month`}
                                                </TextAction>
                                            )}

                                            <Switch checked={selected} onChange={() => toggleBudget(budget.name)} aria-label={`Budget for ${budget.name}`} />
                                        </div>
                                    );
                                })}
                            </Rows>

                            <Button size="lg" style={{ width: '100%' }} isLoading={saving} onClick={handleFinish}>
                                {budgetButtonLabel(budgets.length)}
                            </Button>
                            <div style={BACK}><TextAction quiet onClick={() => setStep(isTreatment ? 3 : 2)}>Back</TextAction></div>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
