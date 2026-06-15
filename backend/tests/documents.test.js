process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

jest.mock('../src/db/pool', () => ({ query: jest.fn() }));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
});

const mockUpload = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockRemove = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        storage: {
            from: () => ({
                upload: mockUpload,
                createSignedUrl: mockCreateSignedUrl,
                remove: mockRemove,
            }),
        },
    }),
}));

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const documentsRouter = require('../src/routes/documents');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/documents', documentsRouter);
    return app;
}

describe('Documents routes', () => {
    let app;

    beforeEach(() => {
        app = buildApp();
        pool.query.mockReset();
        mockUpload.mockReset();
        mockCreateSignedUrl.mockReset();
        mockRemove.mockReset();
    });

    test('POST / returns 400 if no file provided', async () => {
        const res = await request(app)
            .post('/api/documents')
            .field('name', 'My Form 16')
            .field('type', 'form_16');

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    test('POST / returns 400 if type is invalid', async () => {
        const res = await request(app)
            .post('/api/documents')
            .field('name', 'My Document')
            .field('type', 'not_a_real_type')
            .attach('file', Buffer.from('test content'), 'test.pdf');

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    test('GET / returns only the requesting user\'s documents', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 'doc-1', user_id: 'user-123', name: 'Form 16', type: 'form_16' }],
        });

        const res = await request(app).get('/api/documents');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(pool.query.mock.calls[0][1]).toEqual(['user-123']);
    });

    test('DELETE /:id returns 404 for another user\'s document', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).delete('/api/documents/doc-999');

        expect(res.status).toBe(404);
        expect(res.body.error).toBeDefined();
    });

    test('GET /:id/download-url returns 404 for another user\'s document', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/api/documents/doc-999/download-url');

        expect(res.status).toBe(404);
        expect(res.body.error).toBeDefined();
    });
});
