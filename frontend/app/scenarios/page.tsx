'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { planningAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/StatTile';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { toast } from '@/store/toastStore';
import {
    Plus, Trash2, TrendingUp, Landmark, Scissors, Wallet,
    Sparkles, ArrowLeft,
} from 'lucide-react';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtSigned = (n: number) => (n >= 0 ? '+' : '-') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

const fmtAbbrev = (n: number) => {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(1)}Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
    return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
};

const sectionTitleSt: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' };
const heroSt: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '40px', color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.02em', margin: '4px 0' };
const labelSt: React.CSSProperties = { fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', display: 'block', marginBottom: '6px' };
const inputSt: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '14px', boxSizing: 'border-box' as const };

interface ScenarioType {
    key: string;
    label: string;
    description: string;
    icon: typeof TrendingUp;
    color: string;
    bg: string;
}

const SCENARIO_TYPES: ScenarioType[] = [
    {
        key: 'investment_growth',
        label: 'Investment Growth',
        description: 'Model how a monthly SIP (plus an optional lumpsum) compounds over time at a given return rate.',
        icon: TrendingUp,
        color: 'var(--color-inc)',
        bg: 'color-mix(in srgb, var(--color-inc) 10%, transparent)',
    },
    {
        key: 'loan_impact',
        label: 'Loan Impact',
        description: 'See the EMI, total interest, and effect on your debt-to-income ratio from taking a new loan.',
        icon: Landmark,
        color: 'var(--color-warn)',
        bg: 'color-mix(in srgb, var(--color-warn) 10%, transparent)',
    },
    {
        key: 'expense_reduction',
        label: 'Expense Reduction',
        description: 'Cut a recurring monthly expense and see the savings — or what it could grow to if invested.',
        icon: Scissors,
        color: 'var(--accent)',
        bg: 'var(--accent-subtle)',
    },
    {
        key: 'income_change',
        label: 'Income Change',
        description: 'Model a salary increase and how much extra wealth it builds if part of it is invested.',
        icon: Wallet,
        color: 'var(--accent)',
        bg: 'color-mix(in srgb, var(--accent) 10%, transparent)',
    },
];

const TYPE_MAP: Record<string, ScenarioType> = Object.fromEntries(SCENARIO_TYPES.map(t => [t.key, t]));

interface Scenario {
    id: string;
    title: string;
    type: string;
    inputs_json: any;
    result_json?: any;
    created_at: string;
    updated_at: string;
}

interface ProjectionPoint { year: number; portfolio_value: number; }

function ProjectionChart({ data }: { data: ProjectionPoint[] }) {
    return (
        <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="scenarioFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="year" tickFormatter={(v) => `Y${v}`} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtAbbrev} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip
                        content={({ active, payload, label }: any) => {
                            if (!active || !payload?.length) return null;
                            return (
                                <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--bg-border-strong)', borderRadius: 8, padding: '8px 12px' }}>
                                    <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>Year {label}</p>
                                    <p style={{ margin: 0, fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(payload[0].value)}</p>
                                </div>
                            );
                        }}
                    />
                    <Area type="monotone" dataKey="portfolio_value" stroke="var(--accent)" strokeWidth={2} fill="url(#scenarioFill)" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

function previewLine(scenario: Scenario): string {
    const summary = scenario.result_json?.summary_text;
    if (summary) return summary;
    return 'Run the simulation to see results.';
}

function generateTitle(type: string, inputs: any): string {
    switch (type) {
        case 'investment_growth':
            return `₹${Math.round(inputs.monthly_amount || 0).toLocaleString('en-IN')}/mo @ ${inputs.annual_return_pct}% for ${inputs.years}y`;
        case 'loan_impact':
            return `${fmtAbbrev(inputs.loan_amount || 0)} loan @ ${inputs.interest_rate_pct}% for ${inputs.tenure_months}mo`;
        case 'expense_reduction':
            return `Cut ₹${Math.round(inputs.monthly_reduction_amount || 0).toLocaleString('en-IN')}/mo for ${inputs.years}y`;
        case 'income_change':
            return `+₹${Math.round(inputs.monthly_income_increase || 0).toLocaleString('en-IN')}/mo income for ${inputs.years}y`;
        default:
            return 'What-If Scenario';
    }
}

const DEFAULT_INPUTS: Record<string, any> = {
    investment_growth: { monthly_amount: 10000, annual_return_pct: 12, years: 10, initial_lumpsum: 0 },
    loan_impact: { loan_amount: 500000, interest_rate_pct: 10, tenure_months: 60 },
    expense_reduction: { monthly_reduction_amount: 2000, redirect_to_investment: true, investment_return_pct: 12, years: 10 },
    income_change: { monthly_income_increase: 10000, effective_from_months: 0, savings_rate_of_increase_pct: 50, investment_return_pct: 12, years: 10 },
};

export default function ScenariosPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [loading, setLoading] = useState(true);
    const [scenarios, setScenarios] = useState<Scenario[]>([]);

    const [builderOpen, setBuilderOpen] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [inputs, setInputs] = useState<any>({});
    const [result, setResult] = useState<any>(null);
    const [simLoading, setSimLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [saveTitle, setSaveTitle] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        fetchScenarios();
    }, [user]);

    function fetchScenarios() {
        setLoading(true);
        planningAPI.getScenarios()
            .then(res => setScenarios(res.data.scenarios || []))
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => setLoading(false));
    }

    function openNewBuilder() {
        setEditingId(null);
        setSelectedType(null);
        setInputs({});
        setResult(null);
        setStep(1);
        setBuilderOpen(true);
    }

    function openScenario(scenario: Scenario) {
        setEditingId(scenario.id);
        setSelectedType(scenario.type);
        setInputs(scenario.inputs_json || DEFAULT_INPUTS[scenario.type]);
        setResult(scenario.result_json || null);
        setStep(2);
        setBuilderOpen(true);
    }

    function chooseType(typeKey: string) {
        setSelectedType(typeKey);
        setInputs(DEFAULT_INPUTS[typeKey]);
        setResult(null);
        setStep(2);
    }

    function updateInput(key: string, value: any) {
        setInputs((prev: any) => ({ ...prev, [key]: value }));
    }

    function runSimulation() {
        if (!selectedType) return;
        setSimLoading(true);
        setResult(null);
        planningAPI.simulate(selectedType, inputs)
            .then(res => setResult(res.data.result))
            .catch((err: any) => toast.error(err.response?.data?.error || 'Simulation failed.'))
            .finally(() => setSimLoading(false));
    }

    function openSaveDialog() {
        setSaveTitle(generateTitle(selectedType!, inputs));
        setSaveModalOpen(true);
    }

    function saveScenario() {
        if (!selectedType || !result) return;
        setSaving(true);
        planningAPI.createScenario({ title: saveTitle, type: selectedType, inputs_json: inputs, result_json: result })
            .then(res => {
                setScenarios(prev => [res.data.scenario, ...prev]);
                toast.success('Scenario saved.');
                setSaveModalOpen(false);
                setBuilderOpen(false);
            })
            .catch((err: any) => toast.error(err.response?.data?.error || 'Failed to save scenario.'))
            .finally(() => setSaving(false));
    }

    function deleteScenario(id: string, e: React.MouseEvent) {
        e.stopPropagation();
        planningAPI.deleteScenario(id)
            .then(() => {
                setScenarios(prev => prev.filter(s => s.id !== id));
                toast.success('Scenario deleted.');
            })
            .catch(() => toast.error('Failed to delete scenario.'));
    }

    if (isLoading || !user || loading) {
        return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {[1, 2, 3].map(i => <SkeletonCard key={i} height={100} />)}
                </div>
        );
    }

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                            What-If Scenarios
                        </h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                            Explore how financial decisions affect your future
                        </p>
                    </div>
                    <Button variant="primary" onClick={openNewBuilder}>
                        <Plus size={16} /> New Scenario
                    </Button>
                </div>

                {/* ── SAVED SCENARIOS ── */}
                {scenarios.length === 0 ? (
                    <Card>
                        <EmptyState
                            icon={Sparkles}
                            title="No scenarios saved yet."
                            subtitle="Create your first what-if scenario to explore how your financial decisions play out."
                            action={<Button variant="primary" onClick={openNewBuilder}><Plus size={16} /> New Scenario</Button>}
                        />
                    </Card>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {scenarios.map(scenario => {
                            const meta = TYPE_MAP[scenario.type];
                            const Icon = meta?.icon || Sparkles;
                            return (
                                <Card key={scenario.id} onClick={() => openScenario(scenario)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: 'var(--space-4)' }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 'var(--radius-md)', flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: meta?.bg, color: meta?.color,
                                    }}>
                                        <Icon size={18} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{scenario.title}</span>
                                            <Badge color={meta?.color} bg={meta?.bg}>{meta?.label}</Badge>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                                {new Date(scenario.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {previewLine(scenario)}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => deleteScenario(scenario.id, e)}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px', display: 'flex', flexShrink: 0 }}
                                        aria-label="Delete scenario"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── SCENARIO BUILDER PANEL ── */}
            <Modal
                isOpen={builderOpen}
                onClose={() => setBuilderOpen(false)}
                title={step === 1 ? 'New Scenario' : TYPE_MAP[selectedType!]?.label}
                maxWidth="640px"
            >
                {step === 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>
                            Choose what you'd like to model:
                        </p>
                        {SCENARIO_TYPES.map(type => {
                            const Icon = type.icon;
                            return (
                                <Card key={type.key} onClick={() => chooseType(type.key)} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: 'var(--space-4)' }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 'var(--radius-md)', flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: type.bg, color: type.color,
                                    }}>
                                        <Icon size={18} />
                                    </div>
                                    <div>
                                        <p style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{type.label}</p>
                                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>{type.description}</p>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}

                {step === 2 && selectedType && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <button
                            type="button"
                            onClick={() => { setStep(1); setResult(null); }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontFamily: 'var(--font-body)', padding: 0, alignSelf: 'flex-start' }}
                        >
                            <ArrowLeft size={14} /> Change type
                        </button>

                        <ScenarioInputForm type={selectedType} inputs={inputs} onChange={updateInput} />

                        <Button variant="primary" onClick={runSimulation} isLoading={simLoading}>
                            {!simLoading && <Sparkles size={16} />} Run Simulation
                        </Button>

                        {result && !result.error && (
                            <>
                                <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
                                <ScenarioResult type={selectedType} result={result} />
                                <Card style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}>
                                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
                                        {result.summary_text}
                                    </p>
                                </Card>
                                <Button variant="secondary" onClick={openSaveDialog}>
                                    Save Scenario
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </Modal>

            {/* ── SAVE DIALOG ── */}
            <Modal
                isOpen={saveModalOpen}
                onClose={() => setSaveModalOpen(false)}
                title="Save Scenario"
                footer={
                    <Button variant="primary" onClick={saveScenario} isLoading={saving} style={{ width: '100%' }}>
                        Save
                    </Button>
                }
            >
                <label style={labelSt}>Scenario title</label>
                <input
                    type="text"
                    value={saveTitle}
                    onChange={e => setSaveTitle(e.target.value)}
                    style={inputSt}
                    autoFocus
                />
            </Modal>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Input forms
// ─────────────────────────────────────────────────────────────────────────

function NumberField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix?: string }) {
    return (
        <div>
            <label style={labelSt}>{label}{suffix ? ` (${suffix})` : ''}</label>
            <input
                type="number"
                value={value ?? ''}
                onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                style={inputSt}
            />
        </div>
    );
}

function ScenarioInputForm({ type, inputs, onChange }: { type: string; inputs: any; onChange: (key: string, value: any) => void }) {
    const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' };

    if (type === 'investment_growth') {
        return (
            <div style={grid}>
                <NumberField label="Monthly SIP amount" suffix="₹" value={inputs.monthly_amount} onChange={v => onChange('monthly_amount', v)} />
                <NumberField label="Annual return" suffix="%" value={inputs.annual_return_pct} onChange={v => onChange('annual_return_pct', v)} />
                <NumberField label="Years" value={inputs.years} onChange={v => onChange('years', v)} />
                <NumberField label="One-time lumpsum" suffix="₹, optional" value={inputs.initial_lumpsum} onChange={v => onChange('initial_lumpsum', v)} />
            </div>
        );
    }

    if (type === 'loan_impact') {
        return (
            <div style={grid}>
                <NumberField label="Loan amount" suffix="₹" value={inputs.loan_amount} onChange={v => onChange('loan_amount', v)} />
                <NumberField label="Interest rate" suffix="%" value={inputs.interest_rate_pct} onChange={v => onChange('interest_rate_pct', v)} />
                <NumberField label="Tenure" suffix="months" value={inputs.tenure_months} onChange={v => onChange('tenure_months', v)} />
            </div>
        );
    }

    if (type === 'expense_reduction') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={grid}>
                    <NumberField label="Monthly reduction" suffix="₹" value={inputs.monthly_reduction_amount} onChange={v => onChange('monthly_reduction_amount', v)} />
                    <NumberField label="Years" value={inputs.years} onChange={v => onChange('years', v)} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={!!inputs.redirect_to_investment}
                        onChange={e => onChange('redirect_to_investment', e.target.checked)}
                    />
                    Redirect savings into investments
                </label>
                {inputs.redirect_to_investment && (
                    <div style={grid}>
                        <NumberField label="Investment return" suffix="%" value={inputs.investment_return_pct} onChange={v => onChange('investment_return_pct', v)} />
                    </div>
                )}
            </div>
        );
    }

    if (type === 'income_change') {
        return (
            <div style={grid}>
                <NumberField label="Monthly income increase" suffix="₹" value={inputs.monthly_income_increase} onChange={v => onChange('monthly_income_increase', v)} />
                <NumberField label="Months until effective" value={inputs.effective_from_months} onChange={v => onChange('effective_from_months', v)} />
                <NumberField label="% of increase to invest" suffix="%" value={inputs.savings_rate_of_increase_pct} onChange={v => onChange('savings_rate_of_increase_pct', v)} />
                <NumberField label="Expected return" suffix="%" value={inputs.investment_return_pct} onChange={v => onChange('investment_return_pct', v)} />
                <NumberField label="Years" value={inputs.years} onChange={v => onChange('years', v)} />
            </div>
        );
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Result layouts
// ─────────────────────────────────────────────────────────────────────────

function ScenarioResult({ type, result }: { type: string; result: any }) {
    const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' };

    if (type === 'investment_growth') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Corpus at End</span>
                    <div style={heroSt}>{fmt(result.corpus_at_end)}</div>
                </div>
                <div style={grid}>
                    <StatTile label="Total Invested" value={fmt(result.total_invested)} />
                    <StatTile label="Total Returns" value={fmt(result.total_returns)} accentColor="var(--color-inc)" />
                    <StatTile label="Wealth Ratio" value={`${result.wealth_ratio.toFixed(2)}x`} />
                </div>
                {result.projection?.length > 0 && <ProjectionChart data={result.projection} />}
            </div>
        );
    }

    if (type === 'loan_impact') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Monthly EMI</span>
                    <div style={heroSt}>{fmt(result.emi_amount)}</div>
                </div>
                <div style={grid}>
                    <StatTile label="Total Interest" value={fmt(result.total_interest)} accentColor="var(--color-warn)" />
                    <StatTile label="Total Payable" value={fmt(result.total_payable)} />
                    <StatTile label="Payoff Date" value={result.payoff_date} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>DTI:</span>
                    <Badge bg="var(--bg-surface-2)" color="var(--text-secondary)">Before {result.current_dti_pct.toFixed(1)}%</Badge>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <Badge bg="color-mix(in srgb, var(--color-warn) 12%, transparent)" color="var(--color-warn)">After {result.new_dti_pct.toFixed(1)}%</Badge>
                    {result.dti_status_change && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>({result.dti_status_change})</span>
                    )}
                </div>
            </div>
        );
    }

    if (type === 'expense_reduction') {
        const hasCorpus = result.corpus_if_invested !== undefined;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                        {hasCorpus ? 'Corpus if Invested' : 'Monthly Savings'}
                    </span>
                    <div style={heroSt}>{fmt(hasCorpus ? result.corpus_if_invested : result.monthly_savings)}</div>
                </div>
                <div style={grid}>
                    <StatTile label="Monthly Savings" value={fmt(result.monthly_savings)} accentColor="var(--color-inc)" />
                    <StatTile label="Annual Savings" value={fmt(result.annual_savings)} accentColor="var(--color-inc)" />
                    {hasCorpus && <StatTile label="Total Invested" value={fmt(result.total_invested)} />}
                    {hasCorpus && <StatTile label="Total Returns" value={fmt(result.total_returns)} accentColor="var(--color-inc)" />}
                </div>
                {result.projection?.length > 0 && <ProjectionChart data={result.projection} />}
            </div>
        );
    }

    if (type === 'income_change') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Additional Monthly Savings</span>
                    <div style={heroSt}>{fmt(result.monthly_additional_savings)}</div>
                </div>
                <div style={grid}>
                    <StatTile label="Corpus from Savings" value={fmt(result.corpus_from_savings)} accentColor="var(--color-inc)" />
                    <StatTile label="Total Invested" value={fmt(result.total_invested)} />
                    <StatTile label="Total Returns" value={fmt(result.total_returns)} accentColor="var(--color-inc)" />
                </div>
                {result.projection?.length > 0 && <ProjectionChart data={result.projection} />}
            </div>
        );
    }

    return null;
}
