// Indian income tax slab configuration, keyed by financial year.
// Add a new entry here each Budget year rather than touching computation logic.
const TAX_CONFIG = {
    '2024-25': {
        old: {
            standard_deduction: 50000,
            rebate_threshold: 500000, // 87A: taxable income <= this => rebate
            rebate_max: 12500,
            slabs: [
                { upto: 250000, rate: 0 },
                { upto: 500000, rate: 0.05 },
                { upto: 1000000, rate: 0.20 },
                { upto: Infinity, rate: 0.30 },
            ],
        },
        new: {
            standard_deduction: 75000,
            rebate_threshold: 700000, // 87A: taxable income <= this => rebate
            rebate_max: 25000,
            slabs: [
                { upto: 300000, rate: 0 },
                { upto: 700000, rate: 0.05 },
                { upto: 1000000, rate: 0.10 },
                { upto: 1200000, rate: 0.15 },
                { upto: 1500000, rate: 0.20 },
                { upto: Infinity, rate: 0.30 },
            ],
        },
    },
};

const CESS_RATE = 0.04;

// Falls back to the latest configured FY if the given one isn't present.
function getTaxConfig(financial_year) {
    if (TAX_CONFIG[financial_year]) return TAX_CONFIG[financial_year];
    const latest = Object.keys(TAX_CONFIG).sort().pop();
    return TAX_CONFIG[latest];
}

// Applies a marginal-rate slab table to a taxable income amount.
function applySlabTax(taxableIncome, slabs) {
    let tax = 0;
    let lastCap = 0;
    for (const slab of slabs) {
        if (taxableIncome <= lastCap) break;
        const taxableInSlab = Math.min(taxableIncome, slab.upto) - lastCap;
        tax += taxableInSlab * slab.rate;
        lastCap = slab.upto;
    }
    return tax;
}

// Computes tax + cess for one regime, given the taxable income (after all deductions).
// Returns { taxable_income, tax_before_rebate, rebate, tax_after_rebate, cess, total }.
function computeRegimeTax(taxableIncome, regime, financial_year) {
    const config = getTaxConfig(financial_year)[regime];
    const income = Math.max(0, taxableIncome);

    const tax_before_rebate = applySlabTax(income, config.slabs);
    let rebate = 0;
    if (income <= config.rebate_threshold) {
        rebate = Math.min(tax_before_rebate, config.rebate_max);
    }
    const tax_after_rebate = Math.max(0, tax_before_rebate - rebate);
    const cess = tax_after_rebate * CESS_RATE;
    const total = tax_after_rebate + cess;

    return {
        taxable_income: income,
        tax_before_rebate,
        rebate,
        tax_after_rebate,
        cess,
        total,
    };
}

module.exports = {
    TAX_CONFIG,
    getTaxConfig,
    computeRegimeTax,
};
