process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
});
jest.mock('pdf-parse', () => jest.fn());
jest.mock('../src/utils/ai', () => ({
    aiComplete: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const pdfParse = require('pdf-parse');
const { aiComplete } = require('../src/utils/ai');
const camsRouter = require('../src/routes/camsImport');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/cams-import', camsRouter);
    return app;
}

const app = buildApp();

function mockClient(queryImpl) {
    return { query: jest.fn(queryImpl), release: jest.fn() };
}

afterEach(() => {
    pool.query.mockReset();
    pool.connect.mockReset();
    pdfParse.mockReset();
    aiComplete.mockReset();
});

describe('POST /api/cams-import/cams-statement', () => {
    test('a too-short / garbage PDF text returns 422 and marks the job failed', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'job-1' }] }); // INSERT job
        pool.query.mockResolvedValueOnce({}); // UPDATE failed
        pdfParse.mockResolvedValue({ text: 'short' });

        const res = await request(app)
            .post('/api/cams-import/cams-statement')
            .attach('pdf', Buffer.from('%PDF-1.4 dummy'), 'statement.pdf');

        expect(res.status).toBe(422);
        const updateCall = pool.query.mock.calls[1];
        expect(updateCall[0]).toMatch(/UPDATE cams_import_jobs SET status=\$1/);
        expect(updateCall[1][0]).toBe('failed');
        expect(aiComplete).not.toHaveBeenCalled();
    });

    test('a non-JSON AI response returns 422 and marks the job failed', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'job-1' }] }); // INSERT job
        pool.query.mockResolvedValueOnce({}); // UPDATE failed
        pdfParse.mockResolvedValue({ text: 'A'.repeat(200) });
        aiComplete.mockResolvedValue('this is not valid json {{{');

        const res = await request(app)
            .post('/api/cams-import/cams-statement')
            .attach('pdf', Buffer.from('%PDF-1.4 dummy'), 'statement.pdf');

        expect(res.status).toBe(422);
        const updateCall = pool.query.mock.calls[1];
        expect(updateCall[1][0]).toBe('failed');
        expect(updateCall[1][1]).toMatch(/AI could not parse/);
    });
});

describe('POST /api/cams-import/cams-statement/:jobId/confirm', () => {
    test('confirming a job not awaiting review returns 400', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'job-1', user_id: 'user-123', status: 'processing' }] });

        const res = await request(app)
            .post('/api/cams-import/cams-statement/job-1/confirm')
            .send({ holdings: [] });

        expect(res.status).toBe(400);
    });

    test('confirming another user\'s job returns 403', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'job-1', user_id: 'someone-else', status: 'review' }] });

        const res = await request(app)
            .post('/api/cams-import/cams-statement/job-1/confirm')
            .send({ holdings: [] });

        expect(res.status).toBe(403);
    });

    test('a holding with non-positive units or NAV is skipped, not inserted', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'job-1', user_id: 'user-123', status: 'review' }] }); // job lookup
        pool.query.mockResolvedValueOnce({ rows: [] }); // existing-folio check

        const client = mockClient(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.includes('INSERT INTO investments')) return {};
            if (sql.includes('UPDATE cams_import_jobs')) return {};
            throw new Error(`Unexpected query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(app)
            .post('/api/cams-import/cams-statement/job-1/confirm')
            .send({
                holdings: [
                    { folio_number: 'F1', scheme_name: 'Bad Fund', units: 0, nav: 100 },
                    { folio_number: 'F2', scheme_name: 'Good Fund', units: 10, nav: 50 },
                ],
            });

        expect(res.status).toBe(200);
        expect(res.body.skipped).toBe(1);
        expect(res.body.created).toBe(1);
        const insertCalls = client.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO investments'));
        expect(insertCalls).toHaveLength(1);
        expect(insertCalls[0][1]).toContain('Good Fund');
    });
});
