const {
    fetchCreditCardEmisWithBalance,
    fetchCreditCardEmiWithBalance,
    fetchActiveEmiPrincipalByCard,
    deriveStatus,
    buildEmiInstallmentSchedule,
} = require('../src/utils/creditCardEmi');
const { generateAmortization } = require('../src/utils/amortization');

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

describe('buildEmiInstallmentSchedule', () => {
    test('interest-bearing EMI: correct length, sums to principal, some interest charged', () => {
        const amortization = generateAmortization({ outstanding_balance: 12000, interest_rate_pct: 18, tenure_months_remaining: 6 });
        const schedule = buildEmiInstallmentSchedule(amortization, '2026-01-15', 6);

        expect(schedule).toHaveLength(6);
        const totalPrincipal = schedule.reduce((sum, e) => sum + e.principal_component, 0);
        expect(Math.round(totalPrincipal * 100) / 100).toBeCloseTo(12000, 1);
        expect(schedule.some(e => e.interest_component > 0)).toBe(true);
        expect(schedule.map(e => e.installment_number)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test('no-cost EMI (interest_rate_pct 0): even split, zero interest component', () => {
        const amortization = generateAmortization({ outstanding_balance: 12000, interest_rate_pct: 0, tenure_months_remaining: 6 });
        const schedule = buildEmiInstallmentSchedule(amortization, '2026-01-15', 6);

        expect(schedule).toHaveLength(6);
        for (const entry of schedule) {
            expect(entry.interest_component).toBe(0);
            expect(entry.principal_component).toBeCloseTo(2000, 2);
        }
    });

    // First installment is due one month after the purchase date -- the
    // standard EMI convention (a purchase made today isn't due immediately).
    test('due dates start one month after the purchase date and step monthly', () => {
        const amortization = generateAmortization({ outstanding_balance: 6000, interest_rate_pct: 0, tenure_months_remaining: 3 });
        const schedule = buildEmiInstallmentSchedule(amortization, '2026-02-01', 3);

        expect(schedule.map(e => e.due_date)).toEqual(['2026-03-01', '2026-04-01', '2026-05-01']);
    });

    // The whole point of the route anchoring `purchaseDate` through
    // istDateStr before calling this function: a purchase timestamp that
    // lands late evening UTC is already the *next* calendar day in IST. This
    // test proves that once purchaseDate correctly reflects that ('2026-02-01',
    // not the naive UTC '2026-01-31'), the due dates that follow shift
    // accordingly -- the case a UTC-vs-IST boundary bug would otherwise hide.
    test('due dates reflect an IST-correct purchase date, not a naive UTC one', () => {
        const amortization = generateAmortization({ outstanding_balance: 6000, interest_rate_pct: 0, tenure_months_remaining: 3 });
        // 2026-01-31T20:00:00.000Z is 2026-02-01 01:30 IST -- the route
        // computes this via istDateStr(new Date(date)) before calling here.
        const istPurchaseDate = '2026-02-01';
        const schedule = buildEmiInstallmentSchedule(amortization, istPurchaseDate, 3);

        expect(schedule.map(e => e.due_date)).toEqual(['2026-03-01', '2026-04-01', '2026-05-01']);
        // The naive (wrong) UTC calendar date would have produced 03-31/04-30 clamped differently
        // and, more importantly, a day earlier in the general case -- asserting equality above
        // against the IST-correct anchor is what actually catches the regression.
    });

    test('clamps the due date to the shorter month when the purchase day does not exist there', () => {
        const amortization = generateAmortization({ outstanding_balance: 3000, interest_rate_pct: 0, tenure_months_remaining: 1 });
        const schedule = buildEmiInstallmentSchedule(amortization, '2026-01-31', 1);
        expect(schedule[0].due_date).toBe('2026-02-28'); // Jan 31 + 1 month -> Feb has no 31st
    });

    test('throws if the amortization schedule length does not match tenure_months', () => {
        const amortization = { schedule: [{ emi: 100, principal_component: 100, interest_component: 0 }] };
        expect(() => buildEmiInstallmentSchedule(amortization, '2026-01-15', 6)).toThrow(/does not match tenure_months/);
    });
});
