process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123' };
    next();
});

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const router = require('../src/routes/personalLoans');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/personal-loans', router);
    return app;
}

afterEach(() => {
    pool.query.mockReset();
    pool.connect.mockReset();
});

describe('GET /api/personal-loans', () => {
    test('returns loans with derived status', async () => {
        pool.query.mockResolvedValueOnce({ rows: [
            { id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null },
        ] });
        const res = await request(buildApp()).get('/api/personal-loans');
        expect(res.status).toBe(200);
        expect(res.body.loans[0].status).toBe('outstanding');
    });
});

describe('GET /api/personal-loans/:id', () => {
    test('404s when not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = await request(buildApp()).get('/api/personal-loans/missing');
        expect(res.status).toBe(404);
    });

    test('returns the loan with its repayments', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '1000', outstanding_amount: '4000', written_off_at: null }] })
            .mockResolvedValueOnce({ rows: [{ id: 'r1', amount: '1000', date: '2026-09-01' }] });
        const res = await request(buildApp()).get('/api/personal-loans/l1');
        expect(res.status).toBe(200);
        expect(res.body.loan.status).toBe('partially_repaid');
        expect(res.body.repayments).toHaveLength(1);
    });
});

describe('POST /api/personal-loans', () => {
    test('rejects when required fields are missing', async () => {
        const res = await request(buildApp()).post('/api/personal-loans').send({ direction: 'lent' });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rejects an invalid direction', async () => {
        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'gifted', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13',
        });
        expect(res.status).toBe(400);
    });

    test('rejects a non-none interest_type without a positive interest_rate', async () => {
        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13', interest_type: 'flat',
        });
        expect(res.status).toBe(400);
        expect(pool.connect).not.toHaveBeenCalled();

        const res2 = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13', interest_type: 'flat', interest_rate: -5,
        });
        expect(res2.status).toBe(400);
    });

    test('accepts a non-none interest_type with a valid interest_rate', async () => {
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', counterparty_name: 'Priya', principal_amount: '5000', account_id: null, interest_type: 'flat', interest_rate: '2' }] }) // INSERT loan
            .mockResolvedValueOnce({ rows: [] }); // COMMIT
        pool.connect.mockResolvedValueOnce(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null, interest_type: 'flat', interest_rate: '2' }] });

        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13', interest_type: 'flat', interest_rate: 2,
        });
        expect(res.status).toBe(201);
    });

    test('creates a loan without an account (no linked transaction)', async () => {
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', counterparty_name: 'Priya', principal_amount: '5000', account_id: null }] }) // INSERT loan
            .mockResolvedValueOnce({ rows: [] }); // COMMIT
        pool.connect.mockResolvedValueOnce(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null }] });

        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13',
        });

        expect(res.status).toBe(201);
        expect(res.body.loan.status).toBe('outstanding');
        expect(res.body.loan.outstanding_amount).toBe('5000');
        expect(client.query).toHaveBeenCalledTimes(3);
    });

    test('creates a loan with an account, inserting a linked expense transaction for "lent"', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // account ownership check
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', counterparty_name: 'Priya', principal_amount: '5000', account_id: 1 }] }) // INSERT loan
            .mockResolvedValueOnce({ rows: [{ id: 'tx1' }] }) // INSERT transaction
            .mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', counterparty_name: 'Priya', principal_amount: '5000', account_id: 1, transaction_id: 'tx1' }] }) // UPDATE loan.transaction_id
            .mockResolvedValueOnce({ rows: [] }); // COMMIT
        pool.connect.mockResolvedValueOnce(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null, account_id: 1, transaction_id: 'tx1' }] });

        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13', account_id: 1,
        });

        expect(res.status).toBe(201);
        const txInsertCall = client.query.mock.calls.find(c => /INSERT INTO transactions/.test(c[0]));
        expect(txInsertCall[1]).toEqual(expect.arrayContaining(['expense', 5000, 'Lent to Priya', '2026-09-13', 1, 'l1']));
    });

    test('rolls back and releases the client if the transactional insert fails', async () => {
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockRejectedValueOnce(new Error('insert failed')) // INSERT loan fails
            .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
        pool.connect.mockResolvedValueOnce(client);

        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13',
        });

        expect(res.status).toBe(500);
        expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
    });

    test('rejects an account_id that does not belong to the user', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // ownership check finds nothing
        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13', account_id: 999,
        });
        expect(res.status).toBe(400);
        expect(pool.connect).not.toHaveBeenCalled();
    });
});

describe('PATCH /api/personal-loans/:id', () => {
    test('updates non-financial fields only', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1' }] }); // UPDATE
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null, notes: 'Paid half back in cash' }] }); // fetchPersonalLoanWithBalance
        const res = await request(buildApp()).patch('/api/personal-loans/l1').send({ notes: 'Paid half back in cash' });
        expect(res.status).toBe(200);
        expect(res.body.loan.notes).toBe('Paid half back in cash');
    });

    test('404s when the loan does not belong to the user', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = await request(buildApp()).patch('/api/personal-loans/l1').send({ notes: 'x' });
        expect(res.status).toBe(404);
    });

    test('rejects an invalid interest_type', async () => {
        const res = await request(buildApp()).patch('/api/personal-loans/l1').send({ interest_type: 'compound' });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rejects setting a non-none interest_type without ever providing a positive interest_rate', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ interest_type: 'none', interest_rate: null }] }); // current row fetch
        const res = await request(buildApp()).patch('/api/personal-loans/l1').send({ interest_type: 'flat' });
        expect(res.status).toBe(400);
    });

    test('clears interest_rate when interest_type is set back to none', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ interest_type: 'flat', interest_rate: '2' }] }); // current row fetch
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1' }] }); // UPDATE
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null, interest_type: 'none', interest_rate: null }] }); // fetchPersonalLoanWithBalance
        const res = await request(buildApp()).patch('/api/personal-loans/l1').send({ interest_type: 'none' });
        expect(res.status).toBe(200);
        expect(res.body.loan.interest_type).toBe('none');
        expect(res.body.loan.interest_rate).toBeNull();
    });

    test('404s during the interest-rate pre-check when the loan does not belong to the user', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // current row fetch finds nothing
        const res = await request(buildApp()).patch('/api/personal-loans/l1').send({ interest_type: 'flat', interest_rate: 2 });
        expect(res.status).toBe(404);
    });
});

describe('POST /api/personal-loans/:id/repayments', () => {
    test('rejects a repayment larger than the outstanding balance', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null, counterparty_name: 'Priya' }] });
        const res = await request(buildApp()).post('/api/personal-loans/l1/repayments').send({ amount: 6000, date: '2026-09-14' });
        expect(res.status).toBe(400);
    });

    test('rejects a repayment on a written-off loan', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: '2026-01-01', counterparty_name: 'Priya' }] });
        const res = await request(buildApp()).post('/api/personal-loans/l1/repayments').send({ amount: 100, date: '2026-09-14' });
        expect(res.status).toBe(400);
    });

    test('records a repayment without an account (no linked transaction), passing user_id to the repayment insert', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null, counterparty_name: 'Priya' }] });
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'r1', loan_id: 'l1', user_id: 'user-123', amount: '1000', date: '2026-09-14' }] }) // INSERT repayment
            .mockResolvedValueOnce({ rows: [] }); // COMMIT
        pool.connect.mockResolvedValueOnce(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '1000', outstanding_amount: '4000', written_off_at: null }] }); // fetchPersonalLoanWithBalance after commit

        const res = await request(buildApp()).post('/api/personal-loans/l1/repayments').send({ amount: 1000, date: '2026-09-14' });

        expect(res.status).toBe(201);
        expect(res.body.loan.status).toBe('partially_repaid');
        expect(client.query).toHaveBeenCalledTimes(3);
        const repaymentInsertCall = client.query.mock.calls.find(c => /INSERT INTO personal_loan_repayments/.test(c[0]));
        expect(repaymentInsertCall[0]).toMatch(/user_id/);
        expect(repaymentInsertCall[1]).toEqual(expect.arrayContaining(['user-123', 'l1', 1000, '2026-09-14']));
    });

    test('records a repayment with an account, inserting a linked income transaction for a lent loan', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null, counterparty_name: 'Priya' }] }) // fetchPersonalLoanWithBalance
            .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // account ownership check
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'tx1' }] }) // INSERT transaction
            .mockResolvedValueOnce({ rows: [{ id: 'r1' }] }) // INSERT repayment
            .mockResolvedValueOnce({ rows: [] }); // COMMIT
        pool.connect.mockResolvedValueOnce(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '1000', outstanding_amount: '4000', written_off_at: null }] });

        const res = await request(buildApp()).post('/api/personal-loans/l1/repayments').send({ amount: 1000, date: '2026-09-14', account_id: 1 });

        expect(res.status).toBe(201);
        const txInsertCall = client.query.mock.calls.find(c => /INSERT INTO transactions/.test(c[0]));
        expect(txInsertCall[1]).toEqual(expect.arrayContaining(['income', 1000, 'Repayment from Priya', '2026-09-14', 1, 'l1']));
    });
});

describe('PATCH /api/personal-loans/:id/write-off', () => {
    test('marks the loan written off', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1' }] }); // UPDATE
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: '2026-09-14T00:00:00Z' }] });
        const res = await request(buildApp()).patch('/api/personal-loans/l1/write-off');
        expect(res.status).toBe(200);
        expect(res.body.loan.status).toBe('written_off');
    });

    test('404s when already written off or not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = await request(buildApp()).patch('/api/personal-loans/l1/write-off');
        expect(res.status).toBe(404);
    });
});

describe('DELETE /api/personal-loans/:id', () => {
    test('deletes the loan and its linked transactions', async () => {
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ transaction_id: 'tx-repay-1' }] }) // repayments' transaction_ids
            .mockResolvedValueOnce({ rows: [{ transaction_id: 'tx-loan-1' }] }) // loan row (ownership + its own transaction_id)
            .mockResolvedValueOnce({ rows: [] }) // DELETE transactions
            .mockResolvedValueOnce({ rows: [] }) // DELETE personal_loans
            .mockResolvedValueOnce({ rows: [] }); // COMMIT
        pool.connect.mockResolvedValueOnce(client);

        const res = await request(buildApp()).delete('/api/personal-loans/l1');

        expect(res.status).toBe(200);
        const txDeleteCall = client.query.mock.calls.find(c => /DELETE FROM transactions/.test(c[0]));
        expect(txDeleteCall[1][0]).toEqual(expect.arrayContaining(['tx-loan-1', 'tx-repay-1']));
    });

    test('404s when the loan does not belong to the user', async () => {
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // repayments (none)
            .mockResolvedValueOnce({ rows: [] }) // loan row -- not found
            .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
        pool.connect.mockResolvedValueOnce(client);

        const res = await request(buildApp()).delete('/api/personal-loans/l1');
        expect(res.status).toBe(404);
    });
});
