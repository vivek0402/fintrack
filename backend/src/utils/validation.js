const TRANSACTION_TYPES = ['income', 'expense'];
const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly'];
const INVESTMENT_TYPES = ['mutual_fund', 'stock', 'fd', 'ppf', 'nps', 'gold', 'crypto', 'other'];
const LOAN_TYPES = ['home_loan', 'car_loan', 'personal_loan', 'education_loan', 'gold_loan', 'business_loan', 'other'];
const PERSONAL_LOAN_DIRECTIONS = ['lent', 'borrowed'];
const PERSONAL_LOAN_INTEREST_TYPES = ['none', 'flat', 'percent_per_month'];
const RISK_PROFILES = ['safety', 'balanced', 'growth'];

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

const isValidPersonalLoanDirection = (value) => PERSONAL_LOAN_DIRECTIONS.includes(value);

const isValidPersonalLoanInterestType = (value) => PERSONAL_LOAN_INTEREST_TYPES.includes(value);

const isValidRiskProfile = (value) => RISK_PROFILES.includes(value);

module.exports = {
    TRANSACTION_TYPES,
    RECURRING_FREQUENCIES,
    INVESTMENT_TYPES,
    LOAN_TYPES,
    RISK_PROFILES,
    isValidRiskProfile,
    isPositiveNumber,
    isNonNegativeNumber,
    isValidDateString,
    isValidTransactionType,
    isValidRecurringFrequency,
    isValidInvestmentType,
    isValidLoanType,
    PERSONAL_LOAN_DIRECTIONS,
    PERSONAL_LOAN_INTEREST_TYPES,
    isValidPersonalLoanDirection,
    isValidPersonalLoanInterestType,
};

