const { isNonSavingsExpense, isRealIncome, nonSpendingExclusionSQL } = require('../src/utils/savingsRate');

// These two predicates decide what counts as real spending and real income, and
// therefore what the user's savings rate is. They are hand-mirrored in
// frontend/lib/utils.ts, whose header says "keep both definitions in sync" --
// but nothing enforces that beyond the comment, and the two are reached by
// different code paths (SQL aggregation here, JS reduction there), so a drift
// would not surface as an error. It would surface as the API and the UI quietly
// disagreeing about the same month.
//
// The case table below is deliberately the same one used by
// frontend/lib/utils.test.ts, so a change on either side has to be made twice
// and a one-sided edit fails a suite.

const expense = (over = {}) => ({ type: 'expense', ...over });
const income = (over = {}) => ({ type: 'income', ...over });

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

describe('nonSpendingExclusionSQL', () => {
    // The SQL fragment is the aggregate-side twin of isNonSavingsExpense. It
    // cannot be executed here, but the shape it must keep is checkable: it has
    // to exclude the same three things, and it has to stay safe to drop into a
    // WHERE clause that also selects income rows.
    it('excludes the same three cases the JS predicate does', () => {
        const sql = nonSpendingExclusionSQL();
        expect(sql).toMatch(/is_investment_category/);
        expect(sql).toMatch(/goal_id IS NOT NULL/);
        expect(sql).toMatch(/transfer/);
        expect(sql).toMatch(/credit_card_payment/);
    });

    it('guards the expense-only clause so income rows survive the filter', () => {
        // Without the `type = 'expense' AND` guard, the investment/goal
        // exclusions would also drop income rows and understate income.
        expect(nonSpendingExclusionSQL()).toMatch(/NOT \(\s*\w+\.type = 'expense' AND/);
    });

    it('qualifies every column with the alias it is given', () => {
        // Dropped into joins, so unqualified columns would be ambiguous.
        const sql = nonSpendingExclusionSQL('t');
        expect(sql).toMatch(/t\.type/);
        expect(sql).toMatch(/t\.goal_id/);
        expect(sql).toMatch(/t\.category_id/);
        expect(sql).not.toMatch(/[^.\w]transactions\./);
    });

    it('defaults to the transactions table when no alias is passed', () => {
        expect(nonSpendingExclusionSQL()).toMatch(/transactions\.type/);
    });
});

describe('cross-stack parity with frontend/lib/utils.ts', () => {
    // Reads the frontend source and checks the mirrored predicates still make
    // the same decisions. This is the only thing standing between the comment
    // and an actual guarantee.
    const fs = require('node:fs');
    const path = require('node:path');
    const frontendUtils = path.join(__dirname, '..', '..', 'frontend', 'lib', 'utils.ts');

    const available = fs.existsSync(frontendUtils);
    const maybe = available ? it : it.skip;

    maybe('still declares both mirrored predicates', () => {
        const src = fs.readFileSync(frontendUtils, 'utf8');
        expect(src).toMatch(/export function isNonSavingsExpense/);
        expect(src).toMatch(/export function isRealIncome/);
    });

    maybe('excludes the same tags on the frontend side', () => {
        const src = fs.readFileSync(frontendUtils, 'utf8');
        const body = src.slice(src.indexOf('export function isNonSavingsExpense'));
        expect(body).toMatch(/'transfer'/);
        expect(body).toMatch(/'credit_card_payment'/);
        expect(body).toMatch(/is_investment_category/);
        expect(body).toMatch(/goal_id/);
    });

    maybe('keeps the sync note that explains why both copies exist', () => {
        // If someone deletes the note, the next person has no reason to keep
        // the two in step -- so the note itself is part of the contract.
        const src = fs.readFileSync(frontendUtils, 'utf8');
        expect(src).toMatch(/savingsRate\.js/);
    });
});
