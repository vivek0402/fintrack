process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
}));
jest.mock('../src/utils/email', () => ({
    sendOTPEmail: jest.fn().mockResolvedValue(undefined),
}));

const bcrypt = require('bcryptjs');
const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const authRouter = require('../src/routes/auth');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    return app;
}

const app = buildApp();

afterEach(() => {
    pool.query.mockReset();
});

describe('POST /api/auth/register', () => {
    test('duplicate, already-verified email returns 409', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'u1', is_verified: true }] });

        const res = await request(app)
            .post('/api/auth/register')
            .send({ full_name: 'Jane', email: 'jane@example.com', password: 'password1' });

        expect(res.status).toBe(409);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the existence check, no insert/update/OTP
    });

    test('re-registering over an unverified account updates it and sends a fresh OTP', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'u1', is_verified: false }] }); // existence check
        pool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE users
        pool.query.mockResolvedValueOnce({ rows: [] }); // DELETE old OTPs
        pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT new OTP

        const res = await request(app)
            .post('/api/auth/register')
            .send({ full_name: 'Jane', email: 'jane@example.com', password: 'password1' });

        expect(res.status).toBe(201);
        expect(pool.query.mock.calls[1][0]).toMatch(/UPDATE users/);
    });
});

describe('POST /api/auth/login', () => {
    test('wrong password returns a generic 401 (does not leak account existence)', async () => {
        const hash = await bcrypt.hash('correct-password', 4);
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 'u1', email: 'jane@example.com', password_hash: hash, is_verified: true }],
        });

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'jane@example.com', password: 'wrong-password' });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid email or password.');
    });

    test('correct password on an unverified account returns 403 with unverified flag', async () => {
        const hash = await bcrypt.hash('correct-password', 4);
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 'u1', email: 'jane@example.com', password_hash: hash, is_verified: false }],
        });

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'jane@example.com', password: 'correct-password' });

        expect(res.status).toBe(403);
        expect(res.body.unverified).toBe(true);
        expect(res.body.email).toBe('jane@example.com');
    });
});

describe('POST /api/auth/verify-email — OTP handling', () => {
    test('expired or unmatched OTP returns 400', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // attemptCheck: no active OTP
        pool.query.mockResolvedValueOnce({ rows: [] }); // result: no match
        pool.query.mockResolvedValueOnce({ rows: [] }); // attempts increment (best-effort)

        const res = await request(app)
            .post('/api/auth/verify-email')
            .send({ email: 'jane@example.com', otp: '000000' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid or expired OTP.');
    });

    test('5 failed attempts invalidate the OTP even on a correct 6th guess', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ attempts: 5 }] }); // attemptCheck: lockout threshold hit
        pool.query.mockResolvedValueOnce({ rows: [] }); // DELETE invalidates the OTP

        const res = await request(app)
            .post('/api/auth/verify-email')
            .send({ email: 'jane@example.com', otp: '123456' }); // the "correct" OTP, never even checked

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid or expired OTP.');
        // Only 2 queries ran — the lockout short-circuits before the OTP-match SELECT.
        expect(pool.query).toHaveBeenCalledTimes(2);
        expect(pool.query.mock.calls[1][0]).toMatch(/DELETE FROM otp_verifications/);
    });
});

describe('POST /api/auth/refresh', () => {
    test('missing refresh_token returns 400 without touching the database', async () => {
        const res = await request(app).post('/api/auth/refresh').send({});

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('an unknown refresh token returns a generic 401', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).post('/api/auth/refresh').send({ refresh_token: 'nonexistent' });

        expect(res.status).toBe(401);
    });

    test('an expired (but never-used) refresh token returns 401', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 'rt-1', user_id: 'u1', revoked_at: null, expires_at: new Date(Date.now() - 1000).toISOString(), device_label: null }],
        });

        const res = await request(app).post('/api/auth/refresh').send({ refresh_token: 'expired-token' });

        expect(res.status).toBe(401);
        expect(pool.query).toHaveBeenCalledTimes(1); // no user lookup, no rotation
    });

    test('replaying an already-rotated (revoked) token is logged as reuse and rejected, without issuing a new token', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 'rt-1', user_id: 'u1', revoked_at: new Date().toISOString(), expires_at: new Date(Date.now() + 1000000).toISOString(), device_label: null }],
        });

        const res = await request(app).post('/api/auth/refresh').send({ refresh_token: 'reused-token' });

        expect(res.status).toBe(401);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('reuse detected'));
        expect(pool.query).toHaveBeenCalledTimes(1); // no rotation, no new token issued
        warnSpy.mockRestore();
    });

    test('a valid refresh token rotates: the old row is revoked and a new access + refresh token pair is issued', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 'rt-1', user_id: 'u1', revoked_at: null, expires_at: new Date(Date.now() + 1000000).toISOString(), device_label: 'web' }],
        });
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'jane@example.com' }] }); // user lookup
        pool.query.mockResolvedValueOnce({}); // UPDATE revoked_at
        pool.query.mockResolvedValueOnce({}); // INSERT new refresh token

        const res = await request(app).post('/api/auth/refresh').send({ refresh_token: 'valid-token' });

        expect(res.status).toBe(200);
        expect(typeof res.body.token).toBe('string');
        expect(typeof res.body.refreshToken).toBe('string');
        const revokeCall = pool.query.mock.calls.find(([sql]) => sql.includes('SET revoked_at = NOW()'));
        expect(revokeCall[1]).toEqual(['rt-1']);
    });
});
