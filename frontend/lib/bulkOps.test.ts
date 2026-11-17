import { describe, it, expect } from 'vitest';
import { splitSummary, formatSplitSentence } from './bulkOps';

const lines = (...amounts: string[]) => amounts.map(amount => ({ amount }));
const fmt = (n: number) => `₹${n}`;

describe('splitSummary', () => {
    it('is valid when the lines add up to the total', () => {
        const s = splitSummary(lines('60', '40'), 100);
        expect(s).toMatchObject({ sum: 100, remaining: 0, over: 0, valid: true, sentenceKey: 'match' });
    });

    it('allows a difference under one paisa', () => {
        expect(splitSummary(lines('33.333', '66.666'), 100).valid).toBe(true);
    });

    it('is short when the lines add up to less', () => {
        const s = splitSummary(lines('30', '20'), 100);
        expect(s).toMatchObject({ sum: 50, remaining: 50, valid: false, sentenceKey: 'short' });
    });

    it('is over when the lines add up to more', () => {
        const s = splitSummary(lines('80', '40'), 100);
        expect(s).toMatchObject({ sum: 120, remaining: 0, over: 20, valid: false, sentenceKey: 'over' });
    });

    it('needs at least two lines', () => {
        const s = splitSummary(lines('100'), 100);
        expect(s.valid).toBe(false);
        expect(s.sentenceKey).toBe('incomplete');
    });

    it('rejects a non-positive or blank line even when the sum matches', () => {
        expect(splitSummary(lines('100', '0'), 100).valid).toBe(false);
        expect(splitSummary(lines('120', '-20'), 100).valid).toBe(false);
        expect(splitSummary(lines('100', ''), 100).sentenceKey).toBe('incomplete');
    });
});

describe('formatSplitSentence', () => {
    it('says the lines match', () => {
        expect(formatSplitSentence(splitSummary(lines('60', '40'), 100), 100, fmt)).toBe('Lines add up to ₹100 of ₹100. They match.');
    });

    it('says how much is left', () => {
        expect(formatSplitSentence(splitSummary(lines('30', '20'), 100), 100, fmt)).toBe('₹50 left to assign.');
    });

    it('says how much is over', () => {
        expect(formatSplitSentence(splitSummary(lines('80', '40'), 100), 100, fmt)).toBe('₹20 over the total.');
    });

    it('asks for an amount on every line', () => {
        expect(formatSplitSentence(splitSummary(lines('100', ''), 100), 100, fmt)).toBe('Every line needs an amount.');
    });
});
