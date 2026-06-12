const TRANSACTION_TYPES = ['income', 'expense'];
const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly'];

const isPositiveNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0;
};

const isValidDateString = (value) => {
    if (typeof value !== 'string') return false;
    return /^\d{4}-\d{2}-\d{2}/.test(value) && !isNaN(new Date(value).getTime());
};

const isValidTransactionType = (value) => TRANSACTION_TYPES.includes(value);

const isValidRecurringFrequency = (value) => RECURRING_FREQUENCIES.includes(value);

module.exports = {
    TRANSACTION_TYPES,
    RECURRING_FREQUENCIES,
    isPositiveNumber,
    isValidDateString,
    isValidTransactionType,
    isValidRecurringFrequency,
};
