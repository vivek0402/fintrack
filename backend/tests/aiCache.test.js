const { setCached, getCached } = require('../src/utils/aiCache');

describe('aiCache.setCached', () => {
    test('writes with a single atomic jsonb_set UPDATE, not a read-then-write', async () => {
        const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await setCached(pool, 'user-123', 'forecast', { foo: 'bar' });

        // Exactly one query — no SELECT-then-UPDATE round trip that two concurrent
        // calls could race on and silently drop each other's cache entries.
        expect(pool.query).toHaveBeenCalledTimes(1);
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/jsonb_set/);
        expect(sql).not.toMatch(/SELECT/i);
        expect(params[0]).toEqual(['forecast']);
        expect(JSON.parse(params[1])).toMatchObject({ data: { foo: 'bar' } });
        expect(params[2]).toBe('user-123');
    });
});

describe('aiCache.getCached', () => {
    test('returns null when no cache entry exists', async () => {
        const pool = { query: jest.fn().mockResolvedValue({ rows: [{ ai_cache: {} }] }) };
        const result = await getCached(pool, 'user-123', 'forecast');
        expect(result).toBeNull();
    });

    test('returns cached data within the TTL window', async () => {
        const pool = {
            query: jest.fn().mockResolvedValue({
                rows: [{ ai_cache: { forecast: { data: { foo: 'bar' }, generated_at: new Date().toISOString() } } }],
            }),
        };
        const result = await getCached(pool, 'user-123', 'forecast');
        expect(result).toEqual({ foo: 'bar' });
    });
});
