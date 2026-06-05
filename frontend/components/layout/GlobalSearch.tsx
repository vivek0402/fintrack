'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, TrendingUp, TrendingDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { transactionsAPI } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

export function GlobalSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
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
                setResults(res.data.transactions);
            } catch { setResults([]); }
            finally { setLoading(false); }
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    return (
        <>
            <button
                onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '10px', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '8px' }}
            >
                <Search size={14} />
                Search... (Ctrl+K)
            </button>

            {open && mounted && createPortal(
                <>
                    <div onClick={() => { setOpen(false); setQuery(''); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 9999 }} />
                    <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '560px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', zIndex: 10000, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: '1px solid var(--bg-border)' }}>
                            <Search size={16} color="var(--text-muted)" />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search transactions..."
                                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.95rem', fontFamily: "'Satoshi', 'DM Sans', sans-serif" }}
                            />
                            {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>}
                        </div>
                        <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                            {loading && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Searching...</div>}
                            {!loading && query.length >= 2 && results.length === 0 && (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No results found</div>
                            )}
                            {results.map(tx => {
                                const isIncome = tx.type === 'income';
                                return (
                                    <div key={tx.id} onClick={() => { router.push('/transactions'); setOpen(false); setQuery(''); }}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--bg-border)' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: isIncome ? 'var(--accent-green-bg)' : 'var(--accent-red-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {isIncome ? <TrendingUp size={14} color="var(--accent-green)" /> : <TrendingDown size={14} color="var(--accent-red)" />}
                                            </div>
                                            <div>
                                                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>{tx.description}</p>
                                                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>{tx.category_name || 'Uncategorized'} · {formatDate(tx.date)}</p>
                                            </div>
                                        </div>
                                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.875rem', fontWeight: 600, color: isIncome ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                            {isIncome ? '+' : '-'}{formatCurrency(parseFloat(tx.amount), user?.currency)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>,
                document.body
            )}
        </>
    );
}