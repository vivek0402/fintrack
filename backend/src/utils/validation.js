const TRANSACTION_TYPES = ['income', 'expense'];
const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly'];
const INVESTMENT_TYPES = ['mutual_fund', 'stock', 'fd', 'ppf', 'nps', 'gold', 'crypto', 'other'];
const TAX_INVESTMENT_TYPES = ['ppf', 'elss', 'epf', 'life_insurance', 'nsc', 'tax_saver_fd', 'nps', 'home_loan_principal', 'tuition_fees', 'other'];
const CAPITAL_ASSET_TYPES = ['equity', 'debt', 'gold', 'real_estate', 'other'];
const CAPITAL_TRANSACTION_TYPES = ['buy', 'sell'];
const LOAN_TYPES = ['home_loan', 'car_loan', 'personal_loan', 'education_loan', 'gold_loan', 'business_loan', 'other'];

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

const isValidTaxInvestmentType = (value) => TAX_INVESTMENT_TYPES.includes(value);

const isValidCapitalAssetType = (value) => CAPITAL_ASSET_TYPES.includes(value);

const isValidCapitalTransactionType = (value) => CAPITAL_TRANSACTION_TYPES.includes(value);

const isValidLoanType = (value) => LOAN_TYPES.includes(value);

const isValidFinancialYear = (value) => {
    if (typeof value !== 'string') return false;
    return /^\d{4}-\d{2}$/.test(value);
};

module.exports = {
    TRANSACTION_TYPES,
    RECURRING_FREQUENCIES,
    INVESTMENT_TYPES,
    TAX_INVESTMENT_TYPES,
    CAPITAL_ASSET_TYPES,
    CAPITAL_TRANSACTION_TYPES,
    LOAN_TYPES,
    isPositiveNumber,
    isNonNegativeNumber,
    isValidDateString,
    isValidTransactionType,
    isValidRecurringFrequency,
    isValidInvestmentType,
    isValidTaxInvestmentType,
    isValidFinancialYear,
    isValidCapitalAssetType,
    isValidCapitalTransactionType,
    isValidLoanType,
};
