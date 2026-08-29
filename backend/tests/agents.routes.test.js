process.env.JWT_SECRET = 'test-secret';
// agents.js requires utils/ai.js, which builds a Groq client at require time
// and throws without a key. These tests never reach a model call.
process.env.GROQ_API_KEY = 'test-groq-key';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
});

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const agentsRouter = require('../src/routes/agents');

const app = express();
app.use(express.json());
app.use('/api/agents', agentsRouter);

afterEach(() => { pool.query.mockReset(); });

// Conversation CRUD for the AI Advisor. Worth covering despite the file being
// mostly prompt construction, because these three routes decide who can read
// and delete whose chat history.
//
// Note the shape: unlike most routes in this codebase, /conversations/:id and
// DELETE fetch the row by id alone and compare `user_id` in JavaScript, rather
// than scoping the SQL with `AND user_id = $2`. That works, but it means the
// ownership check is a single `if` with no SQL-level backstop -- delete the
// line and another user's conversation is served with a 200. These tests are
// that backstop.

const conversation = (over = {}) => ({
    id: 'conv-1',
    user_id: 'user-123',
    agent_type: 'debt_coach',
    title: 'Loan payoff',
    messages: [{ role: 'user', content: 'hi' }],
    ...over,
});

describe('GET /conversations', () => {
    it('lists the caller\'s conversations, newest first', async () => {
        pool.query.mockResolvedValueOnce({ rows: [conversation()] });
        const res = await request(app).get('/api/agents/conversations');

        expect(res.status).toBe(200);
        expect(res.body.conversations).toHaveLength(1);

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/user_id = \$1/);
        expect(sql).toMatch(/ORDER BY updated_at DESC/);
        expect(params).toEqual(['user-123']);
    });

    it('filters by agent_type when asked', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await request(app).get('/api/agents/conversations?agent_type=debt_coach');

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/agent_type = \$2/);
        expect(params).toEqual(['user-123', 'debt_coach']);
    });

    it('rejects an unknown agent_type instead of querying with it', async () => {
        const res = await request(app).get('/api/agents/conversations?agent_type=hacker');

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/agent_type/i);
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('still scopes to the user when no filter is given', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await request(app).get('/api/agents/conversations');
        expect(pool.query.mock.calls[0][1]).toEqual(['user-123']);
    });
});

describe('GET /conversations/:id', () => {
    it('returns a conversation the caller owns', async () => {
        pool.query.mockResolvedValueOnce({ rows: [conversation()] });
        const res = await request(app).get('/api/agents/conversations/conv-1');

        expect(res.status).toBe(200);
        expect(res.body.conversation.id).toBe('conv-1');
    });

    it('404s when there is no such conversation', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = await request(app).get('/api/agents/conversations/nope');

        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });

    it('403s on someone else\'s conversation and does not leak its contents', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [conversation({ user_id: 'someone-else', title: 'Their private chat' })],
        });
        const res = await request(app).get('/api/agents/conversations/conv-1');

        expect(res.status).toBe(403);
        expect(res.body.conversation).toBeUndefined();
        // The row was fetched before the check, so the response body is the
        // only thing standing between another user's chat and this caller.
        expect(JSON.stringify(res.body)).not.toMatch(/Their private chat/);
    });

    it('distinguishes "not yours" from "does not exist"', async () => {
        // A 404 for someone else's row would leak whether an id exists; a 403
        // for a missing one would be misleading. Both codes are deliberate.
        pool.query.mockResolvedValueOnce({ rows: [conversation({ user_id: 'other' })] });
        const forbidden = await request(app).get('/api/agents/conversations/conv-1');

        pool.query.mockReset();
        pool.query.mockResolvedValueOnce({ rows: [] });
        const missing = await request(app).get('/api/agents/conversations/conv-9');

        expect(forbidden.status).toBe(403);
        expect(missing.status).toBe(404);
    });
});

describe('DELETE /conversations/:id', () => {
    it('deletes a conversation the caller owns', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ user_id: 'user-123' }] })  // ownership probe
            .mockResolvedValueOnce({ rowCount: 1 });                      // the delete
        const res = await request(app).delete('/api/agents/conversations/conv-1');

        expect(res.status).toBe(200);
        expect(pool.query).toHaveBeenCalledTimes(2);
        expect(pool.query.mock.calls[1][0]).toMatch(/^DELETE FROM agent_conversations/);
    });

    it('refuses to delete someone else\'s conversation, and issues no DELETE at all', async () => {
        // The important half: not just the 403, but that the destructive query
        // never runs. The DELETE is not itself user-scoped, so reaching it at
        // all would remove another user's data.
        pool.query.mockResolvedValueOnce({ rows: [{ user_id: 'someone-else' }] });
        const res = await request(app).delete('/api/agents/conversations/conv-1');

        expect(res.status).toBe(403);
        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(pool.query.mock.calls.some(([sql]) => /DELETE/i.test(sql))).toBe(false);
    });

    it('404s on a missing conversation without attempting a delete', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = await request(app).delete('/api/agents/conversations/nope');

        expect(res.status).toBe(404);
        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('returns 500 rather than leaking a database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('deadlock detected'));
        const res = await request(app).delete('/api/agents/conversations/conv-1');

        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toMatch(/deadlock/);
    });
});
