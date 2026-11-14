import type { CSSProperties } from 'react';

/**
 * The app's one type scale as inline style objects (DESIGN.md "Typography").
 * Spread these instead of writing fontSize / fontWeight / fontFamily by hand:
 *
 *     <p style={{ ...type.label, margin: 0 }}>Savings rate</p>
 *
 * Seven sizes (11, 12, 14, 16, 20, 28, 40) and three weights: 400 for text,
 * 500 for labels, row titles and every figure, 700 for Cabinet Grotesk
 * headings. DM Mono is only loaded up to 500, so a heavier figure renders as
 * a browser-faked bold; size carries the hierarchy for numbers instead.
 */

const mono: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
};

export const type = {
    /** The page's single hero figure. Pair with className="type-display", which sets the size (40, or 28 on phones). */
    display: { ...mono, lineHeight: 1.05, letterSpacing: '-0.02em', color: 'var(--text-primary)' },
    /** A card's key number. */
    figure: { ...mono, fontSize: 'var(--text-figure)', lineHeight: 1.1, letterSpacing: '-0.01em', color: 'var(--text-primary)' },
    /** Numbers in a stat strip. */
    stat: { ...mono, fontSize: 'var(--text-heading)', lineHeight: 1.2, color: 'var(--text-primary)' },
    /** Amounts in rows and running text. */
    num: { ...mono, fontSize: 'var(--text-body)', color: 'var(--text-primary)' },
    /** Small figures beside a label: spent / limit, chart values. */
    numSmall: { ...mono, fontSize: 'var(--text-caption)', fontWeight: 400, color: 'var(--text-secondary)' },

    /** Page title. */
    heading: { fontFamily: 'var(--font-display)', fontSize: 'var(--text-heading)', fontWeight: 700, lineHeight: 1.2, color: 'var(--text-primary)' },
    /** Card title. */
    title: { fontFamily: 'var(--font-display)', fontSize: 'var(--text-title)', fontWeight: 700, lineHeight: 1.3, color: 'var(--text-primary)' },

    /** Running text. */
    body: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)', fontWeight: 400, lineHeight: 1.55, color: 'var(--text-secondary)' },
    /** Row titles and other emphasised body text. */
    bodyStrong: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)', fontWeight: 500, lineHeight: 1.4, color: 'var(--text-primary)' },
    /** The label above a figure or a field. Sentence case, never uppercase. */
    label: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption)', fontWeight: 500, lineHeight: 1.4, color: 'var(--text-secondary)' },
    /** Metadata under a row title or a figure. */
    meta: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption)', fontWeight: 400, lineHeight: 1.4, color: 'var(--text-secondary)' },
    /** Chart axes and badges only. */
    micro: { fontFamily: 'var(--font-mono)', fontSize: 'var(--text-micro)', fontWeight: 400, lineHeight: 1.2, color: 'var(--text-muted)' },
} satisfies Record<string, CSSProperties>;

/** One line, ellipsis on overflow. Needs a parent with `minWidth: 0`. */
export const truncate: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
