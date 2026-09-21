const {
    fetchCreditCardEmisWithBalance,
    fetchCreditCardEmiWithBalance,
    fetchActiveEmiPrincipalByCard,
    deriveStatus,
} = require('../src/utils/creditCardEmi');

function mockPool(rows) {
    return { query: jest.fn().mockResolvedValue({ rows }) };
}

describe('deriveStatus', () => {
    test('active when fewer installments have posted than the tenure', () => {
        expect(deriveStatus({ installments_posted: 3, installments_total: 12 })).toBe('active');
    });
    test('completed when all installments have posted', () => {
        expect(deriveStatus({ installments_posted: 12, installments_total: 12 })).toBe('completed');
    });
    test('completed when posted somehow exceeds total (defensive)', () => {
        expect(deriveStatus({ installments_posted: 13, installments_total: 12 })).toBe('completed');
    });
    test('active when nothing has posted yet', () => {
        expect(deriveStatus({ installments_posted: 0, installments_total: 6 })).toBe('active');
    });
    test('coerces string values from pg aggregates', () => {
        expect(deriveStatus({ installments_posted: '3', installments_total: '12' })).toBe('active');
        expect(deriveStatus({ installments_posted: '12', installments_total: '12' })).toBe('completed');
    });
});

describe('fetchCreditCardEmisWithBalance', () => {
    test('attaches a derived status to every row and scopes by user_id', async () => {
        const pool = mockPool([
            { id: 'e1', credit_card_id: 1, principal_amount: '12000', posted_principal: '4000', remaining_principal: '8000', installments_posted: 4, installments_total: 12 },
            { id: 'e2', credit_card_id: 2, principal_amount: '6000', posted_principal: '6000', remaining_principal: '0', installments_posted: 6, installments_total: 6 },
        ]);
        const rows = await fetchCreditCardEmisWithBalance(pool, 'u1');
        expect(rows[0].status).toBe('active');
        expect(rows[1].status).toBe('completed');
        expect(pool.query.mock.calls[0][1]).toEqual(['u1']);
    });

    test('scopes the installments aggregation subquery by user_id too, not just the emi', async () => {
        const pool = mockPool([]);
        await fetchCreditCardEmisWithBalance(pool, 'u1');
        expect(pool.query.mock.calls[0][0]).toMatch(/credit_card_emi_installments\s+WHERE user_id = \$1/);
    });

    test('returns an empty array for a user with no emis', async () => {
        const pool = mockPool([]);
        await expect(fetchCreditCardEmisWithBalance(pool, 'u1')).resolves.toEqual([]);
    });
});

describe('fetchCreditCardEmiWithBalance', () => {
    test('returns null when not found', async () => {
        const pool = mockPool([]);
        expect(await fetchCreditCardEmiWithBalance(pool, 'u1', 'missing')).toBeNull();
    });

    test('scopes by user_id and emi id', async () => {
        const pool = mockPool([{ id: 'e1', credit_card_id: 1, principal_amount: '1000', posted_principal: '0', remaining_principal: '1000', installments_posted: 0, installments_total: 3 }]);
        const emi = await fetchCreditCardEmiWithBalance(pool, 'u1', 'e1');
        expect(emi.status).toBe('active');
        expect(pool.query.mock.calls[0][1]).toEqual(['u1', 'e1']);
    });

    test('scopes the installments subquery by both emi id and user_id', async () => {
        const pool = mockPool([{ id: 'e1', credit_card_id: 1, principal_amount: '1000', posted_principal: '0', remaining_principal: '1000', installments_posted: 0, installments_total: 3 }]);
        await fetchCreditCardEmiWithBalance(pool, 'u1', 'e1');
        expect(pool.query.mock.calls[0][0]).toMatch(/WHERE emi_id = \$2 AND user_id = \$1/);
    });
});

describe('fetchActiveEmiPrincipalByCard', () => {
    test('sums remaining principal per card, only for active emis', async () => {
        const pool = mockPool([
            { id: 'e1', credit_card_id: 1, principal_amount: '12000', posted_principal: '4000', remaining_principal: '8000', installments_posted: 4, installments_total: 12 },
            { id: 'e2', credit_card_id: 1, principal_amount: '3000', posted_principal: '1000', remaining_principal: '2000', installments_posted: 1, installments_total: 3 },
            { id: 'e3', credit_card_id: 2, principal_amount: '6000', posted_principal: '6000', remaining_principal: '0', installments_posted: 6, installments_total: 6 },
        ]);
        const totals = await fetchActiveEmiPrincipalByCard(pool, 'u1');
        expect(totals).toEqual([{ credit_card_id: 1, remaining_principal: 10000 }]);
    });

    test('returns an empty array when the user has no active emis', async () => {
        const pool = mockPool([
            { id: 'e1', credit_card_id: 1, principal_amount: '6000', posted_principal: '6000', remaining_principal: '0', installments_posted: 6, installments_total: 6 },
        ]);
        await expect(fetchActiveEmiPrincipalByCard(pool, 'u1')).resolves.toEqual([]);
    });

    test('returns an empty array for a user with no emis at all', async () => {
        const pool = mockPool([]);
        await expect(fetchActiveEmiPrincipalByCard(pool, 'u1')).resolves.toEqual([]);
    });
});
