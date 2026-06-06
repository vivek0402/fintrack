'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, SlidersHorizontal, Bookmark, Clock, ChevronDown, MoreHorizontal, Check } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PanelFilters {
    amountMin: string;
    amountMax: string;
    categories: string[];
    type: 'all' | 'income' | 'expense';
    datePreset: 'all' | 'this-month' | 'last-month' | 'last-3-months' | 'custom';
    dateFrom: string;
    dateTo: string;
    tags: string[];
    hasNotes: boolean;
    isRegretted: boolean;
}

export const DEFAULT_PANEL: PanelFilters = {
    amountMin: '', amountMax: '',
    categories: [], type: 'all',
    datePreset: 'all', dateFrom: '', dateTo: '',
    tags: [], hasNotes: false, isRegretted: false,
};

interface ParsedToken {
    id: string;
    prefix: 'amount' | 'category' | 'type' | 'tag' | 'date' | 'notes';
    value: string;
    raw: string;
    color: string;
    bg: string;
}

interface SavedView {
    id: string;
    name: string;
    inputValue: string;
    panel: PanelFilters;
    createdAt: string;
}

// ── Token colors ──────────────────────────────────────────────────────────────

const TOKEN_STYLES: Record<string, { color: string; bg: string }> = {
    amount:   { color: 'var(--color-warn)', bg: 'rgba(217,119,6,0.12)'    },
    category: { color: 'var(--color-info)', bg: 'rgba(79,70,229,0.12)'    },
    type:     { color: 'var(--accent)',     bg: 'var(--accent-light)'      },
    tag:      { color: '#8b5cf6',           bg: 'rgba(139,92,246,0.12)'   },
    date:     { color: 'var(--color-inc)',  bg: 'rgba(5,150,105,0.12)'    },
    notes:    { color: 'var(--text-secondary)', bg: 'var(--bg-alt)'       },
};

// ── Parsing ───────────────────────────────────────────────────────────────────

function parseTokens(input: string): ParsedToken[] {
    const re = /\b(amount|category|type|tag|date|notes):([^\s]+)/gi;
    const tokens: ParsedToken[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(input)) !== null) {
        const prefix = match[1].toLowerCase() as ParsedToken['prefix'];
        tokens.push({
            id: `${prefix}-${match[2]}-${match.index}`,
            prefix,
            value: match[2],
            raw: match[0],
            ...(TOKEN_STYLES[prefix] || TOKEN_STYLES.notes),
        });
    }
    return tokens;
}

function stripTokens(input: string): string {
    return input.replace(/\b(amount|category|type|tag|date|notes):[^\s]+/gi, '').replace(/\s+/g, ' ').trim();
}

// ── Date bounds ────────────────────────────────────────────────────────────────

function getDateBounds(preset: PanelFilters['datePreset'], from: string, to: string): [Date | null, Date | null] {
    const now = new Date();
    if (preset === 'this-month') return [new Date(now.getFullYear(), now.getMonth(), 1), null];
    if (preset === 'last-month') {
        const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        return [new Date(y, m, 1), new Date(y, m + 1, 0)];
    }
    if (preset === 'last-3-months') return [new Date(now.getFullYear(), now.getMonth() - 3, 1), null];
    if (preset === 'custom') return [from ? new Date(from) : null, to ? new Date(to) : null];
    return [null, null];
}

// ── Filter application (exported for use in page) ─────────────────────────────

export function applyAdvancedFilters(
    transactions: any[],
    inputValue: string,
    panel: PanelFilters,
): any[] {
    const tokens = parseTokens(inputValue);
    const freeText = stripTokens(inputValue).toLowerCase();
    let r = [...transactions];

    if (freeText) {
        r = r.filter(tx =>
            tx.description?.toLowerCase().includes(freeText) ||
            tx.category_name?.toLowerCase().includes(freeText) ||
            tx.notes?.toLowerCase().includes(freeText) ||
            tx.tags?.some((t: string) => t.toLowerCase().includes(freeText))
        );
    }

    for (const tok of tokens) {
        const v = tok.value;
        if (tok.prefix === 'amount') {
            if (v.startsWith('>')) { const n = parseFloat(v.slice(1)); if (!isNaN(n)) r = r.filter(tx => parseFloat(tx.amount) > n); }
            else if (v.startsWith('<')) { const n = parseFloat(v.slice(1)); if (!isNaN(n)) r = r.filter(tx => parseFloat(tx.amount) < n); }
            else if (v.includes('-')) {
                const [a, b] = v.split('-').map(Number);
                if (!isNaN(a) && !isNaN(b)) r = r.filter(tx => { const amt = parseFloat(tx.amount); return amt >= a && amt <= b; });
            } else {
                const n = parseFloat(v); if (!isNaN(n)) r = r.filter(tx => parseFloat(tx.amount) === n);
            }
        } else if (tok.prefix === 'category') {
            r = r.filter(tx => tx.category_name?.toLowerCase().includes(v.toLowerCase()));
        } else if (tok.prefix === 'type') {
            if (v === 'income' || v === 'expense') r = r.filter(tx => tx.type === v);
        } else if (tok.prefix === 'tag') {
            r = r.filter(tx => tx.tags?.some((t: string) => t.toLowerCase().includes(v.toLowerCase())));
        } else if (tok.prefix === 'date') {
            const now = new Date(); const vl = v.toLowerCase();
            if (vl === 'this-month') {
                r = r.filter(tx => { const d = new Date((tx.date || '').split('T')[0]); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
            } else if (vl === 'last-month') {
                const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
                const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
                r = r.filter(tx => { const d = new Date((tx.date || '').split('T')[0]); return d.getFullYear() === y && d.getMonth() === m; });
            } else if (vl === 'last-3-months') {
                const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                r = r.filter(tx => new Date((tx.date || '').split('T')[0]) >= cutoff);
            }
        } else if (tok.prefix === 'notes') {
            r = r.filter(tx => tx.notes?.toLowerCase().includes(v.toLowerCase()));
        }
    }

    if (panel.amountMin) { const n = parseFloat(panel.amountMin); if (!isNaN(n)) r = r.filter(tx => parseFloat(tx.amount) >= n); }
    if (panel.amountMax) { const n = parseFloat(panel.amountMax); if (!isNaN(n)) r = r.filter(tx => parseFloat(tx.amount) <= n); }
    if (panel.categories.length > 0) r = r.filter(tx => panel.categories.some(c => tx.category_name?.toLowerCase() === c.toLowerCase()));
    if (panel.type !== 'all') r = r.filter(tx => tx.type === panel.type);
    if (panel.datePreset !== 'all') {
        const [from, to] = getDateBounds(panel.datePreset, panel.dateFrom, panel.dateTo);
        r = r.filter(tx => {
            const d = new Date((tx.date || '').split('T')[0]);
            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
        });
    }
    if (panel.tags.length > 0) r = r.filter(tx => panel.tags.some(tag => tx.tags?.includes(tag)));
    if (panel.hasNotes) r = r.filter(tx => tx.notes && tx.notes.trim());
    if (panel.isRegretted) r = r.filter(tx => tx.is_regretted);

    return r;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
    transactions: any[];
    onFilter: (filtered: any[]) => void;
    onSetDateContext: (ctx: 'month' | 'all') => void;
    initialQuery?: string;
}

const LS_VIEWS = 'fintrack-saved-views';
const SS_HIST  = 'fintrack-search-history';

export function AdvancedSearchBar({ transactions, onFilter, onSetDateContext, initialQuery = '' }: Props) {
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

    const inputRef  = useRef<HTMLInputElement>(null);
    const panelRef  = useRef<HTMLDivElement>(null);
    const dotMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        try { const v = localStorage.getItem(LS_VIEWS); if (v) setSavedViews(JSON.parse(v)); } catch {}
        try { const h = sessionStorage.getItem(SS_HIST); if (h) setHistory(JSON.parse(h)); } catch {}
    }, []);

    // Re-apply when initialQuery changes (from URL param)
    useEffect(() => { if (initialQuery) setInputValue(initialQuery); }, [initialQuery]);

    const tokens = useMemo(() => parseTokens(inputValue), [inputValue]);
    const freeTextDisplay = useMemo(() => stripTokens(inputValue), [inputValue]);

    const allCategories = useMemo(() =>
        [...new Set(transactions.map((tx: any) => tx.category_name).filter(Boolean))].sort() as string[],
        [transactions]
    );
    const allTags = useMemo(() =>
        [...new Set(transactions.flatMap((tx: any) => tx.tags || []))].sort() as string[],
        [transactions]
    );

    const isAnyFilterActive = useMemo(() =>
        !!(inputValue.trim() || panel.amountMin || panel.amountMax ||
           panel.categories.length || panel.type !== 'all' ||
           panel.datePreset !== 'all' || panel.tags.length ||
           panel.hasNotes || panel.isRegretted),
        [inputValue, panel]
    );

    // Apply filters on every change
    useEffect(() => {
        onFilter(applyAdvancedFilters(transactions, inputValue, panel));
    }, [transactions, inputValue, panel]);

    // Sync date context with parent (drives server-side fetch range)
    useEffect(() => {
        onSetDateContext(panel.datePreset === 'all' ? 'month' : 'all');
    }, [panel.datePreset]);

    // Close panel on outside click
    useEffect(() => {
        if (!panelOpen) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPanelOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [panelOpen]);

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

    const handleInputChange = useCallback((newFree: string) => {
        const tokenPart = tokens.map(t => t.raw).join(' ');
        const full = [tokenPart, newFree].filter(Boolean).join(' ');
        setInputValue(full);
    }, [tokens]);

    const handleInputBlur = useCallback(() => {
        setTimeout(() => setHistoryOpen(false), 160);
        if (inputValue.trim()) saveToHistory(inputValue);
    }, [inputValue, saveToHistory]);

    const removeToken = useCallback((raw: string) => {
        setInputValue(prev => prev.replace(raw, '').replace(/\s+/g, ' ').trim());
    }, []);

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

    const applyView = (view: SavedView) => { setInputValue(view.inputValue); setPanel(view.panel); };
    const deleteView = (id: string) => persistViews(savedViews.filter(v => v.id !== id));
    const finishRename = () => {
        if (!renameId || !renameValue.trim()) { setRenameId(null); return; }
        persistViews(savedViews.map(v => v.id === renameId ? { ...v, name: renameValue.trim() } : v));
        setRenameId(null);
    };
    const clearAll = () => { setInputValue(''); setPanel(DEFAULT_PANEL); };

    // Active summary chips (panel-only; token chips are visible in the search bar)
    const summaryChips: { label: string; onRemove: () => void }[] = [];
    if (panel.type !== 'all') summaryChips.push({ label: panel.type === 'income' ? '↑ Income' : '↓ Expense', onRemove: () => setPanel(p => ({ ...p, type: 'all' })) });
    if (panel.datePreset !== 'all') summaryChips.push({
        label: ({ 'this-month': 'This month', 'last-month': 'Last month', 'last-3-months': 'Last 3 months', custom: `${panel.dateFrom || '?'}–${panel.dateTo || '?'}` } as Record<string, string>)[panel.datePreset] || panel.datePreset,
        onRemove: () => setPanel(p => ({ ...p, datePreset: 'all', dateFrom: '', dateTo: '' })),
    });
    panel.categories.forEach(c => summaryChips.push({ label: c, onRemove: () => setPanel(p => ({ ...p, categories: p.categories.filter(x => x !== c) })) }));
    if (panel.amountMin || panel.amountMax) summaryChips.push({
        label: panel.amountMin && panel.amountMax ? `₹${panel.amountMin}–₹${panel.amountMax}` : panel.amountMin ? `>₹${panel.amountMin}` : `<₹${panel.amountMax}`,
        onRemove: () => setPanel(p => ({ ...p, amountMin: '', amountMax: '' })),
    });
    panel.tags.forEach(t => summaryChips.push({ label: `#${t}`, onRemove: () => setPanel(p => ({ ...p, tags: p.tags.filter(x => x !== t) })) }));
    if (panel.hasNotes) summaryChips.push({ label: 'Has notes', onRemove: () => setPanel(p => ({ ...p, hasNotes: false })) });
    if (panel.isRegretted) summaryChips.push({ label: 'Regretted', onRemove: () => setPanel(p => ({ ...p, isRegretted: false })) });

    // ── Style helpers ────────────────────────────────────────────────────────
    const pillS = (active: boolean): React.CSSProperties => ({
        padding: '5px 14px', borderRadius: '999px', border: 'none', cursor: 'pointer',
        background: active ? 'var(--accent)' : 'var(--bg-alt)',
        color: active ? 'white' : 'var(--text-secondary)',
        fontSize: '13px', fontWeight: active ? 600 : 400,
        fontFamily: 'var(--font-body)', transition: 'all var(--transition-fast)', flexShrink: 0,
    });

    const labelS: React.CSSProperties = {
        fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        display: 'block', marginBottom: '6px', fontFamily: 'var(--font-body)',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

            {/* ── Search input + dropdown overlays (position:relative anchors them) ── */}
            <div style={{ position: 'relative' }}>

            {/* ── Search input with token chips ──────────────────────────────────── */}
            <div
                style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px',
                    padding: '6px 44px 6px 36px',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', minHeight: '44px', cursor: 'text',
                    transition: 'border-color var(--transition-fast)',
                }}
                onClick={() => inputRef.current?.focus()}
            >
                <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />

                {tokens.map(tok => (
                    <span key={tok.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '2px 6px 2px 8px', borderRadius: '999px',
                        fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-body)',
                        color: tok.color, background: tok.bg,
                        border: `1px solid ${tok.color}33`, flexShrink: 0, whiteSpace: 'nowrap',
                    }}>
                        {tok.raw}
                        <button type="button"
                            onClick={e => { e.stopPropagation(); removeToken(tok.raw); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, color: tok.color, lineHeight: 0, flexShrink: 0 }}>
                            <X size={10} />
                        </button>
                    </span>
                ))}

                <input
                    ref={inputRef}
                    type="text"
                    value={freeTextDisplay}
                    onChange={e => handleInputChange(e.target.value)}
                    placeholder={tokens.length === 0 ? 'Search or type amount:>500 category:food…' : ''}
                    onFocus={() => { if (!inputValue.trim()) setHistoryOpen(true); }}
                    onBlur={handleInputBlur}
                    style={{
                        flex: 1, minWidth: '120px', background: 'transparent',
                        border: 'none', outline: 'none', color: 'var(--text-primary)',
                        fontSize: '14px', fontFamily: 'var(--font-body)', padding: '2px 0',
                    }}
                />

                <div style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '2px', alignItems: 'center' }}>
                    {isAnyFilterActive && (
                        <button type="button" onClick={clearAll}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px' }}>
                            <X size={14} />
                        </button>
                    )}
                    <button type="button" onClick={() => setPanelOpen(o => !o)} title="Filters"
                        style={{
                            background: panelOpen ? 'var(--accent-light)' : 'none',
                            border: 'none', cursor: 'pointer',
                            color: panelOpen ? 'var(--accent)' : 'var(--text-muted)',
                            display: 'flex', padding: '4px', borderRadius: '6px',
                            transition: 'all var(--transition-fast)',
                        }}>
                        <SlidersHorizontal size={15} />
                    </button>
                </div>
            </div>

            {/* ── Search history dropdown ───────────────────────────────────────── */}
            {historyOpen && history.length > 0 && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
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
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            <Clock size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                            {h}
                        </button>
                    ))}
                    <button type="button"
                        onClick={() => { setHistory([]); try { sessionStorage.removeItem(SS_HIST); } catch {} setHistoryOpen(false); }}
                        style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', color: 'var(--color-exp)', fontSize: '12px', fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                        Clear history
                    </button>
                </div>
            )}

            {/* ── Filter panel ──────────────────────────────────────────────────── */}
            {panelOpen && (
                <div ref={panelRef} style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, maxHeight: 'min(480px, 60vh)', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: 'var(--shadow-modal)' }}>

                    {/* Amount range */}
                    <div>
                        <label style={labelS}>Amount</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {[['amountMin', 'Min ₹'], ['amountMax', 'Max ₹']] .map(([key, ph]) => (
                                <input key={key} type="number" placeholder={ph}
                                    value={(panel as any)[key]}
                                    onChange={e => setPanel(p => ({ ...p, [key]: e.target.value }))}
                                    style={{ width: '110px', flex: 'none', padding: '6px 10px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', outline: 'none' }}
                                    onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                                    onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                            ))}
                        </div>
                    </div>

                    {/* Category multi-select */}
                    <div>
                        <label style={labelS}>Category</label>
                        <div style={{ position: 'relative' }}>
                            <button type="button" onClick={() => setCatOpen(o => !o)}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '7px 10px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: panel.categories.length ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-body)', cursor: 'pointer', textAlign: 'left' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {panel.categories.length ? panel.categories.join(', ') : 'All categories'}
                                </span>
                                <ChevronDown size={12} style={{ flexShrink: 0 }} />
                            </button>
                            {catOpen && (
                                <div style={{ position: 'absolute', top: '36px', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: '180px', overflowY: 'auto', zIndex: 100, boxShadow: 'var(--shadow-modal)' }}>
                                    {allCategories.length === 0 && (
                                        <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-body)' }}>No categories yet</div>
                                    )}
                                    {allCategories.map(cat => {
                                        const active = panel.categories.includes(cat);
                                        return (
                                            <button key={cat} type="button"
                                                onClick={() => setPanel(p => ({ ...p, categories: active ? p.categories.filter(c => c !== cat) : [...p.categories, cat] }))}
                                                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                                <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
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

                    {/* Type toggle */}
                    <div>
                        <label style={labelS}>Type</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {(['all', 'income', 'expense'] as const).map(t => (
                                <button key={t} type="button" onClick={() => setPanel(p => ({ ...p, type: t }))} style={pillS(panel.type === t)}>
                                    {t === 'all' ? 'All' : t === 'income' ? '↑ Income' : '↓ Expense'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Date range */}
                    <div>
                        <label style={labelS}>Date range</label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {(['all', 'this-month', 'last-month', 'last-3-months', 'custom'] as const).map(d => (
                                <button key={d} type="button" onClick={() => setPanel(p => ({ ...p, datePreset: d }))} style={pillS(panel.datePreset === d)}>
                                    {{ all: 'All time', 'this-month': 'This month', 'last-month': 'Last month', 'last-3-months': 'Last 3 months', custom: 'Custom' }[d]}
                                </button>
                            ))}
                        </div>
                        {panel.datePreset === 'custom' && (
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                {[['dateFrom', 'From'], ['dateTo', 'To']].map(([key, label]) => (
                                    <div key={key} style={{ flex: 1 }}>
                                        <label style={{ ...labelS, marginBottom: '4px' }}>{label}</label>
                                        <input type="date" value={(panel as any)[key]}
                                            onChange={e => setPanel(p => ({ ...p, [key]: e.target.value }))}
                                            style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                                            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                                            onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
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
                                            style={{ padding: '3px 10px', borderRadius: '999px', border: `1px solid ${active ? '#8b5cf6' : 'var(--border)'}`, background: active ? 'rgba(139,92,246,0.12)' : 'var(--bg-alt)', color: active ? '#8b5cf6' : 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'all 0.15s' }}>
                                            #{tag}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Checkboxes */}
                    <div style={{ display: 'flex', gap: '20px' }}>
                        {([['hasNotes', 'Has notes'], ['isRegretted', 'Regretted']] as const).map(([key, lbl]) => (
                            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', userSelect: 'none' }}
                                onClick={() => setPanel(p => ({ ...p, [key]: !p[key] }))}>
                                <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${panel[key] ? 'var(--accent)' : 'var(--border)'}`, background: panel[key] ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', flexShrink: 0 }}>
                                    {panel[key] && <Check size={10} color="white" />}
                                </div>
                                {lbl}
                            </label>
                        ))}
                    </div>
                </div>
            )}

            </div>{/* end: search + dropdown overlays wrapper */}

            {/* ── Active filter summary row ─────────────────────────────────────── */}
            {summaryChips.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '2px', alignItems: 'center' }}>
                    {summaryChips.map((chip, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px 3px 10px', borderRadius: '999px', flexShrink: 0, background: 'var(--bg-alt)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {chip.label}
                            <button type="button" onClick={chip.onRemove}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, color: 'var(--text-muted)', lineHeight: 0 }}>
                                <X size={10} />
                            </button>
                        </span>
                    ))}
                    <button type="button" onClick={clearAll}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-exp)', fontSize: '12px', fontFamily: 'var(--font-body)', fontWeight: 500, flexShrink: 0, padding: '3px 4px', whiteSpace: 'nowrap' }}>
                        Clear all
                    </button>
                    <button type="button" onClick={() => { setSaveViewName(''); setSaveModalOpen(true); }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--accent-border)', background: 'var(--accent-light)', color: 'var(--accent)', fontSize: '12px', fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <Bookmark size={10} />
                        Save view
                    </button>
                </div>
            )}

            {/* ── Saved views row ───────────────────────────────────────────────── */}
            {savedViews.length > 0 && (
                <div ref={dotMenuRef} style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '2px', alignItems: 'center' }}>
                    {savedViews.map(view => (
                        <div key={view.id} style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: '999px', fontSize: '12px', fontFamily: 'var(--font-body)', flexShrink: 0, overflow: 'visible', position: 'relative' }}>
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
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '4px 6px', color: 'var(--text-muted)', borderLeft: '1px solid var(--border)' }}>
                                    <MoreHorizontal size={12} />
                                </button>
                                {dotMenuId === view.id && (
                                    <div style={{ position: 'absolute', top: '28px', right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-modal)', zIndex: 300, minWidth: '100px', overflow: 'hidden' }}>
                                        <button type="button"
                                            onClick={() => { setRenameId(view.id); setRenameValue(view.name); setDotMenuId(null); }}
                                            style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                            Rename
                                        </button>
                                        <button type="button"
                                            onClick={() => { deleteView(view.id); setDotMenuId(null); }}
                                            style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-exp)', fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
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
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '24px', width: '100%', maxWidth: '360px', boxShadow: 'var(--shadow-modal)', animation: 'springIn 280ms cubic-bezier(0.34,1.56,0.64,1) both' }}>
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
                            style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', marginBottom: '16px', transition: 'border-color var(--transition-fast)' }}
                            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setSaveModalOpen(false)}
                                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-alt)', color: 'var(--text-secondary)', fontSize: '13px', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type="button" onClick={saveView} disabled={!saveViewName.trim()}
                                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: saveViewName.trim() ? 'var(--accent)' : 'var(--bg-hover)', color: saveViewName.trim() ? 'white' : 'var(--text-muted)', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: saveViewName.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
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
