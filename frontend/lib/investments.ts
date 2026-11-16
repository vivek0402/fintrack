/** Pure helpers behind the Investments page. */

import type { Investment } from '@/types/investments';

export interface HoldingGroup {
    type: string;
    label: string;
    holdings: Investment[];
    total: number;
    pct: number;
    count: number;
}

const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(n) ? n : 0;
};

const portfolioValue = (investments: Investment[]): number =>
    investments.reduce((s, i) => s + num(i.current_value), 0);

const share = (part: number, whole: number): number =>
    whole > 0 ? Math.round((part / whole) * 100) : 0;

/** One entry per asset type present, biggest first; holdings inside each sorted by value. */
export function groupHoldings(investments: Investment[], labels: Record<string, string>): HoldingGroup[] {
    const whole = portfolioValue(investments);
    const byType = new Map<string, Investment[]>();
    for (const inv of investments) {
        const list = byType.get(inv.type);
        if (list) list.push(inv); else byType.set(inv.type, [inv]);
    }
    return [...byType.entries()]
        .map(([type, list]) => {
            const holdings = [...list].sort((a, b) => num(b.current_value) - num(a.current_value));
            const total = holdings.reduce((s, h) => s + num(h.current_value), 0);
            return { type, label: labels[type] ?? type, holdings, total, pct: share(total, whole), count: holdings.length };
        })
        .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export function largestHolding(investments: Investment[]): { name: string; value: number; pct: number } | null {
    if (investments.length === 0) return null;
    let best = investments[0];
    for (const inv of investments) if (num(inv.current_value) > num(best.current_value)) best = inv;
    const value = num(best.current_value);
    return { name: best.name, value, pct: share(value, portfolioValue(investments)) };
}

export function liveCount(investments: Investment[]): number {
    return investments.filter(i => i.price_source === 'mfapi').length;
}

/** +₹46,721 or −₹3,200 (Unicode minus), whole rupees. */
export function signedMoney(n: number): string {
    const v = num(n);
    const rounded = Math.round(Math.abs(v));
    const sign = v < 0 && rounded > 0 ? '−' : '+';
    return `${sign}₹${rounded.toLocaleString('en-IN')}`;
}

/** +12.5% or −4.9%, sign following the gain. */
export function signedPct(gain: number, pct: number): string {
    const p = Math.round(Math.abs(num(pct)) * 10) / 10;
    return `${num(gain) < 0 && p > 0 ? '−' : '+'}${p}%`;
}

/** +₹46,721 · +12.5% */
export function gainText(gain: number, pct: number): string {
    return `${signedMoney(gain)} · ${signedPct(gain, pct)}`;
}

/** just now, 5h ago, 3d ago; null for a missing or invalid date. */
export function updatedLabel(iso: string | null | undefined, now: Date): string | null {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return null;
    const hrs = Math.floor(Math.max(0, now.getTime() - t) / 3_600_000);
    if (hrs < 1) return 'just now';
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}
