'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Sparkles, Plus, Menu, X, Trash2, MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { agentAPI } from '@/lib/api';
import { useIsMobile } from '@/hooks/useWindowSize';
import { renderChatMarkdown } from '@/lib/chatMarkdown';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface AgentMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
}

interface ConversationSummary {
    id: string;
    title: string;
    updated_at: string;
    message_count: number;
}

const FIN_COLOR = 'var(--accent)';

const STARTER_PROMPTS = [
    'Which loan should I pay off first?',
    'Where am I overspending this month?',
    'How is my investment portfolio allocated?',
];

function timeAgo(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function AiAdvisorPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
    const [conversationsLoaded, setConversationsLoaded] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, sending]);

    const loadConversations = async () => {
        try {
            const res = await agentAPI.getConversations();
            setConversations(res.data.conversations ?? []);
        } catch {
            setConversations([]);
        } finally {
            setConversationsLoaded(true);
        }
    };

    useEffect(() => { loadConversations(); }, []);

    const handleNewConversation = () => {
        setActiveConversationId(null);
        setMessages([]);
        if (isMobile) setMobileSidebarOpen(false);
    };

    const handleSelectConversation = async (conv: ConversationSummary) => {
        try {
            const res = await agentAPI.getConversation(conv.id);
            const conversation = res.data.conversation;
            setMessages((conversation?.messages ?? []) as AgentMessage[]);
            setActiveConversationId(conv.id);
            if (isMobile) setMobileSidebarOpen(false);
        } catch {
            // ignore — leave current view as-is
        }
    };

    const handleDeleteConversation = async (conv: ConversationSummary, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(`Delete "${conv.title || 'this conversation'}"? This cannot be undone.`)) return;

        setDeletingId(conv.id);
        try {
            await agentAPI.deleteConversation(conv.id);
            setConversations(prev => prev.filter(c => c.id !== conv.id));
            if (activeConversationId === conv.id) {
                setActiveConversationId(null);
                setMessages([]);
            }
        } catch {
            // ignore — leave list as-is
        } finally {
            setDeletingId(null);
        }
    };

    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || sending) return;

        const userMsg: AgentMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setSending(true);

        try {
            const res = await agentAPI.sendMessage(trimmed, activeConversationId ?? undefined);
            setMessages((res.data.messages ?? []) as AgentMessage[]);
            if (!activeConversationId && res.data.conversation_id) {
                setActiveConversationId(res.data.conversation_id);
            }
            loadConversations();
        } catch (err: any) {
            const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: serverMsg || "I'm having trouble connecting right now. Please try again.",
                timestamp: new Date().toISOString(),
            }]);
        } finally {
            setSending(false);
        }
    };

    if (isLoading || !user) {
        return (
            <div style={{ display: 'flex', height: isMobile ? 'calc(100dvh - 160px)' : 'calc(100dvh - 72px)', gap: '12px' }}>
                {!isMobile && (
                    <div style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <SkeletonCard height={40} />
                        <SkeletonCard height={80} />
                        <SkeletonCard height={80} />
                        <SkeletonCard height={80} />
                    </div>
                )}
                <div style={{ flex: 1 }}>
                    <SkeletonCard height="100%" />
                </div>
            </div>
        );
    }

    const canSend = !!input.trim() && !sending;
    const containerHeight = isMobile ? 'calc(100dvh - 160px)' : 'calc(100dvh - 72px)';
    const showWelcome = conversationsLoaded && messages.length === 0;

    return (
            <div style={{
                display: 'flex',
                height: containerHeight,
                gap: '12px',
                animation: 'fadeUp 200ms ease forwards',
                position: 'relative',
            }}>

                {/* ── LEFT PANEL ── */}
                {(!isMobile || mobileSidebarOpen) && (
                    <div style={{
                        width: isMobile ? '100%' : '280px',
                        flexShrink: 0,
                        position: isMobile ? 'absolute' : 'static',
                        inset: isMobile ? 0 : undefined,
                        zIndex: isMobile ? 10 : undefined,
                        background: 'var(--bg-surface-1)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xl)',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        overflowY: 'auto',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                Fin
                            </h2>
                            {isMobile && (
                                <button type="button" onClick={() => setMobileSidebarOpen(false)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
                                    <X size={18} />
                                </button>
                            )}
                        </div>

                        <button type="button" onClick={handleNewConversation}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                                border: `1px solid color-mix(in srgb, ${FIN_COLOR} 35%, transparent)`,
                                background: `color-mix(in srgb, ${FIN_COLOR} 10%, var(--bg-surface-1))`,
                                color: 'var(--accent)', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-body)',
                            }}>
                            <Plus size={15} /> New chat
                        </button>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0 8px' }} />
                            {conversationsLoaded && conversations.length === 0 ? (
                                <EmptyState
                                    icon={MessageSquare}
                                    title="No conversations yet"
                                    subtitle="Start a new chat to get personalized financial advice."
                                />
                            ) : conversations.map(conv => {
                                const active = activeConversationId === conv.id;
                                return (
                                    <div key={conv.id} role="button" tabIndex={0}
                                        onClick={() => handleSelectConversation(conv)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleSelectConversation(conv); }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
                                            background: active ? 'var(--accent-subtle)' : 'transparent',
                                            width: '100%',
                                        }}
                                        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-3)'; }}
                                        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', minWidth: 0, flex: 1 }}>
                                            <span style={{
                                                fontSize: '12px', fontWeight: active ? 600 : 500,
                                                color: active ? 'var(--accent)' : 'var(--text-primary)',
                                                fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap', maxWidth: '100%',
                                            }}>
                                                {conv.title || 'Untitled conversation'}
                                            </span>
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                                {timeAgo(conv.updated_at)}
                                            </span>
                                        </div>
                                        <button type="button" title="Delete conversation"
                                            onClick={e => handleDeleteConversation(conv, e)}
                                            disabled={deletingId === conv.id}
                                            style={{
                                                background: 'none', border: 'none', flexShrink: 0, padding: '4px',
                                                color: 'var(--text-muted)', cursor: deletingId === conv.id ? 'default' : 'pointer',
                                                display: 'flex', opacity: deletingId === conv.id ? 0.4 : 1,
                                            }}
                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-exp)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── RIGHT PANEL ── */}
                <div style={{
                    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                    background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)',
                    overflow: 'hidden',
                }}>
                    <ChatHeader isMobile={isMobile} onMenu={() => setMobileSidebarOpen(true)} />

                    {showWelcome ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', gap: '18px', overflowY: 'auto' }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: '50%',
                                background: `color-mix(in srgb, ${FIN_COLOR} 12%, var(--bg-surface-1))`,
                                border: `1px solid color-mix(in srgb, ${FIN_COLOR} 25%, transparent)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Sparkles size={26} color={FIN_COLOR} />
                            </div>
                            <div style={{ textAlign: 'center', maxWidth: '380px' }}>
                                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Hi, I&apos;m Fin
                                </h3>
                                <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
                                    Ask me about your debt, investments, taxes, or spending — anything about your finances.
                                </p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '380px' }}>
                                {STARTER_PROMPTS.map(q => (
                                    <button key={q} type="button" onClick={() => handleSend(q)}
                                        style={{
                                            padding: '10px 14px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer',
                                            border: `1px solid color-mix(in srgb, ${FIN_COLOR} 25%, var(--border-subtle))`,
                                            background: `color-mix(in srgb, ${FIN_COLOR} 6%, var(--bg-surface-1))`,
                                            color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)',
                                            transition: 'all var(--transition-fast)',
                                        }}>
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
                            {messages.map((msg, i) => (
                                <div key={msg.timestamp ? `${msg.role}-${msg.timestamp}` : i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '8px' }}>
                                    {msg.role === 'assistant' ? (
                                        <>
                                            <div style={{
                                                width: 28, height: 28, borderRadius: '50%', flexShrink: 0, marginBottom: 2,
                                                background: `color-mix(in srgb, ${FIN_COLOR} 15%, var(--bg-surface-1))`,
                                                border: `1px solid color-mix(in srgb, ${FIN_COLOR} 25%, transparent)`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Sparkles size={14} color={FIN_COLOR} />
                                            </div>
                                            <div style={{
                                                maxWidth: isMobile ? '88%' : '72%', padding: '10px 14px', borderRadius: '15px 15px 15px 4px',
                                                background: `color-mix(in srgb, ${FIN_COLOR} 8%, var(--bg-surface-1))`,
                                                border: `1px solid color-mix(in srgb, ${FIN_COLOR} 18%, var(--border-subtle))`,
                                                color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6,
                                                fontFamily: 'var(--font-body)',
                                            }}>
                                                {renderChatMarkdown(msg.content)}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{
                                            maxWidth: isMobile ? '82%' : '68%', padding: '10px 14px', borderRadius: '15px 15px 4px 15px',
                                            background: 'var(--accent)', color: 'white', fontSize: '14px', lineHeight: 1.55,
                                            whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)',
                                        }}>
                                            {msg.content}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {sending && (
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                        background: `color-mix(in srgb, ${FIN_COLOR} 15%, var(--bg-surface-1))`,
                                        border: `1px solid color-mix(in srgb, ${FIN_COLOR} 25%, transparent)`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Sparkles size={14} color={FIN_COLOR} />
                                    </div>
                                    <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: '15px 15px 15px 4px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {[0, 1, 2].map(j => (
                                            <div key={j} style={{ width: 7, height: 7, borderRadius: '50%', background: FIN_COLOR, animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite` }} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}

                    <ChatInput input={input} setInput={setInput} sending={sending} canSend={canSend} onSend={handleSend} />
                </div>
            </div>
    );
}

function ChatHeader({ isMobile, onMenu }: { isMobile: boolean; onMenu: () => void }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', flexShrink: 0,
            borderBottom: '1px solid var(--border-subtle)',
            background: `color-mix(in srgb, ${FIN_COLOR} 6%, var(--bg-surface-1))`,
        }}>
            {isMobile && (
                <button type="button" onClick={onMenu}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
                    <Menu size={18} />
                </button>
            )}
            <div style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                background: `color-mix(in srgb, ${FIN_COLOR} 15%, var(--bg-surface-1))`,
                border: `1px solid color-mix(in srgb, ${FIN_COLOR} 25%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Sparkles size={16} color={FIN_COLOR} />
            </div>
            <div>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                    Fin
                </p>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                    Your AI financial assistant
                </p>
            </div>
        </div>
    );
}

function ChatInput({ input, setInput, sending, canSend, onSend }: {
    input: string;
    setInput: (v: string) => void;
    sending: boolean;
    canSend: boolean;
    onSend: (text: string) => void;
}) {
    return (
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--border-subtle)', padding: '12px 14px', display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
            <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(input); }
                }}
                placeholder="Type your message…"
                rows={1}
                style={{
                    flex: 1, padding: '8px 12px', background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)', borderRadius: '20px', fontSize: '14px', fontFamily: 'var(--font-body)',
                    outline: 'none', resize: 'none', lineHeight: 1.5, maxHeight: '120px', overflowY: 'auto',
                    transition: 'border-color var(--transition-fast)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
            />
            <button type="button" onClick={() => onSend(input)} disabled={!canSend}
                style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: canSend ? 'var(--accent)' : 'var(--bg-surface-2)',
                    border: canSend ? 'none' : '1px solid var(--border-subtle)',
                    color: canSend ? 'white' : 'var(--text-muted)',
                    cursor: canSend ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    transition: 'background var(--transition-fast), color var(--transition-fast)',
                }}>
                <Send size={16} />
            </button>
        </div>
    );
}
