process.env.JWT_SECRET = 'test-secret';
// utils/gemini.js constructs its own real Groq/Gemini clients at require time
// (separately from the mocked utils/ai.js below) and the Groq SDK throws if
// the key is missing — a dummy value is enough since nothing here calls it.
process.env.GROQ_API_KEY = 'test-groq-key';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/utils/ai', () => ({
    aiComplete: jest.fn(),
    MODELS: {},
    nimClient: {},
    ROUTES: {},
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

describe('POST /api/ai/parse-image — MIME validation', () => {
    let app;

    beforeEach(() => {
        app = buildApp();
        pool.query.mockReset();
    });

    test('rejects a disallowed file type with 400, not 500 or processed further', async () => {
        const res = await request(app)
            .post('/api/ai/parse-image')
            .attach('image', Buffer.from('not an image'), { filename: 'test.txt', contentType: 'text/plain' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    test('rejects a disallowed binary type (e.g. an executable) with 400', async () => {
        const res = await request(app)
            .post('/api/ai/parse-image')
            .attach('image', Buffer.from([0x7f, 0x45, 0x4c, 0x46]), { filename: 'test.exe', contentType: 'application/x-executable' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    test('still returns 400 when no file is provided', async () => {
        const res = await request(app).post('/api/ai/parse-image');

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Image file is required');
    });
});
