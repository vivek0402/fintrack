'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { investmentAPI, CreateInvestmentPayload } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction, Rows, Stat } from '@/components/ui/CardParts';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CamsImporter } from '@/components/investments/CamsImporter';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { toast } from '@/store/toastStore';
import { Investment, InvestmentSummary, INVESTMENT_TYPES, GROUP_LABELS } from '@/types/investments';
import { fmt } from '@/lib/utils';
import { type, truncate } from '@/lib/typography';
import { groupHoldings, largestHolding, liveCount, signedMoney, signedPct, gainText, updatedLabel } from '@/lib/investments';
import { useQueryClient } from '@tanstack/react-query';
import { useUserQuery } from '@/hooks/queries';

const NO_INVESTMENTS: Investment[] = [];

// Same wash as the shared fields, inlined since these fields live inside already-glass Modals/cards.
const inputSt: React.CSSProperties = { ...type.body, width: '100%', height: 40, background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', padding: '0 12px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' };
const labelSt: React.CSSProperties = { ...type.label, display: 'block', marginBottom: 6 };
const errSt: React.CSSProperties = { ...type.meta, color: 'var(--color-exp-text)', margin: '4px 0 0' };
const inset: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px var(--space-3)', padding: '6px var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)' };
const rowSt: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer', borderRadius: 'var(--radius-md)', minWidth: 0 };

const today = () => new Date().toISOString().split('T')[0];

const emptyForm = {
    type: 'mutual_fund',
    name: '',
    ticker_or_folio: '',
    units: '',
    purchase_price_per_unit: '',
    current_nav_or_price: '',
    purchase_date: today(),
    account_label: '',
};

const onKeyActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};

export default function InvestmentsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    // Holdings + summary from the shared cache: revisits show them at once
    // and refresh in the background.
    const queryClient = useQueryClient();
    const investmentsQuery = useUserQuery('investments', [], async () => {
        const [invRes, sumRes] = await Promise.all([investmentAPI.getAll(), investmentAPI.getSummary()]);
        return { investments: (invRes.data.investments || []) as Investment[], summary: sumRes.data as InvestmentSummary };
    });
    const investments: Investment[] = investmentsQuery.data?.investments ?? NO_INVESTMENTS;
    const summary: InvestmentSummary | null = investmentsQuery.data?.summary ?? null;
    const loading = investmentsQuery.isPending;

    const [showAdd, setShowAdd] = useState(false);
    const [showCamsImport, setShowCamsImport] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [formLoading, setFormLoading] = useState(false);

    const [activeInvestment, setActiveInvestment] = useState<Investment | null>(null);
    const [priceValue, setPriceValue] = useState('');
    const [priceError, setPriceError] = useState('');
    const [priceLoading, setPriceLoading] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [pendingDelete, setPendingDelete] = useState<Set<string>>(new Set());

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    // Holdings feed net worth, the dashboard's allocation widgets and the
    // investment ratio -- refresh every cached query after a write.
    const fetchData = () => queryClient.invalidateQueries();

    // ── Add Investment ──────────────────────────────────────────────────────

    const validateField = (name: keyof typeof emptyForm, value: string): string => {
        switch (name) {
            case 'name':
                return value.trim() ? '' : 'Name is required.';
            case 'units': {
                const units = parseFloat(value);
                return !Number.isFinite(units) || units <= 0 ? 'Units must be greater than 0.' : '';
            }
            case 'purchase_price_per_unit': {
                const purchasePrice = parseFloat(value);
                return !Number.isFinite(purchasePrice) || purchasePrice < 0 ? 'Must be 0 or greater.' : '';
            }
            case 'current_nav_or_price': {
                const currentPrice = parseFloat(value);
                return !Number.isFinite(currentPrice) || currentPrice < 0 ? 'Must be 0 or greater.' : '';
            }
            case 'purchase_date':
                if (!value) return 'Purchase date is required.';
                return new Date(value) > new Date() ? 'Date cannot be in the future.' : '';
            default:
                return '';
        }
    };

    const validateForm = () => {
        const errors: Record<string, string> = {};
        (['name', 'units', 'purchase_price_per_unit', 'current_nav_or_price', 'purchase_date'] as const).forEach(field => {
            const message = validateField(field, form[field]);
            if (message) errors[field] = message;
        });
        return errors;
    };

    const handleFieldBlur = (name: keyof typeof emptyForm) => {
        setFormErrors(prev => ({ ...prev, [name]: validateField(name, form[name]) }));
    };

    // Re-validates on every keystroke only once a field already has a visible
    // error, so it clears live as soon as the value becomes valid instead of
    // waiting for the next blur.
    const handleFieldChange = (name: keyof typeof emptyForm, value: string) => {
        setForm(prev => ({ ...prev, [name]: value }));
        setFormErrors(prev => (prev[name] ? { ...prev, [name]: validateField(name, value) } : prev));
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const errors = validateForm();
        setFormErrors(errors);
        if (Object.keys(errors).length > 0) return;
        if (!navigator.onLine) { toast.error("You're offline — try again when connected"); return; }

        setFormLoading(true);
        try {
            const payload: CreateInvestmentPayload = {
                type: form.type,
                name: form.name.trim(),
                units: parseFloat(form.units),
                purchase_price_per_unit: parseFloat(form.purchase_price_per_unit),
                current_nav_or_price: parseFloat(form.current_nav_or_price),
                purchase_date: form.purchase_date,
                ticker_or_folio: form.ticker_or_folio.trim() || undefined,
                account_label: form.account_label.trim() || undefined,
            };
            await investmentAPI.create(payload);
            if (user) { localStorage.removeItem(`investments-cache-${user.id}`); localStorage.removeItem(`investment-ratio-cache-${user.id}`); }
            setShowAdd(false);
            setForm(emptyForm);
            setFormErrors({});
            toast.success('Investment added');
            fetchData();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to add investment.');
        } finally {
            setFormLoading(false);
        }
    };

    // ── Update Price / Delete ───────────────────────────────────────────────

    const openInvestment = (inv: Investment) => {
        setActiveInvestment(inv);
        setPriceValue(String(inv.current_nav_or_price));
        setPriceError('');
        setConfirmDelete(false);
    };

    const handlePriceSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = parseFloat(priceValue);
        if (!Number.isFinite(value) || value < 0) {
            setPriceError('Must be 0 or greater.');
            return;
        }
        if (!activeInvestment) return;
        setPriceLoading(true);
        try {
            await investmentAPI.update(activeInvestment.id, { current_nav_or_price: value });
            if (user) { localStorage.removeItem(`investments-cache-${user.id}`); localStorage.removeItem(`investment-ratio-cache-${user.id}`); }
            setActiveInvestment(null);
            toast.success('Price updated');
            fetchData();
        } catch (err: any) {
            setPriceError(err.response?.data?.error || 'Failed to update price.');
        } finally {
            setPriceLoading(false);
        }
    };

    const handleDelete = () => {
        if (!activeInvestment) return;
        const id = activeInvestment.id;

        // Optimistically hide the holding and close the modal, then give the user
        // an undo window before actually deleting — same pattern as goals/
        // transactions delete.
        setPendingDelete(prev => new Set([...prev, id]));
        setActiveInvestment(null);
        setConfirmDelete(false);

        let cancelled = false;
        toast.undo('Investment deleted', () => {
            cancelled = true;
            setPendingDelete(prev => { const s = new Set(prev); s.delete(id); return s; });
        });

        setTimeout(async () => {
            if (cancelled) return;
            try {
                await investmentAPI.delete(id);
                if (user) { localStorage.removeItem(`investments-cache-${user.id}`); localStorage.removeItem(`investment-ratio-cache-${user.id}`); }
                // Out of the cache before un-hiding, so the row never flashes back.
                queryClient.setQueryData<{ investments: Investment[]; summary: InvestmentSummary }>(['investments', user?.id],
                    prev => prev && { ...prev, investments: prev.investments.filter(i => i.id !== id) });
                setPendingDelete(prev => { const s = new Set(prev); s.delete(id); return s; });
                fetchData();
            } catch {
                toast.error('Failed to delete investment.');
                setPendingDelete(prev => { const s = new Set(prev); s.delete(id); return s; });
            }
        }, 4000);
    };

    const openAdd = () => { setShowAdd(true); setFormErrors({}); };

    // ── Derived ─────────────────────────────────────────────────────────────

    const now = new Date();
    const visibleInvestments = investments.filter(inv => !pendingDelete.has(inv.id));
    const filteredInvestments = searchQuery.trim()
        ? visibleInvestments.filter(inv => {
              const q = searchQuery.trim().toLowerCase();
              return inv.name.toLowerCase().includes(q)
                  || (inv.ticker_or_folio || '').toLowerCase().includes(q)
                  || (GROUP_LABELS[inv.type] || '').toLowerCase().includes(q);
          })
        : visibleInvestments;

    const allGroups = groupHoldings(visibleInvestments, GROUP_LABELS);
    const groups = groupHoldings(filteredInvestments, GROUP_LABELS);
    const largest = largestHolding(visibleInvestments);
    const liveHoldings = liveCount(visibleInvestments);
    const count = visibleInvestments.length;

    if (isLoading || !user) {
        return (
            <>
                <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[1, 2, 3].map(i => <SkeletonCard key={i} height={100} />)}
                </div>
            </>
        );
    }

    // ── Rows ────────────────────────────────────────────────────────────────

    const renderHolding = (inv: Investment) => {
        const open = () => openInvestment(inv);
        const gainColor = inv.unrealized_gain >= 0 ? 'var(--color-inc-text)' : 'var(--color-exp-text)';
        const meta1 = [inv.ticker_or_folio, `${inv.units} units`, `bought at ${fmt(inv.purchase_price_per_unit)}`].filter(Boolean).join(' · ');
        const updated = inv.price_source === 'mfapi' ? updatedLabel(inv.last_price_updated_at, now) : null;
        return (
            <div key={inv.id} role="button" tabIndex={0} className="pressable" onClick={open} onKeyDown={onKeyActivate(open)} style={rowSt}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{inv.name}</p>
                    <p style={{ ...type.numSmall, ...truncate, margin: 0 }}>{meta1}</p>
                    <p style={{ ...type.numSmall, ...truncate, margin: 0 }}>
                        Price {fmt(inv.current_nav_or_price)}
                        {inv.price_source === 'mfapi' && (
                            <>
                                {' · '}
                                <span style={{ color: 'var(--color-inc-text)' }}>Live price</span>
                                {updated && `, updated ${updated}`}
                            </>
                        )}
                    </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ ...type.num, margin: 0 }}>{fmt(inv.current_value)}</p>
                    <p style={{ ...type.numSmall, margin: 0, color: gainColor }}>{gainText(inv.unrealized_gain, inv.unrealized_gain_pct)}</p>
                </div>
            </div>
        );
    };

    const showTwo = groups.length > 1;

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── PAGE HEADER ── */}
                <div className="fin-page-head">
                    <div style={{ minWidth: 0 }}>
                        {count > 0 ? (
                            <p style={{ ...type.meta, margin: 0 }}>{count} holding{count !== 1 ? 's' : ''}</p>
                        ) : !loading ? (
                            <p style={{ ...type.meta, margin: 0 }}>Track your portfolio across all asset types</p>
                        ) : null}
                        <h1 style={{ ...type.heading, margin: 0 }}>Investments</h1>
                    </div>
                    <div className="fin-page-actions">
                        <Button variant="secondary" onClick={() => setShowCamsImport(true)}>Import from CAMS</Button>
                        <Button onClick={openAdd}>Add investment</Button>
                    </div>
                </div>

                {loading ? (
                    <>
                        <SkeletonCard height={150} />
                        <div className="fin-two">
                            <SkeletonCard height={220} />
                            <SkeletonCard height={220} />
                        </div>
                    </>
                ) : investments.length === 0 ? (
                    <EmptyState
                        icon={Briefcase}
                        title="No investments tracked yet"
                        subtitle="Add your first holding to start tracking your portfolio."
                        action={<Button onClick={() => setShowAdd(true)}>Add investment</Button>}
                    />
                ) : (
                    <>
                        {/* ── SUMMARY ── */}
                        {summary && count > 0 && (
                            <Card>
                                <p style={{ ...type.label, margin: 0 }}>Current value</p>
                                <p className="type-display" style={{ ...type.display, margin: '6px 0 4px' }}>{fmt(summary.total_current_value)}</p>
                                <p style={{ ...type.num, margin: 0 }}>
                                    <span style={{ color: summary.total_unrealized_gain >= 0 ? 'var(--color-inc-text)' : 'var(--color-exp-text)' }}>
                                        {gainText(summary.total_unrealized_gain, summary.total_unrealized_gain_pct)}
                                    </span>
                                    <span style={type.body}> on what you put in</span>
                                </p>
                                <div className="dash-stats">
                                    <Stat className="dash-stat" label="Invested" value={fmt(summary.total_invested)}
                                        sub={`Across ${allGroups.length} asset type${allGroups.length !== 1 ? 's' : ''}`} />
                                    <Stat className="dash-stat" label="Unrealised gain" value={signedMoney(summary.total_unrealized_gain)}
                                        sub={signedPct(summary.total_unrealized_gain, summary.total_unrealized_gain_pct)}
                                        subTone={summary.total_unrealized_gain >= 0 ? 'good' : 'bad'} />
                                    <Stat className="dash-stat" label="Holdings" value={count}
                                        sub={liveHoldings > 0 ? `${liveHoldings} live price${liveHoldings !== 1 ? 's' : ''}` : 'Manual prices'} />
                                    <Stat className="dash-stat" label="Largest holding" value={fmt(largest?.value ?? 0)}
                                        sub={largest ? `${largest.name}, ${largest.pct}%` : undefined} />
                                </div>
                            </Card>
                        )}

                        {/* ── SEARCH ── */}
                        {investments.length > 5 && (
                            <input
                                type="text"
                                aria-label="Search holdings"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search holdings"
                                style={{ ...inputSt, height: 36 }}
                            />
                        )}

                        {/* ── HOLDINGS ── */}
                        {groups.length === 0 ? (
                            <EmptyState
                                icon={Briefcase}
                                title="No holdings match your search"
                                subtitle={`Nothing found for "${searchQuery}".`}
                                action={<Button variant="secondary" onClick={() => setSearchQuery('')}>Clear search</Button>}
                            />
                        ) : (
                            <div className={showTwo ? 'fin-two' : undefined}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
                                    {groups.map(group => (
                                        <Card key={group.type}>
                                            <CardHeader
                                                title={group.label}
                                                sub={`${group.count} holding${group.count !== 1 ? 's' : ''} · ${group.pct}% of your portfolio`}
                                                action={<span style={type.num}>{fmt(group.total)}</span>}
                                            />
                                            <Rows>{group.holdings.map(renderHolding)}</Rows>
                                        </Card>
                                    ))}
                                </div>
                                {showTwo && (
                                    <div style={{ minWidth: 0 }}>
                                        <Card>
                                            <CardHeader title="Where it is held" sub="Share of your portfolio by type" />
                                            <Rows>
                                                {groups.map(group => (
                                                    <div key={group.type} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                                                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                                                            <span style={type.bodyStrong}>{group.label}</span>
                                                            <span style={type.numSmall}>{group.pct}%</span>
                                                        </div>
                                                        <ProgressBar pct={group.pct} height={4} color="var(--text-secondary)" />
                                                    </div>
                                                ))}
                                            </Rows>
                                        </Card>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ═══ CAMS IMPORT MODAL ═══ */}
            <Modal isOpen={showCamsImport} onClose={() => setShowCamsImport(false)} title="Import from CAMS" maxWidth="520px">
                <CamsImporter
                    onClose={() => setShowCamsImport(false)}
                    onSuccess={() => fetchData()}
                />
            </Modal>

            {/* ═══ ADD INVESTMENT MODAL ═══ */}
            <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setFormErrors({}); }} title="Add investment" maxWidth="480px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Button type="button" variant="secondary" onClick={() => { setShowAdd(false); setFormErrors({}); }}>Cancel</Button>
                        <Button type="submit" form="add-investment-form" isLoading={formLoading}>Add investment</Button>
                    </div>
                }
            >
                <form id="add-investment-form" onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label htmlFor="inv-type" style={labelSt}>Type</label>
                        <select id="inv-type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ ...inputSt, cursor: 'pointer' }}>
                            {INVESTMENT_TYPES.map(t => (
                                <option key={t} value={t}>{GROUP_LABELS[t]}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="inv-name" style={labelSt}>Name</label>
                        <input id="inv-name" style={inputSt} value={form.name} onChange={e => handleFieldChange('name', e.target.value)} onBlur={() => handleFieldBlur('name')} placeholder="e.g. Axis Bluechip Fund, Reliance, SBI FD…" />
                        {formErrors.name && <p style={errSt}>{formErrors.name}</p>}
                    </div>
                    <div>
                        <label htmlFor="inv-ticker" style={labelSt}>Ticker or folio (optional)</label>
                        <input id="inv-ticker" style={inputSt} value={form.ticker_or_folio} onChange={e => setForm({ ...form, ticker_or_folio: e.target.value })} placeholder="e.g. RELIANCE, 123456789" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label htmlFor="inv-units" style={labelSt}>Units</label>
                            <input id="inv-units" type="number" min="0" step="any" style={inputSt} value={form.units} onChange={e => handleFieldChange('units', e.target.value)} onBlur={() => handleFieldBlur('units')} placeholder="10" />
                            {formErrors.units && <p style={errSt}>{formErrors.units}</p>}
                        </div>
                        <div>
                            <label htmlFor="inv-date" style={labelSt}>Purchase date</label>
                            <input id="inv-date" type="date" max={today()} style={inputSt} value={form.purchase_date} onChange={e => handleFieldChange('purchase_date', e.target.value)} onBlur={() => handleFieldBlur('purchase_date')} />
                            {formErrors.purchase_date && <p style={errSt}>{formErrors.purchase_date}</p>}
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label htmlFor="inv-buy" style={labelSt}>Purchase price per unit</label>
                            <input id="inv-buy" type="number" min="0" step="any" style={inputSt} value={form.purchase_price_per_unit}
                                onChange={e => {
                                    const value = e.target.value;
                                    setForm(prev => ({ ...prev, purchase_price_per_unit: value, current_nav_or_price: prev.current_nav_or_price || value }));
                                    setFormErrors(prev => (prev.purchase_price_per_unit ? { ...prev, purchase_price_per_unit: validateField('purchase_price_per_unit', value) } : prev));
                                }}
                                onBlur={() => handleFieldBlur('purchase_price_per_unit')}
                                placeholder="100" />
                            {formErrors.purchase_price_per_unit && <p style={errSt}>{formErrors.purchase_price_per_unit}</p>}
                        </div>
                        <div>
                            <label htmlFor="inv-now" style={labelSt}>Current NAV or price</label>
                            <input id="inv-now" type="number" min="0" step="any" style={inputSt} value={form.current_nav_or_price} onChange={e => handleFieldChange('current_nav_or_price', e.target.value)} onBlur={() => handleFieldBlur('current_nav_or_price')} placeholder="120" />
                            {formErrors.current_nav_or_price && <p style={errSt}>{formErrors.current_nav_or_price}</p>}
                        </div>
                    </div>
                    <div>
                        <label htmlFor="inv-account" style={labelSt}>Account label (optional)</label>
                        <input id="inv-account" style={inputSt} value={form.account_label} onChange={e => setForm({ ...form, account_label: e.target.value })} placeholder="e.g. Zerodha, HDFC Demat…" />
                    </div>
                </form>
            </Modal>

            {/* ═══ UPDATE PRICE MODAL ═══ */}
            <Modal isOpen={!!activeInvestment} onClose={() => setActiveInvestment(null)} title={activeInvestment?.name || 'Update investment'} maxWidth="380px"
                footer={
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Button type="button" variant="secondary" onClick={() => setActiveInvestment(null)}>Cancel</Button>
                        <Button type="submit" form="update-price-form" isLoading={priceLoading}>Save price</Button>
                    </div>
                }
            >
                <form id="update-price-form" onSubmit={handlePriceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label htmlFor="inv-price" style={labelSt}>Current NAV or price</label>
                        <input id="inv-price" type="number" min="0" step="any" style={inputSt} value={priceValue} onChange={e => setPriceValue(e.target.value)} autoFocus />
                        {priceError && <p style={errSt}>{priceError}</p>}
                    </div>
                </form>

                <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--glass-border)' }}>
                    {confirmDelete ? (
                        <div style={inset}>
                            <span style={{ ...type.meta, flex: '1 1 160px', color: 'var(--text-primary)' }}>Delete this holding?</span>
                            <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                                <TextAction tone="danger" onClick={handleDelete}>Delete holding</TextAction>
                                <TextAction quiet onClick={() => setConfirmDelete(false)}>Keep it</TextAction>
                            </span>
                        </div>
                    ) : (
                        <TextAction tone="danger" onClick={() => setConfirmDelete(true)}>Delete this holding</TextAction>
                    )}
                </div>
            </Modal>
        </>
    );
}
