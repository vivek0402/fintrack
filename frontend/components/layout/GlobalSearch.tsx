'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, TrendingUp, TrendingDown, LayoutDashboard, PiggyBank, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { transactionsAPI } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

export function GlobalSearch() {
    const [query, setQuery]     = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [open, setOpen]       = useState(false);
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const inputRef = useRef<HTMLInputElement>(null);
    const router   = useRouter();
    const { user } = useAuthStore();

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(true);
                setTimeout(() => inputRef.current?.focus(), 50);
            }
            if (e.key === 'Escape') { setOpen(false); setQuery(''); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        if (!query.trim() || query.length < 2) { setResults([]); return; }
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await transactionsAPI.search(query);
                setResults(res.data.transactions || []);
            } catch { setResults([]); }
            finally { setLoading(false); }
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    const close = () => { setOpen(false); setQuery(''); };

    const navigateToTransactions = (q?: string) => {
        close();
        router.push(q ? `/transactions?q=${encodeURIComponent(q)}` : '/transactions');
    };

    // Derive top matching categories from results
    const topTransactions = results.slice(0, 5);
    const topCategories   = [...new Set(results.map(tx => tx.category_name).filter(Boolean))].slice(0, 3) as string[];

    const quickActions = [
        { label: 'Go to Budgets',    icon: <PiggyBank size={14} />,      onClick: () => { close(); router.push('/budgets'); } },
        { label: 'Add Transaction',  icon: <Plus size={14} />,           onClick: () => { close(); router.push('/transactions?add=true'); } },
        { label: 'Go to Dashboard',  icon: <LayoutDashboard size={14} />, onClick: () => { close(); router.push('/'); } },
    ];

    const rowHover = (e: React.MouseEvent<HTMLElement>, enter: boolean) => {
        (e.currentTarget as HTMLElement).style.background = enter ? 'var(--bg-surface-3)' : 'transparent';
    };

    return (
        <>
            <button
                onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: '10px', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '8px', fontFamily: 'var(--font-body)' }}
            >
                <Search size={14} />
                Search… (Ctrl+K)
            </button>

            {open && mounted && createPortal(
                <>
                    <div onClick={close}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 9999 }} />

                    <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '580px', background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', zIndex: 10000, overflow: 'hidden', boxShadow: 'var(--shadow-modal)', animation: 'springIn 260ms cubic-bezier(0.34,1.56,0.64,1) both' }}>

                        {/* Search input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                            <Search size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search transactions…"
                                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.95rem', fontFamily: 'var(--font-body)' }}
                            />
                            {query
                                ? <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
                                : <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '2px 6px' }}>ESC</span>
                            }
                        </div>

                        <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                            {loading && (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>Searching…</div>
                            )}

                            {!loading && query.length >= 2 && results.length === 0 && (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>No results found</div>
                            )}

                            {/* ── Matching transactions ───────────────────────────────── */}
                            {topTransactions.length > 0 && (
                                <>
                                    <div style={{ padding: '8px 16px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-body)' }}>
                                        Transactions
                                    </div>
                                    {topTransactions.map(tx => {
                                        const isIncome = tx.type === 'income';
                                        return (
                                            <div key={tx.id}
                                                onClick={() => navigateToTransactions(query)}
                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}
                                                onMouseEnter={e => rowHover(e, true)}
                                                onMouseLeave={e => rowHover(e, false)}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                    <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: isIncome ? 'rgba(5,150,105,0.12)' : 'rgba(225,29,72,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        {isIncome
                                                            ? <TrendingUp size={13} color="var(--color-inc)" />
                                                            : <TrendingDown size={13} color="var(--color-exp)" />
                                                        }
                                                    </div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <p style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.description}</p>
                                                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>{tx.category_name || 'Uncategorized'} · {formatDate(tx.date)}</p>
                                                    </div>
                                                </div>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, color: isIncome ? 'var(--color-inc)' : 'var(--color-exp)', flexShrink: 0, marginLeft: '12px' }}>
                                                    {isIncome ? '+' : '-'}{formatCurrency(parseFloat(tx.amount), user?.currency)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {results.length > 5 && (
                                        <button onClick={() => navigateToTransactions(query)}
                                            style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'var(--accent)', fontSize: '12px', fontFamily: 'var(--font-body)', textAlign: 'left', fontWeight: 500 }}
                                            onMouseEnter={e => rowHover(e, true)}
                                            onMouseLeave={e => rowHover(e, false)}>
                                            See all {results.length} results →
                                        </button>
                                    )}
                                </>
                            )}

                            {/* ── Matching categories ─────────────────────────────────── */}
                            {topCategories.length > 0 && (
                                <>
                                    <div style={{ padding: '8px 16px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-body)' }}>
                                        Categories
                                    </div>
                                    {topCategories.map(cat => (
                                        <div key={cat}
                                            onClick={() => navigateToTransactions(`category:${cat}`)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}
                                            onMouseEnter={e => rowHover(e, true)}
                                            onMouseLeave={e => rowHover(e, false)}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{cat}</span>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', marginLeft: 'auto' }}>Filter by category →</span>
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* ── Quick actions ────────────────────────────────────────── */}
                            <div style={{ padding: '8px 16px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-body)' }}>
                                Quick actions
                            </div>
                            {quickActions.map(action => (
                                <div key={action.label}
                                    onClick={action.onClick}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', cursor: 'pointer' }}
                                    onMouseEnter={e => rowHover(e, true)}
                                    onMouseLeave={e => rowHover(e, false)}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-secondary)' }}>
                                        {action.icon}
                                    </div>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{action.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>,
                document.body
            )}
        </>
    );
}
