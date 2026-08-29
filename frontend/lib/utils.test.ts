import { describe, it, expect } from 'vitest';
import {
    fmt, formatCurrency, formatDate, looksLikeEmoji,
    isNonSavingsExpense, isRealIncome, isCategorizableExpense,
} from './utils';

// The three classifiers below decide what counts as real spending, real income
// and category-attributable spending. They feed savings rate, category trends
// and most of Analytics, so a silent bug here corrupts numbers rather than
// crashing anything. `isNonSavingsExpense` and `isRealIncome` are additionally
// hand-mirrored in backend/src/utils/savingsRate.js -- the two were verified
// identical on 2026-08-26, but nothing enforces that beyond a comment, so
// these cases exist to catch drift on the frontend side at least.

const expense = (over: Record<string, unknown> = {}) => ({ type: 'expense', ...over });
const income = (over: Record<string, unknown> = {}) => ({ type: 'income', ...over });

describe('isNonSavingsExpense', () => {
    it('counts a plain expense', () => {
        expect(isNonSavingsExpense(expense())).toBe(true);
        expect(isNonSavingsExpense(expense({ tags: [] }))).toBe(true);
        expect(isNonSavingsExpense(expense({ tags: null }))).toBe(true);
    });

    it('rejects anything that is not an expense', () => {
        expect(isNonSavingsExpense(income())).toBe(false);
        expect(isNonSavingsExpense({ type: 'transfer' })).toBe(false);
    });

    it('excludes investing, goal contributions and internal transfers', () => {
        expect(isNonSavingsExpense(expense({ is_investment_category: true }))).toBe(false);
        expect(isNonSavingsExpense(expense({ goal_id: 'g-1' }))).toBe(false);
        expect(isNonSavingsExpense(expense({ tags: ['transfer'] }))).toBe(false);
        expect(isNonSavingsExpense(expense({ tags: ['credit_card_payment'] }))).toBe(false);
    });

    it('ignores unrelated tags', () => {
        expect(isNonSavingsExpense(expense({ tags: ['holiday', 'shared'] }))).toBe(true);
    });
});

describe('isRealIncome', () => {
    it('counts ordinary income and rejects non-income', () => {
        expect(isRealIncome(income())).toBe(true);
        expect(isRealIncome(expense())).toBe(false);
    });

    it('excludes internal transfers, which would otherwise inflate income', () => {
        expect(isRealIncome(income({ tags: ['transfer'] }))).toBe(false);
        expect(isRealIncome(income({ tags: ['credit_card_payment'] }))).toBe(false);
        expect(isRealIncome(income({ tags: ['bonus'] }))).toBe(true);
    });
});

describe('isCategorizableExpense', () => {
    it('is deliberately wider than isNonSavingsExpense: it keeps investments', () => {
        // For charts that plot spending BY category, an "Investments" line is
        // real information rather than noise -- this is the one difference
        // between the two predicates, so it is worth pinning down.
        const investing = expense({ is_investment_category: true });
        expect(isNonSavingsExpense(investing)).toBe(false);
        expect(isCategorizableExpense(investing)).toBe(true);
    });

    it('still drops goal contributions and transfers', () => {
        expect(isCategorizableExpense(expense({ goal_id: 'g-1' }))).toBe(false);
        expect(isCategorizableExpense(expense({ tags: ['transfer'] }))).toBe(false);
        expect(isCategorizableExpense(income())).toBe(false);
    });
});

describe('formatDate', () => {
    it('formats an ISO date without shifting across timezones', () => {
        // Parsed by splitting the string rather than via `new Date(str)`,
        // precisely so a UTC-midnight timestamp cannot land on the previous
        // day for users behind UTC.
        expect(formatDate('2026-08-26')).toBe('26 Aug 2026');
        expect(formatDate('2026-08-26T00:00:00.000Z')).toBe('26 Aug 2026');
        expect(formatDate('2026-01-01T23:59:59Z')).toBe('1 Jan 2026');
    });

    it('returns an empty string for empty input', () => {
        expect(formatDate('')).toBe('');
    });
});

describe('looksLikeEmoji', () => {
    it('accepts emoji and rejects lucide-style icon names', () => {
        expect(looksLikeEmoji('🏦')).toBe(true);
        expect(looksLikeEmoji('✈️')).toBe(true);
        // Category icons may hold either an emoji or a lucide name; the
        // budget cards pick whichever looks like an emoji.
        expect(looksLikeEmoji('shopping-cart')).toBe(false);
        expect(looksLikeEmoji('wallet')).toBe(false);
    });

    it('treats empty and nullish input as not-an-emoji', () => {
        expect(looksLikeEmoji('')).toBe(false);
        expect(looksLikeEmoji(null)).toBe(false);
        expect(looksLikeEmoji(undefined)).toBe(false);
    });
});

describe('fmt / formatCurrency', () => {
    it('rounds and renders rupees', () => {
        expect(fmt(1234.4)).toContain('1,234');
        expect(fmt(1234.6)).toContain('1,235');
    });

    it('places a negative sign after the symbol, not before it', () => {
        // `₹-500`, not the conventional `-₹500`, because the symbol is
        // concatenated ahead of toLocaleString's own sign. Pinned rather than
        // "fixed": 22 call sites already pass Math.abs() and supply their own
        // +/− prefix, so changing this would alter output in places that do
        // not currently expect a sign at all.
        expect(fmt(-500)).toBe('₹-500');
    });

    it('uses the Indian digit grouping for INR', () => {
        expect(fmt(1234567)).toBe('₹12,34,567');
    });

    it('handles zero', () => {
        expect(formatCurrency(0)).toContain('0');
    });
});
