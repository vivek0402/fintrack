process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/utils/ai', () => ({
    aiComplete: jest.fn(),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
});

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const pdfImportRouter = require('../src/routes/pdfImport');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/import', pdfImportRouter);
    return app;
}

describe('POST /api/import/bank-statement', () => {
    afterEach(() => pool.query.mockReset());

    test('returns 400 with no file', async () => {
        const res = await request(buildApp()).post('/api/import/bank-statement');

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('No PDF file uploaded');
    });

    test('returns 400 with non-PDF file', async () => {
        const res = await request(buildApp())
            .post('/api/import/bank-statement')
            .attach('pdf', Buffer.from('not a pdf'), { filename: 'test.txt', contentType: 'text/plain' });

        expect(res.status).toBe(400);
    });
});

describe('GET /api/import/history', () => {
    afterEach(() => pool.query.mockReset());

    test('returns 200 with correct structure', async () => {
        const rows = [
            { id: 1, bank_name: 'HDFC', file_name: 'statement.pdf', status: 'imported', rows_extracted: 5, rows_imported: 5, created_at: '2026-06-14T00:00:00.000Z' },
        ];
        pool.query.mockResolvedValueOnce({ rows });

        const res = await request(buildApp()).get('/api/import/history');

        expect(res.status).toBe(200);
        expect(res.body.history).toEqual(rows);
        const [query, params] = pool.query.mock.calls[0];
        expect(query).toMatch(/WHERE user_id = \$1/);
        expect(params[0]).toBe('user-123');
    });
});

describe('POST /api/import/bank-statement/:jobId/confirm', () => {
    // The success path runs its INSERT/UPDATE through a transactional client
    // (pool.connect()), not the plain pool — see pdfImport.js:146. Without
    // mocking pool.connect(), client.query('BEGIN') throws on an undefined
    // client, same failure mode fixed in transactions.routes.test.js.
    function mockClient(queryImpl) {
        return { query: jest.fn(queryImpl), release: jest.fn() };
    }

    afterEach(() => {
        pool.query.mockReset();
        pool.connect.mockReset();
    });

    test('returns 404 for another user\'s jobId', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp())
            .post('/api/import/bank-statement/999/confirm')
            .send({ transactions: [] });

        expect(res.status).toBe(404);
    });

    test('imports transactions and marks the job imported', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: '1', user_id: 'user-123', status: 'review' }] });
        const calls = [];
        const client = mockClient(async (sql, params) => {
            calls.push(sql);
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.startsWith('INSERT INTO transactions')) {
                expect(params[1]).toEqual([50]);
                return { rowCount: 1 };
            }
            if (sql.startsWith('UPDATE pdf_import_jobs')) {
                expect(params).toEqual(['imported', 1, '1']);
                return {};
            }
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp())
            .post('/api/import/bank-statement/1/confirm')
            .send({ transactions: [{ date: '2026-06-01', amount: 50, type: 'expense', description: 'Coffee' }] });

        expect(res.status).toBe(200);
        expect(res.body.imported).toBe(1);
        expect(client.release).toHaveBeenCalledTimes(1);
        expect(calls).toEqual(['BEGIN', expect.stringContaining('INSERT INTO transactions'), expect.stringContaining('UPDATE pdf_import_jobs'), 'COMMIT']);
    });
});
