const { RISK_STRATEGY_SPLITS } = require('../src/services/planningEngine');

describe('planningEngine.RISK_STRATEGY_SPLITS', () => {
    test('is exported with exactly the safety/balanced/growth keys', () => {
        expect(Object.keys(RISK_STRATEGY_SPLITS).sort()).toEqual(['balanced', 'growth', 'safety']);
    });

    test.each(['safety', 'balanced', 'growth'])('%s split sums emergencyFund + sip to 1', (profile) => {
        const split = RISK_STRATEGY_SPLITS[profile];
        expect(split.emergencyFund + split.sip).toBeCloseTo(1);
    });
});
