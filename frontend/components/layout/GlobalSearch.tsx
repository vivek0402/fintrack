'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { transactionsAPI } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { type, truncate } from '@/lib/typography';
import { TextAction } from '@/components/ui/CardParts';
import { requestAddTransaction } from '@/lib/addTransactionEvent';

const caption = { ...type.label, color: 'var(--text-muted)', padding: '8px 16px 4px' } as const;
const note = { ...type.body, padding: '20px', textAlign: 'center' } as const;

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
        { label: 'Go to Budgets',    onClick: () => { close(); router.push('/budgets'); } },
        { label: 'Add transaction',  onClick: () => { close(); requestAddTransaction(); } },
        { label: 'Go to Dashboard',  onClick: () => { close(); router.push('/'); } },
    ];

    const rowHover = (e: React.MouseEvent<HTMLElement>, enter: boolean) => {
        (e.currentTarget as HTMLElement).style.background = enter ? 'var(--glass-fill-2)' : 'transparent';
    };

    return (
        <>
            <button
                type="button"
                onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
                style={{
                    ...type.body,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)',
                    width: '100%', height: 36, padding: '0 var(--space-3)',
                    background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
                    cursor: 'pointer', marginBottom: 'var(--space-2)',
                }}
            >
                <span>Search</span>
                <span style={{ ...type.meta, color: 'var(--text-muted)' }}>Ctrl K</span>
            </button>

            {open && mounted && createPortal(
                <>
                    <div onClick={close}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 9999 }} />

                    <div className="glass-surface glass-sheet" style={{ position: 'fixed', top: 'calc(80px + var(--sa-top))', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '580px', borderRadius: 'var(--radius-lg)', zIndex: 10000, overflow: 'hidden', animation: 'springIn 260ms cubic-bezier(0.34,1.56,0.64,1) both' }}>

                        {/* Search input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '14px 16px', borderBottom: '1px solid var(--glass-border)' }}>
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search transactions"
                                aria-label="Search transactions"
                                style={{ ...type.body, color: 'var(--text-primary)', flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none' }}
                            />
                            {query && (
                                <TextAction quiet onClick={() => setQuery('')} aria-label="Clear search">Clear</TextAction>
                            )}
                        </div>

                        <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                            {loading && (
                                <div style={note}>Searching…</div>
                            )}

                            {!loading && query.length >= 2 && results.length === 0 && (
                                <div style={note}>No results found</div>
                            )}

                            {/* Matching transactions */}
                            {topTransactions.length > 0 && (
                                <>
                                    <div style={caption}>Transactions</div>
                                    {topTransactions.map(tx => {
                                        const isIncome = tx.type === 'income';
                                        return (
                                            <div key={tx.id}
                                                onClick={() => navigateToTransactions(query)}
                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--glass-border)' }}
                                                onMouseEnter={e => rowHover(e, true)}
                                                onMouseLeave={e => rowHover(e, false)}>
                                                <div style={{ minWidth: 0 }}>
                                                    <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{tx.description}</p>
                                                    <p style={{ ...type.meta, margin: '2px 0 0' }}>{tx.category_name || 'Uncategorized'} · {formatDate(tx.date)}</p>
                                                </div>
                                                <span style={{ ...type.num, flexShrink: 0, color: isIncome ? 'var(--color-inc-text)' : 'var(--text-primary)' }}>
                                                    {isIncome ? '+' : '−'}{formatCurrency(parseFloat(tx.amount), user?.currency)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {results.length > 5 && (
                                        <div style={{ padding: '2px 16px', borderBottom: '1px solid var(--glass-border)' }}>
                                            <TextAction onClick={() => navigateToTransactions(query)}>
                                                See all {results.length} results
                                            </TextAction>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Matching categories */}
                            {topCategories.length > 0 && (
                                <>
                                    <div style={caption}>Categories</div>
                                    {topCategories.map(cat => (
                                        <div key={cat}
                                            onClick={() => navigateToTransactions(`category:${cat}`)}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--glass-border)' }}
                                            onMouseEnter={e => rowHover(e, true)}
                                            onMouseLeave={e => rowHover(e, false)}>
                                            <span style={{ ...type.bodyStrong, ...truncate }}>{cat}</span>
                                            <span style={{ ...type.meta, flexShrink: 0 }}>Filter by category</span>
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* Quick actions */}
                            <div style={caption}>Quick actions</div>
                            {quickActions.map(action => (
                                <div key={action.label}
                                    onClick={action.onClick}
                                    style={{ ...type.body, padding: '10px 16px', cursor: 'pointer' }}
                                    onMouseEnter={e => rowHover(e, true)}
                                    onMouseLeave={e => rowHover(e, false)}>
                                    {action.label}
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
