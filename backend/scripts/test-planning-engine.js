// Manual sanity-check script for the planning engine. No server, no DB —
// requires planningEngine.js directly and prints results for hand verification.
// Run with: node backend/scripts/test-planning-engine.js

const { calculateEMI, simulateFinancialPlan, getFiveYearSummary } = require('../src/services/planningEngine');

function printScenario(label, result, { loan } = {}) {
    console.log(`\n=== ${label} ===`);
    if (loan) {
        const emi = calculateEMI(loan.principal, loan.annualRatePct, loan.tenureMonths);
        console.log(`EMI: Rs.${emi.toLocaleString('en-IN')}`);
    }

    const month1 = result.rows[0];
    console.log(`Month 1 surplus: Rs.${month1.surplus.toLocaleString('en-IN')}`);
    console.log(`Month 1 -> Emergency Fund: Rs.${month1.emergencyFundContribution.toLocaleString('en-IN')}, SIP: Rs.${month1.sipContribution.toLocaleString('en-IN')}`);

    console.log(`Emergency fund target reached at month: ${result.emergencyFundReachedMonth}`);
    console.log(`Goal target reached at month: ${result.goalReachedMonth}`);

    const summary = getFiveYearSummary(result.rows);
    const year5 = summary[summary.length - 1];
    if (year5) {
        console.log(`Year-5 (month ${year5.month}) net worth: Rs.${year5.netWorth.toLocaleString('en-IN')}`);
    }
}

// Scenario 1: income + fixed expenses + emergency fund goal, balanced strategy, no loan, no goal.
const scenario1 = simulateFinancialPlan({
    monthlyIncome: 80000,
    fixedExpenses: [
        { name: 'Rent', amount: 20000 },
        { name: 'Groceries', amount: 8000 },
        { name: 'Utilities', amount: 3000 },
    ],
    emergencyFundTarget: 200000,
    emergencyFundCurrent: 20000,
    riskStrategy: 'balanced',
    simulationMonths: 60,
});
printScenario('Scenario 1: Income + Expenses + Emergency Fund (balanced)', scenario1);

// Scenario 2: same as above but with a goal (e.g. vacation fund) added.
const scenario2 = simulateFinancialPlan({
    monthlyIncome: 80000,
    fixedExpenses: [
        { name: 'Rent', amount: 20000 },
        { name: 'Groceries', amount: 8000 },
        { name: 'Utilities', amount: 3000 },
    ],
    emergencyFundTarget: 200000,
    emergencyFundCurrent: 20000,
    goal: { name: 'Vacation', targetAmount: 150000, targetMonths: 24 },
    riskStrategy: 'growth',
    simulationMonths: 60,
});
printScenario('Scenario 2: Income + Expenses + Emergency Fund + Goal (growth)', scenario2);

// Scenario 3: adds a home loan with a 6-month moratorium.
const scenario3 = simulateFinancialPlan({
    monthlyIncome: 120000,
    fixedExpenses: [
        { name: 'Rent', amount: 15000 },
        { name: 'Groceries', amount: 10000 },
        { name: 'Utilities', amount: 4000 },
    ],
    emergencyFundTarget: 300000,
    emergencyFundCurrent: 50000,
    loan: { principal: 3000000, annualRatePct: 9, tenureMonths: 240, moratoriumMonths: 6 },
    riskStrategy: 'safety',
    simulationMonths: 60,
});
printScenario('Scenario 3: Income + Expenses + Emergency Fund + Loan w/ 6mo moratorium (safety)', scenario3, { loan: scenario3 && { principal: 3000000, annualRatePct: 9, tenureMonths: 240 } });
