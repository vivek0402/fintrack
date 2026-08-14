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
    aiComplete: jest.fn().mockResolvedValue('Test narrative.'),
    MODELS: {},
    nimClient: {},
}));
jest.mock('../src/utils/fcm', () => ({
    sendToUser: jest.fn(),
    userHasTokens: jest.fn().mockResolvedValue(false),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => next());

const pool = require('../src/db/pool');
const { filterRepeatedRiskFlags } = require('../src/routes/ai');

// Builds a fake daily_briefings history row shaped the way buildDailyBriefPoints
// actually persists it: a 'risk' point whose `raw` field is the unfiltered
// risk_flags array detected that day.
function historyRow(riskFlags) {
    return { points: [{ key: 'risk', raw: riskFlags }] };
}

const rentSpike = { type: 'spending_spike', category: 'Rent', title: 'x', description: 'y' };
const diningSpike = { type: 'spending_spike', category: 'Dining', title: 'x', description: 'y' };
const forecastWarning = { type: 'forecast_budget_warning', over_pct: 35, title: 'x', description: 'y' };

describe('filterRepeatedRiskFlags', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('does not query the database when there are no fresh flags', async () => {
        const result = await filterRepeatedRiskFlags('user-1', [], '2026-08-14');
        expect(result).toEqual([]);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('a brand new flag with no history shows through', async () => {
        pool.query.mockResolvedValue({ rows: [] });
        const result = await filterRepeatedRiskFlags('user-1', [rentSpike], '2026-08-14');
        expect(result).toEqual([rentSpike]);
    });

    test('the same spike shown on the 3 immediately preceding days is suppressed', async () => {
        pool.query.mockResolvedValue({
            rows: [historyRow([rentSpike]), historyRow([rentSpike]), historyRow([rentSpike])],
        });
        const result = await filterRepeatedRiskFlags('user-1', [rentSpike], '2026-08-14');
        expect(result).toEqual([]);
    });

    test('a streak broken on the 3rd day back still shows (only shown 2 of 3 days)', async () => {
        pool.query.mockResolvedValue({
            // Most recent first: yesterday and the day before had it, the day
            // before that did not -- streak stops counting at 2.
            rows: [historyRow([rentSpike]), historyRow([rentSpike]), historyRow([diningSpike])],
        });
        const result = await filterRepeatedRiskFlags('user-1', [rentSpike], '2026-08-14');
        expect(result).toEqual([rentSpike]);
    });

    test('a different category spike does not count toward the streak', async () => {
        pool.query.mockResolvedValue({
            rows: [historyRow([diningSpike]), historyRow([diningSpike]), historyRow([diningSpike])],
        });
        const result = await filterRepeatedRiskFlags('user-1', [rentSpike], '2026-08-14');
        expect(result).toEqual([rentSpike]);
    });

    test('a forecast warning matches by type alone (no category) and throttles the same way', async () => {
        pool.query.mockResolvedValue({
            rows: [historyRow([forecastWarning]), historyRow([forecastWarning]), historyRow([forecastWarning])],
        });
        const result = await filterRepeatedRiskFlags('user-1', [forecastWarning], '2026-08-14');
        expect(result).toEqual([]);
    });

    test('one flag can be throttled while a second, unrelated flag still shows', async () => {
        pool.query.mockResolvedValue({
            rows: [historyRow([rentSpike]), historyRow([rentSpike]), historyRow([rentSpike])],
        });
        const result = await filterRepeatedRiskFlags('user-1', [rentSpike, forecastWarning], '2026-08-14');
        expect(result).toEqual([forecastWarning]);
    });

    test('queries with the correct user, date bound, and lookback limit', async () => {
        pool.query.mockResolvedValue({ rows: [] });
        await filterRepeatedRiskFlags('user-42', [rentSpike], '2026-08-14');
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/daily_briefings/);
        expect(sql).toMatch(/brief_date\s*<\s*\$2/);
        expect(params).toEqual(['user-42', '2026-08-14', 3]);
    });
});
