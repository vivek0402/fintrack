const v = require('../src/utils/validation');

// Input validators used across the route layer. Most are simple allow-lists,
// but the numeric and date ones lean on parseFloat and `new Date`, both of
// which are lenient in ways that decide whether bad input reaches the database.
// The surprising cases are pinned deliberately rather than left implicit.

describe('isPositiveNumber', () => {
    it('accepts positive numbers and numeric strings', () => {
        expect(v.isPositiveNumber(1)).toBe(true);
        expect(v.isPositiveNumber('250.75')).toBe(true);
        expect(v.isPositiveNumber(0.01)).toBe(true);
    });

    it('rejects zero, negatives and non-numeric input', () => {
        expect(v.isPositiveNumber(0)).toBe(false);
        expect(v.isPositiveNumber(-5)).toBe(false);
        expect(v.isPositiveNumber('abc')).toBe(false);
        expect(v.isPositiveNumber('')).toBe(false);
        expect(v.isPositiveNumber(null)).toBe(false);
        expect(v.isPositiveNumber(undefined)).toBe(false);
        expect(v.isPositiveNumber({})).toBe(false);
    });

    it('rejects Infinity and NaN, which are numbers but not amounts', () => {
        expect(v.isPositiveNumber(Infinity)).toBe(false);
        expect(v.isPositiveNumber(NaN)).toBe(false);
        expect(v.isPositiveNumber('1e999')).toBe(false); // overflows to Infinity
    });

    it('accepts a trailing-garbage string, because parseFloat stops at the number', () => {
        // '250abc' becomes 250 rather than being rejected. Pinned so the
        // leniency is a known property of this validator rather than a
        // surprise at a call site that assumed strictness.
        expect(v.isPositiveNumber('250abc')).toBe(true);
        expect(v.isPositiveNumber('  42  ')).toBe(true);
    });
});

describe('isNonNegativeNumber', () => {
    it('differs from isPositiveNumber only at zero', () => {
        expect(v.isNonNegativeNumber(0)).toBe(true);
        expect(v.isPositiveNumber(0)).toBe(false);
        expect(v.isNonNegativeNumber('0')).toBe(true);
    });

    it('still rejects negatives and junk', () => {
        expect(v.isNonNegativeNumber(-0.01)).toBe(false);
        expect(v.isNonNegativeNumber('nope')).toBe(false);
        expect(v.isNonNegativeNumber(Infinity)).toBe(false);
    });
});

describe('isValidDateString', () => {
    it('accepts YYYY-MM-DD and full ISO timestamps', () => {
        expect(v.isValidDateString('2026-08-26')).toBe(true);
        expect(v.isValidDateString('2026-08-26T10:30:00.000Z')).toBe(true);
    });

    it('rejects other shapes and non-strings', () => {
        expect(v.isValidDateString('26-08-2026')).toBe(false);
        expect(v.isValidDateString('2026/08/26')).toBe(false);
        expect(v.isValidDateString('')).toBe(false);
        expect(v.isValidDateString(null)).toBe(false);
        expect(v.isValidDateString(new Date())).toBe(false); // a Date is not a string
    });

    it('rejects a well-shaped but impossible month', () => {
        expect(v.isValidDateString('2026-13-01')).toBe(false);
    });

    it('accepts an out-of-range day, because Date rolls it over', () => {
        // '2026-02-30' parses to 2 March rather than failing, so this validator
        // guarantees shape and parseability -- not calendar correctness. A
        // caller needing the latter has to check it separately.
        expect(v.isValidDateString('2026-02-30')).toBe(true);
    });
});

describe('allow-list validators', () => {
    const cases = [
        ['isValidTransactionType',    v.TRANSACTION_TYPES,     'transfer'],
        ['isValidRecurringFrequency', v.RECURRING_FREQUENCIES, 'yearly'],
        ['isValidInvestmentType',     v.INVESTMENT_TYPES,      'nft'],
        ['isValidLoanType',           v.LOAN_TYPES,            'payday_loan'],
        ['isValidRiskProfile',        v.RISK_PROFILES,         'aggressive'],
        ['isValidMilestoneStatus',    v.MILESTONE_STATUSES,    'pending'],
        ['isValidDocumentType',       v.DOCUMENT_TYPES,        'passport'],
    ];

    it.each(cases)('%s accepts every listed value', (fn, list) => {
        for (const value of list) expect(v[fn](value)).toBe(true);
    });

    it.each(cases)('%s rejects an unlisted value and junk input', (fn, _list, bad) => {
        expect(v[fn](bad)).toBe(false);
        expect(v[fn]('')).toBe(false);
        expect(v[fn](null)).toBe(false);
        expect(v[fn](undefined)).toBe(false);
    });

    it.each(cases)('%s is case-sensitive', (fn, list) => {
        expect(v[fn](list[0].toUpperCase())).toBe(false);
    });

    it('keeps transaction types to income and expense only', () => {
        // Transfers are stored as a matched expense/income pair tagged
        // 'transfer', never as a third type -- see TransactionModal's transfer
        // branch and isNonSavingsExpense.
        expect(v.TRANSACTION_TYPES).toEqual(['income', 'expense']);
        expect(v.isValidTransactionType('transfer')).toBe(false);
    });
});

describe('isValidFinancialYear', () => {
    it('accepts the YYYY-YY form the Documents page emits', () => {
        expect(v.isValidFinancialYear('2025-26')).toBe(true);
        expect(v.isValidFinancialYear('1999-00')).toBe(true);
    });

    it('rejects full years, single years and junk', () => {
        expect(v.isValidFinancialYear('2025-2026')).toBe(false);
        expect(v.isValidFinancialYear('2025')).toBe(false);
        expect(v.isValidFinancialYear('25-26')).toBe(false);
        expect(v.isValidFinancialYear(null)).toBe(false);
        expect(v.isValidFinancialYear(2025)).toBe(false);
    });
});
