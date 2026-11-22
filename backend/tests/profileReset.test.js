process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123' };
    next();
});

const bcrypt = require('bcryptjs');
const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const profileRouter = require('../src/routes/profile');

const app = express();
app.use(express.json());
app.use('/api/profile', profileRouter);

const hash = bcrypt.hashSync('correct-horse', 4);

afterEach(() => { pool.query.mockReset(); pool.connect.mockReset(); });

describe('POST /api/profile/reset', () => {
    test('rejects a request without a password and deletes nothing', async () => {
        const res = await request(app).post('/api/profile/reset').send({});
        expect(res.status).toBe(400);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('rejects a wrong password and deletes nothing', async () => {
        pool.query.mockResolvedValue({ rows: [{ password_hash: hash }] });
        const res = await request(app).post('/api/profile/reset').send({ password: 'nope' });
        expect(res.status).toBe(401);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('deletes the user\'s rows in one transaction and keeps the login', async () => {
        pool.query.mockResolvedValue({ rows: [{ password_hash: hash }] });
        const calls = [];
        const client = { query: jest.fn(async (sql, params) => { calls.push([sql, params]); return {}; }), release: jest.fn() };
        pool.connect.mockResolvedValue(client);

        const res = await request(app).post('/api/profile/reset').send({ password: 'correct-horse' });

        expect(res.status).toBe(200);
        const sqls = calls.map(c => c[0]);
        expect(sqls[0]).toBe('BEGIN');
        expect(sqls[sqls.length - 1]).toBe('COMMIT');
        const deletes = sqls.filter(s => s.startsWith('DELETE FROM'));
        expect(deletes).toEqual(expect.arrayContaining([
            'DELETE FROM transactions WHERE user_id = $1',
            'DELETE FROM bank_accounts WHERE user_id = $1',
            'DELETE FROM credit_cards WHERE user_id = $1',
            'DELETE FROM savings_goals WHERE user_id = $1',
        ]));
        // Every delete is scoped to this user, and the account itself survives.
        calls.filter(c => c[0].startsWith('DELETE')).forEach(c => expect(c[1]).toEqual(['user-123']));
        expect(sqls.some(s => /FROM users\b|refresh_tokens|categories/.test(s))).toBe(false);
        expect(client.release).toHaveBeenCalled();
    });

    test('rolls back and reports failure if a delete fails', async () => {
        pool.query.mockResolvedValue({ rows: [{ password_hash: hash }] });
        const calls = [];
        const client = {
            query: jest.fn(async (sql) => {
                calls.push(sql);
                if (sql.startsWith('DELETE FROM bank_accounts')) throw new Error('boom');
                return {};
            }),
            release: jest.fn(),
        };
        pool.connect.mockResolvedValue(client);
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const res = await request(app).post('/api/profile/reset').send({ password: 'correct-horse' });

        expect(res.status).toBe(500);
        expect(calls).toContain('ROLLBACK');
        expect(calls).not.toContain('COMMIT');
        expect(client.release).toHaveBeenCalled();
    });
});
