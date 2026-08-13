process.env.JWT_SECRET = 'test-secret';
// utils/gemini.js constructs its own real Groq/Gemini clients at require time
// (separately from the mocked utils/ai.js below) and the Groq SDK throws if
// the key is missing — a dummy value is enough since nothing here calls it.
process.env.GROQ_API_KEY = 'test-groq-key';

const mockClient = { query: jest.fn(), release: jest.fn() };

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/utils/ai', () => ({
    aiComplete: jest.fn().mockResolvedValue('Test narrative.'),
    MODELS: {},
    nimClient: {},
}));
jest.mock('../src/utils/fcm', () => ({
    sendToUser: jest.fn(),
    userHasTokens: jest.fn().mockResolvedValue(false),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
});

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const aiRouter = require('../src/routes/ai');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/ai', aiRouter);
    return app;
}

describe('POST /api/ai/briefing/daily/generate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        pool.connect.mockResolvedValue(mockClient);
        // getDailyBriefData reads 8 unrelated tables via the module-level pool —
        // none of them touch daily_briefings, so empty rows are fine here.
        pool.query.mockResolvedValue({ rows: [] });

        mockClient.query.mockImplementation((sql) => {
            if (/^BEGIN/.test(sql) || /^COMMIT/.test(sql) || /^ROLLBACK/.test(sql)) {
                return Promise.resolve({ rows: [] });
            }
            if (/SELECT refresh_log/i.test(sql)) {
                return Promise.resolve({ rows: [] }); // no prior refresh today
            }
            if (/SELECT narrative, action_of_the_day, points/i.test(sql)) {
                return Promise.resolve({ rows: [] }); // no cached brief yet -> AI narrative path
            }
            if (/INSERT INTO daily_briefings/i.test(sql)) {
                return Promise.resolve({
                    rows: [{ id: 'brief-1', narrative: 'Test narrative.', action_of_the_day: 'Do something.' }],
                });
            }
            if (/UPDATE daily_briefings SET refresh_log/i.test(sql)) {
                return Promise.resolve({ rows: [] });
            }
            return Promise.resolve({ rows: [] });
        });
    });

    test('runs the read-check and upsert on the transaction client, not the bare pool', async () => {
        const res = await request(buildApp()).post('/api/ai/briefing/daily/generate');

        expect(res.status).toBe(200);

        // The route takes a `FOR UPDATE` row lock on `client`, then must do all of
        // its daily_briefings writes on that SAME connection. If generateDailyBriefing
        // falls back to the module-level pool for those writes instead, that write
        // blocks forever waiting on the lock this same request just took -- a real
        // self-deadlock against Postgres, one stuck connection per occurrence.
        const poolCalls = pool.query.mock.calls.map(([sql]) => sql);
        expect(poolCalls.some(sql => /daily_briefings/i.test(sql))).toBe(false);

        const clientCalls = mockClient.query.mock.calls.map(([sql]) => sql);
        expect(clientCalls.some(sql => /SELECT narrative, action_of_the_day, points/i.test(sql))).toBe(true);
        expect(clientCalls.some(sql => /INSERT INTO daily_briefings/i.test(sql))).toBe(true);

        expect(mockClient.release).toHaveBeenCalled();
    });
});
