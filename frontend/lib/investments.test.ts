import { describe, it, expect } from 'vitest';
import { groupHoldings, largestHolding, liveCount, signedMoney, gainText, updatedLabel } from './investments';
import type { Investment } from '@/types/investments';

const LABELS = { mutual_fund: 'Mutual Funds', stock: 'Stocks', gold: 'Gold' };

const inv = (o: Partial<Investment>): Investment => ({
    id: 'i', type: 'stock', name: 'X', units: 1, purchase_price_per_unit: 1, current_nav_or_price: 1,
    purchase_date: '2026-01-01', current_value: 0, total_invested: 0, unrealized_gain: 0, unrealized_gain_pct: 0,
    price_source: 'manual', ...o,
});

describe('groupHoldings', () => {
    const list = [
        inv({ id: 'a', type: 'stock', name: 'A', current_value: 100 }),
        inv({ id: 'b', type: 'mutual_fund', name: 'B', current_value: 500 }),
        inv({ id: 'c', type: 'mutual_fund', name: 'C', current_value: 300 }),
        inv({ id: 'd', type: 'stock', name: 'D', current_value: 100 }),
    ];

    it('orders groups by total and holdings by value', () => {
        const g = groupHoldings(list, LABELS);
        expect(g.map(x => x.type)).toEqual(['mutual_fund', 'stock']);
        expect(g[0].holdings.map(h => h.id)).toEqual(['b', 'c']);
        expect(g[0]).toMatchObject({ label: 'Mutual Funds', total: 800, count: 2, pct: 80 });
        expect(g[1]).toMatchObject({ total: 200, count: 2, pct: 20 });
    });

    it('shares sum to 100 here', () => {
        const g = groupHoldings(list, LABELS);
        expect(g.reduce((s, x) => s + x.pct, 0)).toBe(100);
    });

    it('breaks ties by label and falls back to the type string', () => {
        const g = groupHoldings([
            inv({ type: 'stock', current_value: 10 }),
            inv({ type: 'weird', current_value: 10 }),
            inv({ type: 'gold', current_value: 10 }),
        ], LABELS);
        expect(g.map(x => x.label)).toEqual(['Gold', 'Stocks', 'weird']);
    });

    it('handles an empty portfolio and a zero-value portfolio', () => {
        expect(groupHoldings([], LABELS)).toEqual([]);
        expect(groupHoldings([inv({ current_value: 0 })], LABELS)[0].pct).toBe(0);
    });

    it('counts non-numeric values as 0', () => {
        const g = groupHoldings([inv({ current_value: 'abc' as unknown as number }), inv({ type: 'gold', current_value: 50 })], LABELS);
        expect(g[0].type).toBe('gold');
        expect(g[1].total).toBe(0);
    });
});

describe('largestHolding', () => {
    it('returns the biggest with its share', () => {
        const r = largestHolding([inv({ name: 'Small', current_value: 250 }), inv({ name: 'Big', current_value: 750 })]);
        expect(r).toEqual({ name: 'Big', value: 750, pct: 75 });
    });
    it('is null when empty', () => expect(largestHolding([])).toBeNull());
    it('is 0 percent for a zero portfolio', () => {
        expect(largestHolding([inv({ name: 'Z', current_value: 0 })])?.pct).toBe(0);
    });
});

describe('liveCount', () => {
    it('counts mfapi holdings', () => {
        expect(liveCount([inv({ price_source: 'mfapi' }), inv({}), inv({ price_source: 'mfapi' })])).toBe(2);
        expect(liveCount([])).toBe(0);
    });
});

describe('signedMoney', () => {
    it('formats gains, losses and zero', () => {
        expect(signedMoney(46721)).toBe('+₹46,721');
        expect(signedMoney(-3200)).toBe('−₹3,200');
        expect(signedMoney(0)).toBe('+₹0');
        expect(signedMoney(1234567.6)).toBe('+₹12,34,568');
    });
});

describe('gainText', () => {
    it('joins money and percent', () => {
        expect(gainText(46721, 12.5)).toBe('+₹46,721 · +12.5%');
        expect(gainText(-3200, -4.9)).toBe('−₹3,200 · −4.9%');
        expect(gainText(0, 0)).toBe('+₹0 · +0%');
    });
});

describe('updatedLabel', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    it('handles the boundaries', () => {
        expect(updatedLabel('2026-11-16T11:01:00Z', now)).toBe('just now');
        expect(updatedLabel('2026-11-16T11:00:00Z', now)).toBe('1h ago');
        expect(updatedLabel('2026-11-15T12:01:00Z', now)).toBe('23h ago');
        expect(updatedLabel('2026-11-15T12:00:00Z', now)).toBe('1d ago');
        expect(updatedLabel('2026-11-13T12:00:00Z', now)).toBe('3d ago');
    });
    it('is null for missing or invalid dates', () => {
        expect(updatedLabel(null, now)).toBeNull();
        expect(updatedLabel(undefined, now)).toBeNull();
        expect(updatedLabel('nope', now)).toBeNull();
    });
});
