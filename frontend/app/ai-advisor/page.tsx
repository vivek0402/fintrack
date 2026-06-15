'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Bot, TrendingDown, LineChart, Receipt, Wallet, Plus, Menu, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { agentAPI } from '@/lib/api';
import { useIsMobile } from '@/hooks/useWindowSize';
import { AppLayout } from '@/components/layout/AppLayout';

type AgentType = 'debt_coach' | 'investment_advisor' | 'tax_planner' | 'budget_master';

interface AgentMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
}

interface ConversationSummary {
    id: string;
    agent_type: AgentType;
    title: string;
    updated_at: string;
    message_count: number;
}

interface AgentDef {
    type: AgentType;
    name: string;
    shortDesc: string;
    longDesc: string;
    icon: typeof TrendingDown;
    color: string;
    starters: string[];
}

const AGENTS: AgentDef[] = [
    {
        type: 'debt_coach',
        name: 'Debt Coach',
        shortDesc: 'Debt elimination, EMIs & payoff strategy',
        longDesc: 'A no-nonsense coach focused on getting you debt-free as fast as possible — loan prioritization, prepayment strategy, and credit utilization.',
        icon: TrendingDown,
        color: 'var(--color-exp)',
        starters: [
            'Which loan should I pay off first?',
            'How much can I save by prepaying my home loan?',
            'Create a 2-year debt elimination plan for me',
        ],
    },
    {
        type: 'investment_advisor',
        name: 'Investment Advisor',
        shortDesc: 'Portfolio, allocation & wealth building',
        longDesc: 'A calm, data-driven advisor for long-term compounding — portfolio review, asset allocation, and progress toward your FIRE goal.',
        icon: LineChart,
        color: 'var(--color-inc)',
        starters: [
            'How should I rebalance my portfolio?',
            'Am I on track for my FIRE goal?',
            'What’s the ideal asset allocation for me right now?',
        ],
    },
    {
        type: 'tax_planner',
        name: 'Tax Planner',
        shortDesc: 'Deductions, regimes & ITR readiness',
        longDesc: 'A meticulous tax professional who cites the exact sections of Indian tax law — 80C, HRA exemptions, regime comparison, and ITR readiness.',
        icon: Receipt,
        color: 'var(--color-warn)',
        starters: [
            'How can I save more tax this year?',
            'Should I switch to the new tax regime?',
            'What’s my ITR readiness status?',
        ],
    },
    {
        type: 'budget_master',
        name: 'Budget Master',
        shortDesc: 'Spending habits & budget adherence',
        longDesc: 'An empathetic behavioral finance coach focused on progress, not perfection — spending patterns, budget adherence, and savings rate.',
        icon: Wallet,
        color: 'var(--color-info)',
        starters: [
            'Where am I overspending this month?',
            'How can I improve my savings rate?',
            'Why do I keep overspending in the same category?',
        ],
    },
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

    const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(null);
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, sending]);

    const loadConversations = async (agentType: AgentType) => {
        try {
            const res = await agentAPI.getConversations(agentType);
            setConversations(res.data.conversations ?? []);
        } catch {
            setConversations([]);
        }
    };

    const handleSelectAgent = (agentType: AgentType) => {
        setSelectedAgent(agentType);
        setActiveConversationId(null);
        setMessages([]);
        if (isMobile) setMobileSidebarOpen(false);
        loadConversations(agentType);
    };

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

    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || sending || !selectedAgent) return;

        const userMsg: AgentMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setSending(true);

        try {
            const res = await agentAPI.sendMessage(selectedAgent, trimmed, activeConversationId ?? undefined);
            setMessages((res.data.messages ?? []) as AgentMessage[]);
            if (!activeConversationId && res.data.conversation_id) {
                setActiveConversationId(res.data.conversation_id);
            }
            loadConversations(selectedAgent);
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

    if (isLoading || !user) return <AppLayout><div /></AppLayout>;

    const agentDef = AGENTS.find(a => a.type === selectedAgent) || null;
    const canSend = !!input.trim() && !sending && !!selectedAgent;
    const containerHeight = isMobile ? 'calc(100dvh - 160px)' : 'calc(100dvh - 72px)';

    return (
        <AppLayout>
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
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-xl)',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        overflowY: 'auto',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                AI Advisor
                            </h2>
                            {isMobile && (
                                <button type="button" onClick={() => setMobileSidebarOpen(false)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
                                    <X size={18} />
                                </button>
                            )}
                        </div>

                        {/* Agent selector cards */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {AGENTS.map(agent => {
                                const Icon = agent.icon;
                                const active = selectedAgent === agent.type;
                                return (
                                    <button key={agent.type} type="button" onClick={() => handleSelectAgent(agent.type)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                                            borderRadius: '12px', textAlign: 'left', cursor: 'pointer',
                                            border: active ? `1px solid color-mix(in srgb, ${agent.color} 35%, transparent)` : '1px solid var(--border)',
                                            background: active ? `color-mix(in srgb, ${agent.color} 10%, var(--bg-card))` : 'var(--bg-alt)',
                                            transition: 'all var(--transition-fast)',
                                        }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                                            background: `color-mix(in srgb, ${agent.color} 15%, var(--bg-card))`,
                                            border: `1px solid color-mix(in srgb, ${agent.color} 25%, transparent)`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <Icon size={17} color={agent.color} />
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
                                                {agent.name}
                                            </p>
                                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {agent.shortDesc}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Conversation history */}
                        {selectedAgent && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0 8px' }} />
                                <button type="button" onClick={handleNewConversation}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: '4px 2px', fontFamily: 'var(--font-body)' }}>
                                    <Plus size={14} /> New conversation
                                </button>
                                {conversations.length === 0 ? (
                                    <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '6px 2px', fontFamily: 'var(--font-body)' }}>
                                        No conversations yet.
                                    </p>
                                ) : conversations.map(conv => {
                                    const active = activeConversationId === conv.id;
                                    return (
                                        <button key={conv.id} type="button" onClick={() => handleSelectConversation(conv)}
                                            style={{
                                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px',
                                                padding: '8px 10px', borderRadius: '8px', textAlign: 'left', cursor: 'pointer',
                                                border: 'none',
                                                background: active ? 'var(--accent-light)' : 'transparent',
                                                width: '100%',
                                            }}
                                            onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                            onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                            <span style={{
                                                fontSize: '12px', fontWeight: active ? 600 : 500,
                                                color: active ? 'var(--accent)' : 'var(--text-primary)',
                                                fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap', maxWidth: '100%',
                                            }}>
                                                {conv.title || 'Untitled conversation'}
                                            </span>
                                            <span style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'var(--font-body)' }}>
                                                {timeAgo(conv.updated_at)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── RIGHT PANEL ── */}
                <div style={{
                    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)',
                    overflow: 'hidden',
                }}>

                    {/* No agent selected — welcome screen */}
                    {!selectedAgent && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', gap: '20px', overflowY: 'auto' }}>
                            <div style={{ textAlign: 'center' }}>
                                <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Choose an advisor to get started
                                </h2>
                                <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                    Each agent specializes in a different area of your finances.
                                </p>
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                                gap: '14px',
                                width: '100%',
                                maxWidth: '620px',
                            }}>
                                {AGENTS.map(agent => {
                                    const Icon = agent.icon;
                                    return (
                                        <button key={agent.type} type="button" onClick={() => handleSelectAgent(agent.type)}
                                            style={{
                                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px',
                                                padding: '18px', borderRadius: '14px', textAlign: 'left', cursor: 'pointer',
                                                border: '1px solid var(--border)', background: 'var(--bg-alt)',
                                                transition: 'all var(--transition-fast)',
                                            }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${agent.color} 35%, transparent)`; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
                                            <div style={{
                                                width: 44, height: 44, borderRadius: 12,
                                                background: `color-mix(in srgb, ${agent.color} 15%, var(--bg-card))`,
                                                border: `1px solid color-mix(in srgb, ${agent.color} 25%, transparent)`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Icon size={22} color={agent.color} />
                                            </div>
                                            <div>
                                                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-head)' }}>
                                                    {agent.name}
                                                </p>
                                                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                                                    {agent.longDesc}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Agent selected, no active conversation, no messages — new conversation view */}
                    {selectedAgent && agentDef && messages.length === 0 && (
                        <>
                            <ChatHeader agent={agentDef} isMobile={isMobile} onMenu={() => setMobileSidebarOpen(true)} />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', gap: '18px', overflowY: 'auto' }}>
                                <div style={{
                                    width: 56, height: 56, borderRadius: '50%',
                                    background: `color-mix(in srgb, ${agentDef.color} 12%, var(--bg-card))`,
                                    border: `1px solid color-mix(in srgb, ${agentDef.color} 25%, transparent)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <agentDef.icon size={26} color={agentDef.color} />
                                </div>
                                <div style={{ textAlign: 'center', maxWidth: '380px' }}>
                                    <h3 style={{ margin: 0, fontFamily: 'var(--font-head)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {agentDef.name}
                                    </h3>
                                    <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
                                        {agentDef.longDesc}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '380px' }}>
                                    {agentDef.starters.map(q => (
                                        <button key={q} type="button" onClick={() => handleSend(q)}
                                            style={{
                                                padding: '10px 14px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer',
                                                border: `1px solid color-mix(in srgb, ${agentDef.color} 25%, var(--border))`,
                                                background: `color-mix(in srgb, ${agentDef.color} 6%, var(--bg-card))`,
                                                color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-body)',
                                                transition: 'all var(--transition-fast)',
                                            }}>
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <ChatInput input={input} setInput={setInput} sending={sending} canSend={canSend} onSend={handleSend} />
                        </>
                    )}

                    {/* Active conversation — chat interface */}
                    {selectedAgent && agentDef && messages.length > 0 && (
                        <>
                            <ChatHeader agent={agentDef} isMobile={isMobile} onMenu={() => setMobileSidebarOpen(true)} />
                            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
                                {messages.map((msg, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '8px' }}>
                                        {msg.role === 'assistant' ? (
                                            <>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0, marginBottom: 2,
                                                    background: `color-mix(in srgb, ${agentDef.color} 15%, var(--bg-card))`,
                                                    border: `1px solid color-mix(in srgb, ${agentDef.color} 25%, transparent)`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <agentDef.icon size={14} color={agentDef.color} />
                                                </div>
                                                <div style={{
                                                    maxWidth: isMobile ? '88%' : '72%', padding: '10px 14px', borderRadius: '15px 15px 15px 4px',
                                                    background: `color-mix(in srgb, ${agentDef.color} 8%, var(--bg-card))`,
                                                    border: `1px solid color-mix(in srgb, ${agentDef.color} 18%, var(--border))`,
                                                    color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6,
                                                    whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)',
                                                }}>
                                                    {msg.content}
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

                                {/* Typing indicator */}
                                {sending && (
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                            background: `color-mix(in srgb, ${agentDef.color} 15%, var(--bg-card))`,
                                            border: `1px solid color-mix(in srgb, ${agentDef.color} 25%, transparent)`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <agentDef.icon size={14} color={agentDef.color} />
                                        </div>
                                        <div style={{ background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: '15px 15px 15px 4px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            {[0, 1, 2].map(j => (
                                                <div key={j} style={{ width: 7, height: 7, borderRadius: '50%', background: agentDef.color, animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite` }} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                            <ChatInput input={input} setInput={setInput} sending={sending} canSend={canSend} onSend={handleSend} />
                        </>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}

function ChatHeader({ agent, isMobile, onMenu }: { agent: AgentDef; isMobile: boolean; onMenu: () => void }) {
    const Icon = agent.icon;
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', flexShrink: 0,
            borderBottom: '1px solid var(--border)',
            background: `color-mix(in srgb, ${agent.color} 6%, var(--bg-card))`,
        }}>
            {isMobile && (
                <button type="button" onClick={onMenu}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
                    <Menu size={18} />
                </button>
            )}
            <div style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                background: `color-mix(in srgb, ${agent.color} 15%, var(--bg-card))`,
                border: `1px solid color-mix(in srgb, ${agent.color} 25%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={16} color={agent.color} />
            </div>
            <div>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-head)' }}>
                    {agent.name}
                </p>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                    {agent.shortDesc}
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
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '12px 14px', display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
            <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(input); }
                }}
                placeholder="Type your message…"
                rows={1}
                style={{
                    flex: 1, padding: '8px 12px', background: 'var(--bg-alt)', color: 'var(--text-primary)',
                    border: '1px solid var(--border)', borderRadius: '20px', fontSize: '14px', fontFamily: 'var(--font-body)',
                    outline: 'none', resize: 'none', lineHeight: 1.5, maxHeight: '120px', overflowY: 'auto',
                    transition: 'border-color var(--transition-fast)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
            <button type="button" onClick={() => onSend(input)} disabled={!canSend}
                style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: canSend ? 'var(--accent)' : 'var(--bg-alt)',
                    border: canSend ? 'none' : '1px solid var(--border)',
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
