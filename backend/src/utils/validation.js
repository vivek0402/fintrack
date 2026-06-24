const TRANSACTION_TYPES = ['income', 'expense'];
const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly'];
const INVESTMENT_TYPES = ['mutual_fund', 'stock', 'fd', 'ppf', 'nps', 'gold', 'crypto', 'other'];
const LOAN_TYPES = ['home_loan', 'car_loan', 'personal_loan', 'education_loan', 'gold_loan', 'business_loan', 'other'];
const SCENARIO_TYPES = ['investment_growth', 'loan_impact', 'expense_reduction', 'income_change'];
const RISK_PROFILES = ['safety', 'balanced', 'growth'];
const MILESTONE_STATUSES = ['not_started', 'in_progress', 'achieved', 'missed'];
const DOCUMENT_TYPES = [
    'salary_slip', 'bank_statement', 'insurance_policy', 'investment_proof', 'other',
];

const isPositiveNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0;
};

const isNonNegativeNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) && n >= 0;
};

const isValidDateString = (value) => {
    if (typeof value !== 'string') return false;
    return /^\d{4}-\d{2}-\d{2}/.test(value) && !isNaN(new Date(value).getTime());
};

const isValidTransactionType = (value) => TRANSACTION_TYPES.includes(value);

const isValidRecurringFrequency = (value) => RECURRING_FREQUENCIES.includes(value);

const isValidInvestmentType = (value) => INVESTMENT_TYPES.includes(value);

const isValidLoanType = (value) => LOAN_TYPES.includes(value);

const isValidScenarioType = (value) => SCENARIO_TYPES.includes(value);

const isValidRiskProfile = (value) => RISK_PROFILES.includes(value);

const isValidMilestoneStatus = (value) => MILESTONE_STATUSES.includes(value);

const isValidFinancialYear = (value) => {
    if (typeof value !== 'string') return false;
    return /^\d{4}-\d{2}$/.test(value);
};

const isValidDocumentType = (value) => DOCUMENT_TYPES.includes(value);

module.exports = {
    TRANSACTION_TYPES,
    RECURRING_FREQUENCIES,
    INVESTMENT_TYPES,
    LOAN_TYPES,
    SCENARIO_TYPES,
    MILESTONE_STATUSES,
    DOCUMENT_TYPES,
    RISK_PROFILES,
    isValidRiskProfile,
    isValidScenarioType,
    isValidMilestoneStatus,
    isValidDocumentType,
    isPositiveNumber,
    isNonNegativeNumber,
    isValidDateString,
    isValidTransactionType,
    isValidRecurringFrequency,
    isValidInvestmentType,
    isValidFinancialYear,
    isValidLoanType,
};

