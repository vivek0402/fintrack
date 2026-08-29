'use client';

import { useRouter } from 'next/navigation';

interface AIResponseCardProps {
    message: string;
    type?: 'chat' | 'insight' | 'afford' | 'report';
    onAction?: (action: string) => void;
    style?: React.CSSProperties;
}

interface ActionButton {
    label: string;
    route?: string;
    colorKey: 'blue' | 'green' | 'yellow';
}

const colorStyles = {
    blue: {
        text:  'var(--accent)',
        bg:    'var(--accent-subtle)',
        border:'var(--accent-border)',
        hover: 'var(--accent-subtle)',
    },
    green: {
        text:  'var(--color-inc)',
        bg:    'color-mix(in srgb, var(--color-inc) 10%, transparent)',
        border:'color-mix(in srgb, var(--color-inc) 20%, transparent)',
        hover: 'color-mix(in srgb, var(--color-inc) 18%, transparent)',
    },
    yellow: {
        text:  'var(--color-warn)',
        bg:    'color-mix(in srgb, var(--color-warn) 10%, transparent)',
        border:'color-mix(in srgb, var(--color-warn) 20%, transparent)',
        hover: 'color-mix(in srgb, var(--color-warn) 18%, transparent)',
    },
};

function stripHtml(text: string): string {
    return text.replace(/<[^>]*>/g, '');
}

function highlightValues(text: string): string {
    const safe = stripHtml(text);
    return safe.replace(
        /(₹[\d,]+(?:\.\d+)?|[\d.]+%)/g,
        '<span style="color: var(--accent); font-weight: 500;">$1</span>'
    );
}

function parseMessageSections(message: string): { headline: string; details: string } {
    const sentences = message.split(/(?<=[.!?])\s+/);
    const headline = sentences[0] || message;
    const details  = sentences.slice(1).join(' ');
    return { headline, details };
}

function parseActions(message: string, type: string): ActionButton[] {
    if (type === 'afford') {
        return [
            { label: 'Buy it',     colorKey: 'green'  },
            { label: 'Delay it',   colorKey: 'yellow' },
            { label: 'Set a Goal', route: '/goals', colorKey: 'blue' },
        ];
    }
    const actions: ActionButton[] = [];
    const lower = message.toLowerCase();
    if (lower.includes('over budget') || lower.includes('overspend'))
        actions.push({ label: 'View Budgets',     route: '/budgets',               colorKey: 'yellow' });
    if (lower.includes('save') || lower.includes('goal') || lower.includes('saving'))
        actions.push({ label: 'View Goals',        route: '/goals',                colorKey: 'green'  });
    if (lower.includes('transaction') || lower.includes('spent') || lower.includes('expense'))
        actions.push({ label: 'View Transactions', route: '/transactions',         colorKey: 'blue'   });
    if (lower.includes('add') || lower.includes('record') || lower.includes('log'))
        actions.push({ label: '+ Add Transaction', route: '/transactions?add=true', colorKey: 'blue' });
    if (lower.includes('trend') || lower.includes('pattern') || lower.includes('analytic'))
        actions.push({ label: 'See Analytics',     route: '/analytics',            colorKey: 'blue'   });
    return actions.slice(0, 3);
}

export function AIResponseCard({ message, type = 'chat', onAction, style }: AIResponseCardProps) {
    const router = useRouter();
    const { headline, details } = parseMessageSections(message);
    const actions = parseActions(message, type);

    const handleAction = (action: ActionButton) => {
        const target = action.route ?? action.label;
        if (onAction) onAction(target);
        else if (action.route) router.push(action.route);
    };

    return (
        <div style={{
            background: 'var(--glass-sheet-surface)',
            border: '1px solid var(--glass-border)',
            borderLeft: `3px solid var(--accent)`,
            borderRadius: 'var(--radius-lg)',
            padding: '14px 16px',
            ...style,
        }}>
            {/* AI avatar dot — hidden when type="chat" (external avatar handles it) */}
            {type !== 'chat' && (
                <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: 'color-mix(in srgb, var(--color-info) 15%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-info) 25%, transparent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px', color: 'var(--color-info)',
                    marginBottom: '12px', flexShrink: 0,
                }}>✦</div>
            )}

            {/* Headline */}
            <p
                style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 6px', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}
                dangerouslySetInnerHTML={{ __html: highlightValues(headline) }}
            />

            {/* Details */}
            {details && (
                <p
                    style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, fontFamily: 'var(--font-body)' }}
                    dangerouslySetInnerHTML={{ __html: highlightValues(details) }}
                />
            )}

            {/* Action buttons */}
            {actions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                    {actions.map((action, i) => {
                        const c = colorStyles[action.colorKey];
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => handleAction(action)}
                                style={{ padding: '6px 14px', borderRadius: '20px', border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'background 150ms' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = c.hover}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = c.bg}
                            >
                                {action.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
