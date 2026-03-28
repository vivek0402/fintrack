'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Sparkles } from 'lucide-react';
import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { useIsMobile } from '@/hooks/useWindowSize';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard } from '@/components/ui/Skeleton';
import { AIResponseCard } from '@/components/ui/AIResponseCard';
import PageHelp from '@/components/ui/PageHelp';

const HEADER_H = 64;
const INPUT_H  = 64;
const NAV_H    = 64;

interface Message {
    role: 'user' | 'assistant';
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
    const isMobile = useIsMobile();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // Auto-resize textarea
    useEffect(() => {
        if (!inputRef.current) return;
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }, [input]);

    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;
        const userMsg: Message = { role: 'user', content: trimmed };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setLoading(true);
        try {
            const token = localStorage.getItem('fintrack_token');
            const res = await axios.post(
                `${process.env.NEXT_PUBLIC_API_URL}/api/ai/chat`,
                { message: trimmed, history: [] },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const reply = res.data.reply;
            if (!reply) throw new Error('No reply');
            setMessages([...newMessages, { role: 'assistant', content: reply }]);
        } catch (err: any) {
            const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
            const displayMsg = serverMsg || "I'm having trouble connecting right now. Please try again.";
            setMessages([...newMessages, { role: 'assistant', content: displayMsg }]);
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

    const leftOffset = isMobile ? '0' : '220px';

    // Input bar: always glued above BottomNav on mobile, at page bottom on desktop
    const inputBarBottom = isMobile
        ? 'calc(64px + env(safe-area-inset-bottom))'
        : '0';

    // Messages area: fills space between header and input bar
    const messagesBottom = isMobile
        ? `calc(${INPUT_H + NAV_H}px + env(safe-area-inset-bottom))`
        : `${INPUT_H}px`;

    return (
        <AppLayout>
            {/* Fixed Header */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: leftOffset,
                right: 0,
                height: `${HEADER_H}px`,
                zIndex: 300,
                backgroundColor: 'var(--bg-primary)',
                borderBottom: '1px solid var(--bg-border)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                gap: '10px',
                justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        background: 'var(--accent-blue-bg)', border: '1px solid var(--bg-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <Sparkles size={18} color="var(--accent-blue)" />
                    </div>
                    <div>
                        <div style={{ fontFamily: 'Sora, sans-serif', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                            AI Finance Advisor
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            Ask anything about your finances
                        </div>
                    </div>
                </div>
                <PageHelp title="AI Chat" sections={[
                    { icon: '🤖', heading: 'What is this page?', body: 'Chat with your personal AI financial advisor. It has full access to your transactions, budgets, and goals — ask it anything.' },
                    { icon: '💬', heading: 'What to ask', body: "Try: 'How much did I spend on food this month?', 'Can I afford a ₹5000 purchase?', 'What are my worst spending habits?', 'Generate a savings plan for me.'" },
                    { icon: '📱', heading: 'SMS Parser', body: 'Paste a bank SMS or UPI notification and the AI will automatically extract and add the transaction for you.' },
                    { icon: '🧠', heading: 'Financial Personality', body: "Ask 'What is my financial personality?' to get a detailed profile of your spending behaviour and money habits." },
                ]} />
            </div>

            {/* Scrollable Messages Area */}
            <div style={{
                position: 'fixed',
                top: `${HEADER_H}px`,
                left: leftOffset,
                right: 0,
                bottom: messagesBottom,
                overflowY: messages.length === 0 ? 'hidden' : 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: messages.length === 0 ? 'unset' : 'touch',
                padding: '16px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
            }}>
                {messages.length === 0 ? (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', flex: 1, gap: '24px', paddingTop: '40px',
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                width: '52px', height: '52px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--accent-blue), #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 12px', fontSize: '22px', color: 'white',
                            }}>✦</div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                                Ask me anything about your spending, budgets, or goals.
                            </p>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '480px' }}>
                            {SUGGESTIONS.map(s => (
                                <button
                                    key={s}
                                    onClick={() => handleSend(s)}
                                    style={{
                                        padding: '8px 16px',
                                        background: 'var(--bg-card)',
                                        border: '0.5px solid var(--bg-border)',
                                        borderRadius: '20px',
                                        color: 'var(--text-secondary)',
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        fontFamily: 'DM Sans, sans-serif',
                                        transition: 'border-color 150ms, color 150ms',
                                    }}
                                    onMouseEnter={e => {
                                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)';
                                        (e.currentTarget as HTMLElement).style.color = 'var(--accent-blue)';
                                    }}
                                    onMouseLeave={e => {
                                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)';
                                        (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                                    }}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map((msg, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '8px' }}>
                            {msg.role === 'assistant' && (
                                <div style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--accent-blue), #8b5cf6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '13px', color: 'white', flexShrink: 0, marginBottom: '2px',
                                }}>✦</div>
                            )}
                            {msg.role === 'assistant' ? (
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
                                    borderRadius: '18px 18px 4px 18px',
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
                    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', gap: '8px' }}>
                        <div style={{
                            width: '28px', height: '28px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--accent-blue), #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '13px', color: 'white', flexShrink: 0,
                        }}>✦</div>
                        <div style={{
                            background: 'var(--bg-card)',
                            border: '0.5px solid var(--bg-border)',
                            borderRadius: '18px 18px 18px 4px',
                            padding: '12px 16px',
                            display: 'flex', alignItems: 'center', gap: '4px',
                        }}>
                            {[0, 1, 2].map(j => (
                                <div key={j} style={{
                                    width: '7px', height: '7px',
                                    borderRadius: '50%',
                                    background: 'var(--accent-blue)',
                                    animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite`,
                                }} />
                            ))}
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Fixed Input Bar — always above BottomNav, never moves */}
            <div style={{
                position: 'fixed',
                bottom: inputBarBottom,
                left: leftOffset,
                right: 0,
                height: `${INPUT_H}px`,
                zIndex: 200,
                backgroundColor: 'var(--bg-primary)',
                borderTop: '1px solid var(--bg-border)',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-end',
                gap: '8px',
            }}>
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend(input);
                        }
                    }}
                    placeholder="Ask about your finances…"
                    rows={1}
                    style={{
                        flex: 1,
                        padding: '9px 14px',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--bg-border)',
                        borderRadius: '22px',
                        fontSize: '0.875rem',
                        fontFamily: 'DM Sans, sans-serif',
                        outline: 'none',
                        resize: 'none',
                        lineHeight: 1.5,
                        maxHeight: '120px',
                        overflowY: 'auto',
                    }}
                />
                <button
                    onClick={() => handleSend(input)}
                    disabled={loading || !input.trim()}
                    style={{
                        width: '40px', height: '40px', borderRadius: '50%',
                        background: 'var(--accent-blue)',
                        border: 'none', color: '#fff',
                        cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                        opacity: loading || !input.trim() ? 0.45 : 1,
                        transition: 'opacity 0.15s',
                    }}
                >
                    <Send size={16} />
                </button>
            </div>
        </AppLayout>
    );
}
