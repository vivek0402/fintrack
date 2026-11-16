'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { planningAPI } from '@/lib/api';
import { CategoryField } from '@/components/categories/CategoryPickerDialog';
import { useCategories } from '@/hooks/useCategories';
import { fmt } from '@/lib/utils';
import { type } from '@/lib/typography';
import { monthlyWaterfall, driftLabel, riskLabel, moratoriumNote } from '@/lib/planning';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction, Rows, Stat, Switch, TONE_TEXT } from '@/components/ui/CardParts';
import { Input } from '@/components/ui/Input';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { toast } from '@/store/toastStore';

const RISK_OPTIONS = [
    { key: 'safety', label: 'Safety first' },
    { key: 'balanced', label: 'Balanced' },
    { key: 'growth', label: 'Growth first' },
];

const STEP_LABELS = ['Income', 'Expenses', 'Credit card', 'Emergency fund', 'Goal', 'Loan', 'Risk profile'];

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

// A plain row: label and description on the left, the shared switch on the right.
function ToggleRow({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
            <div style={{ minWidth: 0 }}>
                <p style={{ ...type.bodyStrong, margin: 0 }}>{label}</p>
                {description && <p style={{ ...type.meta, margin: '2px 0 0' }}>{description}</p>}
            </div>
            <Switch checked={checked} onChange={onChange} aria-label={label} />
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
    const { categories } = useCategories();

    const [step, setStep] = useState(0);
    const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
    const [stepError, setStepError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [editingPlan, setEditingPlan] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
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

    // ── Delete plan ─────────────────────────────────────────────────────────

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleDeletePlan = async () => {
        setDeleting(true);
        try {
            await planningAPI.deletePlan();
        } catch (err: any) {
            // A 404 means the plan is already gone, so fall through and show the wizard.
            if (err?.response?.status !== 404) {
                toast.error('Failed to delete your financial plan');
                setDeleting(false);
                return;
            }
        }
        if (user?.id) localStorage.removeItem(`fintrack-planning-has-credit-card-${user.id}`);
        setDeleteOpen(false);
        setDeleting(false);
        setNarrative(null);
        setForm(EMPTY_FORM);
        setStep(0);
        setStepError('');
        setEditingPlan(false);
        setActiveTab('monthly');
        setPlanData({ exists: false });
        toast.success('Financial plan deleted');
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <SkeletonCard height={64} />
                <SkeletonCard height={320} />
            </div>
        );
    }

    const hasDrift = recalcResult && (recalcResult.driftedExpenses?.length > 0 || recalcResult.incomeDrift);

    // Rendered by both the plan view and the edit screen, since deleting is
    // reachable from the edit screen.
    const modals = (
        <>
            <Modal isOpen={recalcOpen} onClose={closeRecalc} title="Recalculate from recent spending" maxWidth="520px"
                footer={
                    hasDrift ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                            <Button variant="secondary" onClick={closeRecalc} disabled={applying}>Cancel</Button>
                            <Button onClick={handleApplyRecalculation} isLoading={applying}>Apply</Button>
                        </div>
                    ) : (
                        <Button variant="secondary" style={{ width: '100%' }} onClick={closeRecalc}>Close</Button>
                    )
                }
            >
                {!recalcResult ? null : !hasDrift ? (
                    <p style={{ ...type.body, margin: 0 }}>
                        Your plan still matches your recent spending.
                    </p>
                ) : (
                    <Rows>
                        {recalcResult.incomeDrift && (
                            <DriftRow
                                label="Monthly income"
                                oldAmount={recalcResult.incomeDrift.declared_amount}
                                newAmount={recalcResult.incomeDrift.actual_average}
                                percentDifference={recalcResult.incomeDrift.percent_difference}
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
                    </Rows>
                )}
            </Modal>

            <Modal isOpen={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} title="Delete financial plan"
                footer={
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                        <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting} style={{ flex: 1 }}>Cancel</Button>
                        <Button variant="danger" onClick={handleDeletePlan} isLoading={deleting} style={{ flex: 1 }}>Delete</Button>
                    </div>
                }
            >
                <p style={{ ...type.body, margin: 0 }}>
                    This removes your plan, its expenses and projections. Your transactions and goals are not affected. You can build a new plan afterwards.
                </p>
            </Modal>
        </>
    );

    // ── Setup wizard (no plan yet, or editing an existing one) ──────────────

    if (!planData?.exists || editingPlan) {
        const setField = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => setForm(f => ({ ...f, [key]: value }));
        const mono = { ...type.num };

        return (
            <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 'var(--space-6)' }}>
                <div style={{ marginBottom: 'var(--space-6)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <p style={{ ...type.meta, margin: 0 }}>
                            {`Step ${step + 1} of ${STEP_LABELS.length}: ${STEP_LABELS[step]}`}
                        </p>
                        {editingPlan && (
                            <TextAction quiet onClick={() => { setEditingPlan(false); setStepError(''); }}>Cancel</TextAction>
                        )}
                    </div>
                    <h1 style={{ ...type.heading, margin: '4px 0 var(--space-3)' }}>
                        {editingPlan ? 'Edit your financial plan' : 'Build your financial plan'}
                    </h1>
                    <div style={{ width: '100%', height: 3, background: 'var(--border-visible)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 'var(--radius-sm)', width: `${((step + 1) / STEP_LABELS.length) * 100}%`, transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
                    </div>
                </div>

                <Card>
                    {/* Step 0: Monthly income */}
                    {step === 0 && (
                        <div>
                            <CardHeader title="What's your monthly income?" sub="After-tax, take-home pay each month." />
                            <Input label="Monthly income" type="number" min="0" placeholder="80000" prefix="₹" autoFocus
                                value={form.monthly_income} style={mono}
                                onChange={e => setField('monthly_income', e.target.value)} />
                        </div>
                    )}

                    {/* Step 1: Fixed expenses */}
                    {step === 1 && (
                        <div>
                            <CardHeader title="What are your fixed monthly expenses?" sub="Rent, groceries, utilities, anything that repeats every month." />
                            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 'var(--space-3)' }}>
                                {form.expenses.map((exp, i) => (
                                    <div key={i} style={{ padding: 'var(--space-3) 0', borderTop: i > 0 ? '1px solid var(--glass-border)' : undefined, paddingTop: i === 0 ? 0 : undefined }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
                                            <div style={{ flex: '2 1 180px', minWidth: 0 }}>
                                                <Input aria-label="Expense name" placeholder="e.g. Rent" value={exp.name} onChange={e => updateExpense(i, 'name', e.target.value)} />
                                            </div>
                                            <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                                                <Input aria-label="Expense amount" type="number" min="0" placeholder="0" prefix="₹" value={exp.amount} style={mono}
                                                    onChange={e => updateExpense(i, 'amount', e.target.value)} />
                                            </div>
                                            <TextAction quiet disabled={form.expenses.length === 1} onClick={() => removeExpenseRow(i)}>Remove</TextAction>
                                        </div>
                                        <div style={{ marginTop: 'var(--space-2)' }}>
                                            <CategoryField
                                                value={exp.category_id}
                                                onChange={v => updateExpense(i, 'category_id', v)}
                                                categories={categories}
                                                allowNone
                                                noneLabel="No category (can't compare to actual spending)"
                                                placeholder="No category (can't compare to actual spending)"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <TextAction onClick={addExpenseRow}>Add an expense</TextAction>
                        </div>
                    )}

                    {/* Step 2: Credit card toggle */}
                    {step === 2 && (
                        <div>
                            <CardHeader title="Do you use a credit card?" sub="We'll use this later to show you relevant tips." />
                            <ToggleRow checked={form.has_credit_card} onChange={v => setField('has_credit_card', v)} label="I have a credit card" />
                        </div>
                    )}

                    {/* Step 3: Emergency fund */}
                    {step === 3 && (
                        <div>
                            <CardHeader title="Your emergency fund" sub="A cash buffer for the unexpected, usually 3 to 12 months of expenses." />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                <Input label="Target in months" type="number" min="1" value={form.emergency_fund_target_months} style={mono}
                                    onChange={e => setField('emergency_fund_target_months', e.target.value)} />
                                <Input label="Current balance" type="number" min="0" prefix="₹" value={form.emergency_fund_current_balance} style={mono}
                                    onChange={e => setField('emergency_fund_current_balance', e.target.value)} />
                            </div>
                        </div>
                    )}

                    {/* Step 4: Goal */}
                    {step === 4 && (
                        <div>
                            <CardHeader title="Saving for something specific?" sub="A trip, a gadget, a down payment, anything with a target amount and date." />
                            <ToggleRow checked={form.has_goal} onChange={v => setField('has_goal', v)} label="I'm saving for something specific" />
                            {form.has_goal && (
                                <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                    <Input label="Goal name" placeholder="e.g. Japan Trip" value={form.goal_name}
                                        onChange={e => setField('goal_name', e.target.value)} />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                        <Input label="Goal amount" type="number" min="0" prefix="₹" value={form.goal_amount} style={mono}
                                            onChange={e => setField('goal_amount', e.target.value)} />
                                        <Input label="Target in months" type="number" min="1" value={form.goal_target_months} style={mono}
                                            onChange={e => setField('goal_target_months', e.target.value)} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 5: Loan */}
                    {step === 5 && (
                        <div>
                            <CardHeader title="Do you have a loan?" sub="Home, car, personal, any loan with a fixed EMI." />
                            <ToggleRow checked={form.has_loan} onChange={v => setField('has_loan', v)} label="I have a loan" />
                            {form.has_loan && (
                                <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                        <Input label="Principal" type="number" min="0" prefix="₹" value={form.loan_principal} style={mono}
                                            onChange={e => setField('loan_principal', e.target.value)} />
                                        <Input label="Annual rate (%)" type="number" min="0" step="0.01" value={form.loan_annual_rate_pct} style={mono}
                                            onChange={e => setField('loan_annual_rate_pct', e.target.value)} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                        <Input label="Tenure in months" type="number" min="1" value={form.loan_tenure_months} style={mono}
                                            onChange={e => setField('loan_tenure_months', e.target.value)} />
                                        <Input label="Moratorium in months" type="number" min="0" value={form.loan_moratorium_months} style={mono}
                                            onChange={e => setField('loan_moratorium_months', e.target.value)} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 6: Risk profile */}
                    {step === 6 && (
                        <div>
                            <CardHeader title="What's your risk profile?" sub="This decides how your surplus splits between your emergency fund and investments." />
                            <Tabs tabs={RISK_OPTIONS} active={form.risk_profile}
                                onChange={key => setField('risk_profile', key as WizardForm['risk_profile'])} />
                        </div>
                    )}

                    {stepError && <p style={{ ...type.meta, color: TONE_TEXT.bad, margin: 'var(--space-3) 0 0' }}>{stepError}</p>}

                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-6)' }}>
                        {step > 0 && (
                            <Button variant="secondary" onClick={handleBack} disabled={submitting}>Back</Button>
                        )}
                        <Button style={{ flex: 1 }} onClick={handleContinue} isLoading={submitting}>
                            {step === STEP_LABELS.length - 1 ? 'Finish' : 'Continue'}
                        </Button>
                    </div>
                </Card>

                {editingPlan && (
                    <div style={{ marginTop: 'var(--space-4)' }}>
                        <TextAction tone="danger" quiet onClick={() => setDeleteOpen(true)}>Delete this plan</TextAction>
                        <p style={{ ...type.meta, margin: 'var(--space-1) 0 0' }}>
                            Removes the plan, its expenses and projections. Your transactions and goals are not affected.
                        </p>
                    </div>
                )}

                {modals}
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
        { key: 'five_year', label: 'Five years' },
        ...(hasLoan ? [{ key: 'loan', label: 'Loan' }] : []),
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-6)' }}>
            <div className="fin-page-head">
                <div style={{ minWidth: 0 }}>
                    <p style={{ ...type.meta, margin: 0 }}>How your income is split, month by month</p>
                    <h1 style={{ ...type.heading, margin: 0 }}>Financial plan</h1>
                </div>
                <div className="fin-page-actions">
                    <Button variant="secondary" onClick={handleRecalculateClick} isLoading={recalcLoading}>
                        Recalculate from recent spending
                    </Button>
                    <Button variant="secondary" onClick={handleEditClick}>
                        Edit plan
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

            {modals}
        </div>
    );
}

// ── Shared pieces ───────────────────────────────────────────────────────────

function NoteCard({ children }: { children: React.ReactNode }) {
    return <Card><p style={{ ...type.meta, margin: 0 }}>{children}</p></Card>;
}

// The lead card's caption and display figure, as on Analytics.
function LeadFigure({ label, figure }: { label: string; figure: string }) {
    return (
        <>
            <p style={{ ...type.label, margin: 0 }}>{label}</p>
            <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{figure}</p>
        </>
    );
}

// ── Recalculate modal: one row per drifted income/expense line item ────────

function DriftRow({ label, oldAmount, newAmount, percentDifference }: { label: string; oldAmount: number; newAmount: number; percentDifference: number }) {
    return (
        <div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...type.bodyStrong, margin: 0 }}>{label}</p>
                <p style={{ ...type.num, margin: '2px 0' }}>{driftLabel(oldAmount, newAmount, percentDifference)}</p>
                <p style={{ ...type.meta, margin: 0 }}>
                    Averaged {fmt(newAmount)} over the last 3 months. You had declared {fmt(oldAmount)}.
                </p>
            </div>
        </div>
    );
}

// ── Start tab: setup checklist (AI narrative once it lands, static until then) ──

function StartTab({ checklist }: { checklist?: { title: string; description: string }[] }) {
    if (!checklist || checklist.length === 0) {
        return <NoteCard>Your setup checklist will appear here once your plan finishes generating.</NoteCard>;
    }
    return (
        <Card>
            <Rows>
                {checklist.map((item, i) => (
                    <div key={i} style={{ alignItems: 'flex-start' }}>
                        <span style={{ ...type.numSmall, width: 20, flexShrink: 0 }}>{i + 1}</span>
                        <div style={{ minWidth: 0 }}>
                            <p style={{ ...type.bodyStrong, margin: 0 }}>{item.title}</p>
                            <p style={{ ...type.meta, margin: '2px 0 0' }}>{item.description}</p>
                        </div>
                    </div>
                ))}
            </Rows>
        </Card>
    );
}

// ── Monthly tab: income, three figures, then where every rupee goes ────────

function MonthlyTab({ plan, expenses, projection }: { plan: any; expenses: any[]; projection: any[] }) {
    const month1 = projection?.[0];
    if (!month1) return <NoteCard>No projection available.</NoteCard>;

    const hasLoan = plan.loan_principal !== null;
    const inMoratorium = hasLoan && plan.loan_moratorium_months >= 1;
    const w = monthlyWaterfall(plan, expenses, month1);

    const sentence = w.balanced
        ? { text: 'Every rupee is accounted for. The totals add up to your income.', color: undefined }
        : w.deficit
            ? { text: "This month's fixed costs exceed your income, so there is nothing left to allocate.", color: TONE_TEXT.caution }
            : { text: `The allocations are ${fmt(Math.abs(w.endingBalance))} away from your income. This points to a problem in the planning engine.`, color: TONE_TEXT.bad };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Card>
                <LeadFigure label="Monthly income" figure={fmt(month1.income)} />
                <p style={{ ...type.meta, margin: 'var(--space-2) 0 0', color: sentence.color ?? type.meta.color }}>{sentence.text}</p>
                <div className="dash-stats">
                    <Stat className="dash-stat" label="Fixed costs" value={fmt(w.fixedCosts)}
                        sub={`${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'}`} />
                    <Stat className="dash-stat" label="Loan"
                        value={hasLoan ? fmt(month1.loanPayment) : 'None'}
                        sub={hasLoan ? (inMoratorium ? 'Interest only' : 'Monthly payment') : 'No loan in this plan'} />
                    <Stat className="dash-stat" label="Saved and invested" value={fmt(w.savedAndInvested)} sub={`${w.savedPct}% of income`} />
                </div>
            </Card>

            <Card>
                <CardHeader title="Where it goes" sub="In order, with what is left after each line" />
                <Rows>
                    {w.rows.map((r, i) => (
                        <div key={i} style={{ justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                            <div style={{ minWidth: 0 }}>
                                <p style={{ ...type.bodyStrong, margin: 0 }}>{r.label}</p>
                                {r.note && <p style={{ ...type.meta, margin: '2px 0 0' }}>{r.note}</p>}
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <p style={{ ...type.num, margin: 0 }}>{r.amount > 0 ? '−' : ''}{fmt(r.amount)}</p>
                                <p style={{ ...type.meta, margin: '2px 0 0' }}>Left: {fmt(r.running)}</p>
                            </div>
                        </div>
                    ))}
                </Rows>
            </Card>
        </div>
    );
}

// ── Portfolio tab: how the surplus is split, then funds by role ─────────────

function FundRows({ funds }: { funds: { name: string; plan_type: string; platform: string }[] }) {
    return (
        <Rows>
            {funds.map(f => (
                <div key={f.name}>
                    <div style={{ minWidth: 0 }}>
                        <p style={{ ...type.bodyStrong, margin: 0 }}>{f.name}</p>
                        <p style={{ ...type.meta, margin: '2px 0 0' }}>{f.plan_type} · {f.platform}</p>
                    </div>
                </div>
            ))}
        </Rows>
    );
}

function PortfolioTab({ plan, expenses, month1, recommendedFunds, rationale, emergencyFundReachedMonth, goalReachedMonth }: {
    plan: any; expenses: any[]; month1: any; recommendedFunds: any[]; rationale?: string;
    emergencyFundReachedMonth: number | null; goalReachedMonth: number | null;
}) {
    if (!month1) return <NoteCard>No projection available.</NoteCard>;

    const efFund = recommendedFunds.find((f: any) => f.role === 'liquidEmergencyFund');
    const equityFunds = recommendedFunds.filter((f: any) => f.role === 'broadMarketIndex' || f.role === 'secondaryIndex' || f.role === 'elssTaxSaver');
    const goalFund = recommendedFunds.find((f: any) => f.role === 'goalFund');
    const hasGoal = plan.goal_amount !== null;

    const fixedExpenseTotal = expenses.reduce((sum: number, e: any) => sum + e.amount, 0);
    const efTarget = plan.emergency_fund_target_months * fixedExpenseTotal;
    const efPct = efTarget > 0 ? (plan.emergency_fund_current_balance / efTarget) * 100 : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Card>
                <CardHeader title="How your surplus is split" sub={`${riskLabel(plan.risk_profile)} risk profile`} flush={false} />
                <p style={{ ...type.body, margin: 0 }}>{rationale || 'Your surplus is split by your risk profile.'}</p>
            </Card>

            <div className="fin-two">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
                    <Card>
                        <CardHeader title="Emergency fund"
                            sub={`This month ${fmt(month1.emergencyFundContribution)}${emergencyFundReachedMonth != null ? ` · on track for month ${emergencyFundReachedMonth}` : ''}`}
                            action={<span style={type.num}>{fmt(plan.emergency_fund_current_balance)} of {fmt(efTarget)}</span>} />
                        <div style={{ marginBottom: 'var(--space-4)' }}>
                            <ProgressBar pct={efPct} color="var(--text-secondary)" height={6} />
                        </div>
                        {efFund && <FundRows funds={[efFund]} />}
                    </Card>

                    {hasGoal && goalFund && (
                        <Card>
                            <CardHeader title={`Goal: ${plan.goal_name}`}
                                sub={`${fmt(month1.goalPayment)} a month${goalReachedMonth != null ? ` · on track for month ${goalReachedMonth}` : ''}`}
                                action={<span style={type.num}>{fmt(plan.goal_amount)} target</span>} />
                            <FundRows funds={[goalFund]} />
                        </Card>
                    )}
                </div>

                <Card>
                    <CardHeader title="SIP and investments" sub="Funds to start with"
                        action={<span style={type.num}>{fmt(month1.sipContribution)} a month</span>} />
                    <FundRows funds={equityFunds} />
                </Card>
            </div>
        </div>
    );
}

// ── Five years: net worth lead, then a year-by-year table ───────────────────

function FiveYearTab({ plan, summary, summaryText }: { plan: any; summary: any[]; summaryText?: string }) {
    if (!summary || summary.length === 0) return <NoteCard>No projection available.</NoteCard>;

    const hasGoal = plan.goal_amount !== null;
    const columns = ['Year', 'Income', 'Expenses', 'Emergency fund', ...(hasGoal ? ['Goal'] : []), 'SIP', 'Net worth'];
    const headSt: React.CSSProperties = { ...type.meta, textAlign: 'right', padding: '0 var(--space-2) var(--space-2)', whiteSpace: 'nowrap' };
    const cellSt: React.CSSProperties = { ...type.numSmall, textAlign: 'right', padding: 'var(--space-3) var(--space-2)', borderTop: '1px solid var(--glass-border)', whiteSpace: 'nowrap' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Card>
                <LeadFigure label="Net worth after five years" figure={fmt(summary[summary.length - 1].netWorth)} />
                {summaryText && <p style={{ ...type.body, margin: 'var(--space-3) 0 0' }}>{summaryText}</p>}
            </Card>

            <Card>
                <CardHeader title="Year by year" sub="Balances at the end of each year" />
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                        <thead>
                            <tr>
                                {columns.map((c, i) => (
                                    <th key={c} scope="col" style={{ ...headSt, textAlign: i === 0 ? 'left' : 'right' }}>{c}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {summary.map((row: any) => (
                                <tr key={row.month}>
                                    <td style={{ ...type.bodyStrong, padding: 'var(--space-3) var(--space-2)', borderTop: '1px solid var(--glass-border)' }}>{row.month / 12}</td>
                                    <td style={cellSt}>{fmt(row.income)}</td>
                                    <td style={cellSt}>{fmt(row.fixedExpenses)}</td>
                                    <td style={cellSt}>{fmt(row.emergencyFundBalance)}</td>
                                    {hasGoal && <td style={cellSt}>{fmt(row.goalBalance)}</td>}
                                    <td style={cellSt}>{fmt(row.sipBalance)}</td>
                                    <td style={cellSt}>{fmt(row.netWorth)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

// ── Loan tab: EMI lead, then outstanding balance over time ──────────────────

function LoanTab({ plan, emi, fiveYearSummary }: { plan: any; emi: number; fiveYearSummary: any[] }) {
    const note = moratoriumNote(plan);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Card>
                <LeadFigure label="Monthly EMI" figure={fmt(emi)} />
                {note && <p style={{ ...type.meta, margin: 'var(--space-2) 0 0' }}>{note}</p>}
                <div className="dash-stats">
                    <Stat className="dash-stat" label="Principal" value={fmt(plan.loan_principal)} />
                    <Stat className="dash-stat" label="Annual rate" value={`${plan.loan_annual_rate_pct}%`} />
                    <Stat className="dash-stat" label="Tenure" value={`${plan.loan_tenure_months} months`} />
                </div>
            </Card>

            <Card>
                <CardHeader title="Outstanding balance" sub="What is left to pay at the end of each year" />
                <Rows>
                    {fiveYearSummary.map((row: any) => (
                        <div key={row.month} style={{ justifyContent: 'space-between' }}>
                            <span style={type.bodyStrong}>Year {row.month / 12}</span>
                            <span style={type.num}>{row.loanOutstanding === 0 ? 'Paid off' : fmt(row.loanOutstanding)}</span>
                        </div>
                    ))}
                </Rows>
            </Card>
        </div>
    );
}
