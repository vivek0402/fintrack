const { fetchPersonalLoansWithBalance, fetchPersonalLoanWithBalance, fetchPersonalLoanTotals, deriveStatus } = require('../src/utils/personalLoans');

function mockPool(rows) {
    return { query: jest.fn().mockResolvedValue({ rows }) };
}

describe('deriveStatus', () => {
    test('written_off wins regardless of balance', () => {
        expect(deriveStatus({ written_off_at: '2026-01-01', outstanding_amount: '500', repaid_amount: '0' })).toBe('written_off');
    });
    test('repaid when outstanding is zero or negative', () => {
        expect(deriveStatus({ written_off_at: null, outstanding_amount: '0', repaid_amount: '5000' })).toBe('repaid');
        expect(deriveStatus({ written_off_at: null, outstanding_amount: '-10', repaid_amount: '5010' })).toBe('repaid');
    });
    test('partially_repaid when some but not all repaid', () => {
        expect(deriveStatus({ written_off_at: null, outstanding_amount: '2000', repaid_amount: '3000' })).toBe('partially_repaid');
    });
    test('outstanding when nothing repaid yet', () => {
        expect(deriveStatus({ written_off_at: null, outstanding_amount: '5000', repaid_amount: '0' })).toBe('outstanding');
    });
});

describe('fetchPersonalLoansWithBalance', () => {
    test('attaches a derived status to every row and scopes by user_id', async () => {
        const pool = mockPool([
            { id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null },
            { id: 'l2', direction: 'borrowed', principal_amount: '2000', repaid_amount: '2000', outstanding_amount: '0', written_off_at: null },
        ]);
        const rows = await fetchPersonalLoansWithBalance(pool, 'u1');
        expect(rows[0].status).toBe('outstanding');
        expect(rows[1].status).toBe('repaid');
        expect(pool.query.mock.calls[0][1]).toEqual(['u1']);
    });

    test('scopes the repayments sum query by user_id too, not just the loan', async () => {
        const pool = mockPool([{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '1000', outstanding_amount: '4000', written_off_at: null }]);
        await fetchPersonalLoansWithBalance(pool, 'u1');
        expect(pool.query.mock.calls[0][0]).toMatch(/personal_loan_repayments\s+WHERE user_id = \$1/);
    });
});

describe('fetchPersonalLoanWithBalance', () => {
    test('returns null when not found', async () => {
        const pool = mockPool([]);
        expect(await fetchPersonalLoanWithBalance(pool, 'u1', 'missing')).toBeNull();
    });
    test('scopes by user_id and loan id', async () => {
        const pool = mockPool([{ id: 'l1', direction: 'lent', principal_amount: '1000', repaid_amount: '0', outstanding_amount: '1000', written_off_at: null }]);
        const loan = await fetchPersonalLoanWithBalance(pool, 'u1', 'l1');
        expect(loan.status).toBe('outstanding');
        expect(pool.query.mock.calls[0][1]).toEqual(['u1', 'l1']);
    });

    test('scopes the repayments sum subquery by both loan id and user_id', async () => {
        const pool = mockPool([{ id: 'l1', direction: 'lent', principal_amount: '1000', repaid_amount: '0', outstanding_amount: '1000', written_off_at: null }]);
        await fetchPersonalLoanWithBalance(pool, 'u1', 'l1');
        expect(pool.query.mock.calls[0][0]).toMatch(/WHERE loan_id = \$2 AND user_id = \$1/);
    });
});

describe('fetchPersonalLoanTotals', () => {
    test('sums outstanding lent as receivable and borrowed as payable, skipping repaid/written-off', async () => {
        const pool = mockPool([
            { id: 'l1', direction: 'lent', outstanding_amount: '3000', repaid_amount: '0', written_off_at: null },
            { id: 'l2', direction: 'lent', outstanding_amount: '0', repaid_amount: '2000', written_off_at: null },
            { id: 'l3', direction: 'borrowed', outstanding_amount: '1500', repaid_amount: '500', written_off_at: null },
            { id: 'l4', direction: 'lent', outstanding_amount: '9000', repaid_amount: '0', written_off_at: '2026-01-01' },
        ]);
        const totals = await fetchPersonalLoanTotals(pool, 'u1');
        expect(totals).toEqual({ receivable: 3000, payable: 1500 });
    });
});
