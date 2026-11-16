import { describe, it, expect } from 'vitest';
import { netWorthChange, sortByAmountDesc, furthestFromTarget, deviationLabel, trendPhrase } from './netWorth';

describe('netWorthChange', () => {
    it('is null with no history or one snapshot', () => {
        expect(netWorthChange([])).toBeNull();
        expect(netWorthChange([{ snapshot_date: '2026-01-01', net_worth: 10 }])).toBeNull();
    });
    it('reports a gain against the previous snapshot', () => {
        const r = netWorthChange([
            { snapshot_date: '2026-01-01', net_worth: 100 },
            { snapshot_date: '2026-02-01', net_worth: 150 },
        ]);
        expect(r).toEqual({ change: 50, pct: 50, prevLabelDate: '2026-01-01' });
    });
    it('reports a loss and uses abs(prev) for pct', () => {
        const r = netWorthChange([
            { snapshot_date: '2026-01-01', net_worth: 200 },
            { snapshot_date: '2026-02-01', net_worth: 150 },
        ]);
        expect(r!.change).toBe(-50);
        expect(r!.pct).toBe(-25);
        const neg = netWorthChange([
            { snapshot_date: '2026-01-01', net_worth: -100 },
            { snapshot_date: '2026-02-01', net_worth: -50 },
        ]);
        expect(neg!.pct).toBe(50);
    });
    it('gives pct 0 when the previous value is 0', () => {
        const r = netWorthChange([
            { snapshot_date: '2026-01-01', net_worth: 0 },
            { snapshot_date: '2026-02-01', net_worth: 500 },
        ]);
        expect(r).toEqual({ change: 500, pct: 0, prevLabelDate: '2026-01-01' });
    });
});

describe('sortByAmountDesc', () => {
    it('sorts biggest first without mutating', () => {
        const input = [{ n: 'a', amount: 1 }, { n: 'b', amount: 3 }, { n: 'c', amount: 2 }];
        const out = sortByAmountDesc(input);
        expect(out.map(x => x.n)).toEqual(['b', 'c', 'a']);
        expect(input.map(x => x.n)).toEqual(['a', 'b', 'c']);
    });
    it('is stable on ties', () => {
        const out = sortByAmountDesc([{ n: 'a', amount: 5 }, { n: 'b', amount: 5 }, { n: 'c', amount: 5 }]);
        expect(out.map(x => x.n)).toEqual(['a', 'b', 'c']);
    });
});

describe('furthestFromTarget', () => {
    it('is null when empty or all deviations are 0', () => {
        expect(furthestFromTarget([])).toBeNull();
        expect(furthestFromTarget([{ deviation: 0 }, { deviation: 0 }])).toBeNull();
    });
    it('picks the largest absolute deviation', () => {
        const a = { id: 'a', deviation: 4 };
        const b = { id: 'b', deviation: -12 };
        expect(furthestFromTarget([a, b])).toBe(b);
    });
    it('takes the first on ties', () => {
        const a = { id: 'a', deviation: -8 };
        const b = { id: 'b', deviation: 8 };
        expect(furthestFromTarget([a, b])).toBe(a);
    });
});

describe('deviationLabel', () => {
    it('is on target under 0.5', () => {
        expect(deviationLabel(0.4)).toEqual({ text: 'On target', flagged: false });
        expect(deviationLabel(-0.49)).toEqual({ text: 'On target', flagged: false });
    });
    it('is over or under target otherwise', () => {
        expect(deviationLabel(0.5).text).toBe('1 point over target');
        expect(deviationLabel(-3.2).text).toBe('3 points under target');
    });
    it('flags only strictly above the threshold', () => {
        expect(deviationLabel(5).flagged).toBe(false);
        expect(deviationLabel(-5).flagged).toBe(false);
        expect(deviationLabel(5.1).flagged).toBe(true);
        expect(deviationLabel(-5.1).flagged).toBe(true);
    });
});

describe('trendPhrase', () => {
    it('maps each trend to plain words', () => {
        expect(trendPhrase('accelerating')).toBe('accelerating');
        expect(trendPhrase('decelerating')).toBe('slowing down');
        expect(trendPhrase('steady')).toBe('steady');
    });
});
