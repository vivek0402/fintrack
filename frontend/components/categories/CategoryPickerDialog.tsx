'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
    Search, Plus, ChevronDown,
    Utensils, Car, ShoppingBag, Film, HeartPulse, BookOpen,
    Zap, Home, Briefcase, TrendingUp, Sparkles, Users, Plane,
    Repeat, Gift, CircleDot, Laptop, Package,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useIsMobile } from '@/hooks/useWindowSize';
import { randomCategoryColor } from '@/lib/categoryColors';
import { categoriesAPI } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategoryOption {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    usage_count?: number | string;
    last_used?: string | null;
    is_investment_category?: boolean;
    [key: string]: unknown;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

// `icon` is dual-purpose: either a lucide slug seeded by the backend, or a
// literal emoji typed by the user. Anything unrecognised renders as text, which
// is what makes the emoji case work without a second column.
export const ICON_MAP: Record<string, React.ElementType> = {
    'utensils': Utensils, 'car': Car, 'shopping-bag': ShoppingBag,
    'film': Film, 'heart-pulse': HeartPulse, 'book-open': BookOpen,
    'zap': Zap, 'home': Home, 'briefcase': Briefcase, 'trending-up': TrendingUp,
    'sparkles': Sparkles, 'users': Users, 'plane': Plane, 'repeat': Repeat,
    'gift': Gift, 'circle-dot': CircleDot, 'laptop': Laptop, 'package': Package,
};

export const CategoryIcon = ({ name, size = 14, color = 'currentColor' }: { name?: string; size?: number; color?: string }) => {
    if (!name) return <span style={{ fontSize: size }}>📦</span>;
    const Icon = ICON_MAP[name];
    if (Icon) return <Icon size={size} color={color} />;
    return <span style={{ fontSize: size, lineHeight: 1 }}>{name}</span>;
};

// ─── Matching ─────────────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Exact -> substring -> word-overlap, over normalised names. Lifted out of
 * TransactionModal so the AI-category reconciliation and the picker's own
 * search share one definition of "same category".
 */
export function findCategory(cats: CategoryOption[], query: string): CategoryOption | null {
    if (!query || !cats.length) return null;
    const q = norm(query);
    if (!q) return null;
    let m = cats.find(c => norm(c.name) === q);
    if (m) return m;
    m = cats.find(c => { const n = norm(c.name); return n.includes(q) || q.includes(n); });
    if (m) return m;
    const words = new Set(q.split(' ').filter(w => w.length > 2));
    return cats.find(c => norm(c.name).split(' ').some(w => w.length > 2 && words.has(w))) || null;
}

function matches(cat: CategoryOption, query: string): boolean {
    const q = norm(query);
    if (!q) return true;
    const n = norm(cat.name);
    if (n.includes(q)) return true;
    return q.split(' ').every(w => n.includes(w));
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function lastUsedLabel(iso?: string | null): string {
    if (!iso) return '';
    const then = new Date(String(iso).split('T')[0] + 'T00:00:00').getTime();
    if (!isFinite(then)) return '';
    const days = Math.floor((Date.now() - then) / 86_400_000);
    if (days <= 0) return 'today';
    if (days < 7) return days + 'd';
    if (days < 31) return Math.floor(days / 7) + 'w';
    if (days < 365) return Math.floor(days / 30) + 'mo';
    return Math.floor(days / 365) + 'y';
}

/** Highlights the matched run using the raw name, so punctuation can't shift offsets. */
function Highlight({ text, query }: { text: string; query: string }) {
    const q = query.trim();
    if (!q) return <>{text}</>;
    const at = text.toLowerCase().indexOf(q.toLowerCase());
    if (at === -1) return <>{text}</>;
    return (
        <>
            {text.slice(0, at)}
            <mark style={{ background: 'none', color: 'var(--accent)', fontWeight: 700 }}>{text.slice(at, at + q.length)}</mark>
            {text.slice(at + q.length)}
        </>
    );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

type Entry =
    | { kind: 'none' }
    | { kind: 'cat'; cat: CategoryOption }
    | { kind: 'create' };

const ROW_BASE: React.CSSProperties = {
    position: 'relative', display: 'flex', alignItems: 'center', gap: '11px',
    width: '100%', padding: '0 16px', background: 'none', border: 'none',
    cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left',
    transition: 'background 0.1s',
};

const MONO_COL: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
    flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)',
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CategoryPickerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    value: string;
    onChange: (value: string, cat: CategoryOption | null) => void;
    categories: CategoryOption[];
    valueKey?: 'id' | 'name';
    title?: string;
    exclude?: (c: CategoryOption) => boolean;
    allowNone?: boolean;
    noneLabel?: string;
    allowCreate?: boolean;
    onCreated?: (c: CategoryOption) => void;
}

// ─── Body ─────────────────────────────────────────────────────────────────────

// Split out so it mounts fresh every time the dialog opens. Search text, cursor
// position and a half-typed new category all reset by unmounting rather than by
// an effect that fires on isOpen.
function PickerBody({
    onClose, value, onChange, categories,
    valueKey = 'id', title = 'Category',
    exclude, allowNone, noneLabel = 'No category',
    allowCreate = false, onCreated,
}: Omit<CategoryPickerDialogProps, 'isOpen'>) {
    const isMobile = useIsMobile();
    const [query, setQuery] = useState('');
    const [rawCursor, setCursor] = useState(0);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(randomCategoryColor);
    const [saving, setSaving] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    const rowH = isMobile ? 42 : 34;
    const showLastUsed = !isMobile;

    const keyOf = useCallback(
        (c: CategoryOption) => (valueKey === 'name' ? c.name : String(c.id)),
        [valueKey]
    );

    const pool = useMemo(
        () => (categories || []).filter(c => !exclude || !exclude(c)),
        [categories, exclude]
    );

    // Same ordering the old dropdown used: usage desc -> last used desc -> name.
    const sorted = useMemo(() => {
        return [...pool].sort((a, b) => {
            const d = (Number(b.usage_count) || 0) - (Number(a.usage_count) || 0);
            if (d !== 0) return d;
            if (a.last_used && b.last_used) return new Date(b.last_used).getTime() - new Date(a.last_used).getTime();
            if (a.last_used) return -1;
            if (b.last_used) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [pool]);

    const hits = useMemo(() => sorted.filter(c => matches(c, query)), [sorted, query]);
    const trimmed = query.trim();
    const hasExact = !!trimmed && hits.some(c => norm(c.name) === norm(query));

    // One flat list drives both render order and cursor movement.
    const entries = useMemo<Entry[]>(() => {
        const out: Entry[] = [];
        if (allowNone && !trimmed) out.push({ kind: 'none' });
        hits.forEach(cat => out.push({ kind: 'cat', cat }));
        if (allowCreate && trimmed && !hasExact) out.push({ kind: 'create' });
        return out;
    }, [hits, allowNone, allowCreate, trimmed, hasExact]);

    // Clamped at read time rather than corrected by an effect, so filtering down
    // to fewer rows can never leave the cursor pointing past the end.
    const cursor = Math.min(rawCursor, Math.max(0, entries.length - 1));
    const leading = allowNone && !trimmed ? 1 : 0;
    const frequentCount = trimmed ? 0 : hits.filter(c => Number(c.usage_count) > 0).length;

    const commit = (entry: Entry) => {
        if (entry.kind === 'none') { onChange('', null); onClose(); return; }
        if (entry.kind === 'cat') { onChange(keyOf(entry.cat), entry.cat); onClose(); return; }
        setCreating(true);
        setNewName(trimmed);
    };

    const handleCreate = async () => {
        const name = newName.trim();
        if (!name || saving) return;
        setSaving(true);
        try {
            const res = await categoriesAPI.create({ name, color: newColor, icon: '📦' });
            const created: CategoryOption = { usage_count: 0, last_used: null, ...res.data.category };
            onCreated?.(created);
            onChange(keyOf(created), created);
            onClose();
        } catch {
            setSaving(false);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (!entries.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(Math.min(entries.length - 1, cursor + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(Math.max(0, cursor - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); commit(entries[cursor]); }
    };

    // Keep the cursor row in view as it moves. Reads the DOM rather than
    // setting state, which is what an effect is actually for. scrollIntoView is
    // optional-chained: jsdom does not implement it.
    useEffect(() => {
        listRef.current?.querySelector<HTMLElement>('[data-idx="' + cursor + '"]')?.scrollIntoView?.({ block: 'nearest' });
    }, [cursor]);

    const groupLabel = (text: string) => (
        <p key={'lbl-' + text} style={{
            fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--text-muted)', padding: '10px 16px 6px', margin: 0,
        }}>{text}</p>
    );

    const row = (entry: Entry, idx: number) => {
        const isCursor = idx === cursor;
        const selected =
            entry.kind === 'none' ? !value
                : entry.kind === 'cat' ? keyOf(entry.cat) === value
                    : false;
        const accented = selected || entry.kind === 'create';

        return (
            <button
                key={entry.kind === 'cat' ? 'c-' + entry.cat.id : entry.kind}
                type="button"
                role="option"
                aria-selected={selected}
                data-idx={idx}
                onClick={() => commit(entry)}
                onMouseMove={() => { if (!isCursor) setCursor(idx); }}
                style={{ ...ROW_BASE, height: rowH, backgroundColor: isCursor ? 'var(--glass-fill-2)' : 'transparent' }}
            >
                <span aria-hidden="true" style={{
                    position: 'absolute', left: 0, top: 6, bottom: 6, width: 2, borderRadius: '0 2px 2px 0',
                    backgroundColor: selected ? 'var(--accent)' : isCursor ? 'var(--accent-border)' : 'transparent',
                }} />
                <span style={{ flexShrink: 0, width: 15, display: 'grid', placeItems: 'center' }}>
                    {entry.kind === 'cat'
                        ? <CategoryIcon name={entry.cat.icon} size={13} color={entry.cat.color || 'var(--text-muted)'} />
                        : entry.kind === 'create'
                            ? <Plus size={13} color="var(--accent)" />
                            : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </span>
                <span style={{
                    flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: accented ? 600 : 500,
                    color: accented ? 'var(--accent)' : 'var(--text-primary)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {entry.kind === 'cat'
                        ? <Highlight text={entry.cat.name} query={query} />
                        : entry.kind === 'create'
                            ? <>Create &ldquo;<b>{trimmed}</b>&rdquo;</>
                            : noneLabel}
                </span>
                {entry.kind === 'cat' && (
                    <>
                        <span style={{ ...MONO_COL, fontSize: 11, width: 34, letterSpacing: '-0.02em' }}>
                            {Number(entry.cat.usage_count) > 0
                                ? <>{entry.cat.usage_count}<span style={{ fontSize: 9.5 }}>×</span></>
                                : ''}
                        </span>
                        {showLastUsed && (
                            <span style={{ ...MONO_COL, fontSize: 10, width: 46 }}>
                                {lastUsedLabel(entry.cat.last_used)}
                            </span>
                        )}
                    </>
                )}
            </button>
        );
    };

    let rendered: React.ReactNode;
    if (!entries.length) {
        rendered = (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', padding: '18px 16px', margin: 0 }}>
                {pool.length === 0 ? 'Loading…' : <>No category matches &ldquo;{query}&rdquo;</>}
            </p>
        );
    } else if (trimmed) {
        rendered = entries.map(row);
    } else {
        rendered = (
            <>
                {entries.slice(0, leading).map(row)}
                {frequentCount > 0 && groupLabel('Frequent')}
                {entries.slice(leading, leading + frequentCount).map((e, i) => row(e, i + leading))}
                {entries.length > leading + frequentCount && groupLabel('All categories')}
                {entries.slice(leading + frequentCount).map((e, i) => row(e, i + leading + frequentCount))}
            </>
        );
    }

    return (
        <div onKeyDown={onKeyDown} style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Search takes the header slot -- it is the primary control here. */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '0 16px', height: 50,
                borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
            }}>
                <Search size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <input
                    autoFocus
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setCursor(0); }}
                    placeholder="Search categories…"
                    aria-label="Search categories"
                    autoComplete="off"
                    style={{
                        flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none',
                        color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 14.5, padding: 0,
                    }}
                />
                <button type="button" onClick={onClose} aria-label="Close"
                    style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)',
                        border: '1px solid var(--glass-border)', borderRadius: 4, padding: '2px 6px',
                        background: 'none', cursor: 'pointer', flexShrink: 0,
                    }}>esc</button>
            </div>

            <div
                ref={listRef}
                role="listbox"
                aria-label={title}
                style={{ maxHeight: 'min(50vh, 360px)', overflowY: 'auto', padding: '6px 0' }}
            >
                {rendered}
            </div>

            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                {creating ? (
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                        <input
                            type="text" value={newName} autoFocus placeholder="Category name" aria-label="New category name"
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); void handleCreate(); }
                                // Close the create bar without also closing the dialog --
                                // Modal's Escape listener sits on window, past this handler.
                                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCreating(false); }
                            }}
                            style={{
                                flex: 1, minWidth: 0, padding: '7px 11px', backgroundColor: 'var(--glass-fill-1)',
                                border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 12.5, outline: 'none',
                            }}
                        />
                        <input
                            type="color" value={newColor} aria-label="Category colour"
                            onChange={e => setNewColor(e.target.value)}
                            style={{
                                width: 30, height: 30, padding: 2, border: '1px solid var(--glass-border)',
                                borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer', flexShrink: 0,
                            }}
                        />
                        <button type="button" onClick={() => void handleCreate()} disabled={!newName.trim() || saving}
                            style={{
                                padding: '7px 14px', backgroundColor: 'var(--accent)', border: 'none',
                                borderRadius: 'var(--radius-sm)', color: '#fff', fontFamily: 'var(--font-body)',
                                fontSize: 12.5, fontWeight: 600, flexShrink: 0,
                                cursor: !newName.trim() || saving ? 'not-allowed' : 'pointer',
                                opacity: !newName.trim() || saving ? 0.4 : 1,
                            }}>
                            {saving ? '…' : 'Add'}
                        </button>
                        <button type="button" onClick={() => setCreating(false)} aria-label="Cancel creating a category"
                            style={{
                                padding: '7px 10px', backgroundColor: 'var(--glass-fill-1)',
                                border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-secondary)', fontSize: 12.5, cursor: 'pointer', flexShrink: 0,
                            }}>×</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        {allowCreate ? (
                            <button type="button" onClick={() => { setCreating(true); setNewName(trimmed); }}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none',
                                    border: 'none', color: 'var(--accent)', fontFamily: 'var(--font-body)',
                                    fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '2px 0',
                                }}>
                                <Plus size={12} /> New category
                            </button>
                        ) : <span />}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                            ↑↓ move · ↵ select · esc close
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export function CategoryPickerDialog({ isOpen, onClose, title = 'Category', ...rest }: CategoryPickerDialogProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} ariaLabel={title} bodyPadding="0" maxWidth="440px">
            <PickerBody onClose={onClose} title={title} {...rest} />
        </Modal>
    );
}

// ─── Field (trigger + dialog) ─────────────────────────────────────────────────

export interface CategoryFieldProps extends Omit<CategoryPickerDialogProps, 'isOpen' | 'onClose'> {
    placeholder?: string;
    size?: 'md' | 'sm';
    disabled?: boolean;
    id?: string;
}

export function CategoryField({
    value, onChange, categories, valueKey = 'id',
    placeholder = 'Choose', size = 'md', disabled, id, ...rest
}: CategoryFieldProps) {
    const [open, setOpen] = useState(false);
    const selected = (categories || []).find(c => (valueKey === 'name' ? c.name : String(c.id)) === value);
    const sm = size === 'sm';

    return (
        <>
            <button
                type="button"
                id={id}
                disabled={disabled}
                onClick={() => setOpen(true)}
                aria-haspopup="listbox"
                aria-expanded={open}
                style={{
                    width: '100%', padding: sm ? '8px' : '10px 12px',
                    backgroundColor: 'var(--glass-fill-1)', color: 'var(--text-primary)',
                    border: '1px solid var(--glass-border)', borderRadius: sm ? 8 : 'var(--radius-md)',
                    fontSize: sm ? 12 : 14, fontFamily: 'var(--font-body)',
                    display: 'flex', alignItems: 'center', gap: sm ? 6 : 9,
                    cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
                    opacity: disabled ? 0.5 : 1, boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                }}
            >
                {selected && !sm && (
                    <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center' }}>
                        <CategoryIcon name={selected.icon} size={13} color={selected.color || 'var(--text-muted)'} />
                    </span>
                )}
                <span style={{
                    flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
                }}>
                    {selected ? selected.name : placeholder}
                </span>
                <ChevronDown size={sm ? 11 : 13} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
            </button>

            <CategoryPickerDialog
                isOpen={open}
                onClose={() => setOpen(false)}
                value={value}
                onChange={onChange}
                categories={categories}
                valueKey={valueKey}
                {...rest}
            />
        </>
    );
}
