'use client';

import { useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { planningAPI, categoriesAPI } from '@/lib/api';
import { fmt } from '@/lib/utils';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { GCard } from '@/components/ui/GCard';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { toast } from '@/store/toastStore';

// ── Shared inline style tokens (matches the pattern used on goals/page.tsx etc.) ──
const inputSt: React.CSSProperties = { width: '100%', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' };
const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block', fontFamily: 'var(--font-body)' };
const errSt: React.CSSProperties = { fontSize: 12, color: 'var(--color-exp)', margin: '8px 0 0', fontFamily: 'var(--font-body)' };
const iconBtn: React.CSSProperties = { width: 38, height: 38, borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const outlineBtn: React.CSSProperties = { padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6 };

const RISK_OPTIONS = [
    { value: 'safety', label: 'Safety First' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'growth', label: 'Growth First' },
] as const;

const STEP_LABELS = ['Income', 'Expenses', 'Credit Card', 'Emergency Fund', 'Goal', 'Loan', 'Risk Profile'];

type ExpenseRow = { name: string; amount: string; category_id: string };

interface WizardForm {
    monthly_income: string;
    expenses: ExpenseRow[];
    has_credit_card: boolean;
    emergency_fund_target_months: string;
    emergency_fund_current_balance: string;
    has_goal: boolean;
    goal_name: string;
    goal_amount: string;
    goal_target_months: string;
    has_loan: boolean;
    loan_principal: string;
    loan_annual_rate_pct: string;
    loan_tenure_months: string;
    loan_moratorium_months: string;
    risk_profile: 'safety' | 'balanced' | 'growth';
}

const EMPTY_FORM: WizardForm = {
    monthly_income: '',
    expenses: [{ name: '', amount: '', category_id: '' }],
    has_credit_card: false,
    emergency_fund_target_months: '6',
    emergency_fund_current_balance: '0',
    has_goal: false,
    goal_name: '',
    goal_amount: '',
    goal_target_months: '',
    has_loan: false,
    loan_principal: '',
    loan_annual_rate_pct: '',
    loan_tenure_months: '',
    loan_moratorium_months: '0',
    risk_profile: 'balanced',
};

function isPositive(value: string): boolean {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0;
}
function isNonNegative(value: string): boolean {
    const n = parseFloat(value);
    return Number.isFinite(n) && n >= 0;
}
function isPositiveInt(value: string): boolean {
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
}
function isNonNegativeInt(value: string): boolean {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0;
}

// Track + knob boolean switch — no shared Switch component exists yet in
// components/ui, so this is kept local to the wizard rather than introducing
// a new shared component for a single page's use.
function ToggleRow({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 16px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>{label}</p>
                {description && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>{description}</p>}
            </div>
            <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
                style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, position: 'relative', background: checked ? 'var(--accent)' : 'var(--bg-surface-3)', transition: 'background 180ms ease' }}>
                <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 180ms cubic-bezier(0.34,1.56,0.64,1)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </button>
        </div>
    );
}

export default function PlanningPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [planData, setPlanData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('monthly');
    const [narrative, setNarrative] = useState<any>(null);
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

    const [step, setStep] = useState(0);
    const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
    const [stepError, setStepError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [editingPlan, setEditingPlan] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        categoriesAPI.getAll().then(res => setCategories(res.data.categories)).catch(() => {});
    }, [user]);

    const fetchPlan = async () => {
        setLoading(true);
        try {
            const res = await planningAPI.getPlan();
            setPlanData(res.data);
        } catch {
            toast.error('Failed to load your financial plan');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { if (user) fetchPlan(); }, [user]);

    // Fires once when the tabs view first renders (plan already exists) —
    // not on every tab switch. Failure/timeout is swallowed silently; the
    // static narrative from GET /api/planning keeps showing either way.
    useEffect(() => {
        if (!planData?.exists) return;
        planningAPI.getNarrative()
            .then(res => setNarrative(res.data.narrative))
            .catch(() => { /* keep showing static text */ });
    }, [planData?.exists]);

    // If editing removes a loan while the Loan tab is active, fall back to
    // Monthly rather than leaving the now-hidden tab selected.
    useEffect(() => {
        if (planData?.exists && activeTab === 'loan' && planData.plan.loan_principal === null) {
            setActiveTab('monthly');
        }
    }, [planData, activeTab]);

    // ── Recalculate from recent spending ────────────────────────────────────

    const [recalcOpen, setRecalcOpen] = useState(false);
    const [recalcLoading, setRecalcLoading] = useState(false);
    const [recalcResult, setRecalcResult] = useState<any>(null);
    const [applying, setApplying] = useState(false);

    const closeRecalc = () => { setRecalcOpen(false); setRecalcResult(null); };

    const handleRecalculateClick = async () => {
        setRecalcLoading(true);
        try {
            const res = await planningAPI.recalculate();
            setRecalcResult(res.data);
            setRecalcOpen(true);
        } catch {
            toast.error('Failed to compare your plan against recent spending');
        } finally {
            setRecalcLoading(false);
        }
    };

    const handleApplyRecalculation = async () => {
        setApplying(true);
        try {
            const res = await planningAPI.applyRecalculation();
            setPlanData(res.data);
            closeRecalc();
            toast.success('Plan updated from recent spending');
        } catch {
            toast.error('Failed to apply the recalculation');
        } finally {
            setApplying(false);
        }
    };

    // ── Wizard helpers ──────────────────────────────────────────────────────

    const updateExpense = (i: number, field: 'name' | 'amount' | 'category_id', value: string) => {
        setForm(f => ({ ...f, expenses: f.expenses.map((e, idx) => idx === i ? { ...e, [field]: value } : e) }));
    };
    const addExpenseRow = () => setForm(f => ({ ...f, expenses: [...f.expenses, { name: '', amount: '', category_id: '' }] }));
    const removeExpenseRow = (i: number) => setForm(f => ({ ...f, expenses: f.expenses.filter((_, idx) => idx !== i) }));

    // Pre-fills the wizard from an already-saved plan so "Edit Plan" can reuse
    // every step instead of forcing a delete-and-recreate to change anything
    // (including linking a category, which only this form can set).
    const buildFormFromPlanData = (data: any): WizardForm => {
        const { plan: p, expenses: exp } = data;
        return {
            monthly_income: String(p.monthly_income),
            expenses: exp.length > 0
                ? exp.map((e: any) => ({ name: e.name, amount: String(e.amount), category_id: e.category_id || '' }))
                : [{ name: '', amount: '', category_id: '' }],
            has_credit_card: user?.id ? localStorage.getItem(`fintrack-planning-has-credit-card-${user.id}`) === 'true' : false,
            emergency_fund_target_months: String(p.emergency_fund_target_months),
            emergency_fund_current_balance: String(p.emergency_fund_current_balance),
            has_goal: p.goal_amount !== null,
            goal_name: p.goal_name || '',
            goal_amount: p.goal_amount !== null ? String(p.goal_amount) : '',
            goal_target_months: p.goal_target_months !== null ? String(p.goal_target_months) : '',
            has_loan: p.loan_principal !== null,
            loan_principal: p.loan_principal !== null ? String(p.loan_principal) : '',
            loan_annual_rate_pct: p.loan_annual_rate_pct !== null ? String(p.loan_annual_rate_pct) : '',
            loan_tenure_months: p.loan_tenure_months !== null ? String(p.loan_tenure_months) : '',
            loan_moratorium_months: p.loan_moratorium_months !== null ? String(p.loan_moratorium_months) : '0',
            risk_profile: p.risk_profile,
        };
    };

    const handleEditClick = () => {
        setForm(buildFormFromPlanData(planData));
        setStep(0);
        setStepError('');
        setEditingPlan(true);
    };

    const validateStep = (s: number): string => {
        switch (s) {
            case 0:
                return isPositive(form.monthly_income) ? '' : 'Enter a monthly income greater than 0.';
            case 1:
                for (const e of form.expenses) {
                    if (e.name.trim() && !isNonNegative(e.amount)) return `Enter a valid amount for "${e.name}".`;
                }
                return '';
            case 2:
                return '';
            case 3:
                if (!isPositiveInt(form.emergency_fund_target_months)) return 'Emergency fund target must be a positive whole number of months.';
                if (!isNonNegative(form.emergency_fund_current_balance)) return 'Current emergency fund balance must be zero or greater.';
                return '';
            case 4:
                if (!form.has_goal) return '';
                if (!form.goal_name.trim()) return 'Give your goal a name.';
                if (!isPositive(form.goal_amount)) return 'Goal amount must be greater than 0.';
                if (!isPositiveInt(form.goal_target_months)) return 'Goal target must be a positive whole number of months.';
                return '';
            case 5:
                if (!form.has_loan) return '';
                if (!isPositive(form.loan_principal)) return 'Loan principal must be greater than 0.';
                if (!isNonNegative(form.loan_annual_rate_pct)) return 'Interest rate must be zero or greater.';
                if (!isPositiveInt(form.loan_tenure_months)) return 'Loan tenure must be a positive whole number of months.';
                if (!isNonNegativeInt(form.loan_moratorium_months)) return 'Moratorium months must be zero or greater.';
                if (Number(form.loan_tenure_months) <= Number(form.loan_moratorium_months)) return 'Loan tenure must be greater than the moratorium period.';
                return '';
            default:
                return '';
        }
    };

    const submitPlan = async () => {
        setSubmitting(true);
        setStepError('');
        try {
            const payload: Record<string, any> = {
                monthly_income: parseFloat(form.monthly_income),
                risk_profile: form.risk_profile,
                emergency_fund_target_months: parseInt(form.emergency_fund_target_months, 10),
                emergency_fund_current_balance: parseFloat(form.emergency_fund_current_balance) || 0,
                expenses: form.expenses
                    .filter(e => e.name.trim())
                    .map(e => ({ name: e.name.trim(), amount: parseFloat(e.amount) || 0, category_id: e.category_id || null })),
            };
            if (form.has_goal) {
                payload.goal_name = form.goal_name.trim();
                payload.goal_amount = parseFloat(form.goal_amount);
                payload.goal_target_months = parseInt(form.goal_target_months, 10);
            }
            if (form.has_loan) {
                payload.loan_principal = parseFloat(form.loan_principal);
                payload.loan_annual_rate_pct = parseFloat(form.loan_annual_rate_pct);
                payload.loan_tenure_months = parseInt(form.loan_tenure_months, 10);
                payload.loan_moratorium_months = parseInt(form.loan_moratorium_months || '0', 10);
            }

            await planningAPI.savePlan(payload);

            // No backend column for this yet — it's just a note for a Phase 5 tip,
            // so it's kept client-side rather than inventing a migration column.
            if (user?.id) {
                localStorage.setItem(`fintrack-planning-has-credit-card-${user.id}`, String(form.has_credit_card));
            }

            await fetchPlan();
            setActiveTab('monthly');
            setEditingPlan(false);
            toast.success('Financial plan saved');
        } catch (err: any) {
            setStepError(err.response?.data?.error || 'Failed to save your plan.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleContinue = async () => {
        const err = validateStep(step);
        if (err) { setStepError(err); return; }
        setStepError('');
        if (step < STEP_LABELS.length - 1) {
            setStep(s => s + 1);
        } else {
            await submitPlan();
        }
    };

    const handleBack = () => { setStepError(''); setStep(s => Math.max(0, s - 1)); };

    // ── Loading state ────────────────────────────────────────────────────────

    if (isLoading || !user || loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <SkeletonCard height={64} />
                <SkeletonCard height={320} />
            </div>
        );
    }

    // ── Setup wizard (no plan yet, or editing an existing one) ──────────────

    if (!planData?.exists || editingPlan) {
        return (
            <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 24 }}>
                <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>
                            Step {step + 1} of {STEP_LABELS.length}
                        </p>
                        {editingPlan && (
                            <button type="button" onClick={() => { setEditingPlan(false); setStepError(''); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)', padding: 0 }}>
                                Cancel
                            </button>
                        )}
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                        {editingPlan ? 'Edit Your Financial Plan' : 'Build Your Financial Plan'}
                    </h1>
                    <div style={{ width: '100%', height: 3, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: `${((step + 1) / STEP_LABELS.length) * 100}%`, transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
                    </div>
                </div>

                <GCard padding="28px 24px">
                    {/* Step 0: Monthly income */}
                    {step === 0 && (
                        <div>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>What's your monthly income?</h2>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>After-tax, take-home pay each month.</p>
                            <label style={labelSt}>Monthly Income</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 16 }}>₹</span>
                                <input type="number" min="0" placeholder="80000" value={form.monthly_income} autoFocus
                                    onChange={e => setForm(f => ({ ...f, monthly_income: e.target.value }))}
                                    style={{ ...inputSt, paddingLeft: 32, fontFamily: 'var(--font-mono)', fontSize: 16, fontVariantNumeric: 'tabular-nums' }} />
                            </div>
                        </div>
                    )}

                    {/* Step 1: Fixed expenses */}
                    {step === 1 && (
                        <div>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>What are your fixed monthly expenses?</h2>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>Rent, groceries, utilities — anything recurring every month.</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                                {form.expenses.map((exp, i) => (
                                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <input placeholder="e.g. Rent" value={exp.name} onChange={e => updateExpense(i, 'name', e.target.value)} style={{ ...inputSt, background: 'var(--bg-surface-1)' }} />
                                            <div style={{ position: 'relative', width: 140, flexShrink: 0 }}>
                                                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 13 }}>₹</span>
                                                <input type="number" min="0" placeholder="0" value={exp.amount} onChange={e => updateExpense(i, 'amount', e.target.value)}
                                                    style={{ ...inputSt, background: 'var(--bg-surface-1)', paddingLeft: 26, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }} />
                                            </div>
                                            <button type="button" onClick={() => removeExpenseRow(i)} disabled={form.expenses.length === 1} style={{ ...iconBtn, opacity: form.expenses.length === 1 ? 0.4 : 1 }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        <select value={exp.category_id} onChange={e => updateExpense(i, 'category_id', e.target.value)}
                                            style={{ ...inputSt, background: 'var(--bg-surface-1)', fontSize: 12, padding: '6px 10px', color: exp.category_id ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                            <option value="">No category — can't compare to actual spending</option>
                                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>
                            <button type="button" onClick={addExpenseRow} style={outlineBtn}>
                                <Plus size={14} /> Add Expense
                            </button>
                        </div>
                    )}

                    {/* Step 2: Credit card toggle */}
                    {step === 2 && (
                        <div>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Do you use a credit card?</h2>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>We'll use this later to show you relevant tips.</p>
                            <ToggleRow checked={form.has_credit_card} onChange={v => setForm(f => ({ ...f, has_credit_card: v }))} label="I have a credit card" />
                        </div>
                    )}

                    {/* Step 3: Emergency fund */}
                    {step === 3 && (
                        <div>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Your emergency fund</h2>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>A cash buffer for the unexpected — usually 3 to 12 months of expenses.</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={labelSt}>Target (months)</label>
                                    <input type="number" min="1" value={form.emergency_fund_target_months}
                                        onChange={e => setForm(f => ({ ...f, emergency_fund_target_months: e.target.value }))}
                                        style={{ ...inputSt, fontFamily: 'var(--font-mono)' }} />
                                </div>
                                <div>
                                    <label style={labelSt}>Current Balance</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 13 }}>₹</span>
                                        <input type="number" min="0" value={form.emergency_fund_current_balance}
                                            onChange={e => setForm(f => ({ ...f, emergency_fund_current_balance: e.target.value }))}
                                            style={{ ...inputSt, paddingLeft: 26, fontFamily: 'var(--font-mono)' }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Goal */}
                    {step === 4 && (
                        <div>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Saving for something specific?</h2>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>A trip, a gadget, a down payment — anything with a target amount and date.</p>
                            <ToggleRow checked={form.has_goal} onChange={v => setForm(f => ({ ...f, has_goal: v }))} label="I'm saving for something specific" />
                            {form.has_goal && (
                                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div>
                                        <label style={labelSt}>Goal Name</label>
                                        <input placeholder="e.g. Japan Trip" value={form.goal_name} onChange={e => setForm(f => ({ ...f, goal_name: e.target.value }))} style={inputSt} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div>
                                            <label style={labelSt}>Goal Amount</label>
                                            <div style={{ position: 'relative' }}>
                                                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 13 }}>₹</span>
                                                <input type="number" min="0" value={form.goal_amount} onChange={e => setForm(f => ({ ...f, goal_amount: e.target.value }))}
                                                    style={{ ...inputSt, paddingLeft: 26, fontFamily: 'var(--font-mono)' }} />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={labelSt}>Target (months)</label>
                                            <input type="number" min="1" value={form.goal_target_months} onChange={e => setForm(f => ({ ...f, goal_target_months: e.target.value }))}
                                                style={{ ...inputSt, fontFamily: 'var(--font-mono)' }} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 5: Loan */}
                    {step === 5 && (
                        <div>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Do you have a loan?</h2>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>Home, car, personal — any loan with a fixed EMI.</p>
                            <ToggleRow checked={form.has_loan} onChange={v => setForm(f => ({ ...f, has_loan: v }))} label="I have a loan" />
                            {form.has_loan && (
                                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div>
                                            <label style={labelSt}>Principal</label>
                                            <div style={{ position: 'relative' }}>
                                                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 13 }}>₹</span>
                                                <input type="number" min="0" value={form.loan_principal} onChange={e => setForm(f => ({ ...f, loan_principal: e.target.value }))}
                                                    style={{ ...inputSt, paddingLeft: 26, fontFamily: 'var(--font-mono)' }} />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={labelSt}>Annual Rate (%)</label>
                                            <input type="number" min="0" step="0.01" value={form.loan_annual_rate_pct} onChange={e => setForm(f => ({ ...f, loan_annual_rate_pct: e.target.value }))}
                                                style={{ ...inputSt, fontFamily: 'var(--font-mono)' }} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div>
                                            <label style={labelSt}>Tenure (months)</label>
                                            <input type="number" min="1" value={form.loan_tenure_months} onChange={e => setForm(f => ({ ...f, loan_tenure_months: e.target.value }))}
                                                style={{ ...inputSt, fontFamily: 'var(--font-mono)' }} />
                                        </div>
                                        <div>
                                            <label style={labelSt}>Moratorium (months)</label>
                                            <input type="number" min="0" value={form.loan_moratorium_months} onChange={e => setForm(f => ({ ...f, loan_moratorium_months: e.target.value }))}
                                                style={{ ...inputSt, fontFamily: 'var(--font-mono)' }} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 6: Risk profile */}
                    {step === 6 && (
                        <div>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>What's your risk profile?</h2>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>This decides how your surplus splits between your emergency fund and investments.</p>
                            <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', width: '100%' }}>
                                {RISK_OPTIONS.map(opt => {
                                    const isActive = form.risk_profile === opt.value;
                                    return (
                                        <button key={opt.value} type="button" onClick={() => setForm(f => ({ ...f, risk_profile: opt.value }))}
                                            style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: isActive ? 'var(--accent)' : 'transparent', color: isActive ? '#fff' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'all 150ms ease' }}>
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {stepError && <p style={errSt}>{stepError}</p>}

                    <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                        {step > 0 && (
                            <Button variant="secondary" onClick={handleBack} disabled={submitting}>Back</Button>
                        )}
                        <Button style={{ flex: 1 }} onClick={handleContinue} isLoading={submitting}>
                            {step === STEP_LABELS.length - 1 ? 'Finish' : 'Continue'}
                        </Button>
                    </div>
                </GCard>
            </div>
        );
    }

    // ── Tabs view (plan exists) ─────────────────────────────────────────────

    const { plan, expenses, projection, staticNarrative, fiveYearSummary, recommendedFunds, loan, emergencyFundReachedMonth, goalReachedMonth } = planData;
    const hasLoan = plan.loan_principal !== null;
    const displayNarrative = narrative || staticNarrative;
    const month1 = projection[0];

    const tabDefs = [
        { key: 'start', label: 'Start' },
        { key: 'monthly', label: 'Monthly' },
        { key: 'portfolio', label: 'Portfolio' },
        { key: 'five_year', label: '5 Years' },
        ...(hasLoan ? [{ key: 'loan', label: 'Loan' }] : []),
    ];

    const hasDrift = recalcResult && (recalcResult.driftedExpenses?.length > 0 || recalcResult.incomeDrift);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Your Financial Plan
                </h1>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button variant="secondary" size="sm" onClick={handleEditClick}>
                        Edit Plan
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleRecalculateClick} isLoading={recalcLoading}>
                        Recalculate from recent spending
                    </Button>
                </div>
            </div>

            <Tabs tabs={tabDefs} active={activeTab} onChange={setActiveTab} />

            <TabPanel tabKey={activeTab}>
                {activeTab === 'start' && <StartTab checklist={displayNarrative?.checklist} />}
                {activeTab === 'monthly' && <MonthlyTab plan={plan} expenses={expenses} projection={projection} />}
                {activeTab === 'portfolio' && (
                    <PortfolioTab
                        plan={plan}
                        expenses={expenses}
                        month1={month1}
                        recommendedFunds={recommendedFunds}
                        rationale={displayNarrative?.allocation_rationale}
                        emergencyFundReachedMonth={emergencyFundReachedMonth}
                        goalReachedMonth={goalReachedMonth}
                    />
                )}
                {activeTab === 'five_year' && (
                    <FiveYearTab plan={plan} summary={fiveYearSummary} summaryText={displayNarrative?.five_year_summary} />
                )}
                {activeTab === 'loan' && hasLoan && (
                    <LoanTab plan={plan} emi={loan?.emi ?? 0} fiveYearSummary={fiveYearSummary} />
                )}
            </TabPanel>

            <Modal isOpen={recalcOpen} onClose={closeRecalc} title="Recalculate from Recent Spending" maxWidth="520px"
                footer={
                    hasDrift ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <Button variant="secondary" onClick={closeRecalc} disabled={applying}>Cancel</Button>
                            <Button onClick={handleApplyRecalculation} isLoading={applying}>Apply</Button>
                        </div>
                    ) : (
                        <Button variant="secondary" style={{ width: '100%' }} onClick={closeRecalc}>Close</Button>
                    )
                }
            >
                {!recalcResult ? null : !hasDrift ? (
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                        Your plan still matches your recent spending.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {recalcResult.incomeDrift && (
                            <DriftRow
                                label="Monthly Income"
                                oldAmount={recalcResult.incomeDrift.declared_amount}
                                newAmount={recalcResult.incomeDrift.actual_average}
                                percentDifference={recalcResult.incomeDrift.percent_difference}
                                isIncome
                            />
                        )}
                        {recalcResult.driftedExpenses.map((item: any) => (
                            <DriftRow
                                key={item.id}
                                label={item.name}
                                oldAmount={item.declared_amount}
                                newAmount={item.actual_average}
                                percentDifference={item.percent_difference}
                            />
                        ))}
                    </div>
                )}
            </Modal>
        </div>
    );
}

// ── Recalculate modal: one row per drifted income/expense line item ────────

function DriftRow({ label, oldAmount, newAmount, percentDifference, isIncome }: { label: string; oldAmount: number; newAmount: number; percentDifference: number; isIncome?: boolean }) {
    const increased = newAmount > oldAmount;
    const isGood = isIncome ? increased : !increased;
    const color = isGood ? 'var(--color-inc)' : 'var(--color-exp)';

    return (
        <div style={{ padding: '12px 14px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>{label}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>{fmt(oldAmount)}</span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{fmt(newAmount)}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: 'var(--font-mono)' }}>
                    ({percentDifference > 0 ? '+' : ''}{percentDifference.toFixed(0)}%)
                </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                Averaged {fmt(newAmount)} over the last 3 months, you'd declared {fmt(oldAmount)}.
            </p>
        </div>
    );
}

// ── Start tab: setup checklist (AI narrative once it lands, static until then) ──

function StartTab({ checklist }: { checklist?: { title: string; description: string }[] }) {
    if (!checklist || checklist.length === 0) {
        return <GCard><p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Coming in Phase 5.</p></GCard>;
    }
    return (
        <GCard>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {checklist.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12 }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                            {i + 1}
                        </span>
                        <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>{item.title}</p>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>{item.description}</p>
                        </div>
                    </div>
                ))}
            </div>
        </GCard>
    );
}

// ── Monthly tab: waterfall from income to month-1 allocations ──────────────

function WaterfallRow({ label, amount, running, note }: { label: string; amount: number; running: number; note?: string }) {
    const isPositiveAmt = amount >= 0;
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)', fontWeight: 500 }}>{label}</p>
                {note && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>{note}</p>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: isPositiveAmt ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {isPositiveAmt ? '+' : '−'}{fmt(Math.abs(amount))}
                </p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                    Balance: {fmt(running)}
                </p>
            </div>
        </div>
    );
}

function MonthlyTab({ plan, expenses, projection }: { plan: any; expenses: any[]; projection: any[] }) {
    const month1 = projection?.[0];
    if (!month1) {
        return <GCard><p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>No projection available.</p></GCard>;
    }

    const hasGoal = plan.goal_amount !== null;
    const hasLoan = plan.loan_principal !== null;
    const inMoratorium = hasLoan && plan.loan_moratorium_months >= 1;

    let running = month1.income;
    const rows: { label: string; amount: number; running: number; note?: string }[] = [];

    expenses.forEach((e: any) => {
        running -= e.amount;
        rows.push({ label: e.name, amount: -e.amount, running });
    });

    if (hasLoan) {
        running -= month1.loanPayment;
        rows.push({
            label: 'Loan Payment',
            amount: -month1.loanPayment,
            running,
            note: inMoratorium ? 'Interest-only — moratorium in effect' : undefined,
        });
    }

    if (hasGoal) {
        running -= month1.goalPayment;
        rows.push({ label: `Goal: ${plan.goal_name}`, amount: -month1.goalPayment, running });
    }

    running -= month1.emergencyFundContribution;
    rows.push({ label: 'Emergency Fund', amount: -month1.emergencyFundContribution, running });

    running -= month1.sipContribution;
    rows.push({ label: 'SIP / Investments', amount: -month1.sipContribution, running });

    // Small rounding slack absorbs the engine's per-line Math.round() — anything
    // larger than this is a real reconciliation problem, not display noise.
    const TOLERANCE = 2;
    const balanced = Math.abs(running) <= TOLERANCE && !month1.deficit;

    return (
        <GCard>
            <WaterfallRow label="Monthly Income" amount={month1.income} running={month1.income} />
            {rows.map((r, i) => <WaterfallRow key={i} {...r} />)}

            <div style={{
                marginTop: 16, padding: '14px 16px', borderRadius: 'var(--radius-md)',
                background: balanced ? 'var(--color-inc-subtle)' : month1.deficit ? 'var(--color-warn-subtle)' : 'var(--color-exp-subtle)',
                border: `1px solid ${balanced ? 'var(--color-inc)' : month1.deficit ? 'var(--color-warn)' : 'var(--color-exp)'}`,
            }}>
                {balanced ? (
                    <span style={{ color: 'var(--color-inc)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600 }}>
                        ✓ Every rupee accounted for — totals reconcile with income.
                    </span>
                ) : month1.deficit ? (
                    <span style={{ color: 'var(--color-warn)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600 }}>
                        ⚠ This month's fixed costs exceed income — there's no surplus to allocate.
                    </span>
                ) : (
                    <span style={{ color: 'var(--color-exp)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600 }}>
                        ⚠ Mismatch of {fmt(Math.abs(running))} between income and allocations — this likely indicates a bug in the planning engine.
                    </span>
                )}
            </div>
        </GCard>
    );
}

// ── Portfolio tab: emergency fund / SIP / goal allocation by recommended fund ──

function FundCard({ fund }: { fund: { name: string; plan_type: string; platform: string; reason?: string } }) {
    return (
        <div style={{ padding: '10px 12px', background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>{fund.name}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{fund.plan_type} · {fund.platform}</p>
        </div>
    );
}

function PortfolioTab({ plan, expenses, month1, recommendedFunds, rationale, emergencyFundReachedMonth, goalReachedMonth }: {
    plan: any; expenses: any[]; month1: any; recommendedFunds: any[]; rationale?: string;
    emergencyFundReachedMonth: number | null; goalReachedMonth: number | null;
}) {
    const efFund = recommendedFunds.find((f: any) => f.role === 'liquidEmergencyFund');
    const equityFunds = recommendedFunds.filter((f: any) => f.role === 'broadMarketIndex' || f.role === 'secondaryIndex' || f.role === 'elssTaxSaver');
    const goalFund = recommendedFunds.find((f: any) => f.role === 'goalFund');
    const hasGoal = plan.goal_amount !== null;

    const fixedExpenseTotal = expenses.reduce((sum: number, e: any) => sum + e.amount, 0);
    const efTarget = plan.emergency_fund_target_months * fixedExpenseTotal;
    const efPct = efTarget > 0 ? (plan.emergency_fund_current_balance / efTarget) * 100 : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {rationale && (
                <GCard><p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{rationale}</p></GCard>
            )}

            <GCard>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Emergency Fund</p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(plan.emergency_fund_current_balance)} / {fmt(efTarget)}</p>
                </div>
                <ProgressBar pct={efPct} color="var(--color-info)" height={6} />
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 12px', fontFamily: 'var(--font-body)' }}>
                    This month's contribution: {fmt(month1.emergencyFundContribution)}
                    {emergencyFundReachedMonth != null && ` · On track to reach target by month ${emergencyFundReachedMonth}`}
                </p>
                {efFund && <FundCard fund={efFund} />}
            </GCard>

            <GCard>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>SIP / Investments</p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-inc)', margin: 0, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(month1.sipContribution)}/mo</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {equityFunds.map((f: any) => <FundCard key={f.name} fund={f} />)}
                </div>
            </GCard>

            {hasGoal && goalFund && (
                <GCard>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Goal: {plan.goal_name}</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(plan.goal_amount)} target</p>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>
                        Contributing {fmt(month1.goalPayment)}/month
                        {goalReachedMonth != null && ` · On track to reach this goal by month ${goalReachedMonth}`}
                    </p>
                    <FundCard fund={goalFund} />
                </GCard>
            )}
        </div>
    );
}

// ── 5-Year tab: year-by-year table from getFiveYearSummary() rows ───────────

function FiveYearTab({ plan, summary, summaryText }: { plan: any; summary: any[]; summaryText?: string }) {
    if (!summary || summary.length === 0) {
        return <GCard><p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>No projection available.</p></GCard>;
    }

    const hasGoal = plan.goal_amount !== null;
    const columns = ['Year', 'Income', 'Expenses', 'EF Balance', ...(hasGoal ? ['Goal Balance'] : []), 'SIP Balance', 'Net Worth'];
    const cellSt: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', padding: '8px 4px', borderTop: '1px solid var(--border-subtle)', fontVariantNumeric: 'tabular-nums' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {summaryText && (
                <GCard><p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{summaryText}</p></GCard>
            )}
            <GCard>
                <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${columns.length - 1}, 1fr)`, gap: 4, minWidth: 560 }}>
                        {columns.map(c => (
                            <span key={c} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-body)', padding: '0 4px 8px' }}>{c}</span>
                        ))}
                        {summary.map((row: any) => (
                            <Fragment key={row.month}>
                                <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontWeight: 600, padding: '8px 4px', borderTop: '1px solid var(--border-subtle)' }}>{row.month / 12}</span>
                                <span style={cellSt}>{fmt(row.income)}</span>
                                <span style={cellSt}>{fmt(row.fixedExpenses)}</span>
                                <span style={cellSt}>{fmt(row.emergencyFundBalance)}</span>
                                {hasGoal && <span style={cellSt}>{fmt(row.goalBalance)}</span>}
                                <span style={cellSt}>{fmt(row.sipBalance)}</span>
                                <span style={{ ...cellSt, fontSize: 13, fontWeight: 700, color: 'var(--color-inc)' }}>{fmt(row.netWorth)}</span>
                            </Fragment>
                        ))}
                    </div>
                </div>
            </GCard>
        </div>
    );
}

// ── Loan tab: EMI, moratorium status, outstanding balance over time ────────

function LoanTab({ plan, emi, fiveYearSummary }: { plan: any; emi: number; fiveYearSummary: any[] }) {
    const hasMoratorium = plan.loan_moratorium_months > 0;
    const statSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontFamily: 'var(--font-body)' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <GCard>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                        <p style={statSt}>Monthly EMI</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(emi)}</p>
                    </div>
                    <div>
                        <p style={statSt}>Principal</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(plan.loan_principal)}</p>
                    </div>
                    <div>
                        <p style={statSt}>Annual Rate</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>{plan.loan_annual_rate_pct}%</p>
                    </div>
                    <div>
                        <p style={statSt}>Tenure</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>{plan.loan_tenure_months} months</p>
                    </div>
                </div>
                {hasMoratorium && (
                    <p style={{ fontSize: 12, color: 'var(--color-warn)', margin: '14px 0 0', fontFamily: 'var(--font-body)' }}>
                        Interest-only for the first {plan.loan_moratorium_months} month{plan.loan_moratorium_months > 1 ? 's' : ''} — full EMI begins month {plan.loan_moratorium_months + 1}.
                    </p>
                )}
            </GCard>

            <GCard>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Outstanding Balance</p>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {fiveYearSummary.map((row: any) => (
                        <div key={row.month} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>Year {row.month / 12}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: row.loanOutstanding === 0 ? 'var(--color-inc)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                {row.loanOutstanding === 0 ? 'Paid off' : fmt(row.loanOutstanding)}
                            </span>
                        </div>
                    ))}
                </div>
            </GCard>
        </div>
    );
}
