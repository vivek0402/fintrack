// Pure calculation engine for financial planning projections.
// No DB calls, no network calls, no Express imports — every function here is
// deterministic given its inputs, so it can be unit tested in isolation.

const ANNUAL_SALARY_GROWTH = 0.05; // 5% per year, applied monthly via compounding
const ANNUAL_EXPENSE_INFLATION = 0.055; // 5.5% per year, applied monthly via compounding
const ANNUAL_DEBT_FUND_RETURN = 0.07; // emergency fund + goal fund growth rate
const ANNUAL_EQUITY_FUND_RETURN = 0.12; // SIP/investment growth rate

const DEFAULT_SIMULATION_MONTHS = 60;

function monthlyRateFromAnnual(annualRate) {
    return Math.pow(1 + annualRate, 1 / 12) - 1;
}

const MONTHLY_SALARY_GROWTH_RATE = monthlyRateFromAnnual(ANNUAL_SALARY_GROWTH);
const MONTHLY_EXPENSE_INFLATION_RATE = monthlyRateFromAnnual(ANNUAL_EXPENSE_INFLATION);
const MONTHLY_DEBT_FUND_RATE = monthlyRateFromAnnual(ANNUAL_DEBT_FUND_RETURN);
const MONTHLY_EQUITY_FUND_RATE = monthlyRateFromAnnual(ANNUAL_EQUITY_FUND_RETURN);

const RISK_STRATEGY_SPLITS = {
    safety: { emergencyFund: 1, sip: 0 },
    balanced: { emergencyFund: 0.5, sip: 0.5 },
    growth: { emergencyFund: 0.3, sip: 0.7 },
};

/**
 * Standard reducing-balance EMI formula.
 * @param {number} principal - loan principal
 * @param {number} annualRatePct - annual interest rate as a percentage (e.g. 9.5)
 * @param {number} tenureMonths - tenure in months
 * @returns {number} monthly EMI rounded to the nearest rupee
 */
function calculateEMI(principal, annualRatePct, tenureMonths) {
    const monthlyRate = annualRatePct / 12 / 100;
    if (monthlyRate === 0) {
        return Math.round(principal / tenureMonths);
    }
    const factor = Math.pow(1 + monthlyRate, tenureMonths);
    const emi = (principal * monthlyRate * factor) / (factor - 1);
    return Math.round(emi);
}

/**
 * Sinking-fund / future-value-of-annuity formula: the fixed monthly contribution
 * required to reach a target future value by a given month, with monthly compounding.
 * @param {number} targetAmount - the future value goal
 * @param {number} annualRatePct - annual interest rate as a percentage
 * @param {number} months - number of months to reach the target
 * @returns {number} required monthly contribution rounded to the nearest rupee
 */
function calculateGoalContribution(targetAmount, annualRatePct, months) {
    const monthlyRate = annualRatePct / 12 / 100;
    if (monthlyRate === 0) {
        return Math.round(targetAmount / months);
    }
    const factor = Math.pow(1 + monthlyRate, months);
    const contribution = (targetAmount * monthlyRate) / (factor - 1);
    return Math.round(contribution);
}

function sumFixedExpenses(fixedExpenses) {
    return fixedExpenses.reduce((total, item) => total + item.amount, 0);
}

/**
 * Runs a month-by-month projection of income, expenses, loan/goal contributions,
 * emergency fund, goal fund and SIP balances, and net worth.
 * @param {object} input
 * @param {number} input.monthlyIncome
 * @param {Array<{name: string, amount: number}>} input.fixedExpenses
 * @param {number} input.emergencyFundTarget
 * @param {number} input.emergencyFundCurrent
 * @param {{name: string, targetAmount: number, targetMonths: number}} [input.goal]
 * @param {{principal: number, annualRatePct: number, tenureMonths: number, moratoriumMonths: number}} [input.loan]
 * @param {'safety'|'balanced'|'growth'} input.riskStrategy
 * @param {number} [input.simulationMonths]
 * @returns {{rows: Array<object>, emergencyFundReachedMonth: number|null, goalReachedMonth: number|null}}
 */
function simulateFinancialPlan(input) {
    const {
        monthlyIncome,
        fixedExpenses = [],
        emergencyFundTarget,
        emergencyFundCurrent = 0,
        goal = null,
        loan = null,
        riskStrategy,
        simulationMonths = DEFAULT_SIMULATION_MONTHS,
    } = input;

    const split = RISK_STRATEGY_SPLITS[riskStrategy];
    const baseFixedExpenseTotal = sumFixedExpenses(fixedExpenses);

    const emi = loan ? calculateEMI(loan.principal, loan.annualRatePct, loan.tenureMonths) : 0;
    const loanMonthlyRate = loan ? loan.annualRatePct / 12 / 100 : 0;
    const moratoriumMonths = loan && loan.moratoriumMonths ? loan.moratoriumMonths : 0;

    const goalContribution = goal
        ? calculateGoalContribution(goal.targetAmount, ANNUAL_DEBT_FUND_RETURN * 100, goal.targetMonths)
        : 0;

    let emergencyFundBalance = emergencyFundCurrent;
    let goalBalance = 0;
    let sipBalance = 0;
    let loanOutstanding = loan ? loan.principal : 0;

    let emergencyFundReachedMonth = null;
    let goalReachedMonth = null;

    const rows = [];

    for (let month = 1; month <= simulationMonths; month++) {
        const income = monthlyIncome * Math.pow(1 + MONTHLY_SALARY_GROWTH_RATE, month - 1);
        const fixedExpensesThisMonth = baseFixedExpenseTotal * Math.pow(1 + MONTHLY_EXPENSE_INFLATION_RATE, month - 1);

        // Loan payment for this month: interest-only during moratorium, full EMI after.
        let loanPayment = 0;
        let interestComponent = 0;
        let principalComponent = 0;
        if (loan && loanOutstanding > 0) {
            interestComponent = loanOutstanding * loanMonthlyRate;
            if (month <= moratoriumMonths) {
                loanPayment = interestComponent;
                principalComponent = 0;
            } else {
                loanPayment = emi;
                principalComponent = Math.min(emi - interestComponent, loanOutstanding);
                if (principalComponent < 0) principalComponent = 0;
            }
        }

        const goalActive = goal && month <= goal.targetMonths;
        const goalPayment = goalActive ? goalContribution : 0;

        const mandatoryOutflow = fixedExpensesThisMonth + loanPayment + goalPayment;
        let deficit = false;
        let surplus = income - mandatoryOutflow;

        if (surplus < 0) {
            deficit = true;
            surplus = 0;
        }

        const emergencyFundAlreadyFull = emergencyFundBalance >= emergencyFundTarget;

        let emergencyFundContribution = 0;
        let sipContribution = 0;

        if (emergencyFundAlreadyFull) {
            sipContribution = surplus;
        } else {
            emergencyFundContribution = surplus * split.emergencyFund;
            sipContribution = surplus * split.sip;

            if (emergencyFundBalance + emergencyFundContribution > emergencyFundTarget) {
                const overflow = emergencyFundBalance + emergencyFundContribution - emergencyFundTarget;
                emergencyFundContribution -= overflow;
                sipContribution += overflow;
            }
        }

        // Grow balances for the month, then add this month's contributions/payments.
        emergencyFundBalance = emergencyFundBalance * (1 + MONTHLY_DEBT_FUND_RATE) + emergencyFundContribution;
        sipBalance = sipBalance * (1 + MONTHLY_EQUITY_FUND_RATE) + sipContribution;
        if (goal) {
            goalBalance = goalBalance * (1 + MONTHLY_DEBT_FUND_RATE) + goalPayment;
        }
        if (loan) {
            loanOutstanding = Math.max(loanOutstanding - principalComponent, 0);
        }

        if (emergencyFundReachedMonth === null && emergencyFundBalance >= emergencyFundTarget) {
            emergencyFundReachedMonth = month;
        }
        if (goal && goalReachedMonth === null && goalBalance >= goal.targetAmount) {
            goalReachedMonth = month;
        }

        const netWorth = emergencyFundBalance + goalBalance + sipBalance - loanOutstanding;

        rows.push({
            month,
            income: Math.round(income),
            fixedExpenses: Math.round(fixedExpensesThisMonth),
            loanPayment: Math.round(loanPayment),
            goalPayment: Math.round(goalPayment),
            surplus: Math.round(surplus),
            emergencyFundContribution: Math.round(emergencyFundContribution),
            sipContribution: Math.round(sipContribution),
            emergencyFundBalance: Math.round(emergencyFundBalance),
            goalBalance: Math.round(goalBalance),
            sipBalance: Math.round(sipBalance),
            loanOutstanding: Math.round(loanOutstanding),
            netWorth: Math.round(netWorth),
            deficit,
        });
    }

    return {
        rows,
        emergencyFundReachedMonth,
        goalReachedMonth,
    };
}

/**
 * Picks out the year-1 through year-5 (or fewer) rows from a simulation, for a
 * year-by-year summary table.
 * @param {Array<object>} rows - the rows array from simulateFinancialPlan
 * @returns {Array<object>}
 */
function getFiveYearSummary(rows) {
    const yearEndMonths = [12, 24, 36, 48, 60];
    return yearEndMonths
        .filter(m => m <= rows.length)
        .map(m => rows[m - 1]);
}

module.exports = {
    calculateEMI,
    calculateGoalContribution,
    simulateFinancialPlan,
    getFiveYearSummary,
    ANNUAL_SALARY_GROWTH,
    ANNUAL_EXPENSE_INFLATION,
    ANNUAL_DEBT_FUND_RETURN,
    ANNUAL_EQUITY_FUND_RETURN,
};
