const { parseArgs, buildPlan, formatPlan, applyPlan, CANDIDATES_SQL } = require('../scripts/fix-bank-account-on-cash-and-card');

const rows = [
    { id: 'a', user_id: 'u1', email: 'v@x.in', amount: '120', payment_method: 'Cash', credit_card_id: null, account_id: 1, account_name: 'HDFC Savings' },
    { id: 'b', user_id: 'u1', email: 'v@x.in', amount: '2400.50', payment_method: 'Credit Card', credit_card_id: 3, account_id: 1, account_name: 'HDFC Savings' },
    { id: 'c', user_id: 'u1', email: 'v@x.in', amount: '80', payment_method: 'UPI', credit_card_id: 3, account_id: 2, account_name: 'ICICI' },
];

describe('fix-bank-account-on-cash-and-card', () => {
    test('parses flags and rejects junk', () => {
        expect(parseArgs([])).toEqual({ apply: false, json: false, user: null });
        expect(parseArgs(['--apply', '--json']).apply).toBe(true);
        expect(() => parseArgs(['--user', 'nope'])).toThrow();
        expect(() => parseArgs(['--force'])).toThrow();
    });

    test('plans totals by kind and each account\'s balance increase', () => {
        const plan = buildPlan(rows);
        expect(plan.total).toBe(3);
        expect(plan.byKind).toEqual({ Cash: { count: 1, total: 120 }, 'Credit card': { count: 2, total: 2480.5 } });
        expect(plan.accounts).toEqual([
            expect.objectContaining({ account_name: 'HDFC Savings', count: 2, increase: 2520.5 }),
            expect.objectContaining({ account_name: 'ICICI', count: 1, increase: 80 }),
        ]);
        expect(formatPlan(plan, { apply: false })).toContain('DRY RUN, nothing changed.');
        expect(formatPlan(buildPlan([]), { apply: false })).toContain('Nothing to do');
    });

    test('only targets expenses, never transfers, card-payment legs, goals or loans', () => {
        expect(CANDIDATES_SQL).toContain("t.type = 'expense'");
        expect(CANDIDATES_SQL).toContain('t.transfer_group_id IS NULL');
        expect(CANDIDATES_SQL).toContain("ARRAY['transfer','credit_card_payment']");
        expect(CANDIDATES_SQL).toContain('t.goal_id IS NULL');
        expect(CANDIDATES_SQL).toContain('t.personal_loan_id IS NULL');
    });

    test('--apply rolls back unless exactly the planned rows change', async () => {
        const calls = [];
        const client = { query: jest.fn(async (sql) => { calls.push(sql); return sql.startsWith('UPDATE') ? { rowCount: 2 } : {}; }), release: jest.fn() };
        const pool = { connect: jest.fn().mockResolvedValue(client) };
        await expect(applyPlan(pool, buildPlan(rows))).rejects.toThrow('Rolled back');
        expect(calls).toContain('ROLLBACK');
        expect(calls).not.toContain('COMMIT');
        expect(client.release).toHaveBeenCalled();
    });

    test('--apply commits when every planned row changes', async () => {
        const calls = [];
        const client = { query: jest.fn(async (sql) => { calls.push(sql); return sql.startsWith('UPDATE') ? { rowCount: 3 } : {}; }), release: jest.fn() };
        const pool = { connect: jest.fn().mockResolvedValue(client) };
        await expect(applyPlan(pool, buildPlan(rows))).resolves.toBe(3);
        expect(calls).toContain('COMMIT');
    });
});
