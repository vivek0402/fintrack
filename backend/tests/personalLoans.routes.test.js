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

        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13',
        });

        expect(res.status).toBe(201);
        expect(res.body.loan.status).toBe('outstanding');
        expect(res.body.loan.outstanding_amount).toBe(5000);
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

        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13', account_id: 1,
        });

        expect(res.status).toBe(201);
        const txInsertCall = client.query.mock.calls.find(c => /INSERT INTO transactions/.test(c[0]));
        expect(txInsertCall[1]).toEqual(expect.arrayContaining(['expense', 5000, 'Lent to Priya', '2026-09-13', 1, 'l1']));
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
