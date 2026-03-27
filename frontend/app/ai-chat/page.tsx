'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard } from '@/components/ui/Skeleton';
import { AIResponseCard } from '@/components/ui/AIResponseCard';

interface Message {
    role: 'user' | 'ai';
    content: string;
}

const SUGGESTIONS = [
    'How am I doing this month?',
    'Where am I overspending?',
    'Can I afford a ₹5000 purchase?',
    'What should I focus on saving?',
];

export default function AiChatPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

    useEffect(() => {
        const handleResize = () => {
            if (window.visualViewport) {
                const keyboardH = window.innerHeight - window.visualViewport.height;
                setKeyboardHeight(Math.max(0, keyboardH));
            }
        };
        window.visualViewport?.addEventListener('resize', handleResize);
        window.visualViewport?.addEventListener('scroll', handleResize);
        return () => {
            window.visualViewport?.removeEventListener('resize', handleResize);
            window.visualViewport?.removeEventListener('scroll', handleResize);
        };
    }, []);

    useEffect(() => {
        if (keyboardHeight > 0) {
            setTimeout(() => {
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 150);
        }
    }, [keyboardHeight]);

    const sendMessage = async (text: string) => {
        if (!text.trim() || loading) return;
        const userMsg: Message = { role: 'user', content: text.trim() };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setLoading(true);
        try {
            const res = await aiAPI.chat(text.trim(), []);
            const reply = res.data.reply;
            if (!reply) throw new Error('No reply');
            setMessages([...newMessages, { role: 'ai', content: reply }]);
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
                            </div>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>Ask anything about your finances</p>
                        </div>
                    </div>
                </div>

                {/* Messages area */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: keyboardHeight > 0 ? `calc(80px + ${keyboardHeight}px)` : 'calc(80px + env(safe-area-inset-bottom))' }}>
                    {messages.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '24px', paddingTop: '40px' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-blue), #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: '20px', color: 'white' }}>✦</div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Ask me anything about your spending, budgets, or goals.</p>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '480px' }}>
                                {SUGGESTIONS.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => sendMessage(s)}
                                        style={{ padding: '8px 16px', background: 'var(--bg-card)', border: '0.5px solid var(--bg-border)', borderRadius: '20px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'border-color 150ms, color 150ms' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-blue)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                {msg.role === 'ai' ? (
                                    <AIResponseCard
                                        message={msg.content}
                                        type="chat"
                                        onAction={route => router.push(route)}
                                        style={{ maxWidth: '85%', width: '100%' }}
                                    />
                                ) : (
                                    <div style={{
                                        maxWidth: '75%',
                                        padding: '10px 14px',
                                        borderRadius: '14px 14px 4px 14px',
                                        background: 'var(--accent-blue)',
                                        color: '#fff',
                                        fontSize: '0.875rem',
                                        lineHeight: 1.55,
                                        whiteSpace: 'pre-wrap',
                                    }}>
                                        {msg.content}
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    {/* Typing indicator */}
                    {loading && (
                        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <div style={{
                                background: 'var(--bg-card)',
                                border: '0.5px solid var(--bg-border)',
                                borderLeft: '3px solid var(--accent-blue)',
                                borderRadius: '12px',
                                padding: '14px 16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}>
                                {[0, 1, 2].map(j => (
                                    <div key={j} style={{
                                        width: '6px', height: '6px',
                                        borderRadius: '50%',
                                        background: 'var(--accent-blue)',
                                        animation: `typingDot 1.2s ease-in-out ${j * 0.2}s infinite`,
                                    }} />
                                ))}
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Input bar */}
                <div style={{
                    position: 'fixed',
                    bottom: keyboardHeight + 'px',
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    backgroundColor: 'var(--bg-primary)',
                    borderTop: '1px solid var(--bg-border)',
                    padding: '12px 16px',
                    paddingBottom: keyboardHeight > 0 ? '12px' : 'calc(12px + env(safe-area-inset-bottom))',
                    transition: 'bottom 0.15s ease',
                }}>
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
            `}</style>
        </AppLayout>
    );
}
