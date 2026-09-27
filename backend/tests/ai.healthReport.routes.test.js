process.env.JWT_SECRET = 'test-secret';
// utils/gemini.js builds a real Groq client at require time; a dummy key is enough.
process.env.GROQ_API_KEY = 'test-groq-key';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/utils/ai', () => ({
    aiComplete: jest.fn(),
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
const { aiComplete } = require('../src/utils/ai');
const aiRouter = require('../src/routes/ai');
const { validateHealthScoreInput, healthReportFingerprint } = require('../src/utils/healthReport');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/ai', aiRouter);
    return app;
}

// Sums to 62.
const FACTORS = [
    { id: 'savings', score: 13, max: 20 },
    { id: 'momentum', score: 6, max: 10 },
    { id: 'stability', score: 8, max: 10 },
    { id: 'efficiency', score: 9, max: 15 },
    { id: 'investment', score: 9, max: 15 },
    { id: 'debt', score: 12, max: 15 },
    { id: 'goals', score: 3, max: 10 },
    { id: 'budgets', score: 2, max: 5 },
];
const body = (over = {}) => ({ score: 62, factors: FACTORS, ...over });

let aiCacheRow = {};
function mockDb() {
    pool.query.mockImplementation((sql, params) => {
        if (/SELECT ai_cache FROM users/.test(sql)) return Promise.resolve({ rows: [{ ai_cache: aiCacheRow }] });
        if (/UPDATE users SET ai_cache = jsonb_set/.test(sql)) {
            aiCacheRow = { ...aiCacheRow, [params[0][0]]: JSON.parse(params[1]) };
            return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    aiCacheRow = {};
    mockDb();
});

describe('validateHealthScoreInput', () => {
    test('accepts a well-formed score and normalises factor order and names', () => {
        const r = validateHealthScoreInput(body({ factors: [...FACTORS].reverse() }));
        expect(r.ok).toBe(true);
        expect(r.factors.map(f => f.id)).toEqual(FACTORS.map(f => f.id));
        expect(r.factors[0]).toEqual({ id: 'savings', name: 'Savings Rate', score: 13, max: 20 });
    });

    test.each([
        ['missing score', { score: undefined }],
        ['string score', { score: '62' }],
        ['score above 100', { score: 101 }],
        ['negative score', { score: -1 }],
        ['fractional score', { score: 61.5 }],
        ['missing factors', { factors: undefined }],
        ['too few factors', { factors: FACTORS.slice(1) }],
        ['unknown factor key', { factors: [...FACTORS.slice(1), { id: 'vibes', score: 13, max: 20 }] }],
        ['duplicate factor', { factors: [...FACTORS.slice(0, 7), { id: 'savings', score: 2 }] }],
        ['factor above its max', { score: 66, factors: FACTORS.map(f => f.id === 'budgets' ? { ...f, score: 6 } : f) }],
        ['score not equal to factor sum', { score: 70 }],
    ])('rejects %s', (_label, over) => {
        expect(validateHealthScoreInput(body(over)).ok).toBe(false);
    });

    test('fingerprint changes when the score or a factor changes', () => {
        const a = validateHealthScoreInput(body());
        const b = validateHealthScoreInput(body({ score: 63, factors: FACTORS.map(f => f.id === 'budgets' ? { ...f, score: 3 } : f) }));
        const fa = healthReportFingerprint({ month: 9, year: 2026, ...a });
        const fb = healthReportFingerprint({ month: 9, year: 2026, ...b });
        expect(fa).not.toBe(fb);
        expect(fa).toBe(healthReportFingerprint({ month: 9, year: 2026, ...a }));
    });
});

describe('POST /api/ai/health-report', () => {
    test('400s on invalid input without touching the DB or the AI', async () => {
        const res = await request(buildApp()).post('/api/ai/health-report').send(body({ score: 150 }));
        expect(res.status).toBe(400);
        expect(aiComplete).not.toHaveBeenCalled();
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('400s when the body has no score at all (old client shape)', async () => {
        const res = await request(buildApp()).post('/api/ai/health-report').send({});
        expect(res.status).toBe(400);
    });

    test('response carries the client score even if the AI invents another', async () => {
        aiComplete.mockResolvedValue(JSON.stringify({
            health_score: 91, grade: 'A+', score: 91,
            narrative: 'Solid month.', strengths: ['Debt is low'], weak_spots: ['Goals lag'], next_steps: ['Fund a goal'],
        }));
        const res = await request(buildApp()).post('/api/ai/health-report').send(body());
        expect(res.status).toBe(200);
        expect(res.body.report.score).toBe(62);
        expect(res.body.report).not.toHaveProperty('health_score');
        expect(res.body.report).not.toHaveProperty('grade');
        expect(res.body.report).not.toHaveProperty('scores');
        expect(Object.values(res.body.report)).not.toContain(91);
        expect(res.body.report.weak_spots).toEqual(['Goals lag']);
        expect(res.body.report.generated_at).toEqual(expect.any(String));
    });

    test('the prompt states the provided score and fences the data as untrusted', async () => {
        aiComplete.mockResolvedValue('{"narrative":"x","strengths":[],"weak_spots":[],"next_steps":[]}');
        await request(buildApp()).post('/api/ai/health-report').send(body());
        const prompt = aiComplete.mock.calls[0][1][0].content;
        expect(prompt).toContain('The score is 62/100');
        expect(prompt).toMatch(/untrusted/i);
        expect(prompt).toContain('"health_score":62');
    });

    test('peek returns null without calling the AI when nothing is cached', async () => {
        const res = await request(buildApp()).post('/api/ai/health-report').send(body({ peek: true }));
        expect(res.status).toBe(200);
        expect(res.body.report).toBeNull();
        expect(aiComplete).not.toHaveBeenCalled();
    });

    test('a cached report is reused for the same score and regenerated when the score changes', async () => {
        aiComplete.mockResolvedValue('{"narrative":"first","strengths":[],"weak_spots":[],"next_steps":[]}');
        const app = buildApp();
        await request(app).post('/api/ai/health-report').send(body());
        expect(aiComplete).toHaveBeenCalledTimes(1);

        const again = await request(app).post('/api/ai/health-report').send(body({ peek: true }));
        expect(again.body.from_cache).toBe(true);
        expect(again.body.report.narrative).toBe('first');
        expect(again.body.report.score).toBe(62);

        const changed = body({ score: 63, factors: FACTORS.map(f => f.id === 'budgets' ? { ...f, score: 3 } : f) });
        const peekChanged = await request(app).post('/api/ai/health-report').send({ ...changed, peek: true });
        expect(peekChanged.body.report).toBeNull();

        aiComplete.mockResolvedValue('{"narrative":"second","strengths":[],"weak_spots":[],"next_steps":[]}');
        const regen = await request(app).post('/api/ai/health-report').send(changed);
        expect(aiComplete).toHaveBeenCalledTimes(2);
        expect(regen.body.report.score).toBe(63);
        expect(regen.body.report.narrative).toBe('second');
    });

    test('a tampered cache entry still returns the requested score', async () => {
        const v = validateHealthScoreInput(body());
        const { month, year } = require('../src/utils/istDate').istMonthYear(new Date());
        aiCacheRow = {
            health_report: {
                generated_at: new Date().toISOString(),
                data: { fingerprint: healthReportFingerprint({ month, year, ...v }), report: { score: 99, narrative: 'old' } },
            },
        };
        const res = await request(buildApp()).post('/api/ai/health-report').send(body({ peek: true }));
        expect(res.body.report.score).toBe(62);
    });
});
