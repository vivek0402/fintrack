'use client';

import React from 'react';
import { type } from '@/lib/typography';

/**
 * The pieces that go inside a Card (DESIGN.md "The card"): one header
 * pattern, one text action, hairline rows and a status dot. Their layout
 * lives in globals.css (.fin-rows, .fin-link, .fin-icon-btn).
 */

/** Title on the left, at most one action on the right. `sub` is a line of metadata under the title. */
export function CardHeader({ title, sub, action, flush = false }: {
    title: string;
    sub?: React.ReactNode;
    action?: React.ReactNode;
    /** No space below, for a card that is only a header. */
    flush?: boolean;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: flush ? 0 : 'var(--space-4)' }}>
            <div style={{ minWidth: 0 }}>
                <h2 style={{ ...type.title, margin: 0 }}>{title}</h2>
                {sub && <p style={{ ...type.meta, margin: '2px 0 0' }}>{sub}</p>}
            </div>
            {action && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>{action}</div>}
        </div>
    );
}

/** The one link style inside cards. `quiet` is for secondary actions such as Dismiss. */
export function TextAction({ children, onClick, quiet = false, disabled, 'aria-label': ariaLabel }: {
    children: React.ReactNode;
    onClick: () => void;
    quiet?: boolean;
    disabled?: boolean;
    'aria-label'?: string;
}) {
    return (
        <button type="button" className={quiet ? 'fin-link fin-link-quiet' : 'fin-link'} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
            {children}
        </button>
    );
}

/** Rows split by hairlines. Each direct child is one row. */
export function Rows({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return <div className="fin-rows" style={style}>{children}</div>;
}

export type Tone = 'bad' | 'caution' | 'good' | 'info' | 'neutral';

const TONE_COLOR: Record<Tone, string> = {
    bad: 'var(--color-exp)',
    caution: 'var(--color-warn)',
    good: 'var(--color-inc)',
    info: 'var(--accent)',
    neutral: 'var(--text-muted)',
};

/** The matching text colour for a tone, AA-safe at small sizes. */
export const TONE_TEXT: Record<Tone, string> = {
    bad: 'var(--color-exp-text)',
    caution: 'var(--color-warn-text)',
    good: 'var(--color-inc-text)',
    info: 'var(--accent-text)',
    neutral: 'var(--text-secondary)',
};

/** 8px status dot. Colour is never the only signal: the row's text says what is wrong. */
export function StatusDot({ tone = 'neutral' }: { tone?: Tone }) {
    return <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: TONE_COLOR[tone] }} />;
}

/**
 * A notice as a row: dot, one plain sentence, optional metadata, then actions.
 * Replaces tinted banners and side-stripe alerts.
 */
export function NoticeRow({ tone = 'neutral', title, sub, children }: {
    tone?: Tone;
    title: React.ReactNode;
    sub?: React.ReactNode;
    /** Actions, right-aligned. */
    children?: React.ReactNode;
}) {
    return (
        <div>
            <StatusDot tone={tone} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...type.bodyStrong, margin: 0 }}>{title}</p>
                {sub && <p style={{ ...type.meta, margin: '2px 0 0' }}>{sub}</p>}
            </div>
            {children && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexShrink: 0 }}>{children}</div>}
        </div>
    );
}

/** Label, figure, one line of context. Lay several out in a `.dash-stats` style strip. */
export function Stat({ label, value, sub, subTone = 'neutral', className }: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    subTone?: Tone;
    className?: string;
}) {
    return (
        <div className={className}>
            <p style={{ ...type.label, margin: 0 }}>{label}</p>
            <p style={{ ...type.stat, margin: '4px 0 2px' }}>{value}</p>
            {sub && <p style={{ ...type.meta, margin: 0, color: TONE_TEXT[subTone], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>}
        </div>
    );
}
