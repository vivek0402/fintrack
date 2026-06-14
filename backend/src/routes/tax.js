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
} = require('../utils/validation');
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
