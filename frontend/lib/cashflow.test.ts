import { describe, it, expect } from 'vitest';
import { riskSentence, statusLabel } from './cashflow';

const m = (month: string, status: string) => ({ month, status });

describe('riskSentence', () => {
    it('says no month is tight or at risk', () => {
        expect(riskSentence([m('Jan', 'surplus'), m('Feb', 'healthy')])).toBe('Over the next 12 months. No month is tight or at risk.');
        expect(riskSentence([])).toBe('Over the next 12 months. No month is tight or at risk.');
    });
    it('names one or two at-risk months', () => {
        expect(riskSentence([m('Jan', 'at_risk'), m('Feb', 'healthy')])).toBe('Over the next 12 months. You are at risk in Jan.');
        expect(riskSentence([m('Jan', 'at_risk'), m('Feb', 'at_risk')])).toBe('Over the next 12 months. You are at risk in Jan and Feb.');
    });
    it('names tight months only', () => {
        expect(riskSentence([m('Mar', 'tight'), m('Apr', 'surplus')])).toBe('Over the next 12 months. You are tight in Mar.');
    });
    it('names both', () => {
        expect(riskSentence([m('Jan', 'at_risk'), m('Mar', 'tight')])).toBe('Over the next 12 months. You are at risk in Jan and tight in Mar.');
    });
    it('joins three or more with commas and "and"', () => {
        expect(riskSentence([m('Jan', 'tight'), m('Feb', 'tight'), m('Mar', 'tight')])).toBe('Over the next 12 months. You are tight in Jan, Feb and Mar.');
        expect(riskSentence([m('Jan', 'at_risk'), m('Feb', 'at_risk'), m('Mar', 'at_risk'), m('Apr', 'at_risk'), m('May', 'tight')]))
            .toBe('Over the next 12 months. You are at risk in Jan, Feb, Mar and Apr and tight in May.');
    });
});

describe('statusLabel', () => {
    it('maps known statuses', () => {
        expect(statusLabel('surplus')).toBe('Surplus');
        expect(statusLabel('healthy')).toBe('Healthy');
        expect(statusLabel('tight')).toBe('Tight');
        expect(statusLabel('at_risk')).toBe('At risk');
    });
    it('falls back to the raw status', () => {
        expect(statusLabel('mystery')).toBe('mystery');
    });
});
