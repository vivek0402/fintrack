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
const loansRouter = require('../src/routes/loans');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/loans', loansRouter);
    return app;
}

const app = buildApp();

const baseLoan = {
    id: 'loan-1',
    user_id: 'user-123',
    name: 'Home Loan',
    outstanding_balance: '100000',
    interest_rate_pct: '10',
    emi_amount: '5000',
    tenure_months: 24,
    disbursement_date: new Date().toISOString(),
};

function mockClient(queryImpl) {
    return { query: jest.fn(queryImpl), release: jest.fn() };
}

describe('POST /api/loans/:id/prepayments — race-safe balance check', () => {
    afterEach(() => {
        pool.query.mockReset();
        pool.connect.mockReset();
    });

    test('rolls back and returns 400 when the atomic conditional UPDATE loses the race (rowCount 0)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [baseLoan] }); // initial loan SELECT

        const client = mockClient(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
            if (sql.includes('UPDATE loans')) return { rowCount: 0, rows: [] }; // lost the race — balance already consumed
            throw new Error(`Unexpected query in test: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(app)
            .post('/api/loans/loan-1/prepayments')
            .send({ amount: 60000, prepayment_date: '2026-06-23' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/exceed/i);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        // The prepayment INSERT must never run once the balance check fails atomically.
        expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO loan_prepayments'))).toBe(false);
        expect(client.release).toHaveBeenCalled();
    });

    test('commits and returns 201 when the atomic conditional UPDATE wins (rowCount 1)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [baseLoan] }); // initial loan SELECT

        const insertedPrepayment = { id: 'prepay-1', amount: '60000' };
        const client = mockClient(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.includes('UPDATE loans')) return { rowCount: 1, rows: [{ outstanding_balance: '40000' }] };
            if (sql.includes('INSERT INTO loan_prepayments')) return { rows: [insertedPrepayment] };
            throw new Error(`Unexpected query in test: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(app)
            .post('/api/loans/loan-1/prepayments')
            .send({ amount: 60000, prepayment_date: '2026-06-23' });

        expect(res.status).toBe(201);
        expect(res.body.prepayment).toEqual(insertedPrepayment);
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.release).toHaveBeenCalled();
    });
});
