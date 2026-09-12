const { loadModel, saveModel, bootstrapModel, suggest } = require('../src/utils/txClassifierStore');
const { createModel, learn } = require('../src/utils/txClassifier');

function mockPool() {
    return { query: jest.fn(), connect: jest.fn() };
}

const HISTORY = Array.from({ length: 25 }, (_, i) => ({
    description: i % 2 ? 'Swiggy' : 'Uber',
    amount: i % 2 ? '450' : '180',
    date: '2026-09-01', type: 'expense',
    category_id: i % 2 ? 'food' : 'travel',
    payment_method: i % 2 ? 'UPI' : 'Cash',
    tags: [], created_at: '2026-09-01T12:00:00Z',
}));

describe('loadModel', () => {
    test('returns null when there is no row', async () => {
        const pool = mockPool();
        pool.query.mockResolvedValueOnce({ rows: [] });
        expect(await loadModel(pool, 'u1')).toBeNull();
    });
    test('returns model and trainedCount', async () => {
        const pool = mockPool();
        pool.query.mockResolvedValueOnce({ rows: [{ model: { version: 1 }, trained_count: 7 }] });
        expect(await loadModel(pool, 'u1')).toEqual({ model: { version: 1 }, trainedCount: 7 });
    });
});

describe('saveModel', () => {
    test('upserts serialized JSON with the count', async () => {
        const pool = mockPool();
        pool.query.mockResolvedValueOnce({ rows: [] });
        await saveModel(pool, 'u1', { a: 1 }, 3);
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/ON CONFLICT \(user_id\)/);
        expect(params).toEqual(['u1', '{"a":1}', 3]);
    });
});

describe('bootstrapModel', () => {
    test('trains on history and saves', async () => {
        const pool = mockPool();
        pool.query
            .mockResolvedValueOnce({ rows: HISTORY })   // history select
            .mockResolvedValueOnce({ rows: [] });       // save
        const { model, trainedCount } = await bootstrapModel(pool, 'u1');
        expect(trainedCount).toBe(25);
        expect(model.category.total).toBe(25);
        expect(pool.query.mock.calls[1][0]).toMatch(/INSERT INTO tx_classifier_models/);
    });
});

describe('suggest', () => {
    test('is not ready below MIN_SAMPLES', async () => {
        const pool = mockPool();
        const model = createModel();
        learn(model, HISTORY[0]);
        pool.query.mockResolvedValueOnce({ rows: [{ model, trained_count: 1 }] });
        const out = await suggest(pool, 'u1', { description: 'swiggy', type: 'expense' });
        expect(out).toEqual({ ready: false, trained: 1, category: [], payment_method: [] });
    });

    test('predicts category and payment when ready', async () => {
        const pool = mockPool();
        const model = createModel();
        HISTORY.forEach(tx => learn(model, tx));
        pool.query.mockResolvedValueOnce({ rows: [{ model, trained_count: 25 }] });
        const out = await suggest(pool, 'u1', { description: 'swiggy order', amount: 450, type: 'expense' });
        expect(out.ready).toBe(true);
        expect(out.category[0]).toEqual({ id: 'food', prob: expect.any(Number) });
        expect(out.category[0].prob).toBeGreaterThan(0.7);
        expect(out.payment_method[0].method).toBe('UPI');
    });

    test('bootstraps when no model row exists', async () => {
        const pool = mockPool();
        pool.query
            .mockResolvedValueOnce({ rows: [] })          // loadModel
            .mockResolvedValueOnce({ rows: HISTORY })     // history
            .mockResolvedValueOnce({ rows: [] });         // save
        const out = await suggest(pool, 'u1', { description: 'uber', type: 'expense' });
        expect(out.ready).toBe(true);
        expect(out.category[0].id).toBe('travel');
    });

    test('omits payment suggestions for income', async () => {
        const pool = mockPool();
        const model = createModel();
        HISTORY.forEach(tx => learn(model, tx));
        pool.query.mockResolvedValueOnce({ rows: [{ model, trained_count: 25 }] });
        const out = await suggest(pool, 'u1', { description: 'salary', type: 'income' });
        expect(out.payment_method).toEqual([]);
    });
});
