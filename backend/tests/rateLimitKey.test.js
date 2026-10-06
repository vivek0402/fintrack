const jwt = require('jsonwebtoken');
const { userOrIpKey } = require('../src/middleware/rateLimitKey');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const reqWith = (headers, ip = '203.0.113.7') => ({ headers, ip });

describe('userOrIpKey', () => {
    const key = userOrIpKey('api');

    it('keys a signed-in request by user id, not IP', () => {
        const token = jwt.sign({ id: 42 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
        expect(key(reqWith({ authorization: `Bearer ${token}` }))).toBe('api:user:42');
    });

    it('gives two users behind the same IP separate buckets', () => {
        const a = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
        const b = jwt.sign({ id: 2 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
        expect(key(reqWith({ authorization: `Bearer ${a}` })))
            .not.toBe(key(reqWith({ authorization: `Bearer ${b}` })));
    });

    it('falls back to the client IP string for signed-out or bad tokens', () => {
        // The old inline fallback passed the whole request to ipKeyGenerator,
        // which expects an IP string; every signed-out client shared one key.
        expect(key(reqWith({}))).toBe('203.0.113.7');
        expect(key(reqWith({ authorization: 'Bearer nope' }, '198.51.100.9'))).toBe('198.51.100.9');
        expect(key(reqWith({}, '198.51.100.9'))).not.toBe(key(reqWith({})));
    });
});
