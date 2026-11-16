import { describe, it, expect } from 'vitest';
import { estimateEMI, payoffVerdict, pctRepaid, plural, utilizationSentence, utilizationParts } from './debt';
import { fmt } from './utils';

describe('estimateEMI', () => {
    it('computes a reducing-balance EMI', () => {
        const emi = estimateEMI(1200000, 12, 120);
        expect(emi).not.toBeNull();
        expect(Math.round(emi as number)).toBe(17217);
    });
    it('is null for unusable inputs', () => {
        expect(estimateEMI(0, 10, 12)).toBeNull();
        expect(estimateEMI(1000, 0, 12)).toBeNull();
        expect(estimateEMI(1000, 10, 0)).toBeNull();
        expect(estimateEMI(NaN, 10, 12)).toBeNull();
    });
    it('is null for a zero rate', () => {
        expect(estimateEMI(100000, 0, 24)).toBeNull();
    });
});

describe('plural', () => {
    it('uses the singular only for one', () => {
        expect(plural(1, 'month', 'months')).toBe('1 month');
        expect(plural(0, 'month', 'months')).toBe('0 months');
        expect(plural(5, 'month', 'months')).toBe('5 months');
    });
});

describe('pctRepaid', () => {
    it('is the repaid share of the principal', () => {
        expect(pctRepaid(1000, 250)).toBe(75);
    });
    it('is zero without a principal', () => {
        expect(pctRepaid(0, 0)).toBe(0);
        expect(pctRepaid(-10, 5)).toBe(0);
    });
    it('clamps to 0 and 100', () => {
        expect(pctRepaid(1000, 1500)).toBe(0);
        expect(pctRepaid(1000, -50)).toBe(100);
    });
});

describe('payoffVerdict', () => {
    const base = { months: 100, total_interest: 900000 };
    it('says avalanche saves more and finishes sooner', () => {
        const v = payoffVerdict(base, { months: 60, total_interest: 500000 }, { months: 64, total_interest: 540000 });
        expect(v).toBe(`Avalanche saves you ${fmt(40000)} more in interest than snowball, and finishes 4 months sooner.`);
    });
    it('is symmetric when snowball is cheaper', () => {
        const v = payoffVerdict(base, { months: 64, total_interest: 540000 }, { months: 60, total_interest: 500000 });
        expect(v).toBe(`Snowball saves you ${fmt(40000)} more in interest than avalanche, and finishes 4 months sooner.`);
    });
    it('says both cost the same when interest is equal', () => {
        expect(payoffVerdict(base, { months: 60, total_interest: 500000 }, { months: 62, total_interest: 500000 }))
            .toBe('Both strategies cost the same in interest.');
    });
    it('omits the month clause when months are equal', () => {
        const v = payoffVerdict(base, { months: 60, total_interest: 500000 }, { months: 60, total_interest: 510000 });
        expect(v).toBe(`Avalanche saves you ${fmt(10000)} more in interest than snowball.`);
    });
    it('uses the singular for a one month difference', () => {
        const v = payoffVerdict(base, { months: 59, total_interest: 500000 }, { months: 60, total_interest: 510000 });
        expect(v).toContain('finishes 1 month sooner.');
    });
    it('says takes longer when the cheaper strategy finishes later', () => {
        const v = payoffVerdict(base, { months: 62, total_interest: 500000 }, { months: 60, total_interest: 510000 });
        expect(v).toContain('but takes 2 months longer.');
    });
});

describe('utilizationSentence', () => {
    const agg = (status: string) => ({ total_outstanding: 30000, total_limit: 100000, status });
    it('capitalises each status and states the totals', () => {
        for (const s of ['optimal', 'moderate', 'high', 'critical']) {
            const text = utilizationSentence(agg(s));
            expect(text).toBe(`${s.charAt(0).toUpperCase()}${s.slice(1)}. You use ${fmt(30000)} of ${fmt(100000)} in limits.`);
        }
    });
    it('splits the status from the rest', () => {
        const p = utilizationParts(agg('high'));
        expect(p.status).toBe('High');
        expect(p.rest).toBe(`You use ${fmt(30000)} of ${fmt(100000)} in limits.`);
    });
});
