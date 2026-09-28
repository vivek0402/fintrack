const fs = require('fs');
const path = require('path');
const { postRecurringOccurrence, postDueRecurring } = require('../src/utils/recurringPosting');

// In-memory stand-in for Postgres: recurring rows keyed by id, a transactions
// list, and per-client transactions that only become visible on COMMIT. Each
// query yields to the event loop first, so two concurrent posts interleave.
function fakeDb(rows) {
    const recurring = new Map(rows.map(r => [r.id, { ...r }]));
    const transactions = [];
    const tick = () => new Promise(resolve => setImmediate(resolve));

    const pool = {
        connect: jest.fn(async () => {
            let pending = null; // { updates: [], inserts: [] } while in BEGIN
            return {
                release: jest.fn(),
                query: jest.fn(async (sql, params = []) => {
                    await tick();
                    const verb = sql.trim().split(/\s+/)[0];
                    if (verb === 'BEGIN') { pending = { updates: [], inserts: [] }; return {}; }
                    if (verb === 'ROLLBACK') { pending = null; return {}; }
                    if (verb === 'COMMIT') {
                        pending.inserts.forEach(t => transactions.push(t));
                        pending = null;
                        return {};
                    }
                    if (verb === 'UPDATE') {
                        // Row lock semantics: the guarded UPDATE applies at once
                        // (a second claimer sees the new date and matches 0 rows).
                        const [next, id, userId, old] = params;
                        const r = recurring.get(id);
                        if (!r || r.user_id !== userId || r.next_due_date !== old) return { rowCount: 0 };
                        r.next_due_date = next;
                        return { rowCount: 1 };
                    }
                    if (verb === 'INSERT') { pending.inserts.push(params); return { rowCount: 1 }; }
                    throw new Error(`unexpected SQL: ${sql}`);
                }),
            };
        }),
    };
    return { pool, recurring, transactions };
}

const row = (over = {}) => ({
    id: 'r1', user_id: 'u1', category_id: 'c1', type: 'expense', amount: '500',
    description: 'Netflix', notes: null, frequency: 'monthly', day_of_month: 15,
    next_due_date: '2026-01-15', ...over,
});

describe('postRecurringOccurrence', () => {
    test('normal path posts once, dated to the due date, and advances once', async () => {
        const db = fakeDb([row()]);

        await expect(postRecurringOccurrence(db.pool, row())).resolves.toBe('posted');

        expect(db.transactions).toEqual([['u1', 'c1', 'expense', '500', 'Netflix', null, '2026-01-15', 'r1']]); // last: recurring_id links the posting to its item
        expect(db.recurring.get('r1').next_due_date).toBe('2026-02-15');
    });

    test('two concurrent claims of the same occurrence -> exactly one INSERT', async () => {
        const db = fakeDb([row()]);

        const outcomes = await Promise.all([
            postRecurringOccurrence(db.pool, row()),
            postRecurringOccurrence(db.pool, row()),
        ]);

        expect(outcomes.sort()).toEqual(['posted', 'skipped']);
        expect(db.transactions).toHaveLength(1);
        expect(db.recurring.get('r1').next_due_date).toBe('2026-02-15');
    });

    test('a next-date helper throw posts nothing and leaves the date unchanged', async () => {
        const bad = row({ frequency: 'yearly' });
        const db = fakeDb([bad]);

        await expect(postRecurringOccurrence(db.pool, bad)).rejects.toThrow(/Unsupported/);

        expect(db.transactions).toHaveLength(0);
        expect(db.recurring.get('r1').next_due_date).toBe('2026-01-15');
        expect(db.pool.connect).not.toHaveBeenCalled();
    });

    test('an INSERT failure rolls back and releases the client', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                if (/^INSERT/.test(sql.trim())) throw new Error('insert failed');
                return /^UPDATE/.test(sql.trim()) ? { rowCount: 1 } : {};
            }),
            release: jest.fn(),
        };
        const pool = { connect: jest.fn(async () => client) };

        await expect(postRecurringOccurrence(pool, row())).rejects.toThrow('insert failed');

        const verbs = client.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0]);
        expect(verbs).toEqual(['BEGIN', 'UPDATE', 'INSERT', 'ROLLBACK']);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('a pg DATE value is claimed and posted as its calendar date', async () => {
        const db = fakeDb([row()]);
        await postRecurringOccurrence(db.pool, row({ next_due_date: new Date(2026, 0, 15) }));
        expect(db.transactions[0][6]).toBe('2026-01-15');
        expect(db.recurring.get('r1').next_due_date).toBe('2026-02-15');
    });
});

describe('postDueRecurring', () => {
    test('counts processed/skipped/failed and keeps going past a bad row', async () => {
        const rows = [row({ id: 'a' }), row({ id: 'bad', frequency: 'yearly' }), row({ id: 'gone' })];
        const db = fakeDb([row({ id: 'a' }), row({ id: 'bad', frequency: 'yearly' })]); // 'gone' no longer matches
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const result = await postDueRecurring(db.pool, rows, '[Test]');

        expect(result).toEqual({ processed: 1, skipped: 1, failed: 1, created: ['Netflix'] });
        expect(db.transactions).toHaveLength(1);
        expect(errSpy).toHaveBeenCalledWith('[Test] Failed to process recurring bad (Netflix):', expect.stringMatching(/Unsupported/));
        errSpy.mockRestore();
    });
});

// index.js starts the server on require, so check the cron's wiring from source.
describe('midnight recurring cron in index.js', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
    const block = src.split('// ─── Cron:').find(b => b.startsWith(' process recurring transactions'));

    test('posts through the shared claim-then-insert helper', () => {
        expect(src).toContain("const { postDueRecurring } = require('./utils/recurringPosting');");
        expect(block).toContain("await postDueRecurring(pool, due.rows, '[Cron]')");
        expect(block).not.toMatch(/INSERT INTO transactions|UPDATE recurring_transactions/);
    });
});
