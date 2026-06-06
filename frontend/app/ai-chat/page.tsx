'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { aiAPI, transactionsAPI } from '@/lib/api';
import { useIsMobile } from '@/hooks/useWindowSize';
import { AppLayout } from '@/components/layout/AppLayout';
import { AIResponseCard } from '@/components/ui/AIResponseCard';

interface RegretWarning {
    category: string;
    rate: number;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    regretWarning?: RegretWarning;
}

const QUICK_PROMPTS = [
    'Analyze my spending',
    'Can I afford a trip?',
    'Budget advice',
    'Tax estimate',
];

const AFFORDABILITY_PATTERNS = [
    'can i afford', 'should i buy', 'is it okay to spend', 'should i spend',
    'can i spend', 'should i get', 'is it worth buying', 'worth spending',
];

function fmtTime(d: Date): string {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function AiChatPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const SESSION_KEY = 'fintrack-chat-history';

    const regretRatesRef = useRef<Record<string, number> | null>(null);

    const [messages, setMessages] = useState<Message[]>(() => {
        // Restore from sessionStorage on mount (survives tab switches)
        if (typeof window === 'undefined') return [];
        try {
            const saved = sessionStorage.getItem(SESSION_KEY);
            if (!saved) return [];
            const parsed = JSON.parse(saved);
            return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
        } catch { return []; }
    });
    const [input, setInput]     = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef       = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    // Persist messages to sessionStorage whenever they change
    useEffect(() => {
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages)); } catch { /* storage full */ }
    }, [messages]);
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // Auto-resize textarea
    useEffect(() => {
        if (!inputRef.current) return;
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }, [input]);

    const getRegretRates = async (): Promise<Record<string, number>> => {
        if (regretRatesRef.current) return regretRatesRef.current;
        try {
            const res = await transactionsAPI.getAll();
            const expenses: any[] = (res.data.transactions ?? []).filter((tx: any) => tx.type === 'expense');
            const catMap: Record<string, { total: number; regretted: number }> = {};
            expenses.forEach((tx: any) => {
                const cat = (tx.category_name || 'Uncategorized').toLowerCase();
                if (!catMap[cat]) catMap[cat] = { total: 0, regretted: 0 };
                catMap[cat].total++;
                if (tx.is_regretted) catMap[cat].regretted++;
            });
            const rates: Record<string, number> = {};
            Object.entries(catMap).forEach(([cat, { total, regretted }]) => {
                rates[cat] = Math.round((regretted / total) * 100);
            });
            regretRatesRef.current = rates;
            return rates;
        } catch { return {}; }
    };

    const detectRegretWarning = async (text: string): Promise<RegretWarning | undefined> => {
        const lower = text.toLowerCase();
        const isAffordabilityQ = AFFORDABILITY_PATTERNS.some(p => lower.includes(p));
        if (!isAffordabilityQ) return undefined;
        const rates = await getRegretRates();
        const categories = Object.keys(rates);
        const matched = categories.find(cat => lower.includes(cat));
        if (!matched) return undefined;
        const rate = rates[matched];
        if (rate < 40) return undefined;
        return { category: matched.charAt(0).toUpperCase() + matched.slice(1), rate };
    };

    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;
        const userMsg: Message = { role: 'user', content: trimmed, timestamp: new Date() };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setLoading(true);
        try {
            const [res, regretWarning] = await Promise.all([
                aiAPI.chat(trimmed, messages),
                detectRegretWarning(trimmed),
            ]);
            const reply = res.data.reply;
            if (!reply) throw new Error('No reply');
            setMessages([...newMessages, { role: 'assistant', content: reply, timestamp: new Date(), regretWarning }]);
        } catch (err: any) {
            const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
            setMessages([...newMessages, { role: 'assistant', content: serverMsg || "I'm having trouble connecting right now. Please try again.", timestamp: new Date() }]);
        } finally {
            setLoading(false);
        }
    };

    if (isLoading || !user) return <AppLayout><div /></AppLayout>;

    const canSend = !!input.trim() && !loading;

    return (
        <AppLayout>
            {/* Flex column filling the available viewport height */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                height: isMobile
                    ? 'calc(100dvh - 160px)'   // mobile: account for bottom nav + padding
                    : 'calc(100dvh - 72px)',    // desktop: account for top+bottom padding
                animation: 'fadeUp 200ms ease forwards',
                gap: '12px',
            }}>

                {/* ── HEADER CARD (matches other pages) ── */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '16px 20px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'color-mix(in srgb, var(--color-info) 15%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--color-info) 25%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Sparkles size={18} color="var(--color-info)" />
                        </div>
                        <div>
                            <p style={{ fontFamily: 'var(--font-head)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
                                FinTrack AI
                            </p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                Your personal financial advisor
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── QUICK PROMPT CHIPS ── */}
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 }}>
                    {QUICK_PROMPTS.map(chip => (
                        <button key={chip} type="button" onClick={() => setInput(chip)}
                            style={{ padding: '6px 14px', borderRadius: '999px', background: 'var(--accent-light)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all var(--transition-fast)' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-tint)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)'; }}>
                            {chip}
                        </button>
                    ))}
                </div>

                {/* ── MESSAGES AREA (flex: 1 scrolls internally) ── */}
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '12px', padding: '4px 2px 8px' }}>

                    {/* Empty state */}
                    {messages.length === 0 && !loading && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '14px', paddingTop: '32px' }}>
                            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-info) 12%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--color-info) 22%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Sparkles size={22} color="var(--color-info)" />
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0, textAlign: 'center', fontFamily: 'var(--font-body)', maxWidth: '280px', lineHeight: 1.5 }}>
                                Ask me anything about your spending, budgets, or goals.
                            </p>
                        </div>
                    )}

                    {/* Message bubbles */}
                    {messages.map((msg, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '8px' }}>
                            {msg.role === 'assistant' ? (
                                <>
                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-info) 15%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--color-info) 25%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2 }}>
                                        <Sparkles size={14} color="var(--color-info)" />
                                    </div>
                                    <div style={{ maxWidth: isMobile ? '88%' : '72%' }}>
                                        <AIResponseCard message={msg.content} type="chat" onAction={route => router.push(route)} style={{ borderRadius: '15px 15px 15px 4px', border: '1px solid var(--border)', borderLeft: 'none' }} />
                                        <p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '3px 0 0 4px', fontFamily: 'var(--font-body)' }}>{fmtTime(msg.timestamp)}</p>
                                        {msg.regretWarning && (
                                            <div style={{ marginTop: '8px', padding: '10px 14px', background: 'color-mix(in srgb, var(--color-warn) 8%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--color-warn) 25%, transparent)', borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                <span style={{ fontSize: '16px', flexShrink: 0 }}>📊</span>
                                                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                                                    <strong style={{ color: 'var(--color-warn)' }}>FYI:</strong> Your regret rate on <strong>{msg.regretWarning.category}</strong> is {msg.regretWarning.rate}% — worth pausing before buying.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div style={{ maxWidth: isMobile ? '82%' : '68%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                    <div style={{ padding: '10px 14px', borderRadius: '15px 15px 4px 15px', background: 'var(--accent)', color: 'white', fontSize: '14px', lineHeight: 1.55, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)' }}>
                                        {msg.content}
                                    </div>
                                    <p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '3px 4px 0 0', fontFamily: 'var(--font-body)' }}>{fmtTime(msg.timestamp)}</p>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {loading && (
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-info) 15%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--color-info) 25%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Sparkles size={14} color="var(--color-info)" />
                            </div>
                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '15px 15px 15px 4px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {[0, 1, 2].map(j => (
                                    <div key={j} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-3)', animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite` }} />
                                ))}
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* ── INPUT BAR (bottom of flex container, not fixed) ── */}
                <div style={{ flexShrink: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '12px 14px', display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); }
                        }}
                        placeholder="Ask about your finances…"
                        rows={1}
                        style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-alt)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '20px', fontSize: '14px', fontFamily: 'var(--font-body)', outline: 'none', resize: 'none', lineHeight: 1.5, maxHeight: '120px', overflowY: 'auto', transition: 'border-color var(--transition-fast)' }}
                        onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                        onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                    />
                    <button type="button" onClick={() => handleSend(input)} disabled={!canSend}
                        style={{ width: 38, height: 38, borderRadius: '50%', background: canSend ? 'var(--accent)' : 'var(--bg-alt)', border: canSend ? 'none' : '1px solid var(--border)', color: canSend ? 'white' : 'var(--text-muted)', cursor: canSend ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background var(--transition-fast), color var(--transition-fast)' }}>
                        <Send size={16} />
                    </button>
                </div>

            </div>
        </AppLayout>
    );
}
