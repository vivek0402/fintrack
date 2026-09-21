const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

const authMiddleware = require('../src/middleware/auth');

function mockRes() {
    return {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

describe('authMiddleware', () => {
    test('rejects requests with no Authorization header', () => {
        const req = { headers: {} };
        const res = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('rejects requests with a malformed token', () => {
        const req = { headers: { authorization: 'Bearer not-a-real-token' } };
        const res = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('attaches decoded user and calls next() for a valid token', () => {
        const token = jwt.sign({ id: 'user-123', email: 'a@b.com' }, process.env.JWT_SECRET);
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toMatchObject({ id: 'user-123', email: 'a@b.com' });
    });

    // Defense-in-depth: the algorithm is pinned explicitly to HS256 rather than
    // trusting jsonwebtoken's own default-algorithm inference, so a token signed
    // with a different algorithm (even with the same secret) is rejected outright.
    test('rejects a token signed with a different algorithm than HS256', () => {
        const token = jwt.sign({ id: 'user-123', email: 'a@b.com' }, process.env.JWT_SECRET, { algorithm: 'HS384' });
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = mockRes();
        const next = jest.fn();

        authMiddleware(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });
});
