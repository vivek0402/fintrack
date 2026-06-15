const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const {
    isPositiveNumber,
    isNonNegativeNumber,
    isValidDateString,
    isValidTaxInvestmentType,
    isValidFinancialYear,
    isValidCapitalAssetType,
    isValidCapitalTransactionType,
    isValidCityType,
    isValidTaxRegime,
} = require('../utils/validation');
const { computeRegimeTax } = require('../utils/taxComputation');
const router = express.Router();

router.use(auth);

const SECTION_80C_LIMIT = 150000;

// Indian financial year runs April 1 - March 31.
function getCurrentFY() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed; April = 3

    if (month >= 3) {
        return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
    }
    return `${year - 1}-${String(year % 100).padStart(2, '0')}`;
}

function fyToDateRange(fy) {
    const startYear = parseInt(fy.slice(0, 4), 10);
    return {
        start: `${startYear}-04-01`,
        end: `${startYear + 1}-03-31`,
    };
}

router.get('/profile', async (req, res) => {
    try {
        const fy = req.query.fy && isValidFinancialYear(req.query.fy) ? req.query.fy : getCurrentFY();

        const result = await pool.query(
            'SELECT * FROM tax_profiles WHERE user_id = $1 AND financial_year = $2',
            [req.user.id, fy]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: 'No tax profile found for this financial year. Please complete your salary profile.', financial_year: fy });

        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/profile', async (req, res) => {
    try {
        const {
            financial_year, employer_name, basic_salary_monthly, hra_component_monthly,
            lta_component_annual, special_allowance_monthly, rent_paid_monthly,
            city_type, lta_claims_used_in_block, preferred_regime,
        } = req.body;

        if (basic_salary_monthly === undefined)
            return res.status(400).json({ error: 'basic_salary_monthly is required.' });
        if (!isNonNegativeNumber(basic_salary_monthly))
            return res.status(400).json({ error: 'basic_salary_monthly must be 0 or greater.' });
        if (financial_year && !isValidFinancialYear(financial_year))
            return res.status(400).json({ error: 'financial_year must be in YYYY-YY format.' });
        if (hra_component_monthly !== undefined && !isNonNegativeNumber(hra_component_monthly))
            return res.status(400).json({ error: 'hra_component_monthly must be 0 or greater.' });
        if (lta_component_annual !== undefined && !isNonNegativeNumber(lta_component_annual))
            return res.status(400).json({ error: 'lta_component_annual must be 0 or greater.' });
        if (special_allowance_monthly !== undefined && !isNonNegativeNumber(special_allowance_monthly))
            return res.status(400).json({ error: 'special_allowance_monthly must be 0 or greater.' });
        if (rent_paid_monthly !== undefined && !isNonNegativeNumber(rent_paid_monthly))
            return res.status(400).json({ error: 'rent_paid_monthly must be 0 or greater.' });
        if (city_type !== undefined && !isValidCityType(city_type))
            return res.status(400).json({ error: 'Invalid city_type.' });
        if (lta_claims_used_in_block !== undefined && (!Number.isInteger(lta_claims_used_in_block) || lta_claims_used_in_block < 0 || lta_claims_used_in_block > 2))
            return res.status(400).json({ error: 'lta_claims_used_in_block must be an integer between 0 and 2.' });
        if (preferred_regime !== undefined && !isValidTaxRegime(preferred_regime))
            return res.status(400).json({ error: 'Invalid preferred_regime.' });

        const fy = financial_year || getCurrentFY();

        const result = await pool.query(
            `INSERT INTO tax_profiles (
                user_id, financial_year, employer_name, basic_salary_monthly, hra_component_monthly,
                lta_component_annual, special_allowance_monthly, rent_paid_monthly, city_type,
                lta_claims_used_in_block, preferred_regime
             ) VALUES (
                $1,$2,$3,$4,COALESCE($5,0),COALESCE($6,0),COALESCE($7,0),COALESCE($8,0),
                COALESCE($9,'non_metro'),COALESCE($10,0),COALESCE($11,'not_decided')
             )
             ON CONFLICT (user_id, financial_year) DO UPDATE SET
                employer_name = COALESCE($3, tax_profiles.employer_name),
                basic_salary_monthly = $4,
                hra_component_monthly = COALESCE($5, tax_profiles.hra_component_monthly),
                lta_component_annual = COALESCE($6, tax_profiles.lta_component_annual),
                special_allowance_monthly = COALESCE($7, tax_profiles.special_allowance_monthly),
                rent_paid_monthly = COALESCE($8, tax_profiles.rent_paid_monthly),
                city_type = COALESCE($9, tax_profiles.city_type),
                lta_claims_used_in_block = COALESCE($10, tax_profiles.lta_claims_used_in_block),
                preferred_regime = COALESCE($11, tax_profiles.preferred_regime),
                updated_at = NOW()
             RETURNING *`,
            [
                req.user.id, fy, employer_name || null, basic_salary_monthly,
                hra_component_monthly !== undefined ? hra_component_monthly : null,
                lta_component_annual !== undefined ? lta_component_annual : null,
                special_allowance_monthly !== undefined ? special_allowance_monthly : null,
                rent_paid_monthly !== undefined ? rent_paid_monthly : null,
                city_type || null,
                lta_claims_used_in_block !== undefined ? lta_claims_used_in_block : null,
                preferred_regime || null,
            ]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Shared HRA exemption computation (used by GET /hra and GET /advance-tax).
function computeHraExemption(profile) {
    const basic_salary_monthly = parseFloat(profile.basic_salary_monthly);
    const hra_component_monthly = parseFloat(profile.hra_component_monthly);
    const rent_paid_monthly = parseFloat(profile.rent_paid_monthly);
    const city_type = profile.city_type;

    const annual_basic = basic_salary_monthly * 12;
    const annual_hra_received = hra_component_monthly * 12;
    const annual_rent_paid = rent_paid_monthly * 12;
    const pct = city_type === 'metro' ? 0.50 : 0.40;

    const valueA = annual_hra_received;
    const valueB = annual_basic * pct;
    const valueC = Math.max(0, annual_rent_paid - annual_basic * 0.10);

    const exempt_hra = Math.min(valueA, valueB, valueC);
    const taxable_hra = annual_hra_received - exempt_hra;

    let limiting_factor;
    if (exempt_hra === valueA) limiting_factor = 'actual_hra_received';
    else if (exempt_hra === valueB) limiting_factor = 'percentage_of_basic';
    else limiting_factor = 'rent_paid_minus_10pct_basic';

    let optimization_potential = null;
    if (limiting_factor === 'rent_paid_minus_10pct_basic') {
        const rentNeededAnnualForCToEqualB = annual_basic * 0.10 + valueB;
        const rentNeededMonthly = rentNeededAnnualForCToEqualB / 12;
        const additionalMonthlyRent = rentNeededMonthly - rent_paid_monthly;
        const maxReasonableRentMonthly = basic_salary_monthly * 0.40;
        if (additionalMonthlyRent > 0 && rentNeededMonthly <= maxReasonableRentMonthly) {
            optimization_potential = parseFloat(additionalMonthlyRent.toFixed(2));
        }
    }

    let explanation = `Your exempt HRA is limited by ${
        limiting_factor === 'actual_hra_received' ? 'the actual HRA your employer pays you'
        : limiting_factor === 'percentage_of_basic' ? `${pct * 100}% of your basic salary (${city_type} city rule)`
        : 'the rent you pay minus 10% of your basic salary'
    }, giving you ₹${exempt_hra.toFixed(0)} exempt per year. `;
    explanation += taxable_hra > 0
        ? `The remaining ₹${taxable_hra.toFixed(0)} of your HRA is taxable.`
        : 'Your entire HRA is exempt from tax.';

    return {
        inputs: {
            basic_salary_monthly,
            hra_component_monthly,
            rent_paid_monthly,
            city_type,
            annual_basic,
            annual_hra_received,
            annual_rent_paid,
        },
        value_a_actual_hra: valueA,
        value_b_pct_of_basic: valueB,
        value_c_rent_minus_10pct_basic: valueC,
        exempt_hra,
        taxable_hra,
        limiting_factor,
        optimization_potential,
        explanation,
    };
}

router.get('/hra', async (req, res) => {
    try {
        const fy = getCurrentFY();

        const result = await pool.query(
            'SELECT * FROM tax_profiles WHERE user_id = $1 AND financial_year = $2',
            [req.user.id, fy]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: 'No tax profile found. Please complete your salary profile first.', financial_year: fy });

        res.json({ financial_year: fy, ...computeHraExemption(result.rows[0]) });
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/lta', async (req, res) => {
    try {
        const fy = getCurrentFY();

        const result = await pool.query(
            'SELECT * FROM tax_profiles WHERE user_id = $1 AND financial_year = $2',
            [req.user.id, fy]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: 'No tax profile found. Please complete your salary profile first.', financial_year: fy });

        const profile = result.rows[0];
        const lta_component = parseFloat(profile.lta_component_annual);
        const claims_used = profile.lta_claims_used_in_block;
        const claims_remaining = Math.max(0, 2 - claims_used);

        const blockEnd = new Date('2026-03-31');
        const now = new Date();
        const next_claim_expires_in_months = Math.max(0, Math.round(
            (blockEnd.getFullYear() - now.getFullYear()) * 12 + (blockEnd.getMonth() - now.getMonth())
        ));
        const next_block_start = '2026-04-01';

        let recommendation = null;
        if (claims_remaining > 0 && next_claim_expires_in_months < 12) {
            recommendation = `You have ${claims_remaining} LTA claim(s) remaining. The current block ends in ${next_claim_expires_in_months} months. Plan a trip to utilize your LTA before March 31, 2026.`;
        }

        res.json({
            financial_year: fy,
            lta_component,
            claims_used,
            claims_remaining,
            next_claim_expires_in_months,
            next_block_start,
            recommendation,
        });
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

const ADVANCE_TAX_THRESHOLD = 10000;
const INSTALLMENTS = [
    { number: 1, month: 6, day: 15, cumulative_pct: 15 },
    { number: 2, month: 9, day: 15, cumulative_pct: 45 },
    { number: 3, month: 12, day: 15, cumulative_pct: 75 },
    { number: 4, month: 3, day: 15, cumulative_pct: 100 },
];

// Estimates annual income, computes old/new regime tax, and builds the installment schedule.
async function computeAdvanceTaxEstimate(userId, fy) {
    const { start } = fyToDateRange(fy);
    const startYear = parseInt(fy.slice(0, 4), 10);
    const today = new Date();
    const fyStartDate = new Date(start);

    const ytdRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE user_id = $1 AND type = 'income' AND date >= $2 AND date <= CURRENT_DATE`,
        [userId, start]
    );
    const ytd_income = parseFloat(ytdRes.rows[0].total);

    let months_elapsed = (today.getFullYear() - fyStartDate.getFullYear()) * 12
        + (today.getMonth() - fyStartDate.getMonth()) + 1;
    months_elapsed = Math.min(12, Math.max(1, months_elapsed));
    const months_remaining = 12 - months_elapsed;

    const projected_remaining_income = (ytd_income / months_elapsed) * months_remaining;
    const transaction_based_estimate = ytd_income + projected_remaining_income;

    const profileRes = await pool.query(
        'SELECT * FROM tax_profiles WHERE user_id = $1 AND financial_year = $2',
        [userId, fy]
    );
    const profile = profileRes.rows[0] || null;

    let profile_based_estimate = null;
    let hra_exempt = 0;
    if (profile) {
        profile_based_estimate = (
            parseFloat(profile.basic_salary_monthly)
            + parseFloat(profile.hra_component_monthly)
            + parseFloat(profile.special_allowance_monthly)
        ) * 12;
        hra_exempt = computeHraExemption(profile).exempt_hra;
    }

    const estimated_income = profile_based_estimate !== null
        ? Math.max(transaction_based_estimate, profile_based_estimate)
        : transaction_based_estimate;

    // 80C deductions for current FY, capped at the section limit
    const eightyCRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM tax_investments
         WHERE user_id = $1 AND financial_year = $2 AND deduction_section = '80C'`,
        [userId, fy]
    );
    const deduction_80c = Math.min(SECTION_80C_LIMIT, parseFloat(eightyCRes.rows[0].total));

    const standard_deduction_old = 50000;
    const standard_deduction_new = 75000;

    const old_taxable_income = Math.max(0, estimated_income - standard_deduction_old - deduction_80c - hra_exempt);
    const new_taxable_income = Math.max(0, estimated_income - standard_deduction_new);

    const old_regime = computeRegimeTax(old_taxable_income, 'old', fy);
    const new_regime = computeRegimeTax(new_taxable_income, 'new', fy);

    const old_regime_tax = old_regime.total;
    const new_regime_tax = new_regime.total;
    const recommended_regime = old_regime_tax <= new_regime_tax ? 'old' : 'new';
    const tax_savings_from_better_regime = Math.abs(old_regime_tax - new_regime_tax);

    const estimated_liability = Math.min(old_regime_tax, new_regime_tax);
    const is_applicable = estimated_liability > ADVANCE_TAX_THRESHOLD;

    // Existing payments logged for this FY
    const paymentsRes = await pool.query(
        'SELECT * FROM advance_tax_payments WHERE user_id = $1 AND financial_year = $2',
        [userId, fy]
    );
    const paymentsByInstallment = {};
    for (const p of paymentsRes.rows) paymentsByInstallment[p.installment_number] = p;

    const installment_schedule = [];
    let prevCumulative = 0;
    for (const inst of INSTALLMENTS) {
        const dueYear = inst.month === 3 ? startYear + 1 : startYear;
        const due_date = `${dueYear}-${String(inst.month).padStart(2, '0')}-${String(inst.day).padStart(2, '0')}`;
        const cumulative_amount_due = parseFloat(((estimated_liability * inst.cumulative_pct) / 100).toFixed(2));
        const installment_amount = parseFloat((cumulative_amount_due - prevCumulative).toFixed(2));
        prevCumulative = cumulative_amount_due;

        const payment = paymentsByInstallment[inst.number];
        const amount_paid = payment ? parseFloat(payment.amount_paid) : 0;

        const dueDateObj = new Date(due_date);
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const dueMidnight = new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), dueDateObj.getDate());

        let status;
        if (amount_paid >= installment_amount && installment_amount > 0) {
            status = 'paid';
        } else if (dueMidnight.getTime() < todayMidnight.getTime()) {
            status = 'overdue';
        } else if (dueMidnight.getTime() === todayMidnight.getTime()) {
            status = 'due';
        } else {
            status = 'upcoming';
        }

        installment_schedule.push({
            installment_number: inst.number,
            due_date,
            cumulative_pct_due: inst.cumulative_pct,
            cumulative_amount_due,
            installment_amount,
            amount_paid,
            paid_on_date: payment ? payment.paid_on_date : null,
            status,
        });
    }

    return {
        financial_year: fy,
        estimated_income,
        income_estimates: {
            transaction_based_estimate,
            profile_based_estimate,
            ytd_income,
            months_elapsed,
            months_remaining,
        },
        deductions: {
            deduction_80c,
            standard_deduction_old,
            standard_deduction_new,
            hra_exempt,
        },
        old_regime_tax,
        new_regime_tax,
        recommended_regime,
        tax_savings_from_better_regime,
        is_applicable,
        installment_schedule,
    };
}

router.get('/advance-tax', async (req, res) => {
    try {
        const fy = getCurrentFY();
        const estimate = await computeAdvanceTaxEstimate(req.user.id, fy);

        if (!estimate.is_applicable) {
            return res.json({
                ...estimate,
                explanation: 'Your estimated tax liability is ₹10,000 or less, so advance tax does not apply to you this year.',
            });
        }

        res.json(estimate);
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/advance-tax/payment', async (req, res) => {
    try {
        const { installment_number, amount_paid, paid_on_date, financial_year, payment_reference } = req.body;

        if (installment_number === undefined || amount_paid === undefined || !paid_on_date)
            return res.status(400).json({ error: 'installment_number, amount_paid and paid_on_date are required.' });
        if (!Number.isInteger(installment_number) || installment_number < 1 || installment_number > 4)
            return res.status(400).json({ error: 'installment_number must be between 1 and 4.' });
        if (!isNonNegativeNumber(amount_paid))
            return res.status(400).json({ error: 'amount_paid must be 0 or greater.' });
        if (!isValidDateString(paid_on_date))
            return res.status(400).json({ error: 'paid_on_date must be a valid date.' });
        if (financial_year && !isValidFinancialYear(financial_year))
            return res.status(400).json({ error: 'financial_year must be in YYYY-YY format.' });

        const fy = financial_year || getCurrentFY();
        const estimate = await computeAdvanceTaxEstimate(req.user.id, fy);
        const schedule = estimate.installment_schedule.find(i => i.installment_number === installment_number);
        const estimated_amount_due = schedule ? schedule.cumulative_amount_due : 0;
        const inst = INSTALLMENTS.find(i => i.number === installment_number);
        const startYear = parseInt(fy.slice(0, 4), 10);
        const dueYear = inst.month === 3 ? startYear + 1 : startYear;
        const due_date = `${dueYear}-${String(inst.month).padStart(2, '0')}-${String(inst.day).padStart(2, '0')}`;

        const result = await pool.query(
            `INSERT INTO advance_tax_payments (
                user_id, financial_year, installment_number, due_date, cumulative_pct_due,
                estimated_amount_due, amount_paid, paid_on_date, payment_reference
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (user_id, financial_year, installment_number) DO UPDATE SET
                estimated_amount_due = $6,
                amount_paid = $7,
                paid_on_date = $8,
                payment_reference = COALESCE($9, advance_tax_payments.payment_reference),
                updated_at = NOW()
             RETURNING *`,
            [req.user.id, fy, installment_number, due_date, inst.cumulative_pct, estimated_amount_due, amount_paid, paid_on_date, payment_reference || null]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

const MANUAL_ITR_ITEMS = [
    { key: 'form_16_received', label: 'Form 16 received from employer', weight: 20 },
    { key: 'ais_reviewed', label: 'AIS / TIS reviewed on Income Tax portal', weight: 15 },
    { key: 'bank_interest_collected', label: 'Bank interest certificates collected', weight: 10 },
    { key: 'hra_documents_ready', label: 'HRA rent receipts and landlord PAN ready', weight: 5 },
];
const MANUAL_ITR_KEYS = MANUAL_ITR_ITEMS.map(i => i.key);

// Builds the full ITR readiness checklist + score for the current FY.
async function computeItrReadiness(userId, fy) {
    const profileRes = await pool.query(
        'SELECT * FROM tax_profiles WHERE user_id = $1 AND financial_year = $2',
        [userId, fy]
    );
    const profile = profileRes.rows[0] || null;
    const checklist = profile ? (profile.itr_checklist_json || {}) : {};

    const items = [];

    // 80c_documented
    const eightyCRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM tax_investments
         WHERE user_id = $1 AND financial_year = $2 AND deduction_section = '80C'`,
        [userId, fy]
    );
    items.push({
        key: '80c_documented',
        label: 'Section 80C investments documented',
        type: 'auto',
        weight: 15,
        status: parseFloat(eightyCRes.rows[0].total) > 0 ? 'done' : 'pending',
    });

    // capital_gains_computed
    const hasTradableInvestmentsRes = await pool.query(
        `SELECT 1 FROM investments WHERE user_id = $1 AND type IN ('stock','mutual_fund') LIMIT 1`,
        [userId]
    );
    if (hasTradableInvestmentsRes.rows.length === 0) {
        items.push({ key: 'capital_gains_computed', label: 'Capital gains computed', type: 'auto', weight: 15, status: 'not_applicable' });
    } else {
        const capGainsRes = await pool.query(
            'SELECT 1 FROM capital_transactions WHERE user_id = $1 AND financial_year = $2 LIMIT 1',
            [userId, fy]
        );
        items.push({
            key: 'capital_gains_computed',
            label: 'Capital gains computed',
            type: 'auto',
            weight: 15,
            status: capGainsRes.rows.length > 0 ? 'done' : 'pending',
        });
    }

    // advance_tax_paid
    const estimate = await computeAdvanceTaxEstimate(userId, fy);
    if (!estimate.is_applicable) {
        items.push({ key: 'advance_tax_paid', label: 'Advance tax installments paid', type: 'auto', weight: 10, status: 'not_applicable' });
    } else {
        const today = new Date();
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        let cumulativeDue = 0;
        let cumulativePaid = 0;
        for (const inst of estimate.installment_schedule) {
            const dueDateObj = new Date(inst.due_date);
            const dueMidnight = new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), dueDateObj.getDate());
            if (dueMidnight.getTime() <= todayMidnight.getTime()) {
                cumulativeDue = inst.cumulative_amount_due;
                cumulativePaid += inst.amount_paid;
            }
        }
        items.push({
            key: 'advance_tax_paid',
            label: 'Advance tax installments paid',
            type: 'auto',
            weight: 10,
            status: cumulativePaid >= cumulativeDue ? 'done' : 'pending',
        });
    }

    // profile_complete
    items.push({
        key: 'profile_complete',
        label: 'Salary profile completed',
        type: 'auto',
        weight: 10,
        status: profile && parseFloat(profile.basic_salary_monthly) > 0 ? 'done' : 'pending',
    });

    // Manual items
    for (const manual of MANUAL_ITR_ITEMS) {
        let status;
        if (manual.key === 'hra_documents_ready') {
            const rentPaid = profile ? parseFloat(profile.rent_paid_monthly) : 0;
            if (!profile || rentPaid <= 0) {
                status = 'not_applicable';
            } else {
                status = checklist[manual.key] ? 'done' : 'pending';
            }
        } else {
            status = checklist[manual.key] ? 'done' : 'pending';
        }
        items.push({ key: manual.key, label: manual.label, type: 'manual', weight: manual.weight, status });
    }

    const applicableItems = items.filter(i => i.status !== 'not_applicable');
    const totalWeight = applicableItems.reduce((s, i) => s + i.weight, 0);
    const doneWeight = applicableItems.filter(i => i.status === 'done').reduce((s, i) => s + i.weight, 0);
    const score = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0;

    const doneCount = applicableItems.filter(i => i.status === 'done').length;
    const completion_summary = `${doneCount} of ${applicableItems.length} items complete`;

    const pendingItems = applicableItems.filter(i => i.status === 'pending').sort((a, b) => b.weight - a.weight);
    const next_action = pendingItems.length > 0 ? pendingItems[0].label : null;

    return {
        financial_year: fy,
        score,
        completion_summary,
        next_action,
        items,
    };
}

router.get('/itr-readiness', async (req, res) => {
    try {
        const fy = getCurrentFY();
        const readiness = await computeItrReadiness(req.user.id, fy);
        res.json(readiness);
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/itr-readiness', async (req, res) => {
    try {
        const { key, value } = req.body;

        if (!key || typeof value !== 'boolean')
            return res.status(400).json({ error: 'key and a boolean value are required.' });
        if (!MANUAL_ITR_KEYS.includes(key))
            return res.status(400).json({ error: 'Invalid checklist key.' });

        const fy = getCurrentFY();

        const profileRes = await pool.query(
            'SELECT * FROM tax_profiles WHERE user_id = $1 AND financial_year = $2',
            [req.user.id, fy]
        );

        if (profileRes.rows.length === 0) {
            await pool.query(
                `INSERT INTO tax_profiles (user_id, financial_year, basic_salary_monthly, itr_checklist_json)
                 VALUES ($1, $2, 0, $3::jsonb)`,
                [req.user.id, fy, JSON.stringify({ [key]: value })]
            );
        } else {
            const checklist = { ...(profileRes.rows[0].itr_checklist_json || {}), [key]: value };
            await pool.query(
                `UPDATE tax_profiles SET itr_checklist_json = $1::jsonb, updated_at = NOW()
                 WHERE user_id = $2 AND financial_year = $3`,
                [JSON.stringify(checklist), req.user.id, fy]
            );
        }

        const readiness = await computeItrReadiness(req.user.id, fy);
        res.json(readiness);
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/80c-summary', async (req, res) => {
    try {
        const fy = req.query.fy && isValidFinancialYear(req.query.fy) ? req.query.fy : getCurrentFY();
        const { start, end } = fyToDateRange(fy);

        const entriesRes = await pool.query(
            `SELECT * FROM tax_investments
             WHERE user_id = $1 AND deduction_section = '80C' AND financial_year = $2
             ORDER BY created_at ASC`,
            [req.user.id, fy]
        );

        const entries = entriesRes.rows;
        const total_claimed = entries.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const remaining = Math.max(0, SECTION_80C_LIMIT - total_claimed);
        const utilization_pct = parseFloat(((total_claimed / SECTION_80C_LIMIT) * 100).toFixed(1));

        const breakdownMap = {};
        for (const e of entries) {
            breakdownMap[e.type] = (breakdownMap[e.type] || 0) + parseFloat(e.amount);
        }
        const breakdown_by_type = Object.entries(breakdownMap).map(([type, total]) => ({ type, total }));

        const candidatesRes = await pool.query(
            `SELECT id, name, type, units, purchase_price_per_unit
             FROM investments
             WHERE user_id = $1
               AND type IN ('ppf','elss')
               AND purchase_date >= $2 AND purchase_date <= $3
               AND id NOT IN (
                 SELECT investment_id FROM tax_investments
                 WHERE financial_year = $4 AND investment_id IS NOT NULL
               )
             LIMIT 5`,
            [req.user.id, start, end, fy]
        );

        const auto_add_candidates = candidatesRes.rows.map(r => ({
            id: r.id,
            name: r.name,
            type: r.type,
            amount: parseFloat(r.units) * parseFloat(r.purchase_price_per_unit),
        }));

        res.json({
            financial_year: fy,
            total_claimed,
            limit: SECTION_80C_LIMIT,
            remaining,
            utilization_pct,
            breakdown_by_type,
            entries,
            auto_add_candidates,
        });
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/80c', async (req, res) => {
    try {
        const { type, name, amount, investment_id, financial_year, deduction_section } = req.body;

        if (!type || !name || amount === undefined)
            return res.status(400).json({ error: 'type, name and amount are required.' });
        if (!isPositiveNumber(amount))
            return res.status(400).json({ error: 'amount must be greater than 0.' });
        if (!isValidTaxInvestmentType(type))
            return res.status(400).json({ error: 'Invalid type.' });
        if (financial_year && !isValidFinancialYear(financial_year))
            return res.status(400).json({ error: 'financial_year must be in YYYY-YY format.' });

        const fy = financial_year || getCurrentFY();
        const section = deduction_section || '80C';

        if (investment_id) {
            const invRes = await pool.query(
                'SELECT id FROM investments WHERE id = $1 AND user_id = $2',
                [investment_id, req.user.id]
            );
            if (invRes.rows.length === 0)
                return res.status(404).json({ error: 'Investment not found.' });
        }

        const result = await pool.query(
            `INSERT INTO tax_investments (user_id, investment_id, type, name, amount, deduction_section, financial_year)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [req.user.id, investment_id || null, type, name, amount, section, fy]
        );

        res.status(201).json({ tax_investment: result.rows[0] });
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/80c/:id', async (req, res) => {
    try {
        const existing = await pool.query('SELECT * FROM tax_investments WHERE id = $1', [req.params.id]);
        if (existing.rows.length === 0)
            return res.status(404).json({ error: 'Not found.' });
        if (existing.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden.' });

        const { name, amount } = req.body;
        if (amount !== undefined && !isPositiveNumber(amount))
            return res.status(400).json({ error: 'amount must be greater than 0.' });

        const result = await pool.query(
            `UPDATE tax_investments
             SET name = COALESCE($1, name), amount = COALESCE($2, amount), updated_at = NOW()
             WHERE id = $3 RETURNING *`,
            [name || null, amount !== undefined ? amount : null, req.params.id]
        );

        res.json({ tax_investment: result.rows[0] });
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/80c/:id', async (req, res) => {
    try {
        const existing = await pool.query('SELECT * FROM tax_investments WHERE id = $1', [req.params.id]);
        if (existing.rows.length === 0)
            return res.status(404).json({ error: 'Not found.' });
        if (existing.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden.' });

        await pool.query('DELETE FROM tax_investments WHERE id = $1', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/capital-gains', async (req, res) => {
    try {
        const fy = req.query.fy && isValidFinancialYear(req.query.fy) ? req.query.fy : getCurrentFY();

        const txnRes = await pool.query(
            `SELECT * FROM capital_transactions
             WHERE user_id = $1 AND financial_year = $2
             ORDER BY transaction_date ASC`,
            [req.user.id, fy]
        );

        const rows = txnRes.rows;
        const buys = rows.filter(r => r.transaction_type === 'buy');
        const sells = rows.filter(r => r.transaction_type === 'sell');

        const aggregates = { stcg_equity: 0, ltcg_equity: 0, stcg_other: 0, ltcg_other: 0 };
        const transactions = [];

        if (sells.length > 0) {
            // FIFO lots per asset
            const lotsByAsset = {};
            for (const b of buys) {
                if (!lotsByAsset[b.asset_name]) lotsByAsset[b.asset_name] = [];
                lotsByAsset[b.asset_name].push({
                    date: b.transaction_date,
                    units: parseFloat(b.units),
                    price: parseFloat(b.price_per_unit),
                    asset_type: b.asset_type,
                });
            }

            const MS_PER_DAY = 1000 * 60 * 60 * 24;

            for (const s of sells) {
                let unitsToSell = parseFloat(s.units);
                const lots = lotsByAsset[s.asset_name] || [];

                for (const lot of lots) {
                    if (unitsToSell <= 0) break;
                    if (lot.units <= 0) continue;

                    const matchedUnits = Math.min(lot.units, unitsToSell);
                    const sellDate = new Date(s.transaction_date);
                    const buyDate = new Date(lot.date);
                    const holding_period_days = Math.round((sellDate - buyDate) / MS_PER_DAY);

                    const assetType = lot.asset_type || s.asset_type;
                    const isEquity = assetType === 'equity';
                    const ltcgThreshold = isEquity ? 365 : 1095;
                    const gain_type = holding_period_days >= ltcgThreshold ? 'ltcg' : 'stcg';

                    const gain_loss_amount = (parseFloat(s.price_per_unit) - lot.price) * matchedUnits;

                    transactions.push({
                        asset_name: s.asset_name,
                        buy_date: lot.date,
                        sell_date: s.transaction_date,
                        holding_period_days,
                        units: matchedUnits,
                        buy_price: lot.price,
                        sell_price: parseFloat(s.price_per_unit),
                        gain_loss_amount,
                        gain_type,
                    });

                    const bucket = `${gain_type}_${isEquity ? 'equity' : 'other'}`;
                    aggregates[bucket] += gain_loss_amount;

                    lot.units -= matchedUnits;
                    unitsToSell -= matchedUnits;
                }
            }
        }

        const total_gains = aggregates.stcg_equity + aggregates.ltcg_equity + aggregates.stcg_other + aggregates.ltcg_other;

        res.json({
            financial_year: fy,
            stcg_equity: aggregates.stcg_equity,
            ltcg_equity: aggregates.ltcg_equity,
            stcg_other: aggregates.stcg_other,
            ltcg_other: aggregates.ltcg_other,
            total_gains,
            transactions,
        });
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/capital-transaction', async (req, res) => {
    try {
        const { asset_name, asset_type, transaction_type, units, price_per_unit, transaction_date } = req.body;

        if (!asset_name || !asset_type || !transaction_type || units === undefined || price_per_unit === undefined || !transaction_date)
            return res.status(400).json({ error: 'asset_name, asset_type, transaction_type, units, price_per_unit and transaction_date are required.' });
        if (!isValidCapitalAssetType(asset_type))
            return res.status(400).json({ error: 'Invalid asset_type.' });
        if (!isValidCapitalTransactionType(transaction_type))
            return res.status(400).json({ error: 'Invalid transaction_type.' });
        if (!isPositiveNumber(units))
            return res.status(400).json({ error: 'units must be greater than 0.' });
        if (!isNonNegativeNumber(price_per_unit))
            return res.status(400).json({ error: 'price_per_unit must be 0 or greater.' });
        if (!isValidDateString(transaction_date))
            return res.status(400).json({ error: 'transaction_date must be a valid date.' });

        const txnDate = new Date(transaction_date);
        const year = txnDate.getFullYear();
        const month = txnDate.getMonth();
        const financial_year = month >= 3
            ? `${year}-${String((year + 1) % 100).padStart(2, '0')}`
            : `${year - 1}-${String(year % 100).padStart(2, '0')}`;

        const result = await pool.query(
            `INSERT INTO capital_transactions (user_id, asset_name, asset_type, transaction_type, units, price_per_unit, transaction_date, financial_year)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [req.user.id, asset_name, asset_type, transaction_type, units, price_per_unit, transaction_date, financial_year]
        );

        res.status(201).json({ capital_transaction: result.rows[0] });
    } catch (err) {
        console.error('[Tax]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
module.exports.getCurrentFY = getCurrentFY;
module.exports.fyToDateRange = fyToDateRange;
module.exports.computeHraExemption = computeHraExemption;
module.exports.computeItrReadiness = computeItrReadiness;
module.exports.computeAdvanceTaxEstimate = computeAdvanceTaxEstimate;
module.exports.SECTION_80C_LIMIT = SECTION_80C_LIMIT;
