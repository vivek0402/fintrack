'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard } from '@/components/ui/Skeleton';

interface Message {
    role: 'user' | 'ai';
    content: string;
}

const SUGGESTIONS = [
    'How much did I spend this month?',
    'Am I on track with my budgets?',
    "What's my biggest spending category?",
];

export default function AiChatPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [memoryActive, setMemoryActive] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

    const sendMessage = async (text: string) => {
        if (!text.trim() || loading) return;
        const userMsg: Message = { role: 'user', content: text.trim() };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setLoading(true);
        try {
            const history = messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
            const res = await aiAPI.chat(text.trim(), history);
            if (res.data.memory_active) setMemoryActive(true);
            setMessages([...newMessages, { role: 'ai', content: res.data.reply }]);
        } catch {
            setMessages([...newMessages, { role: 'ai', content: "I'm having trouble connecting right now. Please try again." }]);
        } finally {
            setLoading(false);
        }
    };

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={120} />
        </AppLayout>
    );

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', maxWidth: '720px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ marginBottom: '16px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--accent-blue-bg)', border: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Sparkles size={18} color="var(--accent-blue)" />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>AI Finance Advisor</h1>
                                {memoryActive && (
                                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', padding: '2px 8px', borderRadius: '20px' }}>
                                        🧠 Memory active
                                    </span>
                                )}
                            </div>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>Ask anything about your finances</p>
                        </div>
                    </div>
                </div>

                {/* Messages area */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '12px' }}>
                    {messages.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '24px', paddingTop: '40px' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✨</div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Ask me anything about your spending, budgets, or goals.</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '400px' }}>
                                {SUGGESTIONS.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => sendMessage(s)}
                                        style={{ padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '12px', color: 'var(--text-secondary)', fontSize: '0.84rem', cursor: 'pointer', textAlign: 'left', fontFamily: 'DM Sans, sans-serif', transition: 'border-color 0.15s' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)'}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '8px', alignItems: 'flex-start' }}>
                                {msg.role === 'ai' && (
                                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--accent-blue-bg)', border: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                                        <Sparkles size={13} color="var(--accent-blue)" />
                                    </div>
                                )}
                                <div style={{
                                    maxWidth: '75%',
                                    padding: '10px 14px',
                                    borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                    background: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                                    border: msg.role === 'user' ? 'none' : '1px solid var(--bg-border)',
                                    color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                                    fontSize: '0.875rem',
                                    lineHeight: 1.55,
                                    whiteSpace: 'pre-wrap',
                                }}>
                                    {msg.content}
                                </div>
                            </div>
                        ))
                    )}

                    {/* Typing indicator */}
                    {loading && (
                        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '8px', alignItems: 'flex-start' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--accent-blue-bg)', border: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Sparkles size={13} color="var(--accent-blue)" />
                            </div>
                            <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '14px 14px 14px 4px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                                {[0, 1, 2].map(j => (
                                    <span key={j} style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block', animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite` }} />
                                ))}
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Input bar */}
                <div style={{ flexShrink: 0, paddingTop: '12px', borderTop: '1px solid var(--bg-border)' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage(input);
                                }
                            }}
                            placeholder="Ask about your finances…"
                            rows={1}
                            style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '12px', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', outline: 'none', resize: 'none', lineHeight: 1.5 }}
                        />
                        <button
                            onClick={() => sendMessage(input)}
                            disabled={loading || !input.trim()}
                            style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'var(--accent-blue)', border: 'none', color: '#fff', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: loading || !input.trim() ? 0.5 : 1, transition: 'opacity 0.15s' }}
                        >
                            <Send size={16} />
                        </button>
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '6px 0 0 4px' }}>Press Enter to send · Shift+Enter for new line</p>
                </div>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
            `}</style>
        </AppLayout>
    );
}
