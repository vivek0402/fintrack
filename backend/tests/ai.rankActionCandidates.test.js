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

const { rankActionCandidates } = require('../src/routes/ai');

function baseData(overrides = {}) {
    return {
        bills_due_soon: { count: 0, total: 0 },
        risk_flags: [],
        top_opportunities: [],
        pace: { ideal_daily_budget: 2204, avg_daily_so_far: 1266 },
        logging_streak: 5,
        ...overrides,
    };
}

describe('rankActionCandidates', () => {
    test('returns null when nothing is urgent (no bills, no risk)', () => {
        expect(rankActionCandidates(baseData())).toBeNull();
    });

    test('does not fall back to an opportunity plug when nothing urgent exists', () => {
        const data = baseData({
            top_opportunities: [{ title: 'x', description: 'y', priority: 1, action_label: 'Do the thing' }],
        });
        expect(rankActionCandidates(data)).toBeNull();
    });

    test('does not fall back to a logging-streak nudge when nothing urgent exists', () => {
        const data = baseData({ logging_streak: 10 });
        expect(rankActionCandidates(data)).toBeNull();
    });

    test('surfaces a due bill', () => {
        const data = baseData({ bills_due_soon: { count: 1, total: 1200 } });
        expect(rankActionCandidates(data)).toBe(
            'You have 1 bill due soon — make sure funds are set aside.'
        );
    });

    test('surfaces a severe forecast warning', () => {
        const data = baseData({
            risk_flags: [{ type: 'forecast_budget_warning', over_pct: 35, description: 'Forecast says you will overspend.' }],
        });
        expect(rankActionCandidates(data)).toBe('Forecast says you will overspend.');
    });

    test('surfaces a spending spike', () => {
        const data = baseData({
            risk_flags: [{ type: 'spending_spike', pct_above: 50, description: 'Dining spend spiked this month.' }],
        });
        expect(rankActionCandidates(data)).toBe('Dining spend spiked this month.');
    });

    test('surfaces a moderate forecast warning', () => {
        const data = baseData({
            risk_flags: [{ type: 'forecast_budget_warning', over_pct: 20, description: 'Trending a bit over budget.' }],
        });
        expect(rankActionCandidates(data)).toBe('Trending a bit over budget.');
    });

    test('a due bill outranks a severe forecast warning', () => {
        const data = baseData({
            bills_due_soon: { count: 1, total: 200 },
            risk_flags: [{ type: 'forecast_budget_warning', over_pct: 35, description: 'Forecast says you will overspend.' }],
        });
        expect(rankActionCandidates(data)).toBe(
            'You have 1 bill due soon — make sure funds are set aside.'
        );
    });
});
