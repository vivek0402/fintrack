'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, SlidersHorizontal, Bookmark, Clock, ChevronDown, ChevronLeft, MoreHorizontal, Check } from 'lucide-react';
import { useIsMobile } from '@/hooks/useWindowSize';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PanelFilters, DEFAULT_PANEL, applyAdvancedFilters, countActiveFilters } from '@/lib/transactionFilters';

const PAYMENT_METHODS = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Wallet'];

interface SavedView {
    id: string;
    name: string;
    inputValue: string;
    panel: PanelFilters;
    createdAt: string;
}

interface Account { id: number; name: string }

interface ExtraChip { label: string; onClear: () => void }

interface Props {
    transactions: any[];
    onFilter: (filtered: any[]) => void;
    onSetDateContext: (ctx: 'month' | 'all') => void;
    initialQuery?: string;
    accounts?: Account[];
    extraChips?: ExtraChip[];
    onRegisterClearAll?: (fn: () => void) => void;
    // When an external top bar renders its own search/filter icons, this
    // suppresses this component's own trigger row (collapsed search icon +
    // filter icon) while keeping the expanded search input, filter panel,
    // history dropdown, summary chips and saved views intact -- those are
    // driven by the same internal state, just opened from outside.
    hideTriggers?: boolean;
    onRegisterOpenSearch?: (fn: () => void) => void;
    onRegisterOpenFilter?: (fn: () => void) => void;
    // Lets an external top bar mirror the active-filter-count badge on its
    // own filter icon when hideTriggers suppresses this component's own one.
    onActiveFilterCountChange?: (n: number) => void;
}

const LS_VIEWS = 'fintrack-saved-views';
const SS_HIST  = 'fintrack-search-history';

export function AdvancedSearchBar({ transactions, onFilter, onSetDateContext, initialQuery = '', accounts = [], extraChips = [], onRegisterClearAll, hideTriggers = false, onRegisterOpenSearch, onRegisterOpenFilter, onActiveFilterCountChange }: Props) {
    const isMobile = useIsMobile();

    const [inputValue, setInputValue]     = useState(initialQuery);
    const [panelOpen, setPanelOpen]       = useState(false);
    const [panel, setPanel]               = useState<PanelFilters>(DEFAULT_PANEL);
    const [savedViews, setSavedViews]     = useState<SavedView[]>([]);
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [saveViewName, setSaveViewName] = useState('');
    const [historyOpen, setHistoryOpen]   = useState(false);
    const [history, setHistory]           = useState<string[]>([]);
    const [dotMenuId, setDotMenuId]       = useState<string | null>(null);
    const [renameId, setRenameId]         = useState<string | null>(null);
    const [renameValue, setRenameValue]   = useState('');
    const [catOpen, setCatOpen]           = useState(false);
    const [mounted, setMounted]           = useState(false);
    const [searchExpanded, setSearchExpanded] = useState(!!initialQuery.trim());

    const inputRef  = useRef<HTMLInputElement>(null);
    const panelRef  = useRef<HTMLDivElement>(null);
    const dotMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        try { const v = localStorage.getItem(LS_VIEWS); if (v) setSavedViews(JSON.parse(v)); } catch {}
        try { const h = sessionStorage.getItem(SS_HIST); if (h) setHistory(JSON.parse(h)); } catch {}
    }, []);

    // Re-apply when initialQuery changes (from URL param)
    useEffect(() => { if (initialQuery) { setInputValue(initialQuery); setSearchExpanded(true); } }, [initialQuery]);

    const allCategories = useMemo(() =>
        [...new Set(transactions.map((tx: any) => tx.category_name).filter(Boolean))].sort() as string[],
        [transactions]
    );
    const allTags = useMemo(() =>
        [...new Set(transactions.flatMap((tx: any) => tx.tags || []))].sort() as string[],
        [transactions]
    );

    // Bounds for the amount-range slider, derived from whatever's loaded.
    const amountBounds = useMemo(() => {
        const amounts = transactions.map((t: any) => parseFloat(t.amount)).filter((n: number) => !isNaN(n) && isFinite(n));
        if (!amounts.length) return { min: 0, max: 10000 };
        const min = Math.floor(Math.min(...amounts));
        const max = Math.ceil(Math.max(...amounts));
        return { min, max: max > min ? max : min + 1000 };
    }, [transactions]);
    const sliderMin = panel.amountMin !== '' ? Math.max(amountBounds.min, parseFloat(panel.amountMin)) : amountBounds.min;
    const sliderMax = panel.amountMax !== '' ? Math.min(amountBounds.max, parseFloat(panel.amountMax)) : amountBounds.max;
    const boundsSpan = amountBounds.max - amountBounds.min || 1;
    const pctOf = (v: number) => ((v - amountBounds.min) / boundsSpan) * 100;

    const activeFilterCount = useMemo(() => countActiveFilters(inputValue, panel), [inputValue, panel]);
    useEffect(() => { onActiveFilterCountChange?.(activeFilterCount); }, [activeFilterCount]);

    // Apply filters on every change
    useEffect(() => {
        onFilter(applyAdvancedFilters(transactions, inputValue, panel));
    }, [transactions, inputValue, panel]);

    // Sync date context with parent (drives server-side fetch range) --
    // both 'all' and 'custom' need the fetch widened beyond the current
    // month so there's data outside it to filter across.
    useEffect(() => {
        onSetDateContext(panel.dateMode === 'default' ? 'month' : 'all');
    }, [panel.dateMode]);

    // Close panel on outside click (desktop overlay only -- BottomSheet handles its own backdrop)
    useEffect(() => {
        if (!panelOpen || isMobile) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPanelOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [panelOpen, isMobile]);

    // Close dot menu on outside click
    useEffect(() => {
        if (!dotMenuId) return;
        const handler = (e: MouseEvent) => {
            if (dotMenuRef.current && !dotMenuRef.current.contains(e.target as Node)) setDotMenuId(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [dotMenuId]);

    const saveToHistory = useCallback((q: string) => {
        if (!q.trim()) return;
        setHistory(prev => {
            const next = [q, ...prev.filter(h => h !== q)].slice(0, 10);
            try { sessionStorage.setItem(SS_HIST, JSON.stringify(next)); } catch {}
            return next;
        });
    }, []);

    const handleInputBlur = useCallback(() => {
        setTimeout(() => { setHistoryOpen(false); if (!inputValue.trim()) setSearchExpanded(false); }, 160);
        if (inputValue.trim()) saveToHistory(inputValue);
    }, [inputValue, saveToHistory]);

    const persistViews = (views: SavedView[]) => {
        setSavedViews(views);
        try { localStorage.setItem(LS_VIEWS, JSON.stringify(views)); } catch {}
    };

    const saveView = () => {
        if (!saveViewName.trim()) return;
        const view: SavedView = {
            id: Date.now().toString(),
            name: saveViewName.trim(),
            inputValue,
            panel: { ...panel },
            createdAt: new Date().toISOString(),
        };
        persistViews([...savedViews, view]);
        setSaveModalOpen(false);
        setSaveViewName('');
    };

    // Merge with defaults rather than replacing outright -- a view saved
    // before this filter shape changed (e.g. old 'datePreset' field, no
    // paymentMethods/accountIds) would otherwise leave new fields undefined
    // and crash on the first .length/.includes() call below.
    const applyView = (view: SavedView) => { setInputValue(view.inputValue); setPanel({ ...DEFAULT_PANEL, ...view.panel }); };
    const deleteView = (id: string) => persistViews(savedViews.filter(v => v.id !== id));
    const finishRename = () => {
        if (!renameId || !renameValue.trim()) { setRenameId(null); return; }
        persistViews(savedViews.map(v => v.id === renameId ? { ...v, name: renameValue.trim() } : v));
        setRenameId(null);
    };
    const clearAll = () => { setInputValue(''); setPanel(DEFAULT_PANEL); };

    // Expose clearAll to the parent (e.g. the filtered-empty state's "Clear
    // filters" action) via callback-prop registration, consistent with this
    // component's other callback props (onFilter, onSetDateContext) -- not
    // forwardRef/useImperativeHandle, which has no precedent elsewhere in
    // components/.
    useEffect(() => { onRegisterClearAll?.(clearAll); }, []);

    // Same registration pattern for an external top bar's search/filter icons.
    useEffect(() => {
        onRegisterOpenSearch?.(() => { setSearchExpanded(true); setTimeout(() => inputRef.current?.focus(), 30); });
    }, []);
    useEffect(() => { onRegisterOpenFilter?.(() => setPanelOpen(o => !o)); }, []);

    // Active summary chips
    const summaryChips: { label: string; onRemove: () => void }[] = [];
    if (inputValue.trim()) summaryChips.push({ label: `"${inputValue.trim()}"`, onRemove: () => { setInputValue(''); setSearchExpanded(false); } });
    if (panel.type !== 'all') summaryChips.push({ label: panel.type === 'income' ? '↑ Income' : '↓ Expense', onRemove: () => setPanel(p => ({ ...p, type: 'all' })) });
    if (panel.dateMode !== 'default') summaryChips.push({
        label: panel.dateMode === 'all' ? 'All time' : `${panel.dateFrom || '?'}–${panel.dateTo || '?'}`,
        onRemove: () => setPanel(p => ({ ...p, dateMode: 'default', dateFrom: '', dateTo: '' })),
    });
    panel.categories.forEach(c => summaryChips.push({ label: c, onRemove: () => setPanel(p => ({ ...p, categories: p.categories.filter(x => x !== c) })) }));
    if (panel.amountMin || panel.amountMax) summaryChips.push({
        label: panel.amountMin && panel.amountMax ? `₹${panel.amountMin}–₹${panel.amountMax}` : panel.amountMin ? `>₹${panel.amountMin}` : `<₹${panel.amountMax}`,
        onRemove: () => setPanel(p => ({ ...p, amountMin: '', amountMax: '' })),
    });
    panel.tags.forEach(t => summaryChips.push({ label: `#${t}`, onRemove: () => setPanel(p => ({ ...p, tags: p.tags.filter(x => x !== t) })) }));
    panel.paymentMethods.forEach(m => summaryChips.push({ label: m, onRemove: () => setPanel(p => ({ ...p, paymentMethods: p.paymentMethods.filter(x => x !== m) })) }));
    panel.accountIds.forEach(id => {
        const acc = accounts.find(a => a.id === id);
        summaryChips.push({ label: acc?.name || 'Account', onRemove: () => setPanel(p => ({ ...p, accountIds: p.accountIds.filter(x => x !== id) })) });
    });
    if (panel.hasNotes) summaryChips.push({ label: 'Has notes', onRemove: () => setPanel(p => ({ ...p, hasNotes: false })) });

    // ── Style helpers ────────────────────────────────────────────────────────
    const pillS = (active: boolean): React.CSSProperties => ({
        padding: '5px 14px', borderRadius: '999px', border: 'none', cursor: 'pointer',
        background: active ? 'var(--accent)' : 'var(--bg-surface-2)',
        color: active ? 'white' : 'var(--text-secondary)',
        fontSize: '13px', fontWeight: active ? 600 : 400,
        fontFamily: 'var(--font-body)', transition: 'all var(--transition-fast)', flexShrink: 0,
    });

    const labelS: React.CSSProperties = {
        fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        display: 'block', marginBottom: '6px', fontFamily: 'var(--font-body)',
    };

    const inputS: React.CSSProperties = {
        padding: '7px 10px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '14px',
        fontFamily: 'var(--font-body)', outline: 'none',
    };

    // ── Filter panel content (shared between desktop overlay and mobile BottomSheet) ──
    const panelContent = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Amount & Type */}
            <div>
                <label style={labelS}>Amount Range</label>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600, marginBottom: '10px' }}>
                    <span>₹{Math.round(sliderMin).toLocaleString('en-IN')}</span>
                    <span>₹{Math.round(sliderMax).toLocaleString('en-IN')}</span>
                </div>
                <div style={{ position: 'relative', height: '28px', marginBottom: '12px' }}>
                    <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '4px', background: 'var(--bg-surface-2)', borderRadius: '2px', transform: 'translateY(-50%)' }} />
                    <div style={{ position: 'absolute', top: '50%', height: '4px', background: 'var(--accent)', borderRadius: '2px', transform: 'translateY(-50%)', left: `${pctOf(sliderMin)}%`, right: `${100 - pctOf(sliderMax)}%` }} />
                    <input type="range" className="fintrack-range-thumb" min={amountBounds.min} max={amountBounds.max}
                        value={sliderMin}
                        onChange={e => setPanel(p => ({ ...p, amountMin: String(Math.min(parseFloat(e.target.value), sliderMax)) }))}
                        style={{ position: 'absolute', width: '100%', height: '28px', top: 0, left: 0, margin: 0, background: 'transparent' }} />
                    <input type="range" className="fintrack-range-thumb" min={amountBounds.min} max={amountBounds.max}
                        value={sliderMax}
                        onChange={e => setPanel(p => ({ ...p, amountMax: String(Math.max(parseFloat(e.target.value), sliderMin)) }))}
                        style={{ position: 'absolute', width: '100%', height: '28px', top: 0, left: 0, margin: 0, background: 'transparent' }} />
                </div>
                <style>{`
                    .fintrack-range-thumb { -webkit-appearance: none; appearance: none; pointer-events: none; }
                    .fintrack-range-thumb::-webkit-slider-runnable-track { background: transparent; }
                    .fintrack-range-thumb::-moz-range-track { background: transparent; }
                    .fintrack-range-thumb::-webkit-slider-thumb {
                        -webkit-appearance: none; appearance: none; pointer-events: auto;
                        width: 20px; height: 20px; border-radius: 50%;
                        background: var(--accent); border: 2px solid var(--bg-surface-1);
                        box-shadow: 0 1px 3px rgba(0,0,0,0.35); cursor: pointer; margin-top: 0;
                    }
                    .fintrack-range-thumb::-moz-range-thumb {
                        pointer-events: auto; width: 20px; height: 20px; border-radius: 50%;
                        background: var(--accent); border: 2px solid var(--bg-surface-1);
                        box-shadow: 0 1px 3px rgba(0,0,0,0.35); cursor: pointer;
                    }
                `}</style>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {(['all', 'income', 'expense'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setPanel(p => ({ ...p, type: t }))} style={pillS(panel.type === t)}>
                            {t === 'all' ? 'All' : t === 'income' ? '↑ Income' : '↓ Expense'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Category */}
            <div>
                <label style={labelS}>Category</label>
                <div style={{ position: 'relative' }}>
                    <button type="button" onClick={() => setCatOpen(o => !o)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', ...inputS, cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box' as const, color: panel.categories.length ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {panel.categories.length ? panel.categories.join(', ') : 'All categories'}
                        </span>
                        <ChevronDown size={12} style={{ flexShrink: 0 }} />
                    </button>
                    {catOpen && (
                        <div style={{ position: 'absolute', top: '38px', left: 0, right: 0, background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', maxHeight: '180px', overflowY: 'auto', zIndex: 100, boxShadow: 'var(--shadow-modal)' }}>
                            {allCategories.length === 0 && (
                                <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-body)' }}>No categories yet</div>
                            )}
                            {allCategories.map(cat => {
                                const active = panel.categories.includes(cat);
                                return (
                                    <button key={cat} type="button"
                                        onClick={() => setPanel(p => ({ ...p, categories: active ? p.categories.filter(c => c !== cat) : [...p.categories, cat] }))}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface-3)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `2px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                                            {active && <Check size={9} color="white" />}
                                        </div>
                                        {cat}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Payment method */}
            <div>
                <label style={labelS}>Payment Method</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {PAYMENT_METHODS.map(m => {
                        const active = panel.paymentMethods.includes(m);
                        return (
                            <button key={m} type="button"
                                onClick={() => setPanel(p => ({ ...p, paymentMethods: active ? p.paymentMethods.filter(x => x !== m) : [...p.paymentMethods, m] }))}
                                style={pillS(active)}>
                                {m}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Account */}
            {accounts.length > 0 && (
                <div>
                    <label style={labelS}>Account</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {accounts.map(acc => {
                            const active = panel.accountIds.includes(acc.id);
                            return (
                                <button key={acc.id} type="button"
                                    onClick={() => setPanel(p => ({ ...p, accountIds: active ? p.accountIds.filter(x => x !== acc.id) : [...p.accountIds, acc.id] }))}
                                    style={pillS(active)}>
                                    {acc.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Date */}
            <div>
                <label style={labelS}>Date</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(['default', 'all', 'custom'] as const).map(d => (
                        <button key={d} type="button" onClick={() => setPanel(p => ({ ...p, dateMode: d }))} style={pillS(panel.dateMode === d)}>
                            {{ default: 'This period', all: 'All time', custom: 'Custom range' }[d]}
                        </button>
                    ))}
                </div>
                {panel.dateMode === 'custom' && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        {[['dateFrom', 'From'], ['dateTo', 'To']].map(([key, label]) => (
                            <div key={key} style={{ flex: 1 }}>
                                <label style={{ ...labelS, marginBottom: '4px' }}>{label}</label>
                                <input type="date" value={(panel as any)[key]}
                                    onChange={e => setPanel(p => ({ ...p, [key]: e.target.value }))}
                                    style={{ ...inputS, width: '100%', boxSizing: 'border-box' as const }}
                                    onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                                    onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')} />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Tags */}
            {allTags.length > 0 && (
                <div>
                    <label style={labelS}>Tags</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {allTags.map(tag => {
                            const active = panel.tags.includes(tag);
                            return (
                                <button key={tag} type="button"
                                    onClick={() => setPanel(p => ({ ...p, tags: active ? p.tags.filter(t => t !== tag) : [...p.tags, tag] }))}
                                    style={{ padding: '3px 10px', borderRadius: '999px', border: `1px solid ${active ? '#8b5cf6' : 'var(--border-subtle)'}`, background: active ? 'rgba(139,92,246,0.12)' : 'var(--bg-surface-2)', color: active ? '#8b5cf6' : 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'all 0.15s' }}>
                                    #{tag}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Has notes */}
            <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', userSelect: 'none' }}
                    onClick={() => setPanel(p => ({ ...p, hasNotes: !p.hasNotes }))}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${panel.hasNotes ? 'var(--accent)' : 'var(--border-subtle)'}`, background: panel.hasNotes ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', flexShrink: 0 }}>
                        {panel.hasNotes && <Check size={10} color="white" />}
                    </div>
                    Has notes
                </label>
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

            {/* ── Search input + dropdown overlays (position:relative anchors them) ── */}
            <div style={{ position: 'relative' }}>

            {/* ── Search icon (collapsed) / search input (expanded) + filter icon ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

                {!searchExpanded ? (
                    !hideTriggers && (
                    <button type="button" onClick={() => { setSearchExpanded(true); setTimeout(() => inputRef.current?.focus(), 30); }}
                        title="Search"
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '48px', height: '48px', flexShrink: 0,
                            background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)', cursor: 'pointer',
                            color: inputValue.trim() ? 'var(--accent)' : 'var(--text-muted)',
                            transition: 'all var(--transition-fast)',
                        }}>
                        <Search size={18} />
                    </button>
                    )
                ) : (
                    <div
                        style={{
                            position: 'relative', flex: 1,
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '6px 12px 6px 6px',
                            background: 'var(--bg-surface-1)', border: '1px solid var(--accent)',
                            borderRadius: 'var(--radius-md)', minHeight: '48px',
                        }}
                    >
                        <button type="button" onClick={() => setSearchExpanded(false)} title="Back"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', flexShrink: 0, background: 'none', border: 'none', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <ChevronLeft size={18} />
                        </button>
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            placeholder="Search description, category, notes, tags…"
                            onFocus={() => { if (!inputValue.trim()) setHistoryOpen(true); }}
                            onBlur={handleInputBlur}
                            style={{
                                flex: 1, minWidth: 0, background: 'transparent',
                                border: 'none', outline: 'none', color: 'var(--text-primary)',
                                fontSize: '14px', fontFamily: 'var(--font-body)', padding: '2px 0',
                            }}
                        />
                        {inputValue && (
                            <button type="button" onClick={() => setInputValue('')}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px', flexShrink: 0 }}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                )}

                {!hideTriggers && (
                <button type="button" onClick={() => setPanelOpen(o => !o)} title="Filters"
                    style={{
                        position: 'relative', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '48px', height: '48px',
                        background: panelOpen ? 'var(--accent-subtle)' : 'var(--bg-surface-1)',
                        border: `1px solid ${panelOpen ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                        color: panelOpen ? 'var(--accent)' : 'var(--text-muted)',
                        borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        transition: 'all var(--transition-fast)', marginLeft: searchExpanded ? 0 : 'auto',
                    }}>
                    <SlidersHorizontal size={18} />
                    {activeFilterCount > 0 && (
                        <span style={{
                            position: 'absolute', top: '-4px', right: '-4px',
                            minWidth: '16px', height: '16px', padding: '0 3px',
                            borderRadius: '999px', background: 'var(--accent)', color: 'white',
                            fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-body)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            {activeFilterCount}
                        </span>
                    )}
                </button>
                )}
            </div>

            {/* ── Search history dropdown ───────────────────────────────────────── */}
            {historyOpen && history.length > 0 && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-modal)',
                    zIndex: 200, overflow: 'hidden',
                }}>
                    <div style={{ padding: '8px 12px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={10} /> Recent searches
                    </div>
                    {history.map((h, i) => (
                        <button key={i} type="button"
                            onClick={() => { setInputValue(h); setHistoryOpen(false); }}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface-3)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            <Clock size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                            {h}
                        </button>
                    ))}
                    <button type="button"
                        onClick={() => { setHistory([]); try { sessionStorage.removeItem(SS_HIST); } catch {} setHistoryOpen(false); }}
                        style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderTop: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'var(--color-exp)', fontSize: '12px', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                        Clear history
                    </button>
                </div>
            )}

            {/* ── Filter panel: desktop overlay ─────────────────────────────────── */}
            {panelOpen && !isMobile && (
                <div ref={panelRef} style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, maxHeight: 'min(520px, 60vh)', overflowY: 'auto', background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px', boxShadow: 'var(--shadow-modal)' }}>
                    {panelContent}
                </div>
            )}

            </div>{/* end: search + dropdown overlays wrapper */}

            {/* ── Filter panel: mobile bottom sheet ─────────────────────────────── */}
            {isMobile && (
                <BottomSheet isOpen={panelOpen} onClose={() => setPanelOpen(false)} title="Filters">
                    {panelContent}
                </BottomSheet>
            )}

            {/* ── Active filter summary row ─────────────────────────────────────── */}
            {(summaryChips.length > 0 || extraChips.length > 0) && (
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '2px', alignItems: 'center' }}>
                    {extraChips.map((chip, i) => (
                        <span key={`extra-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px 3px 10px', borderRadius: '999px', flexShrink: 0, background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', fontSize: '12px', color: 'var(--accent)', fontFamily: 'var(--font-body)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {chip.label}
                            <button type="button" onClick={chip.onClear}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, color: 'var(--accent)', lineHeight: 0 }}>
                                <X size={10} />
                            </button>
                        </span>
                    ))}
                    {summaryChips.map((chip, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px 3px 10px', borderRadius: '999px', flexShrink: 0, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {chip.label}
                            <button type="button" onClick={chip.onRemove}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, color: 'var(--text-muted)', lineHeight: 0 }}>
                                <X size={10} />
                            </button>
                        </span>
                    ))}
                    {summaryChips.length > 0 && (
                        <>
                            <button type="button" onClick={clearAll}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-exp)', fontSize: '12px', fontFamily: 'var(--font-body)', fontWeight: 500, flexShrink: 0, padding: '3px 4px', whiteSpace: 'nowrap' }}>
                                Clear all
                            </button>
                            <button type="button" onClick={() => { setSaveViewName(''); setSaveModalOpen(true); }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--accent-border)', background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: '12px', fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
                                <Bookmark size={10} />
                                Save view
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* ── Saved views row ───────────────────────────────────────────────── */}
            {savedViews.length > 0 && (
                <div ref={dotMenuRef} style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '2px', alignItems: 'center' }}>
                    {savedViews.map(view => (
                        <div key={view.id} style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: '999px', fontSize: '12px', fontFamily: 'var(--font-body)', flexShrink: 0, overflow: 'visible', position: 'relative' }}>
                            {renameId === view.id ? (
                                <input autoFocus value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') setRenameId(null); }}
                                    onBlur={finishRename}
                                    style={{ padding: '4px 10px', background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '12px', fontFamily: 'var(--font-body)', width: '100px', minWidth: 0 }} />
                            ) : (
                                <button type="button" onClick={() => applyView(view)}
                                    style={{ padding: '4px 8px 4px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font-body)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                                    <Bookmark size={10} style={{ flexShrink: 0 }} />
                                    {view.name}
                                </button>
                            )}
                            <div style={{ position: 'relative' }}>
                                <button type="button" onClick={() => setDotMenuId(dotMenuId === view.id ? null : view.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '4px 6px', color: 'var(--text-muted)', borderLeft: '1px solid var(--border-subtle)' }}>
                                    <MoreHorizontal size={12} />
                                </button>
                                {dotMenuId === view.id && (
                                    <div style={{ position: 'absolute', top: '28px', right: 0, background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-modal)', zIndex: 300, minWidth: '100px', overflow: 'hidden' }}>
                                        <button type="button"
                                            onClick={() => { setRenameId(view.id); setRenameValue(view.name); setDotMenuId(null); }}
                                            style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface-3)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                            Rename
                                        </button>
                                        <button type="button"
                                            onClick={() => { deleteView(view.id); setDotMenuId(null); }}
                                            style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-exp)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface-3)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Save view modal ──────────────────────────────────────────────── */}
            {saveModalOpen && mounted && createPortal(
                <div onClick={() => setSaveModalOpen(false)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div onClick={e => e.stopPropagation()}
                        style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px', width: '100%', maxWidth: '360px', boxShadow: 'var(--shadow-modal)', animation: 'springIn 280ms cubic-bezier(0.34,1.56,0.64,1) both' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Save filter view</h3>
                            <button type="button" onClick={() => setSaveModalOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px' }}>
                                <X size={16} />
                            </button>
                        </div>
                        <input autoFocus type="text" placeholder="e.g. Weekend Splurges"
                            value={saveViewName}
                            onChange={e => setSaveViewName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveView(); }}
                            style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', marginBottom: '16px', transition: 'border-color var(--transition-fast)' }}
                            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')} />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setSaveModalOpen(false)}
                                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface-2)', color: 'var(--text-secondary)', fontSize: '13px', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type="button" onClick={saveView} disabled={!saveViewName.trim()}
                                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: saveViewName.trim() ? 'var(--accent)' : 'var(--bg-surface-3)', color: saveViewName.trim() ? 'white' : 'var(--text-muted)', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: saveViewName.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
                                Save
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
