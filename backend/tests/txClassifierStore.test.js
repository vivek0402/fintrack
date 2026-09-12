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

const { learnTransaction, unlearnTransaction, relearnTransaction } = require('../src/utils/txClassifierStore');

function mockClient(queue) {
    const client = { query: jest.fn(), release: jest.fn() };
    for (const r of queue) client.query.mockResolvedValueOnce(r);
    return client;
}

const TX = { description: 'Swiggy', amount: '450', date: '2026-09-12', type: 'expense', category_id: 'food', payment_method: 'UPI', tags: [], created_at: '2026-09-12T12:00:00Z' };

describe('learnTransaction', () => {
    test('takes the per-user advisory lock, folds the tx in, saves, commits', async () => {
        const model = createModel();
        const client = mockClient([
            { rows: [] },                                       // BEGIN
            { rows: [] },                                       // advisory lock
            { rows: [{ model, trained_count: 30 }] },           // loadModel
            { rows: [] },                                       // saveModel
            { rows: [] },                                       // COMMIT
        ]);
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await learnTransaction(pool, 'u1', TX);

        expect(client.query.mock.calls[1][0]).toMatch(/pg_advisory_xact_lock/);
        expect(client.query.mock.calls[1][1]).toEqual(['txclf:u1']);
        const saved = JSON.parse(client.query.mock.calls[3][1][1]);
        expect(saved.category.total).toBe(1);
        expect(client.query.mock.calls[3][1][2]).toBe(31);
        expect(client.query.mock.calls[4][0]).toBe('COMMIT');
        expect(client.release).toHaveBeenCalled();
    });

    test('does not double-count when it had to bootstrap (history already contains the row)', async () => {
        const client = mockClient([
            { rows: [] }, { rows: [] },
            { rows: [] },                    // loadModel -> none
            { rows: [TX] },                  // bootstrap history select
            { rows: [] },                    // bootstrap save
            { rows: [] },                    // COMMIT
        ]);
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await learnTransaction(pool, 'u1', TX);

        const saves = client.query.mock.calls.filter(c => /INSERT INTO tx_classifier_models/.test(c[0]));
        expect(saves).toHaveLength(1);
        expect(saves[0][1][2]).toBe(1);
    });

    test('rolls back and rethrows on error', async () => {
        const client = mockClient([{ rows: [] }, { rows: [] }]);
        client.query.mockRejectedValueOnce(new Error('boom'));
        client.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await expect(learnTransaction(pool, 'u1', TX)).rejects.toThrow('boom');
        expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
    });
});

describe('unlearnTransaction', () => {
    test('subtracts the tx and decrements the count (floored at 0)', async () => {
        const model = createModel();
        learn(model, TX);
        const client = mockClient([{ rows: [] }, { rows: [] }, { rows: [{ model, trained_count: 1 }] }, { rows: [] }, { rows: [] }]);
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await unlearnTransaction(pool, 'u1', TX);

        const saved = JSON.parse(client.query.mock.calls[3][1][1]);
        expect(saved).toEqual(createModel());
        expect(client.query.mock.calls[3][1][2]).toBe(0);
    });
});

describe('relearnTransaction', () => {
    test('swaps the old row for the new one without changing the count', async () => {
        const model = createModel();
        learn(model, TX);
        const client = mockClient([{ rows: [] }, { rows: [] }, { rows: [{ model, trained_count: 1 }] }, { rows: [] }, { rows: [] }]);
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await relearnTransaction(pool, 'u1', TX, { ...TX, category_id: 'travel' });

        const saved = JSON.parse(client.query.mock.calls[3][1][1]);
        expect(Object.keys(saved.category.classCounts)).toEqual(['travel']);
        expect(client.query.mock.calls[3][1][2]).toBe(1);
    });
});
