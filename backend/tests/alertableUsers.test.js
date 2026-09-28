const fs = require('fs');
const path = require('path');
const { fetchAlertableUserIds, ALERTABLE_USER_IDS_SQL, ACTIVE_WINDOW_DAYS } = require('../src/utils/alertableUsers');

describe('fetchAlertableUserIds', () => {
    test('runs the shared query with no bind parameters and returns plain ids', async () => {
        const pool = { query: jest.fn(async () => ({ rows: [{ id: 'u1' }, { id: 'u2' }] })) };

        await expect(fetchAlertableUserIds(pool)).resolves.toEqual(['u1', 'u2']);

        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(pool.query.mock.calls[0]).toEqual([ALERTABLE_USER_IDS_SQL]);
    });

    test('returns an empty list when nobody qualifies', async () => {
        const pool = { query: jest.fn(async () => ({ rows: [] })) };
        await expect(fetchAlertableUserIds(pool)).resolves.toEqual([]);
    });

    test('propagates query errors so the cron logs them as fatal', async () => {
        const pool = { query: jest.fn(async () => { throw new Error('db down'); }) };
        await expect(fetchAlertableUserIds(pool)).rejects.toThrow('db down');
    });
});

describe('ALERTABLE_USER_IDS_SQL', () => {
    const sql = ALERTABLE_USER_IDS_SQL.replace(/\s+/g, ' ');

    test('selects user ids from users, one row per user', () => {
        expect(sql).toMatch(/^ SELECT u\.id FROM users u WHERE /);
        expect(sql).not.toMatch(/JOIN/);
    });

    test('keeps every user with a push token (no regression for Android users)', () => {
        expect(sql).toContain('EXISTS (SELECT 1 FROM user_fcm_tokens ft WHERE ft.user_id = u.id)');
    });

    test('adds users with a recent transaction or a recent sign-in, bounded to 60 days', () => {
        expect(ACTIVE_WINDOW_DAYS).toBe(60);
        expect(sql).toContain("FROM transactions t WHERE t.user_id = u.id AND t.created_at > NOW() - INTERVAL '60 days'");
        expect(sql).toContain("FROM refresh_tokens rt WHERE rt.user_id = u.id AND rt.created_at > NOW() - INTERVAL '60 days'");
        expect(sql.match(/ OR EXISTS /g)).toHaveLength(2);
    });

    test('has no bind parameters, so it can be embedded as a subquery', () => {
        expect(sql).not.toMatch(/\$\d/);
    });
});

// index.js starts the server and schedules crons on require, so check the
// wiring from its source instead: every per-user alert cron must pick users
// through the shared helper, and only the two push-only nudges may still
// select straight from user_fcm_tokens.
describe('cron wiring in index.js', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
    const cronBlocks = src.split('// ─── Cron:').slice(1).map(b => ({ title: b.split('\n')[0], body: b }));
    const block = (fragment) => {
        const found = cronBlocks.find(b => b.title.includes(fragment));
        if (!found) throw new Error(`no cron titled like "${fragment}"`);
        return found.body;
    };

    test.each([
        'bill-due reminders', 'weekly spending summary', 'month-end budget check', 'mid-month spending',
        'credit card bill due', 'salary not received', 'upcoming bills total', 'weekend spending spike',
        'day-of-week spending pattern',
    ])('%s loops over fetchAlertableUserIds', (fragment) => {
        const body = block(fragment);
        expect(body).toContain('const userIds = await fetchAlertableUserIds(pool);');
        expect(body).toContain('for (const user_id of userIds) {');
        expect(body).not.toContain('user_fcm_tokens');
    });

    test.each(['goal deadline approaching', 'personal loan due date', 'no goal contributions'])(
        '%s filters its rows by the shared alertable-users subquery', (fragment) => {
            const body = block(fragment);
            expect(body).toMatch(/\.user_id IN \(\$\{ALERTABLE_USER_IDS_SQL\}\)/);
            expect(body).not.toContain('user_fcm_tokens');
        });

    test('only the push-only nudges still select from user_fcm_tokens', () => {
        const direct = cronBlocks.filter(b => b.body.includes('FROM user_fcm_tokens')).map(b => b.title.trim());
        expect(direct).toHaveLength(2);
        expect(direct[0]).toMatch(/8pm daily reminder/);
        expect(direct[1]).toMatch(/inactivity reminder/);
    });
});
