const TRANSACTION_TYPES = ['income', 'expense'];
const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly'];
const INVESTMENT_TYPES = ['mutual_fund', 'stock', 'fd', 'ppf', 'nps', 'gold', 'crypto', 'other'];
const TAX_INVESTMENT_TYPES = ['ppf', 'elss', 'epf', 'life_insurance', 'nsc', 'tax_saver_fd', 'nps', 'home_loan_principal', 'tuition_fees', 'other'];
const CAPITAL_ASSET_TYPES = ['equity', 'debt', 'gold', 'real_estate', 'other'];
const CAPITAL_TRANSACTION_TYPES = ['buy', 'sell'];
const LOAN_TYPES = ['home_loan', 'car_loan', 'personal_loan', 'education_loan', 'gold_loan', 'business_loan', 'other'];
const SCENARIO_TYPES = ['investment_growth', 'loan_impact', 'expense_reduction', 'income_change'];
const MILESTONE_STATUSES = ['not_started', 'in_progress', 'achieved', 'missed'];
const CITY_TYPES = ['metro', 'non_metro'];
const TAX_REGIMES = ['old', 'new', 'not_decided'];
const DOCUMENT_TYPES = [
    'form_16', 'itr_copy', 'salary_slip', 'bank_statement', 'insurance_policy',
    'investment_proof', 'advance_tax_challan', 'rent_receipt', 'other',
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

const isValidTaxInvestmentType = (value) => TAX_INVESTMENT_TYPES.includes(value);

const isValidCapitalAssetType = (value) => CAPITAL_ASSET_TYPES.includes(value);

const isValidCapitalTransactionType = (value) => CAPITAL_TRANSACTION_TYPES.includes(value);

const isValidLoanType = (value) => LOAN_TYPES.includes(value);

const isValidScenarioType = (value) => SCENARIO_TYPES.includes(value);

const isValidMilestoneStatus = (value) => MILESTONE_STATUSES.includes(value);

const isValidFinancialYear = (value) => {
    if (typeof value !== 'string') return false;
    return /^\d{4}-\d{2}$/.test(value);
};

const isValidCityType = (value) => CITY_TYPES.includes(value);

const isValidTaxRegime = (value) => TAX_REGIMES.includes(value);

const isValidDocumentType = (value) => DOCUMENT_TYPES.includes(value);

module.exports = {
    TRANSACTION_TYPES,
    RECURRING_FREQUENCIES,
    INVESTMENT_TYPES,
    TAX_INVESTMENT_TYPES,
    CAPITAL_ASSET_TYPES,
    CAPITAL_TRANSACTION_TYPES,
    LOAN_TYPES,
    SCENARIO_TYPES,
    MILESTONE_STATUSES,
    CITY_TYPES,
    TAX_REGIMES,
    DOCUMENT_TYPES,
    isValidScenarioType,
    isValidMilestoneStatus,
    isValidCityType,
    isValidTaxRegime,
    isValidDocumentType,
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

