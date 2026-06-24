// Single source of truth for fund names shown anywhere in the app.
// Hand-curated, hardcoded, opinionated by design — this is not a live
// recommendation feed. Update this list (and only this list) to change
// which funds the app points users toward.

const PLAN_TYPE = 'Direct, Growth';

const FUND_CATALOG = {
    liquidEmergencyFund: [
        {
            name: 'Parag Parikh Liquid Fund',
            planType: PLAN_TYPE,
            platform: 'Zerodha Coin',
            reason: 'A liquid fund keeps emergency money safe and accessible within a day, instead of locked up or exposed to market swings.',
        },
    ],
    elssTaxSaver: [
        {
            name: 'Mirae Asset ELSS Tax Saver Fund',
            planType: PLAN_TYPE,
            platform: 'Zerodha Coin',
            reason: 'An ELSS fund grows long-term wealth in equity while also claiming the Section 80C tax deduction on the same investment.',
        },
    ],
    broadMarketIndex: [
        {
            name: 'UTI Nifty 50 Index Fund',
            planType: PLAN_TYPE,
            platform: 'Zerodha Coin',
            reason: 'A broad Nifty 50 index fund gives low-cost exposure to India\'s largest companies without betting on any single stock or fund manager.',
        },
    ],
    secondaryIndex: [
        {
            name: 'UTI Nifty Next 50 Index Fund',
            planType: PLAN_TYPE,
            platform: 'Zerodha Coin',
            reason: 'A Nifty Next 50 fund adds the next tier of large companies, diversifying growth beyond the top 50 names.',
        },
    ],
    goalFund: [
        {
            name: 'ICICI Prudential Liquid Fund',
            planType: PLAN_TYPE,
            platform: 'Zerodha Coin',
            reason: 'A separate liquid fund keeps a specific savings goal walled off from the emergency fund so the two never get mixed up.',
        },
    ],
};

// Deterministic role -> fund selection for a given plan. "Safety" risk
// profiles skip the secondary index sleeve (kept to a single core equity
// fund); the goal fund role only applies when the plan actually has a goal.
function getFundsForPlan(plan) {
    const funds = [];
    const addRole = (role) => FUND_CATALOG[role].forEach(f => funds.push({ ...f, role }));

    addRole('liquidEmergencyFund');
    addRole('elssTaxSaver');
    addRole('broadMarketIndex');
    if (plan.risk_profile !== 'safety') {
        addRole('secondaryIndex');
    }
    if (plan.goal_amount !== null && plan.goal_amount !== undefined) {
        addRole('goalFund');
    }
    return funds;
}

module.exports = { FUND_CATALOG, PLAN_TYPE, getFundsForPlan };
