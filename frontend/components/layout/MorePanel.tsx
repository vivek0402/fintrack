'use client';

import { forwardRef, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Target, Trophy, Settings, LineChart, Briefcase, Bot, Gauge, Waves,
    PiggyBank, Compass, CreditCard, Users,
    FileText, Award, Handshake,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import type { MoreMenuStyle } from '@/store/themeStore';
import { useBudgets, useGoals, useAccounts } from '@/hooks/queries';
import type { MoreAlert } from '@/hooks/useMoreAlerts';
import { pinnedMorePages } from '@/lib/morePins';
import { toAmount } from '@/types/finance';
import { type } from '@/lib/typography';
import { TextAction } from '@/components/ui/CardParts';

type Item = { href: string; icon: typeof Target; label: string; sub: string };

// Every page that isn't a main tab, in the sections both layouts show.
export const moreGroups: { label: string; items: Item[] }[] = [
    {
        label: 'Understand',
        items: [
            { href: '/budgets',     icon: Target,    label: 'Budgets',     sub: 'Limits by category' },
            { href: '/net-worth',   icon: LineChart, label: 'Net Worth',   sub: 'Assets minus debts' },
            { href: '/cash-flow',   icon: Waves,     label: 'Cash Flow',   sub: '12-month projection' },
            { href: '/reports',     icon: FileText,  label: 'Reports',     sub: 'Statements by period' },
            { href: '/year-review', icon: Award,     label: 'Year Review', sub: 'Your year in numbers' },
        ],
    },
    {
        label: 'Grow',
        items: [
            { href: '/goals',             icon: Trophy,    label: 'Goals',       sub: 'Savings targets' },
            { href: '/investments',       icon: Briefcase, label: 'Investments', sub: 'Holdings & returns' },
            { href: '/debt-intelligence', icon: Gauge,     label: 'Debt',        sub: 'Loans, cards, payoff' },
        ],
    },
    {
        label: 'Plan',
        items: [
            { href: '/planning',     icon: Compass,   label: 'Financial Plan', sub: 'Long-range plan' },
            { href: '/savings-plan', icon: PiggyBank, label: 'Savings Plan',   sub: 'Monthly set-asides' },
        ],
    },
    {
        label: 'Tools',
        items: [
            { href: '/ai-advisor',     icon: Bot,        label: 'AI Chat',        sub: 'Ask Fin anything' },
            { href: '/accounts',       icon: CreditCard, label: 'Accounts',       sub: 'Banks, cards, wallets' },
            { href: '/groups',         icon: Users,      label: 'Groups',         sub: 'Shared expenses' },
            { href: '/personal-loans', icon: Handshake,  label: 'Personal Loans', sub: 'Lent & borrowed' },
            { href: '/profile',        icon: Settings,   label: 'Profile',        sub: 'Account & app settings' },
        ],
    },
];

const allItems = moreGroups.flatMap(g => g.items);
/** Every More page's route, for counting visits (lib/morePins). */
export const morePageHrefs = allItems.map(i => i.href);

type Tone = 'good' | 'bad' | 'warn' | undefined;

/** ₹ in lakh/crore shorthand for a one-line figure. */
function shortInr(n: number): string {
    const a = Math.abs(n);
    const sign = n < 0 ? '−' : '';
    if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(1)}Cr`;
    if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)}L`;
    return `${sign}₹${Math.round(a).toLocaleString('en-IN')}`;
}

/**
 * One-line live figures for the list layout. Budgets, goals and accounts are
 * fetched (cheap, and usually cached already); the rest are shown only when
 * their page has already put them in the cache, so opening More never sets
 * off a round of slow requests.
 */
function useLiveFigures(enabled: boolean): Record<string, [string, Tone]> {
    const qc = useQueryClient();
    const { user } = useAuthStore();
    const now = new Date();
    const budgets = useBudgets(now.getMonth() + 1, now.getFullYear(), { enabled }).data;
    const goals = useGoals({ enabled }).data;
    const accounts = useAccounts({ enabled }).data;
    if (!enabled) return {};

    const out: Record<string, [string, Tone]> = {};
    if (budgets?.length) {
        const over = budgets.filter(b => toAmount(b.spent) > toAmount(b.amount)).length;
        out['/budgets'] = over ? [`${over} over limit`, 'bad'] : ['On track', 'good'];
    }
    if (goals?.length) {
        const active = goals.filter(g => toAmount(g.saved_amount) < toAmount(g.target_amount));
        const near = active.filter(g => toAmount(g.saved_amount) >= 0.9 * toAmount(g.target_amount)).length;
        out['/goals'] = near ? [`${active.length} active · ${near} near`, 'good'] : [`${active.length} active`, undefined];
    }
    if (accounts?.length) out['/accounts'] = [`${accounts.length} linked`, undefined];

    const uid = user?.id;
    const nw = qc.getQueryData<{ current?: { net_worth: number } }>(['net-worth', uid]);
    if (nw?.current) out['/net-worth'] = [shortInr(nw.current.net_worth), nw.current.net_worth >= 0 ? 'good' : 'bad'];
    const cf = qc.getQueryData<{ summary?: { average_monthly_surplus: number } }>(['cashflow', uid]);
    if (cf?.summary) {
        const s = cf.summary.average_monthly_surplus;
        out['/cash-flow'] = [`${s >= 0 ? '+' : ''}${shortInr(s)} / mo`, s >= 0 ? 'good' : 'bad'];
    }
    const inv = qc.getQueryData<{ summary?: { total_unrealized_gain_pct: number } }>(['investments', uid]);
    if (inv?.summary && Number.isFinite(inv.summary.total_unrealized_gain_pct)) {
        const p = inv.summary.total_unrealized_gain_pct;
        out['/investments'] = [`${p >= 0 ? '+' : ''}${p.toFixed(1)}%`, p >= 0 ? 'good' : 'bad'];
    }
    const debt = qc.getQueryData<{ dti?: { dti_ratio?: number } }>(['debt', uid]);
    const dti = debt?.dti?.dti_ratio;
    if (typeof dti === 'number') out['/debt-intelligence'] = [`DTI ${Math.round(dti)}%`, dti > 40 ? 'bad' : dti > 30 ? 'warn' : undefined];
    return out;
}

// Text on the glass card: the AA text-colour tokens, not the fill colours.
const TONE_COLOR: Record<string, string> = { good: 'var(--color-inc-text)', bad: 'var(--color-exp-text)', warn: 'var(--color-warn-text)' };

interface MorePanelProps {
    closing: boolean;
    /** Attention items: a badge per page plus the top line. */
    alerts?: { byHref: Record<string, MoreAlert>; top: MoreAlert | null };
    style: MoreMenuStyle;
    onStyleChange: (style: MoreMenuStyle) => void;
    isActive: (href: string) => boolean;
    onNavigate: (href: string) => void;
    onClose: () => void;
    onOpenTour?: () => void;
}

const sectionLabel: CSSProperties = { ...type.meta, color: 'var(--text-muted)', padding: '12px 4px 8px' };

/**
 * The More card: springs up out of the dock (transform + opacity only -- no
 * height animation on glass), items rising in a beat apart. Two layouts the
 * user picks between: an icon grid (fastest to reach a page) or a list with
 * a live figure per page.
 */
export const MorePanel = forwardRef<HTMLDivElement, MorePanelProps & { handleRef: React.Ref<HTMLDivElement> }>(
    function MorePanel({ closing, alerts, style, onStyleChange, isActive, onNavigate, onClose, onOpenTour, handleRef }, ref) {
        const live = useLiveFigures(style === 'list' && !closing);
        const byHref = alerts?.byHref ?? {};
        // Pinned above the grid: this person's most-opened More pages (read
        // once per open, so the row doesn't reshuffle while it's on screen).
        const [pinned] = useState(() => pinnedMorePages()
            .map(href => allItems.find(i => i.href === href))
            .filter((i): i is Item => !!i));
        const top = alerts?.top ?? null;
        let n = 0; // stagger index across the whole card
        const rise = (): CSSProperties => ({ ['--i' as string]: n++ });

        return (
            <div ref={ref} className={`glass-surface glass-nav more-pop ${closing ? 'more-pop-exit' : 'more-pop-enter'}`}
                role="dialog" aria-label="More pages">
                {/* The whole header is the drag-to-close handle, not just the bar. */}
                <div ref={handleRef} style={{ flexShrink: 0, touchAction: 'none' }}>
                <div className="more-grab" />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 14px 6px 20px' }}>
                    <span style={type.title}>More</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                        <TextAction quiet onClick={() => onStyleChange(style === 'grid' ? 'list' : 'grid')}
                            aria-label={style === 'grid' ? 'Show as a list' : 'Show as a grid'}>
                            {style === 'grid' ? 'List' : 'Grid'}
                        </TextAction>
                        {onOpenTour && (
                            <TextAction quiet onClick={onOpenTour} aria-label="Replay the app tour">Tour</TextAction>
                        )}
                        <TextAction quiet onClick={onClose} aria-label="Close">Close</TextAction>
                    </div>
                </div>
                </div>

                <div className="more-scroll">
                    {/* The most pressing thing first, in either layout. */}
                    {top && (
                        <button type="button" className={`more-rise more-attn more-attn-${top.tone} pressable`} style={rise()}
                            onClick={() => onNavigate(top.href)}>
                            <span className="more-attn-dot" aria-hidden />
                            <span style={{ ...type.body, color: 'var(--text-primary)', flex: 1, minWidth: 0 }}>{top.line}</span>
                            <span aria-hidden style={{ ...type.meta, color: 'var(--text-muted)' }}>Open</span>
                        </button>
                    )}
                    {style === 'grid' ? (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', paddingBottom: '4px' }}>
                                {pinned.map(({ href, icon: Icon, label }) => (
                                    <button key={href} type="button" className="more-rise pressable" style={{ ...rise(),
                                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px', minWidth: 0,
                                        padding: '10px', borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-2)',
                                        border: '1px solid var(--glass-border)', cursor: 'pointer', textAlign: 'left' }}
                                        onClick={() => onNavigate(href)}>
                                        <span style={{ position: 'relative', width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--glass-fill-2)' }}>
                                            <Icon size={16} color="var(--text-primary)" />
                                            {byHref[href] && <span className={`more-badge more-badge-${byHref[href].tone}`}>{byHref[href].badge}</span>}
                                        </span>
                                        <span style={{ ...type.label, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{label}</span>
                                    </button>
                                ))}
                            </div>
                            {moreGroups.map(g => (
                                <div key={g.label}>
                                    <div className="more-rise" style={{ ...sectionLabel, ...rise() }}>{g.label}</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px 4px' }}>
                                        {g.items.map(({ href, icon: Icon, label }) => {
                                            const active = isActive(href);
                                            return (
                                                <button key={href} type="button" className="more-rise more-tile" style={rise()}
                                                    onClick={() => onNavigate(href)} aria-current={active ? 'page' : undefined}>
                                                    <span className="more-tile-icon" style={active ? { boxShadow: 'inset 0 0 0 2px var(--text-primary)', borderColor: 'transparent' } : undefined}>
                                                        <Icon size={20} color="var(--text-primary)" />
                                                        {byHref[href] && <span className={`more-badge more-badge-${byHref[href].tone}`}>{byHref[href].badge}</span>}
                                                    </span>
                                                    <span style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: active ? 500 : 400 }}>{label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </>
                    ) : (
                        moreGroups.map(g => (
                            <div key={g.label}>
                                <div className="more-rise" style={{ ...sectionLabel, ...rise() }}>{g.label}</div>
                                {g.items.map(({ href, icon: Icon, label, sub }) => {
                                    const active = isActive(href);
                                    // An alert outranks the plain live figure.
                                    const alert = byHref[href];
                                    const fig: [string, Tone] | undefined = alert ? [alert.badge, alert.tone] : live[href];
                                    return (
                                        <button key={href} type="button" className="more-rise more-row pressable" style={rise()}
                                            onClick={() => onNavigate(href)} aria-current={active ? 'page' : undefined}>
                                            <span className="more-row-icon"><Icon size={17} color="var(--text-primary)" /></span>
                                            <span style={{ flex: 1, minWidth: 0, display: 'grid' }}>
                                                <span style={type.bodyStrong}>{label}</span>
                                                <span style={{ ...type.meta, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
                                            </span>
                                            {fig && (
                                                <span style={{ ...type.numSmall, whiteSpace: 'nowrap', color: fig[1] ? TONE_COLOR[fig[1]] : 'var(--text-secondary)' }}>
                                                    {fig[0]}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    },
);
