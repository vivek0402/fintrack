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

const { buildDailyBriefPoints } = require('../src/routes/ai');

function baseData(overrides = {}) {
    return {
        yesterday: { total: 0, count: 0, top_category: null },
        today_so_far: { total: 0, count: 0 },
        bills_due_soon: { count: 0, total: 0 },
        pace: { ideal_daily_budget: 2204, avg_daily_so_far: 1266 },
        logging_streak: 0,
        top_opportunities: [],
        comparisons: {
            vs_same_weekday_last_week: { current: 0, previous: 0, delta: 0 },
            week_to_date_vs_prior_week: { current: 0, previous: 0, delta: 0, days_elapsed: 1 },
            month_to_date_vs_trailing_avg: null,
        },
        risk_flags: [],
        ...overrides,
    };
}

function findPoint(points, key) {
    return points.find(p => p.key === key);
}

describe('buildDailyBriefPoints — heads_up', () => {
    test('reads "Nothing urgent" when there are no bills or risk flags', () => {
        const headsUp = findPoint(buildDailyBriefPoints(baseData()), 'heads_up');
        expect(headsUp.label).toBe('Heads up');
        expect(headsUp.value).toBe('Nothing urgent');
        expect(headsUp.insight).toBe('No spending or budget risks detected right now');
    });

    test('a due bill wins over a risk flag', () => {
        const data = baseData({
            bills_due_soon: { count: 2, total: 5000 },
            risk_flags: [{ type: 'spending_spike', title: 'Dining spend spiked', description: 'Dining is up this month.' }],
        });
        const headsUp = findPoint(buildDailyBriefPoints(data), 'heads_up');
        expect(headsUp.value).toBe('2 bills due (₹5,000)');
        expect(headsUp.insight).toBe('2 bills due in the next 2 days');
    });

    test('a risk flag surfaces when there is no due bill, in plain language', () => {
        const data = baseData({
            risk_flags: [{ type: 'spending_spike', category: 'Dining', title: 'Dining spend is 40% above your 3-month average', description: 'Last month you spent more on dining.' }],
        });
        const headsUp = findPoint(buildDailyBriefPoints(data), 'heads_up');
        expect(headsUp.value).toBe('Dining spend is higher than usual');
        expect(headsUp.insight).toBe('Dining spend came in higher than your usual amount this month.');
    });

    test('a forecast warning reads as plain language, not percentages', () => {
        const data = baseData({
            risk_flags: [{ type: 'forecast_budget_warning', over_pct: 35, title: 'On track to overspend your budget by 35% this month', description: 'At your current pace you will overspend.' }],
        });
        const headsUp = findPoint(buildDailyBriefPoints(data), 'heads_up');
        expect(headsUp.value).toBe('Trending over budget this month');
        expect(headsUp.insight).toBe("At your current pace, you're on track to spend more than your budget this month.");
    });

    test('a severe forecast warning takes priority over a spending spike, matching the action-box priority', () => {
        const data = baseData({
            risk_flags: [
                { type: 'spending_spike', category: 'Dining', title: 'spike title', description: 'spike description' },
                { type: 'forecast_budget_warning', over_pct: 35, title: 'forecast title', description: 'forecast description' },
            ],
        });
        const headsUp = findPoint(buildDailyBriefPoints(data), 'heads_up');
        expect(headsUp.value).toBe('Trending over budget this month');
    });
});

describe('buildDailyBriefPoints — today_status', () => {
    test('reads "left today" when running under budget', () => {
        const todayStatus = findPoint(buildDailyBriefPoints(baseData()), 'today_status');
        expect(todayStatus.label).toBe('Budget');
        expect(todayStatus.value).toBe('₹938 left today');
        expect(todayStatus.insight).toBe('Running ₹938 under your ₹2,204/day budget');
    });

    test('reads "over today" when running over budget', () => {
        const data = baseData({ pace: { ideal_daily_budget: 1000, avg_daily_so_far: 1500 } });
        const todayStatus = findPoint(buildDailyBriefPoints(data), 'today_status');
        expect(todayStatus.value).toBe('₹500 over today');
        expect(todayStatus.insight).toBe('Running ₹500 over your ₹1,000/day budget');
    });

    test('prompts for income when there is no ideal daily budget yet', () => {
        const data = baseData({ pace: { ideal_daily_budget: 0, avg_daily_so_far: 0 } });
        const todayStatus = findPoint(buildDailyBriefPoints(data), 'today_status');
        expect(todayStatus.value).toBe('Add income to see your daily budget');
    });
});
