'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { agentAPI } from '@/lib/api';
import { useIsMobile } from '@/hooks/useWindowSize';
import { renderChatMarkdown } from '@/lib/chatMarkdown';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextAction } from '@/components/ui/CardParts';
import { type, truncate } from '@/lib/typography';
import { timeAgo } from '@/lib/chatTime';

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

const STARTER_PROMPTS = [
    'Which loan should I pay off first?',
    'Where am I overspending this month?',
    'How is my investment portfolio allocated?',
];

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
            // ignore, leave current view as-is
        }
    };

    const deleteConversation = async (conv: ConversationSummary) => {
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
            // ignore, leave list as-is
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
    const activeConversation = activeConversationId ? conversations.find(c => c.id === activeConversationId) : undefined;
    const washOn = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'var(--glass-fill-2)'; };
    const washOff = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; };

    return (
        <div style={{
            display: 'flex',
            height: containerHeight,
            gap: '12px',
            animation: 'fadeUp 200ms ease forwards',
            position: 'relative',
        }}>

            {/* Conversations */}
            {(!isMobile || mobileSidebarOpen) && (
                <Card style={{
                    width: isMobile ? '100%' : '280px',
                    flexShrink: 0,
                    position: isMobile ? 'absolute' : 'static',
                    inset: isMobile ? 0 : undefined,
                    zIndex: isMobile ? 10 : undefined,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    overflowY: 'auto',
                }}>
                    {isMobile && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <TextAction onClick={() => setMobileSidebarOpen(false)}>Close</TextAction>
                        </div>
                    )}

                    <Button type="button" variant="primary" onClick={handleNewConversation} style={{ width: '100%' }}>
                        New chat
                    </Button>

                    <p style={{ ...type.label, margin: 0 }}>Your chats</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {conversationsLoaded && conversations.length === 0 ? (
                            <p style={{ ...type.meta, margin: 0 }}>
                                No conversations yet. Start a new chat to get personalized financial advice.
                            </p>
                        ) : conversations.map(conv => {
                            const active = activeConversationId === conv.id;
                            return (
                                <div key={conv.id} role="button" tabIndex={0}
                                    onClick={() => handleSelectConversation(conv)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSelectConversation(conv); }}
                                    style={{
                                        display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0,
                                        padding: '10px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                        background: active ? 'var(--glass-fill-2)' : 'transparent',
                                        transition: 'background var(--transition-fast)',
                                    }}
                                    onMouseEnter={e => { if (!active) washOn(e); }}
                                    onMouseLeave={e => { if (!active) washOff(e); }}>
                                    <span style={{ ...(active ? type.bodyStrong : { ...type.body, color: 'var(--text-primary)' }), ...truncate }}>
                                        {conv.title || 'Untitled conversation'}
                                    </span>
                                    <span style={type.meta}>{timeAgo(conv.updated_at)}</span>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* Chat */}
            <Card padding={0} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <ChatHeader
                    isMobile={isMobile}
                    title={activeConversation ? (activeConversation.title || 'Untitled conversation') : 'Fin'}
                    subtitle={activeConversationId ? 'Fin, your AI financial assistant' : 'Your AI financial assistant'}
                    onMenu={() => setMobileSidebarOpen(true)}
                    onDelete={activeConversation ? () => deleteConversation(activeConversation) : undefined}
                    deleting={!!activeConversation && deletingId === activeConversation.id}
                />

                {showWelcome ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', gap: '16px', overflowY: 'auto' }}>
                        <h2 style={{ ...type.heading, margin: 0, textAlign: 'center' }}>Ask Fin anything</h2>
                        <p style={{ ...type.meta, margin: 0, maxWidth: '380px', textAlign: 'center' }}>
                            Ask about your debt, investments, taxes or spending. Fin answers from your own numbers.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '380px' }}>
                            {STARTER_PROMPTS.map(q => (
                                <button key={q} type="button" onClick={() => handleSend(q)}
                                    onMouseEnter={washOn} onMouseLeave={washOff}
                                    style={{
                                        ...type.body, color: 'var(--text-primary)',
                                        padding: '10px 14px', borderRadius: 'var(--radius-md)', textAlign: 'left', cursor: 'pointer',
                                        border: '1px solid var(--glass-border)', background: 'transparent',
                                        transition: 'background var(--transition-fast)',
                                    }}>
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '18px', padding: isMobile ? '16px' : '20px' }}>
                        {messages.map((msg, i) => (
                            <div key={msg.timestamp ? `${msg.role}-${msg.timestamp}` : i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                {msg.role === 'assistant' ? (
                                    <div style={{ ...type.body, color: 'var(--text-primary)', maxWidth: '640px', minWidth: 0, overflowWrap: 'anywhere' }}>
                                        {renderChatMarkdown(msg.content)}
                                    </div>
                                ) : (
                                    <div style={{
                                        ...type.body, color: 'var(--text-primary)',
                                        maxWidth: isMobile ? '82%' : '72%', padding: '10px 14px', borderRadius: '16px 16px 4px 16px',
                                        background: 'var(--glass-fill-2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                                    }}>
                                        {msg.content}
                                    </div>
                                )}
                            </div>
                        ))}

                        {sending && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} aria-label="Fin is typing">
                                {[0, 1, 2].map(j => (
                                    <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite` }} />
                                ))}
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}

                <ChatInput input={input} setInput={setInput} canSend={canSend} onSend={handleSend} />
            </Card>
        </div>
    );
}

function ChatHeader({ isMobile, title, subtitle, onMenu, onDelete, deleting }: {
    isMobile: boolean;
    title: string;
    subtitle: string;
    onMenu: () => void;
    onDelete?: () => void;
    deleting: boolean;
}) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', flexShrink: 0,
            borderBottom: '1px solid var(--glass-border)',
        }}>
            {isMobile && <TextAction onClick={onMenu}>Chats</TextAction>}
            <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ ...type.bodyStrong, margin: 0, ...truncate }}>{title}</p>
                <p style={{ ...type.meta, margin: 0 }}>{subtitle}</p>
            </div>
            {onDelete && (
                <TextAction tone="danger" quiet onClick={onDelete} disabled={deleting}>
                    {deleting ? 'Deleting' : 'Delete chat'}
                </TextAction>
            )}
        </div>
    );
}

function ChatInput({ input, setInput, canSend, onSend }: {
    input: string;
    setInput: (v: string) => void;
    canSend: boolean;
    onSend: (text: string) => void;
}) {
    return (
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--glass-border)', padding: '12px 14px', display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
            <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(input); }
                }}
                placeholder="Ask Fin about your money"
                aria-label="Message Fin"
                rows={1}
                style={{
                    ...type.body, color: 'var(--text-primary)',
                    flex: 1, padding: '8px 14px', background: 'var(--glass-fill-1)',
                    border: '1px solid var(--glass-border)', borderRadius: '20px',
                    outline: 'none', resize: 'none', maxHeight: '120px', overflowY: 'auto',
                    transition: 'border-color var(--transition-fast)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--glass-border)')}
            />
            <Button type="button" variant="primary" onClick={() => onSend(input)} disabled={!canSend}>
                Send
            </Button>
        </div>
    );
}
