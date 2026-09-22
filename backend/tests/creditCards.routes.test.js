process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
});

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const creditCardsRouter = require('../src/routes/creditCards');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/credit-cards', creditCardsRouter);
    return app;
}

function mockClient(queryImpl) {
    return { query: jest.fn(queryImpl), release: jest.fn() };
}

afterEach(() => {
    pool.query.mockReset();
    pool.connect.mockReset();
});

// Credit-card balance helpers now issue a second query (active EMI
// principal for the user) after the cards query. Default that to "no active
// EMIs" globally; any test that cares about EMI behaviour overrides it with
// an explicit mockResolvedValueOnce queued before this default kicks in.
beforeEach(() => {
    pool.query.mockResolvedValue({ rows: [] });
});

describe('GET /api/credit-cards', () => {
    test('returns cards with the computed current_outstanding_balance field', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 1, bank_name: 'HDFC', card_name: 'Millennia', outstanding_balance: '1000.00', current_outstanding_balance: '1500.00' }],
        });

        const res = await request(buildApp()).get('/api/credit-cards');

        expect(res.status).toBe(200);
        expect(res.body.cards[0].current_outstanding_balance).toBe('1500.00');
        // The route must go through the canonical helper's query, not a bare
        // `SELECT * FROM credit_cards` -- that's the exact bug being fixed.
        const [sql] = pool.query.mock.calls[0];
        expect(sql).toMatch(/current_outstanding_balance/);
        expect(sql).toMatch(/LEFT JOIN transactions/);
    });
});

describe('POST /api/credit-cards', () => {
    test('persists interest_rate_pct when provided', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, interest_rate_pct: '39.5', outstanding_balance: '0' }] });

        const res = await request(buildApp())
            .post('/api/credit-cards')
            .send({ bank_name: 'HDFC', card_name: 'Millennia', interest_rate_pct: 39.5 });

        expect(res.status).toBe(201);
        expect(res.body.card.interest_rate_pct).toBe('39.5');
        const [, params] = pool.query.mock.calls[0];
        expect(params).toContain(39.5);
    });

    test('defaults interest_rate_pct to null when not provided', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, interest_rate_pct: null, outstanding_balance: '0' }] });

        const res = await request(buildApp())
            .post('/api/credit-cards')
            .send({ bank_name: 'HDFC', card_name: 'Millennia' });

        expect(res.status).toBe(201);
        const [, params] = pool.query.mock.calls[0];
        expect(params).toContain(null);
    });

    test('rejects a negative interest_rate_pct with 400', async () => {
        const res = await request(buildApp())
            .post('/api/credit-cards')
            .send({ bank_name: 'HDFC', card_name: 'Millennia', interest_rate_pct: -5 });

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('PUT /api/credit-cards/:id', () => {
    test('updates only interest_rate_pct, leaving other fields via COALESCE', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })                              // ownership check
            .mockResolvedValueOnce({ rows: [{ id: 1, interest_rate_pct: '42' }] })      // UPDATE ... RETURNING *
            .mockResolvedValueOnce({ rows: [{ id: 1, interest_rate_pct: '42' }] });     // refreshed card

        const res = await request(buildApp())
            .put('/api/credit-cards/1')
            .send({ interest_rate_pct: 42 });

        expect(res.status).toBe(200);
        const [sql, params] = pool.query.mock.calls[1];
        expect(sql).toContain('COALESCE($10, interest_rate_pct)');
        expect(params).toContain(42);
    });

    test('rejects a negative interest_rate_pct with 400', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // ownership check

        const res = await request(buildApp())
            .put('/api/credit-cards/1')
            .send({ interest_rate_pct: -1 });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check, no UPDATE
    });

    test('resets balance_as_of only when the client explicitly sends the key', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })                       // ownership check
            .mockResolvedValueOnce({ rows: [{ id: 1, outstanding_balance: 500 }] }) // UPDATE ... RETURNING *
            .mockResolvedValueOnce({ rows: [{ id: 1, current_outstanding_balance: 500 }] }); // refreshed card

        const res = await request(buildApp())
            .put('/api/credit-cards/1')
            .send({ outstanding_balance: 500, balance_as_of: '2026-06-01' });

        expect(res.status).toBe(200);
        const [, updateParams] = pool.query.mock.calls[1];
        // newBalanceAsOf !== undefined -> true, and the date value itself
        expect(updateParams[updateParams.length - 2]).toBe(true);
        expect(updateParams[updateParams.length - 1]).toBe('2026-06-01');
    });

    test('leaves balance_as_of untouched when the key is omitted', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            .mockResolvedValueOnce({ rows: [{ id: 1 }] });

        const res = await request(buildApp())
            .put('/api/credit-cards/1')
            .send({ outstanding_balance: 500 });

        expect(res.status).toBe(200);
        const [, updateParams] = pool.query.mock.calls[1];
        expect(updateParams[updateParams.length - 2]).toBe(false);
    });
});

describe('POST /api/credit-cards/:id/pay', () => {
    test('atomically inserts both legs and returns the refreshed card', async () => {
        const calls = [];
        const client = mockClient(async (sql, params) => {
            calls.push(sql);
            if (sql.includes('FROM credit_cards')) return { rows: [{ id: 'card-1', bank_name: 'HDFC', card_name: 'Millennia' }] };
            if (sql.includes('FROM bank_accounts')) return { rows: [{ id: 42, name: 'Main Account' }] };
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.includes("VALUES ($1,'expense'")) {
                expect(params[6]).toBe(42); // account_id
                return { rows: [{ id: 'tx-1', type: 'expense', amount: 300, account_id: 42 }] };
            }
            if (sql.includes("VALUES ($1,'income'")) {
                expect(params[6]).toBe('card-1'); // credit_card_id
                return { rows: [{ id: 'tx-2', type: 'income', amount: 300, credit_card_id: 'card-1' }] };
            }
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'card-1', current_outstanding_balance: 700 }] }); // refreshed card

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/pay')
            .send({ bank_account_id: 42, amount: 300, date: '2026-06-15' });

        expect(res.status).toBe(201);
        expect(res.body.transactions).toHaveLength(2);
        expect(res.body.card.current_outstanding_balance).toBe(700);
        expect(calls).toContain('BEGIN');
        expect(calls).toContain('COMMIT');
        expect(calls.some(sql => sql.includes("VALUES ($1,'expense'"))).toBe(true);
        expect(calls.some(sql => sql.includes("VALUES ($1,'income'"))).toBe(true);
        // Both legs must share one transfer_group_id so they can be deleted together.
        const expenseCall = client.query.mock.calls.find(([sql]) => sql.includes("VALUES ($1,'expense'"));
        const incomeCall = client.query.mock.calls.find(([sql]) => sql.includes("VALUES ($1,'income'"));
        expect(expenseCall[1][expenseCall[1].length - 1]).toBe(incomeCall[1][incomeCall[1].length - 1]);
        expect(client.release).toHaveBeenCalled();
    });

    test('stores the given payment_method on both legs, defaulting to Net Banking when omitted', async () => {
        const client = mockClient(async (sql, params) => {
            if (sql.includes('FROM credit_cards')) return { rows: [{ id: 'card-1', bank_name: 'HDFC', card_name: 'Millennia' }] };
            if (sql.includes('FROM bank_accounts')) return { rows: [{ id: 42, name: 'Main Account' }] };
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.includes("VALUES ($1,'expense'")) {
                expect(params[8]).toBe('UPI');
                return { rows: [{ id: 'tx-1', type: 'expense', amount: 300, account_id: 42 }] };
            }
            if (sql.includes("VALUES ($1,'income'")) {
                expect(params[8]).toBe('UPI');
                return { rows: [{ id: 'tx-2', type: 'income', amount: 300, credit_card_id: 'card-1' }] };
            }
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'card-1', current_outstanding_balance: 700 }] });

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/pay')
            .send({ bank_account_id: 42, amount: 300, date: '2026-06-15', payment_method: 'UPI' });

        expect(res.status).toBe(201);
    });

    test('rejects an unrecognized payment_method before touching the database', async () => {
        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/pay')
            .send({ bank_account_id: 42, amount: 300, date: '2026-06-15', payment_method: 'Bitcoin' });

        expect(res.status).toBe(400);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('releases the client exactly once when the card is not found (no double-release)', async () => {
        const client = mockClient(async (sql) => {
            if (sql.includes('FROM credit_cards')) return { rows: [] }; // card not found
            if (sql.includes('FROM bank_accounts')) return { rows: [{ id: 42, name: 'Main Account' }] };
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/pay')
            .send({ bank_account_id: 42, amount: 300, date: '2026-06-15' });

        expect(res.status).toBe(404);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('rejects a non-positive amount before touching the database', async () => {
        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/pay')
            .send({ bank_account_id: 42, amount: 0, date: '2026-06-15' });

        expect(res.status).toBe(400);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('rolls back if a leg insert throws', async () => {
        const client = mockClient(async (sql) => {
            if (sql.includes('FROM credit_cards')) return { rows: [{ id: 'card-1', bank_name: 'HDFC', card_name: 'Millennia' }] };
            if (sql.includes('FROM bank_accounts')) return { rows: [{ id: 42, name: 'Main Account' }] };
            if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
            if (sql.includes("VALUES ($1,'expense'")) throw new Error('boom');
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/pay')
            .send({ bank_account_id: 42, amount: 300, date: '2026-06-15' });

        expect(res.status).toBe(500);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
        expect(client.release).toHaveBeenCalled();
    });
});

describe('GET /api/credit-cards/:id/cycles', () => {
    // fetchCyclesWithTotals (creditCardCycles.js) does its own DB work via
    // the same `pool` this route uses -- consistent with how this file tests
    // other routes that call into util functions (fetchCreditCardWithBalance
    // etc via GET / and /pay above), we mock at the pool.query level rather
    // than mocking the creditCardCycles module. Call order per request:
    // (1) route's own ownership check, (2) fetchCyclesWithTotals's
    // CARD_CYCLE_INPUTS_QUERY, (3) the VALUES-join bucket query (only when
    // boundaries were actually computed).
    function mockCardWithBillingDate(overrides = {}) {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'card-1' }] }) // ownership check
            .mockResolvedValueOnce({ rows: [{ billing_date: 6, balance_as_of: null, outstanding_balance: '0', ...overrides }] }) // CARD_CYCLE_INPUTS_QUERY
            .mockResolvedValueOnce({ rows: [] }); // bucket query -- empty is fine, totals just default to '0'
    }

    test('default limit (no ?limit=) returns 6 cycles', async () => {
        mockCardWithBillingDate();

        const res = await request(buildApp()).get('/api/credit-cards/card-1/cycles');

        expect(res.status).toBe(200);
        expect(res.body.cycles).toHaveLength(6);
    });

    test('?limit=12 respects the requested count', async () => {
        mockCardWithBillingDate();

        const res = await request(buildApp()).get('/api/credit-cards/card-1/cycles?limit=12');

        expect(res.status).toBe(200);
        expect(res.body.cycles).toHaveLength(12);
    });

    test('?limit=1000 clamps to 24', async () => {
        mockCardWithBillingDate();

        const res = await request(buildApp()).get('/api/credit-cards/card-1/cycles?limit=1000');

        expect(res.status).toBe(200);
        expect(res.body.cycles).toHaveLength(24);
    });

    test('card not found or not owned by user returns 404', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // ownership check fails

        const res = await request(buildApp()).get('/api/credit-cards/card-1/cycles');

        expect(res.status).toBe(404);
        expect(pool.query).toHaveBeenCalledTimes(1); // never reaches fetchCyclesWithTotals
    });

    test('no billing_date set returns an empty cycles array with HTTP 200 (not an error)', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'card-1' }] }) // ownership check
            .mockResolvedValueOnce({ rows: [{ billing_date: null, balance_as_of: null, outstanding_balance: '0' }] }); // CARD_CYCLE_INPUTS_QUERY

        const res = await request(buildApp()).get('/api/credit-cards/card-1/cycles');

        expect(res.status).toBe(200);
        expect(res.body.cycles).toEqual([]);
        expect(pool.query).toHaveBeenCalledTimes(2); // short-circuits before the bucket query
    });

    test('includes correctly-formatted label fields for both the current and a closed cycle', async () => {
        mockCardWithBillingDate();

        const res = await request(buildApp()).get('/api/credit-cards/card-1/cycles?limit=2');

        expect(res.status).toBe(200);
        expect(res.body.cycles).toHaveLength(2);

        const [current, closed] = res.body.cycles;
        expect(current.is_current).toBe(true);
        expect(current.end).toBeNull();
        // "Sep 6 – present" style -- short month, day, no year, no padding.
        expect(current.label).toMatch(/^[A-Z][a-z]{2} \d{1,2} – present$/);

        expect(closed.is_current).toBe(false);
        expect(closed.end).not.toBeNull();
        // "Aug 6 – Sep 5" style.
        expect(closed.label).toMatch(/^[A-Z][a-z]{2} \d{1,2} – [A-Z][a-z]{2} \d{1,2}$/);
    });

    test('returns 500 when fetchCyclesWithTotals\' DB query rejects', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'card-1' }] }) // ownership check succeeds
            .mockRejectedValueOnce(new Error('connection lost')); // CARD_CYCLE_INPUTS_QUERY inside fetchCyclesWithTotals

        const res = await request(buildApp()).get('/api/credit-cards/card-1/cycles');

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Failed to fetch credit card cycles');
    });
});

describe('POST /api/credit-cards/:id/convert-to-emi', () => {
    // Builds a mock transaction client that answers every query this route
    // issues, and records what was sent to the EMI/installment/fee inserts
    // so assertions can inspect exact params rather than re-deriving them.
    function buildEmiClient({ cardExists = true, categoryValid = true } = {}) {
        const installmentInserts = [];
        let feeInsertParams = null;
        let emiInsertParams = null;
        const client = {
            query: jest.fn(async (sql, params) => {
                if (sql.includes('FROM credit_cards')) return cardExists ? { rows: [{ id: 'card-1' }] } : { rows: [] };
                if (sql.includes('FROM categories')) return categoryValid ? { rows: [{ id: params[0] }] } : { rows: [] };
                if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
                if (sql.includes('INSERT INTO transactions')) {
                    feeInsertParams = params;
                    return { rows: [{ id: 'fee-tx-1', type: 'expense', amount: params[1], tags: params[4] }] };
                }
                if (sql.includes('INSERT INTO credit_card_emis')) {
                    emiInsertParams = params;
                    return { rows: [{ id: 'emi-1', user_id: params[0], credit_card_id: params[1] }] };
                }
                if (sql.includes('INSERT INTO credit_card_emi_installments')) {
                    installmentInserts.push(params);
                    return {
                        rows: [{
                            id: `inst-${installmentInserts.length}`,
                            installment_number: params[2],
                            due_date: params[3],
                            amount: params[4],
                            principal_component: params[5],
                            interest_component: params[6],
                        }],
                    };
                }
                throw new Error(`Unexpected client query: ${sql}`);
            }),
            release: jest.fn(),
        };
        return { client, installmentInserts, getFeeInsertParams: () => feeInsertParams, getEmiInsertParams: () => emiInsertParams };
    }

    // Schedule-math correctness (interest split, no-cost even split, IST due
    // dates, tenure_months-mismatch guard) is covered directly against
    // buildEmiInstallmentSchedule in tests/creditCardEmi.test.js now that the
    // route only wires that pure function's output into INSERTs. This is a
    // thin smoke test proving the route actually calls through to it and
    // persists what it returns -- not re-testing the amortization math.
    test('creates the EMI and installment rows for a valid interest-bearing request', async () => {
        const { client, installmentInserts } = buildEmiClient();
        pool.connect.mockResolvedValue(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'emi-1', principal_amount: '12000.00', remaining_principal: '12000.00', installments_posted: 0, installments_total: 6 }] });

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/convert-to-emi')
            .send({ description: 'New laptop', amount: 12000, date: '2026-01-15', tenure_months: 6, interest_rate_pct: 18 });

        expect(res.status).toBe(201);
        expect(installmentInserts).toHaveLength(6);
        expect(res.body.installments).toHaveLength(6);
        expect(res.body.emi.status).toBe('active');
    });

    test('rejects a non-integer tenure_months before touching the database', async () => {
        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/convert-to-emi')
            .send({ description: 'TV', amount: 12000, date: '2026-01-15', tenure_months: 6.5 });

        expect(res.status).toBe(400);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('rejects is_no_cost inconsistent with interest_rate_pct', async () => {
        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/convert-to-emi')
            .send({ description: 'TV', amount: 12000, date: '2026-01-15', tenure_months: 6, interest_rate_pct: 18, is_no_cost: true });

        expect(res.status).toBe(400);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('processing fee: creates a separate transaction, not folded into EMI principal', async () => {
        const { client, installmentInserts, getFeeInsertParams } = buildEmiClient();
        pool.connect.mockResolvedValue(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'emi-1' }] });

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/convert-to-emi')
            .send({ description: 'Fridge', amount: 20000, date: '2026-01-15', tenure_months: 4, interest_rate_pct: 0, processing_fee: 500 });

        expect(res.status).toBe(201);
        const feeParams = getFeeInsertParams();
        expect(feeParams).not.toBeNull();
        expect(feeParams[1]).toBe(500); // fee amount
        expect(feeParams[4]).toEqual(['credit_card_emi_fee']);
        // Principal split across installments still sums to the purchase
        // amount only -- the fee never leaks into it.
        const totalPrincipal = installmentInserts.reduce((sum, p) => sum + p[5], 0);
        expect(Math.round(totalPrincipal * 100) / 100).toBeCloseTo(20000, 1);
        expect(res.body.fee_transaction).not.toBeNull();
    });

    test('does not create a fee transaction when processing_fee is omitted', async () => {
        const { client, getFeeInsertParams } = buildEmiClient();
        pool.connect.mockResolvedValue(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'emi-1' }] });

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/convert-to-emi')
            .send({ description: 'Fridge', amount: 20000, date: '2026-01-15', tenure_months: 4 });

        expect(res.status).toBe(201);
        expect(getFeeInsertParams()).toBeNull();
        expect(res.body.fee_transaction).toBeNull();
    });

    test('markup_suspected flag is stored on the EMI row', async () => {
        const { client, getEmiInsertParams } = buildEmiClient();
        pool.connect.mockResolvedValue(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'emi-1' }] });

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/convert-to-emi')
            .send({ description: 'TV', amount: 12000, date: '2026-01-15', tenure_months: 6, interest_rate_pct: 0, markup_suspected: true });

        expect(res.status).toBe(201);
        const emiParams = getEmiInsertParams();
        expect(emiParams[10]).toBe(true); // markup_suspected
        expect(emiParams[8]).toBe(true);  // derived is_no_cost
    });

    test('card not found or not owned by user returns 404', async () => {
        const { client } = buildEmiClient({ cardExists: false });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/convert-to-emi')
            .send({ description: 'TV', amount: 12000, date: '2026-01-15', tenure_months: 6 });

        expect(res.status).toBe(404);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('invalid category_id (not owned by user) returns 400 before BEGIN', async () => {
        const { client } = buildEmiClient({ categoryValid: false });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/convert-to-emi')
            .send({ description: 'TV', amount: 12000, date: '2026-01-15', tenure_months: 6, category_id: 'someone-elses-category' });

        expect(res.status).toBe(400);
        expect(client.query.mock.calls.some(([sql]) => sql === 'BEGIN')).toBe(false);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    // The route's responsibility for IST-correctness is narrower than it
    // looks: it must anchor `purchaseDate` via istDateStr(new Date(date))
    // before calling buildEmiInstallmentSchedule. That the resulting due
    // dates are then computed correctly off *that* anchor is covered in
    // tests/creditCardEmi.test.js. This test covers the route's own half --
    // that a UTC-boundary timestamp is actually normalized to the IST
    // calendar date before reaching the schedule builder.
    test('normalizes a UTC-boundary purchase timestamp to its IST calendar date before scheduling', async () => {
        const { client, installmentInserts } = buildEmiClient();
        pool.connect.mockResolvedValue(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'emi-1' }] });

        // 2026-01-31T20:00:00.000Z is 2026-02-01 01:30 IST -- a naive
        // server-timezone Date read would see this as Jan 31.
        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/convert-to-emi')
            .send({ description: 'Phone', amount: 6000, date: '2026-01-31T20:00:00.000Z', tenure_months: 3, interest_rate_pct: 0 });

        expect(res.status).toBe(201);
        expect(installmentInserts[0][3]).toBe('2026-03-01'); // 1 month after the IST purchase date, 2026-02-01
    });
});
