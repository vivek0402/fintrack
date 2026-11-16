import { describe, it, expect } from 'vitest';
import { groupBalances, balanceSentence, sortSplitsPendingFirst, budgetPct } from './groups';

const share = (member: string, amount: number, settled = false) => ({ member, amount, settled });

describe('groupBalances', () => {
    it('sums what you owe, what you are owed and the unsettled count', () => {
        const splits = [
            { paid_by: 'Asha', shares: [share('Asha', 50), share('Me', 50)] },
            { paid_by: 'Me', shares: [share('Me', 30), share('Asha', 30), share('Ravi', 30)] },
        ];
        expect(groupBalances(splits)).toEqual({ youOwe: 50, owedToYou: 60, unsettledCount: 5 });
    });
    it('ignores settled shares', () => {
        const splits = [
            { paid_by: 'Asha', shares: [share('Asha', 50), share('Me', 50, true)] },
            { paid_by: 'Me', shares: [share('Me', 30), share('Asha', 30, true), share('Ravi', 30)] },
        ];
        expect(groupBalances(splits)).toEqual({ youOwe: 0, owedToYou: 30, unsettledCount: 3 });
    });
    it('does not count your own share of a split you paid as owed to you or by you', () => {
        const splits = [{ paid_by: 'Me', shares: [share('Me', 40), share('Asha', 40)] }];
        const b = groupBalances(splits);
        expect(b.youOwe).toBe(0);
        expect(b.owedToYou).toBe(40);
    });
    it('is all zeros with no splits', () => {
        expect(groupBalances([])).toEqual({ youOwe: 0, owedToYou: 0, unsettledCount: 0 });
    });
});

describe('balanceSentence', () => {
    it('says you are owed when the net is positive', () => {
        expect(balanceSentence(60, 0, 60)).toBe('You are owed this by the others once the pending splits are settled.');
    });
    it('says you owe when the net is negative', () => {
        expect(balanceSentence(-50, 50, 0)).toBe('You owe this to the others until the pending splits are settled.');
    });
    it('says square when both sides cancel', () => {
        expect(balanceSentence(0, 40, 40)).toBe('You are all square.');
    });
    it('says nothing is pending when there are no balances', () => {
        expect(balanceSentence(0, 0, 0)).toBe('Nothing is pending.');
    });
});

describe('sortSplitsPendingFirst', () => {
    const settled = (id: number) => ({ id, shares: [share('Me', 1, true)] });
    const pending = (id: number) => ({ id, shares: [share('Me', 1, true), share('Asha', 1)] });
    it('puts splits with an unsettled share first and keeps order within each group', () => {
        const out = sortSplitsPendingFirst([settled(1), pending(2), settled(3), pending(4)]);
        expect(out.map(s => s.id)).toEqual([2, 4, 1, 3]);
    });
    it('does not mutate the input', () => {
        const input = [settled(1), pending(2)];
        const copy = [...input];
        sortSplitsPendingFirst(input);
        expect(input).toEqual(copy);
    });
});

describe('budgetPct', () => {
    it('is null with no budget', () => {
        expect(budgetPct(100, undefined)).toBeNull();
        expect(budgetPct(100, null)).toBeNull();
    });
    it('is null for a zero budget', () => {
        expect(budgetPct(100, 0)).toBeNull();
    });
    it('is the percent spent, including over 100', () => {
        expect(budgetPct(50, 200)).toBe(25);
        expect(budgetPct('150', '100')).toBe(150);
    });
});
