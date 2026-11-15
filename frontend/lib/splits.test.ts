import { describe, it, expect } from 'vitest';
import { isSettled, owedOn, groupSplits, whoOwes, splitsSummary, type SplitItem } from './splits';

const split = (o: Partial<SplitItem>): SplitItem => ({
    id: 'x', description: 'Dinner', total_amount: 300, your_share: 100, date: '2026-11-10',
    participants: [{ name: 'Raj', share: 100, settled: false }, { name: 'Priya', share: 100, settled: false }], ...o,
});

describe('isSettled', () => {
    it('is true only when everyone has paid', () => {
        expect(isSettled(split({}))).toBe(false);
        expect(isSettled(split({ participants: [{ name: 'Raj', share: 100, settled: true }, { name: 'P', share: 100, settled: false }] }))).toBe(false);
        expect(isSettled(split({ participants: [{ name: 'Raj', share: 100, settled: true }] }))).toBe(true);
    });
    it('counts an empty list as settled', () => {
        expect(isSettled(split({ participants: [] }))).toBe(true);
    });
});

describe('owedOn', () => {
    it('sums unsettled shares, parsing strings and treating junk as 0', () => {
        expect(owedOn(split({ participants: [
            { name: 'A', share: '50.5', settled: false },
            { name: 'B', share: 20, settled: true },
            { name: 'C', share: 'oops', settled: false },
            { name: 'D', share: 10, settled: false },
        ] }))).toBeCloseTo(60.5, 5);
    });
    it('is 0 when all are settled', () => {
        expect(owedOn(split({ participants: [{ name: 'A', share: 5, settled: true }] }))).toBe(0);
    });
});

describe('groupSplits', () => {
    it('separates open from settled and sorts each newest first, undated last', () => {
        const done = [{ name: 'A', share: 1, settled: true }];
        const list = [
            split({ id: 'o1', date: '2026-10-01' }),
            split({ id: 'o2', date: '2026-11-05' }),
            split({ id: 'o3', date: '' }),
            split({ id: 's1', date: '2026-09-01', participants: done }),
            split({ id: 's2', date: '2026-09-20', participants: done }),
        ];
        const g = groupSplits(list);
        expect(g.open.map(s => s.id)).toEqual(['o2', 'o1', 'o3']);
        expect(g.settled.map(s => s.id)).toEqual(['s2', 's1']);
    });
});

describe('whoOwes', () => {
    it('merges names case-insensitively, keeps first spelling, counts splits, sorts by amount', () => {
        const list = [
            split({ id: '1', participants: [{ name: 'Raj', share: 100, settled: false }, { name: 'Priya', share: 300, settled: false }] }),
            split({ id: '2', participants: [{ name: ' raj ', share: 50, settled: false }, { name: 'Sam', share: 10, settled: true }] }),
        ];
        expect(whoOwes(list)).toEqual([
            { name: 'Priya', amount: 300, count: 1 },
            { name: 'Raj', amount: 150, count: 2 },
        ]);
    });
    it('skips blank names and settled participants', () => {
        const list = [split({ participants: [{ name: '  ', share: 100, settled: false }, { name: 'Sam', share: 5, settled: true }] })];
        expect(whoOwes(list)).toEqual([]);
    });
});

describe('splitsSummary', () => {
    it('totals owed, people, counts, collected, your share and oldest open date', () => {
        const list = [
            split({ id: '1', date: '2026-11-10', your_share: 100, participants: [{ name: 'Raj', share: 100, settled: false }, { name: 'Priya', share: 100, settled: true }] }),
            split({ id: '2', date: '2026-10-02', your_share: '50', participants: [{ name: 'raj', share: 40, settled: false }] }),
            split({ id: '3', date: '2026-08-01', your_share: 999, participants: [{ name: 'Sam', share: 70, settled: true }] }),
        ];
        expect(splitsSummary(list)).toEqual({
            owed: 140, people: 1, openCount: 2, settledCount: 1,
            collected: 170, yourShareOpen: 150, oldestOpenDate: '2026-10-02',
        });
    });
    it('handles an empty list', () => {
        expect(splitsSummary([])).toEqual({ owed: 0, people: 0, openCount: 0, settledCount: 0, collected: 0, yourShareOpen: 0, oldestOpenDate: null });
    });
});
